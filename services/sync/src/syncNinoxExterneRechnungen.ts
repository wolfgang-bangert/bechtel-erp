import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { MODEL, PROMPT, parseJson, type Extracted } from "./extractIncoming";
import { generateInvoiceBooking } from "./syncInvoiceBookings";

/* --------------------------------------------------------------------------
 * Ausgangsrechnungen aus weiteren Ninox-Datenbanken abholen (außerhalb von Keyline):
 *  - Team D-TACK, Tabelle "Rechnungen" (H): abholbereit, wenn "Rechnung an Kunde gesendet" ein
 *    Datum hat; Kunde ist die verknüpfte Rechnungsadresse.
 *  - Team "Kunden Apps", Datenbank "Euchner", Tabelle "Rechnungen" (LB): abholbereit mit
 *    Rechnungs-PDF und Rechnungsnummer.
 * Beträge stehen nicht als Felder in Ninox, daher wird das Rechnungs-PDF mit derselben
 * KI-Erkennung wie die Eingangsbelege gelesen. Anlage als sales_invoice (source 'ninox') plus
 * Position(en) und Erlösbuchung; Dubletten (gleiche Ninox-ID oder gleiche Rechnungsnummer) werden
 * übersprungen.
 * -------------------------------------------------------------------------- */

type Quelle = {
  key: "dtack" | "euchner";
  label: string;
  team: string;
  db: string;
  table: string;
  fileField: string;
  dateField: string;
  numberField?: string;
  sentField?: string;
  /** Kundenname je Datensatz (für die Zuordnung zur Organisation) */
  kunde: (rec: Rec, ctx: Ctx) => string | null;
};
type Rec = { id: number; fields: Record<string, unknown> };
type Ctx = { adressen: Map<number, Record<string, unknown>>; euchnerKunde: string | null };

const QUELLEN: Quelle[] = [
  {
    key: "dtack",
    label: "D-TACK",
    team: "rdw5xd8hxvy1ow5px",
    db: "ppcll2s346bq",
    table: "H",
    fileField: "Rechnung",
    dateField: "Rechnungsdatum",
    sentField: "Rechnung an Kunde gesendet",
    kunde: (r, c) => {
      const ref = r.fields["Rechnungsadressen"];
      const id = Number(Array.isArray(ref) ? ref[0] : ref);
      const a = c.adressen.get(id);
      return a ? String(a["Name oder Firma"] ?? "") || null : null;
    },
  },
  {
    key: "euchner",
    label: "Euchner",
    team: "zia5tzf9tpxo3gava",
    db: "poivhuak8xsg",
    table: "LB",
    fileField: "Rechnung PDF",
    dateField: "Rechnungsdatum",
    numberField: "Rechnungsnummer",
    kunde: (_r, c) => c.euchnerKunde,
  },
];

const nxHeaders = () => ({ Accept: "application/json", Authorization: `Bearer ${env.ninox.key()}` });
const nxUrl = (q: Quelle, path: string) => `${env.ninox.base()}/teams/${q.team}/databases/${q.db}${path}`;

