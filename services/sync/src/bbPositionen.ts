import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabase } from "./supabase";
import { getObjectBytes } from "./storage";
import { MODEL, PROMPT, parseJson, itemExtras, seedAllocations, type Extracted } from "./extractIncoming";

/* --------------------------------------------------------------------------
 * Einzelpositionen für BB-importierte Eingangsrechnungen per KI-Erkennung.
 * Der BB-Import legt je Buchungszeile nur eine Sammelposition an. Hier wird
 * das PDF durch dieselbe KI-Erkennung wie bei Mail-Belegen geschickt und NUR
 * die Positionen übernommen - Kopfdaten, Kontierung (Aufwandskonto/Steuer-
 * schlüssel) und Status "geprüft" aus BB bleiben unangetastet.
 *  - Nur Belege mit genau einem Konto + Satz in BB: alle KI-Positionen erben
 *    dieses Konto/diesen Satz. Mehrere Konten/Sätze: BB-Aufteilung bleibt.
 *  - Weicht die Summe der KI-Positionen vom BB-Netto ab: nichts ersetzen.
 * Bearbeitete Belege bekommen `extraction` gesetzt (Rohantwort + Ergebnis),
 * ein erneuter Lauf überspringt sie.
 * -------------------------------------------------------------------------- */

type Options = { monat?: string; limit?: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function bbPositionen(opts: Options = {}) {
  const client = new Anthropic({ apiKey: env.anthropicKey() });
  let q = supabase
    .from("incoming_document")
    .select(
      "id, doc_number, doc_type, net_amount, pdf_storage_key, supplier_name, " +
        "incoming_document_item!incoming_document_item_incoming_document_id_fkey ( id, tax_rate, ledger_account, tax_code_id )",
    )
    .like("dedup_key", "bb:%")
    .not("pdf_storage_key", "is", null)
    .is("extraction", null)
    .order("doc_date");
  if (opts.monat) {
    const [y, m] = opts.monat.split("-").map(Number);
    q = q
      .gte("doc_date", `${opts.monat}-01`)
      .lte("doc_date", new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
  }
  const { data, error } = await q.limit(opts.limit ?? 1000);
  if (error) throw new Error(error.message);
  type Doc = {
    id: string;
    doc_number: string | null;
    doc_type: string;
    net_amount: number | null;
    pdf_storage_key: string;
    supplier_name: string | null;
    incoming_document_item: { id: string; tax_rate: number | null; ledger_account: string | null; tax_code_id: string | null }[];
  };
  const docs = (data ?? []) as unknown as Doc[];

  const out = {
    ausgewaehlt: docs.length,
    ersetzt: 0,
    positionenGesamt: 0,
    mehrereKontenBleiben: 0,
    keinePositionenErkannt: 0,
    summeAbweichend: [] as string[],
    fehler: [] as string[],
  };

  for (const d of docs) {
    const label = `${d.doc_number ?? d.id.slice(0, 8)} ${d.supplier_name ?? ""}`.trim();
    try {
      const combos = new Set(d.incoming_document_item.map((i) => `${i.ledger_account}|${Number(i.tax_rate)}|${i.tax_code_id}`));
      if (combos.size !== 1) {
        out.mehrereKontenBleiben++;
        await supabase.from("incoming_document").update({ extraction: { _bb: { positionen: "uebersprungen: mehrere Konten/Saetze" } } }).eq("id", d.id);
        continue;
      }
      const base = d.incoming_document_item[0];
      const pdf = await getObjectBytes(d.pdf_storage_key);
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
      const lis = (e.line_items ?? []).filter((li) => li.net_amount != null && li.description);
      let status = "ersetzt";
      if (!lis.length) {
        out.keinePositionenErkannt++;
        status = "keine Positionen erkannt";
      } else {
        const sum = r2(lis.reduce((s, li) => s + Number(li.net_amount), 0));
        const docNet = Math.abs(Number(d.net_amount ?? 0));
        if (Math.abs(Math.abs(sum) - docNet) > 0.05) {
          out.summeAbweichend.push(`${label}: KI ${sum} / BB ${docNet}`);
          status = "Summe weicht ab";
        } else {
          const { error: dErr } = await supabase.from("incoming_document_item").delete().eq("incoming_document_id", d.id);
          if (dErr) throw new Error(dErr.message);
          const credit = d.doc_type === "credit_note";
          const { data: ins, error: iErr } = await supabase.from("incoming_document_item").insert(
            lis.map((li, i) => ({
              incoming_document_id: d.id,
              position: i + 1,
              description: li.description ?? null,
              quantity: li.quantity ?? null,
              unit_price: li.unit_price ?? null,
              tax_rate: base.tax_rate,
              net_amount: credit ? Math.abs(Number(li.net_amount)) : Number(li.net_amount),
              ledger_account: base.ledger_account,
              tax_code_id: base.tax_code_id,
              ...itemExtras(li),
              raw: li,
            })),
          ).select("id, net_amount");
          if (iErr) throw new Error(iErr.message);
          await seedAllocations(ins ?? [], lis);
          out.ersetzt++;
          out.positionenGesamt += lis.length;
        }
      }
      await supabase
        .from("incoming_document")
        .update({ extraction: { ...(e as unknown as Record<string, unknown>), _bb: { positionen: status } }, extraction_model: MODEL, extracted_at: new Date().toISOString() })
        .eq("id", d.id);
    } catch (err) {
      out.fehler.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}
