import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { pruefeUst, loadOwnVatId, type UstTaxCode } from "./ustCheck";
import type { Extracted } from "./extractIncoming";

/* --------------------------------------------------------------------------
 * BB-Belege, bei denen BuchhaltungsButler OHNE Steuerschlüssel gebucht hat (Netto = Brutto, USt 0), obwohl auf
 * der Rechnung USt steht: Netto/USt/Positionen aus der KI-Auswertung der Rechnung übernehmen (Vorsteuer wird
 * so erst abziehbar). Streng: nur bei eindeutigem Befund (pruefeUst = "sicher") bleibt der Beleg geprüft und
 * bekommt den Schlüssel, sonst wird er auf "extrahiert" zurückgesetzt und wartet auf die Bestätigung durch den
 * Nutzer (Kachel "USt bestätigen"). Positionen: KI-Positionen bei einem Konto, sonst die BB-Positionen
 * heruntergerechnet; Belege mit Zuordnungen/Verknüpfungen werden nicht angefasst (nur gemeldet).
 * -------------------------------------------------------------------------- */

// Gegenseitig aufhebendes Paar (Konica: fälschlich abgebucht + Gutschrift) - bleibt unberührt.
const AUSGENOMMEN = new Set(["1206926153", "1207100561"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function bbUstKorrektur({ dryRun }: { dryRun: boolean }) {
  const taxCodes: UstTaxCode[] = (
    await pagedSelect<{ id: string; code: string; rate: number; treatment: string; direction: string; is_active: boolean }>(
      "tax_code",
      "id, code, rate, treatment, direction, is_active",
    )
  )
    .filter((t) => t.direction === "input" && t.is_active)
    .map((t) => ({ id: t.id, code: t.code, rate: Number(t.rate), treatment: t.treatment }));
  const stdByRate = (rate: unknown) =>
    taxCodes.find((c) => c.treatment === "standard_de" && Math.round(c.rate) === Math.round(Number(rate)))?.id ?? null;
  const zeroCodeId = taxCodes.find((c) => c.treatment === "tax_free_other" && Math.round(c.rate) === 0)?.id ?? null;
  const ownVatId = await loadOwnVatId();
  const orgInfo = new Map(
    (await pagedSelect<{ id: string; vat_id: string | null; foreign_supply_kind: string | null }>("organization", "id, vat_id, foreign_supply_kind")).map((o) => [o.id, o]),
  );

  const docs = await pagedSelect<{
    id: string;
    doc_number: string | null;
    doc_date: string | null;
    doc_type: string;
    status: string;
    supplier_name: string | null;
    supplier_organization_id: string | null;
    net_amount: number | null;
    tax_amount: number | null;
    gross_amount: number | null;
    dedup_key: string;
    extraction: (Extracted & { _bb?: Record<string, unknown>; _ust?: unknown }) | null;
  }>(
    "incoming_document",
    "id, doc_number, doc_date, doc_type, status, supplier_name, supplier_organization_id, net_amount, tax_amount, gross_amount, dedup_key, extraction",
  );

  const out = {
    dryRun,
    kandidaten: 0,
    sicher: 0,
    vorschlag: 0,
    manuell: [] as string[],
    ustProMonat: {} as Record<string, { sicher: number; vorschlag: number }>,
    korrigiert: 0,
  };

  for (const d of docs) {
    if (!d.dedup_key.startsWith("bb:") || d.status === "rejected" || !d.extraction) continue;
    const bb = d.extraction._bb as { positionen?: string; ust_korrektur?: unknown } | undefined;
    if (bb?.positionen !== "Summe weicht ab" || bb.ust_korrektur) continue;
    if (AUSGENOMMEN.has(String(d.doc_number))) continue;
    const e = d.extraction;
    const kn = Number(e.net_amount), kt = Number(e.tax_amount ?? 0), kg = Number(e.gross_amount);
    const wn = Number(d.net_amount), wt = Number(d.tax_amount ?? 0);
    if (![kn, kg].every(Number.isFinite)) continue;
    if (!(Math.abs(wn - kg) <= 0.05 && kt > 0.01 && wt < 0.005)) continue; // nur Klasse "Netto = Brutto, keine USt"
    out.kandidaten++;
    const label = `${d.supplier_name ?? "?"} ${d.doc_number ?? ""}`.trim();

    const { data: items } = await supabase
      .from("incoming_document_item")
      .select("id, position, description, quantity, unit_price, net_amount, tax_rate, ledger_account, cost_center_id, material_ref, linked_document_id")
      .eq("incoming_document_id", d.id)
      .order("position");
    const its = items ?? [];
    if (!its.length) { out.manuell.push(`${label}: keine Positionen`); continue; }
    if (its.some((i) => i.linked_document_id)) { out.manuell.push(`${label}: Position mit verknüpftem Beleg`); continue; }
    const { count: allocN } = await supabase
      .from("incoming_document_allocation")
      .select("id", { count: "exact", head: true })
      .in("incoming_document_item_id", its.map((i) => i.id));
    if ((allocN ?? 0) > 0) { out.manuell.push(`${label}: Positionen mit Auftrags-Zuordnung`); continue; }

    const bd = Object.entries(e.tax_breakdown ?? {}).map(([r, a]) => ({ rate: Number(r), amount: Number(a) })).filter((x) => Number.isFinite(x.rate));
    const pos = bd.filter((x) => x.rate > 0);
    const domRate = [...pos].sort((a, b) => b.amount - a.amount)[0]?.rate ?? null;
    const accounts = [...new Set(its.map((i) => i.ledger_account ?? ""))];
    const lis = (e.line_items ?? []).filter((li) => li.net_amount != null);
    const liSum = r2(lis.reduce((s, li) => s + Number(li.net_amount), 0));

    type NewItem = { description: string | null; quantity: number | null; unit_price: number | null; tax_rate: number | null; net_amount: number; ledger_account: string | null; cost_center_id: string | null; material_ref: string | null };
    let neu: NewItem[] | null = null;
    if (accounts.length === 1 && lis.length > 0 && Math.abs(liSum - kn) <= 0.05) {
      neu = lis.map((li) => ({
        description: li.description ?? null,
        quantity: li.quantity ?? null,
        unit_price: li.unit_price ?? null,
        tax_rate: li.tax_rate != null ? Number(li.tax_rate) : domRate,
        net_amount: Number(li.net_amount),
        ledger_account: its[0].ledger_account,
        cost_center_id: its[0].cost_center_id,
        material_ref: its[0].material_ref,
      }));
    } else if (pos.length === 1 && bd.every((x) => x.rate > 0 || x.amount === 0)) {
      // BB-Positionen (Brutto) auf Netto herunterrechnen
      const rate = pos[0].rate;
      let rest = kn;
      neu = its.map((i, idx) => {
        const last = idx === its.length - 1;
        const n = last ? r2(rest) : r2(Number(i.net_amount) / (1 + rate / 100));
        rest = r2(rest - n);
        return { description: i.description, quantity: i.quantity, unit_price: null, tax_rate: rate, net_amount: n, ledger_account: i.ledger_account, cost_center_id: i.cost_center_id, material_ref: i.material_ref };
      });
    }
    if (!neu) { out.manuell.push(`${label}: gemischte Sätze/mehrere Konten - bitte von Hand`); continue; }

    const org = d.supplier_organization_id ? orgInfo.get(d.supplier_organization_id) : undefined;
    const orgVat = (org?.vat_id ?? "").replace(/\s/g, "").toUpperCase();
    const m = /^[A-Za-z]{2}/.exec(orgVat && orgVat !== ownVatId ? orgVat : "");
    const v = pruefeUst(e, { ownVatId, codes: taxCodes, supplierCountry: m ? m[0].toUpperCase() : null, supplierKind: (org?.foreign_supply_kind as "service" | "goods" | null) ?? null });
    const sicher = v.status === "sicher";
    out[sicher ? "sicher" : "vorschlag"]++;
    const mon = String(d.doc_date).slice(0, 7);
    const pm = (out.ustProMonat[mon] ??= { sicher: 0, vorschlag: 0 });
    pm[sicher ? "sicher" : "vorschlag"] += kt;
    if (dryRun) continue;

    const codeFor = (rate: number | null) =>
      !sicher ? null : rate != null && rate === 0 ? zeroCodeId : (taxCodes.find((c) => c.id === v.tax_code_id)?.treatment === "standard_de" ? (stdByRate(rate) ?? v.tax_code_id) : v.tax_code_id);
    const { error: de } = await supabase.from("incoming_document_item").delete().eq("incoming_document_id", d.id);
    if (de) throw new Error(`${label}: ${de.message}`);
    const { error: ie } = await supabase.from("incoming_document_item").insert(
      // Positionen auf Erlöskonten (8xxx, z.B. Gutschrift für Altpapier) sind Umsatz: kein Vorsteuer-Schlüssel.
      neu.map((x, i) => ({
        incoming_document_id: d.id,
        position: i + 1,
        ...x,
        tax_code_id: x.ledger_account?.startsWith("8") ? null : codeFor(x.tax_rate),
      })),
    );
    if (ie) throw new Error(`${label}: ${ie.message}`);
    const { error: ue } = await supabase.from("incoming_document").update({
      net_amount: kn,
      tax_amount: kt,
      tax_breakdown: e.tax_breakdown ?? null,
      tax_code_id: sicher && !neu.every((x) => x.ledger_account?.startsWith("8")) ? v.tax_code_id : null,
      status: sicher ? d.status : "extracted",
      extraction: {
        ...e,
        _ust: v,
        _bb: { ...(e._bb ?? {}), ust_korrektur: { am: new Date().toISOString(), vorher: { netto: wn, ust: wt }, nachher: { netto: kn, ust: kt } } },
      },
    }).eq("id", d.id);
    if (ue) throw new Error(`${label}: ${ue.message}`);
    out.korrigiert++;
  }
  return out;
}