async function nxRecords(q: Quelle, table: string): Promise<Rec[]> {
  const out: Rec[] = [];
  for (let page = 0; page < 100; page++) {
    const res = await fetch(`${nxUrl(q, `/tables/${table}/records`)}?page=${page}&perPage=500`, { headers: nxHeaders() });
    if (!res.ok) throw new Error(`Ninox ${q.label}/${table}: ${res.status} ${(await res.text()).slice(0, 150)}`);
    const rows = (await res.json()) as Rec[];
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}

async function nxPdf(q: Quelle, recId: number, fileName: string): Promise<Buffer> {
  const res = await fetch(nxUrl(q, `/tables/${q.table}/records/${recId}/files/${encodeURIComponent(fileName)}`), { headers: nxHeaders() });
  if (!res.ok) throw new Error(`PDF ${fileName}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
const r2 = (n: number) => Math.round(n * 100) / 100;
const dateOnly = (v: unknown) => (v ? String(v).slice(0, 10) : null);

export async function syncNinoxExterneRechnungen(opts: {
  dryRun?: boolean;
  since?: string;
  quelle?: string;
  limit?: number;
  nurNummern?: Set<string>;
}) {
  const since = opts.since ?? `${new Date().getFullYear()}-01-01`;
  const client = new Anthropic({ apiKey: env.anthropicKey() });

  const orgs = await pagedSelect<{ id: string; name: string }>("organization", "id, name");
  const orgsByName = new Map<string, string[]>();
  for (const o of orgs) orgsByName.set(norm(o.name), [...(orgsByName.get(norm(o.name)) ?? []), o.id]);

  const inv = await pagedSelect<{
    external_id: string | null;
    invoice_number: string | null;
    organization_id: string | null;
    invoice_date: string | null;
    gross_total: number | null;
  }>("sales_invoice", "external_id, invoice_number, organization_id, invoice_date, gross_total");
  // Schutz vor Doppelzählung: dieselbe Rechnung könnte unter anderer Nummer schon aus Keyline da sein.
  const haveKey = new Set(
    inv
      .filter((i) => i.organization_id && i.invoice_date && i.gross_total != null)
      .map((i) => `${i.organization_id}|${i.invoice_date}|${Number(i.gross_total).toFixed(2)}`),
  );
  const haveExt = new Set(inv.map((i) => i.external_id).filter((x): x is string => !!x));
  const haveNr = new Set(inv.map((i) => (i.invoice_number ?? "").trim()).filter(Boolean));

  const out = {
    dryRun: !!opts.dryRun,
    quellen: {} as Record<string, { kandidaten: number; schonVorhanden: number; angelegt: number; probleme: string[] }>,
  };

  for (const q of QUELLEN.filter((x) => !opts.quelle || x.key === opts.quelle)) {
    const stat = { kandidaten: 0, schonVorhanden: 0, angelegt: 0, probleme: [] as string[] };
    out.quellen[q.key] = stat;

    const ctx: Ctx = { adressen: new Map(), euchnerKunde: null };
    if (q.key === "dtack") for (const r of await nxRecords(q, "J")) ctx.adressen.set(r.id, r.fields);
    if (q.key === "euchner") {
      const k = (await nxRecords(q, "H"))[0];
      ctx.euchnerKunde = k ? String(k.fields["Name oder Firma"] ?? "") || null : null;
    }

    const recs = (await nxRecords(q, q.table))
      .filter((r) => {
        const d = dateOnly(r.fields[q.dateField]);
        if (!d || d < since) return false;
        if (!r.fields[q.fileField]) return false;
        if (q.sentField && !r.fields[q.sentField]) return false;
        if (q.numberField && !String(r.fields[q.numberField] ?? "").trim()) return false;
        return true;
      })
      .sort((a, b) => String(a.fields[q.dateField]).localeCompare(String(b.fields[q.dateField])));

    const todo: Rec[] = [];
    for (const r of recs) {
      const ext = `ninox:${q.key}:${q.table}:${r.id}`;
      // Rechnungsnummer vorab: Euchner-Feld, bei D-TACK aus dem Dateinamen ("Rechnung 260H105 vom ...").
      // So kostet eine schon vorhandene Rechnung (z.B. von Hand angelegt) keinen KI-Aufruf pro Lauf.
      const fileName0 = String(r.fields[q.fileField] ?? "");
      const nr = q.numberField
        ? String(r.fields[q.numberField]).trim()
        : (/^Rechnung\s+(\S+)\s+vom\b/i.exec(fileName0)?.[1] ?? "");
      if (opts.nurNummern && !(nr && opts.nurNummern.has(nr))) continue;
      if (haveExt.has(ext) || (nr && haveNr.has(nr))) stat.schonVorhanden++;
      else todo.push(r);
    }
    stat.kandidaten = todo.length + stat.schonVorhanden;
    const batch = opts.limit ? todo.slice(0, opts.limit) : todo;
    if (opts.dryRun) {
      stat.probleme.push(`neu anzulegen: ${batch.length} (${batch.map((r) => String(r.fields[q.fileField]).replace(/\.pdf$/i, "")).slice(0, 6).join(", ")}${batch.length > 6 ? ", …" : ""})`);
      continue;
    }

    const worker = async (r: Rec) => {
      const fileName = String(r.fields[q.fileField]);
      try {
        const pdf = await nxPdf(q, r.id, fileName);
        const res = await client.messages.create({
          model: MODEL,
          max_tokens: 16000,
          messages: [
            {
              role: "user",
              content: [
                { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
                { type: "text", text: PROMPT },
              ],
            },
          ],
        });
        const textPart = res.content.find((c) => c.type === "text");
        const e = parseJson(textPart && "text" in textPart ? textPart.text : "") as Extracted;

        const net = Number(e.net_amount), tax = Number(e.tax_amount ?? 0), gross = Number(e.gross_amount);
        if (![net, gross].every(Number.isFinite) || Math.abs(net + tax - gross) > 0.02) {
          stat.probleme.push(`${fileName}: Beträge nicht stimmig (netto ${e.net_amount}, USt ${e.tax_amount}, brutto ${e.gross_amount})`);
          return;
        }
        const nrNinox = q.numberField ? String(r.fields[q.numberField]).trim() : "";
        const nr = nrNinox || (e.doc_number ?? "").trim() || (/(\d{2}\d{0,2}H\d+)/i.exec(fileName)?.[1] ?? "");
        if (!nr) {
          stat.probleme.push(`${fileName}: keine Rechnungsnummer erkannt`);
          return;
        }
        if (haveNr.has(nr)) {
          stat.schonVorhanden++;
          return;
        }
        const kundeName = q.kunde(r, ctx);
        let cand = kundeName ? (orgsByName.get(norm(kundeName)) ?? []) : [];
        if (cand.length === 0 && kundeName) {
          // lockerer Treffer: Organisationsname beginnt mit dem ersten Wort des Kundennamens (z.B. "Euchner")
          const first = norm(kundeName.split(/[\s,]+/)[0] ?? "");
          if (first.length >= 4) {
            const starts = orgs.filter((o) => norm(o.name).startsWith(first));
            if (starts.length === 1) cand = [starts[0].id];
          }
        }
        if (cand.length !== 1) stat.probleme.push(`${nr}: Kunde „${kundeName ?? "?"}" ${cand.length === 0 ? "nicht gefunden" : "mehrdeutig"} - ohne Organisation angelegt`);

        const invDate0 = dateOnly(e.doc_date) ?? dateOnly(r.fields[q.dateField]);
        if (cand.length === 1 && invDate0 && haveKey.has(`${cand[0]}|${invDate0}|${Math.abs(gross).toFixed(2)}`)) {
          stat.probleme.push(`${nr}: mögliche Dublette (gleicher Kunde, Datum ${invDate0}, Brutto ${Math.abs(gross).toFixed(2)} schon vorhanden) - übersprungen`);
          return;
        }
        const credit = gross < 0;
        const sign = credit ? -1 : 1;
        const rate = (() => {
          const k = Object.keys(e.tax_breakdown ?? {});
          return k.length ? Number(k.sort((a, b) => (e.tax_breakdown![b] ?? 0) - (e.tax_breakdown![a] ?? 0))[0]) : net !== 0 ? Math.round((tax / net) * 100) : 19;
        })();
        const invoiceDate = dateOnly(e.doc_date) ?? dateOnly(r.fields[q.dateField]);
        const ext = `ninox:${q.key}:${q.table}:${r.id}`;

        const { data: created, error } = await supabase
          .from("sales_invoice")
          .insert({
            source: "ninox",
            external_id: ext,
            organization_id: cand.length === 1 ? cand[0] : null,
            invoice_number: nr,
            kind: credit ? "credit_note" : "invoice",
            invoice_date: invoiceDate,
            due_date: dateOnly(e.due_date),
            net_total: r2(Math.abs(net)),
            tax_total: r2(Math.abs(tax)),
            gross_total: r2(Math.abs(gross)),
            tax_breakdown: e.tax_breakdown ?? { [String(rate)]: r2(Math.abs(tax)) },
            currency: (e.currency ?? "EUR").slice(0, 3).toUpperCase(),
            raw: { ninox: { quelle: q.key, tabelle: q.table, id: r.id, datei: fileName } },
            synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);

        const lis = (e.line_items ?? []).filter((li) => li.net_amount != null);
        const liSum = r2(lis.reduce((s, li) => s + Number(li.net_amount), 0));
        const useLines = lis.length > 0 && Math.abs(liSum - net) <= 0.05;
        const items = useLines
          ? lis.map((li, i) => ({
              sales_invoice_id: created!.id,
              source: "ninox",
              external_id: `${ext}:${i + 1}`,
              position: i + 1,
              description: li.description ?? null,
              quantity: li.quantity ?? null,
              unit_price: li.unit_price != null ? sign * Math.abs(Number(li.unit_price)) : null,
              tax_rate: li.tax_rate ?? rate,
              net_amount: r2(Math.abs(Number(li.net_amount))) * (Number(li.net_amount) < 0 && !credit ? -1 : 1),
            }))
          : [
              {
                sales_invoice_id: created!.id,
                source: "ninox",
                external_id: `${ext}:1`,
                position: 1,
                description: `Rechnung ${nr} (${q.label})`,
                quantity: 1,
                unit_price: r2(Math.abs(net)),
                tax_rate: rate,
                net_amount: r2(Math.abs(net)),
              },
            ];
        const { error: ie } = await supabase.from("sales_invoice_item").insert(items);
        if (ie) throw new Error(ie.message);
        await generateInvoiceBooking(created!.id);
        haveNr.add(nr);
        stat.angelegt++;
      } catch (err) {
        stat.probleme.push(`${fileName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    // vier PDFs parallel
    let next = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < batch.length) await worker(batch[next++]);
      }),
    );
  }
  return out;
}
