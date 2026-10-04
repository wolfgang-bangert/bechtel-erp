import { bbGetAll } from "./bbutler";
import { supabase } from "./supabase";
import { pagedSelect } from "./db";

/* --------------------------------------------------------------------------
 * Ausgangsrechnungen, die nur in BuchhaltungsButler als Erlös gebucht sind (z.B. Festool-
 * Konsignationsabrechnungen, von Hand erstellte Rechnungen 260E…, einzelne Ninox-/Keyline-Rechnungen) als
 * sales_invoice mit Quelle 'bb' anlegen - damit Umsatz/UStVA vollständig sind. Beträge, Datum, Kunde und
 * Erlöskonto kommen aus den BB-Buchungen (Brutto/(1+Satz)); das Rechnungs-PDF liefert die BB-API nicht
 * (pdf_status 'none'). Gleiche Rechnungsnummer mehrfach gebucht (Doppelbuchung) wird nur einmal angelegt.
 * Nicht übernommen: Skonto-/Erlösschmälerungskonten, Sachbezüge (8590), Degenkolbe-Gutschriften (EBEF),
 * negative Beträge und Buchungen ohne Rechnungsnummer.
 * -------------------------------------------------------------------------- */

type Posting = {
  id_by_customer: string;
  date: string;
  date_vat_effective: string | null;
  postingtext: string;
  amount: string;
  currency: string;
  vat: string;
  debit_postingaccount_number: string;
  credit_postingaccount_number: string;
  receipts_assigned_types: string | null;
  receipts_assigned_invoice_numbers: string | null;
  receipts_assigned_counterparties: string | null;
  receipt_id_by_customer: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
const AUSGESCHLOSSEN_KONTO = /^(873|8590|852|8900|8910|892|8949)/;

export async function bbAusgangNachholen({ dryRun, von = "2026-01-01", bis = "2026-05-31" }: { dryRun: boolean; von?: string; bis?: string }) {
  // BB-Buchungen monatsweise (kleine Seiten)
  const posts: Posting[] = [];
  for (let d = new Date(`${von.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 10) <= bis; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const a = d.toISOString().slice(0, 10);
    const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    posts.push(...(await bbGetAll<Posting>("postings/get", { date_from: a, date_to: e })));
  }

  const inv = await pagedSelect<{ invoice_number: string | null; external_id: string | null }>("sales_invoice", "invoice_number, external_id");
  const haveNr = new Set(inv.map((i) => (i.invoice_number ?? "").trim()).filter(Boolean));
  const haveExt = new Set(inv.map((i) => i.external_id).filter((x): x is string => !!x));

  type Zeile = { konto: string; satz: number; brutto: number };
  const proNr = new Map<string, { datum: string; kunde: string; rid: string | null; postIds: string[]; zeilen: Zeile[] }>();
  const doppelt: string[] = [];
  for (const p of posts) {
    const konto = String(p.credit_postingaccount_number ?? "");
    if (!konto.startsWith("8") || AUSGESCHLOSSEN_KONTO.test(konto)) continue;
    if (String(p.debit_postingaccount_number ?? "").startsWith("8")) continue;
    if (!(p.receipts_assigned_types ?? "").includes("invoice outbound")) continue;
    const nr = (p.receipts_assigned_invoice_numbers ?? "").split(",")[0].trim();
    const brutto = Number(p.amount);
    if (!nr || /EBEF/i.test(nr) || !(brutto > 0)) continue;
    const datum = (p.date_vat_effective || p.date).slice(0, 10);
    if (datum < von || datum > bis) continue;
    const e = proNr.get(nr) ?? { datum, kunde: p.receipts_assigned_counterparties || p.postingtext, rid: p.receipt_id_by_customer, postIds: [], zeilen: [] };
    // exakt gleiche Buchung unter anderer Belegnummer-ID noch einmal = Doppelbuchung in BB
    if (e.postIds.length && e.zeilen.some((z) => z.konto === konto && Math.abs(z.brutto - brutto) < 0.005 && z.satz === Number(p.vat)) && e.rid !== p.receipt_id_by_customer) {
      doppelt.push(`${nr} (BB-Belege ${e.rid} und ${p.receipt_id_by_customer})`);
      continue;
    }
    e.postIds.push(p.id_by_customer);
    e.zeilen.push({ konto, satz: Number(p.vat), brutto });
    proNr.set(nr, e);
  }

  const kandidaten = [...proNr.entries()].filter(([nr]) => !haveNr.has(nr)).sort((a, b) => a[1].datum.localeCompare(b[1].datum));

  const orgs = await pagedSelect<{ id: string; name: string }>("organization", "id, name");
  const byName = new Map<string, string[]>();
  for (const o of orgs) byName.set(norm(o.name), [...(byName.get(norm(o.name)) ?? []), o.id]);

  const out = {
    dryRun,
    zeitraum: `${von} bis ${bis}`,
    kandidaten: kandidaten.length,
    nettoSumme: 0,
    angelegt: 0,
    ohneOrganisation: [] as string[],
    doppeltGebucht: doppelt,
    liste: [] as string[],
  };
  for (const [nr, e] of kandidaten) {
    const zeilen = e.zeilen.map((z) => {
      const net = r2(z.brutto / (1 + z.satz / 100));
      return { ...z, net, tax: r2(z.brutto - net) };
    });
    const net = r2(zeilen.reduce((s, z) => s + z.net, 0));
    const tax = r2(zeilen.reduce((s, z) => s + z.tax, 0));
    const gross = r2(net + tax);
    out.nettoSumme = r2(out.nettoSumme + net);
    let cand = byName.get(norm(e.kunde)) ?? [];
    if (cand.length === 0) {
      // lockerer Treffer: genau eine Organisation, deren Name mit dem Kundennamen beginnt (oder umgekehrt)
      const k = norm(e.kunde);
      const l = orgs.filter((o) => {
        const n = norm(o.name);
        return Math.min(n.length, k.length) >= 14 && (n.startsWith(k) || k.startsWith(n));
      });
      if (l.length === 1) cand = [l[0].id];
    }
    if (cand.length !== 1) out.ohneOrganisation.push(`${nr} · ${e.kunde} (${cand.length === 0 ? "nicht gefunden" : "mehrdeutig"})`);
    out.liste.push(`${e.datum} ${nr} · ${e.kunde}${cand.length === 1 ? ` → ${orgs.find((o) => o.id === cand[0])?.name}` : ""} · netto ${net.toFixed(2)} · ${zeilen.map((z) => `${z.konto}/${z.satz}%`).join(",")}`);
    if (dryRun) continue;

    const ext = `bb:rcpt:${e.rid ?? nr}`;
    if (haveExt.has(ext)) continue;
    const breakdown: Record<string, number> = {};
    for (const z of zeilen) breakdown[String(z.satz)] = r2((breakdown[String(z.satz)] ?? 0) + z.tax);
    const { data: created, error } = await supabase
      .from("sales_invoice")
      .insert({
        source: "bb",
        external_id: ext,
        organization_id: cand.length === 1 ? cand[0] : null,
        invoice_number: nr,
        kind: "invoice",
        invoice_date: e.datum,
        net_total: net,
        tax_total: tax,
        gross_total: gross,
        tax_breakdown: breakdown,
        currency: "EUR",
        pdf_status: "none",
        raw: { bb: { beleg: e.rid, buchungen: e.postIds, kunde: e.kunde } },
        synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(`${nr}: ${error.message}`);
    const sid = created!.id;
    const { error: ie } = await supabase.from("sales_invoice_item").insert(
      zeilen.map((z, i) => ({
        sales_invoice_id: sid,
        source: "bb",
        external_id: `${ext}:${i + 1}`,
        position: i + 1,
        description: `Rechnung ${nr} (aus BuchhaltungsButler)`,
        quantity: 1,
        unit_price: z.net,
        tax_rate: z.satz,
        net_amount: z.net,
      })),
    );
    if (ie) throw new Error(`${nr}: ${ie.message}`);
    const { error: be } = await supabase.from("sales_invoice_booking").insert(
      zeilen.map((z) => ({
        sales_invoice_id: sid,
        ledger_account: z.konto,
        tax_rate: z.satz,
        net_amount: z.net,
        tax_amount: z.tax,
        gross_amount: r2(z.net + z.tax),
      })),
    );
    if (be) throw new Error(`${nr}: ${be.message}`);
    haveNr.add(nr);
    out.angelegt++;
  }
  return out;
}
