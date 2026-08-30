import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabase } from "./supabase";
import { getObjectBytes } from "./storage";
import { pagedSelect } from "./db";

type Options = { dryRun?: boolean; limit?: number };

const MODEL = "claude-sonnet-5";

const PROMPT = `Du bekommst eine Eingangsrechnung (PDF) einer deutschen Druckerei.
Extrahiere die Daten und antworte ausschließlich mit JSON, ohne Markdown, in genau dieser Struktur:

{
  "doc_type": "invoice" | "credit_note" | "receipt" | "unknown",
  "supplier": { "name": string|null, "vat_id": string|null, "iban": string|null, "address": string|null },
  "doc_number": string|null,
  "doc_date": "YYYY-MM-DD"|null,
  "service_date": "YYYY-MM-DD"|null,
  "due_date": "YYYY-MM-DD"|null,
  "currency": string,           // meist "EUR"
  "net_amount": number|null,    // Gesamt netto
  "tax_amount": number|null,    // Gesamt USt
  "gross_amount": number|null,  // Gesamt brutto / Zahlbetrag
  "tax_breakdown": { "<satz in prozent>": <ust-betrag> },   // z.B. {"19": 12.34}
  "line_items": [
    { "position": number|null, "description": string, "quantity": number|null,
      "unit_price": number|null, "tax_rate": number|null, "net_amount": number|null }
  ],
  "confidence": number          // 0..1, wie sicher die Extraktion insgesamt ist
}

Regeln: Beträge als Zahl mit Punkt als Dezimaltrenner, ohne Währungssymbol.
Unbekannte Felder = null. Wenn es keine Positionsaufstellung gibt, line_items = [].`;

function parseJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("keine JSON-Antwort");
  return JSON.parse(m[0]);
}

type Extracted = {
  doc_type?: string;
  supplier?: { name?: string | null; vat_id?: string | null; iban?: string | null };
  doc_number?: string | null;
  doc_date?: string | null;
  service_date?: string | null;
  due_date?: string | null;
  currency?: string;
  net_amount?: number | null;
  tax_amount?: number | null;
  gross_amount?: number | null;
  tax_breakdown?: Record<string, number>;
  line_items?: {
    position?: number | null;
    description?: string;
    quantity?: number | null;
    unit_price?: number | null;
    tax_rate?: number | null;
    net_amount?: number | null;
  }[];
  confidence?: number;
};

const num = (v: unknown): number | null =>
  v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v);
const date = (v: unknown): string | null => {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

async function findSupplier(e: Extracted): Promise<string | null> {
  const vat = e.supplier?.vat_id?.replace(/\s+/g, "").toUpperCase();
  if (vat) {
    const { data } = await supabase
      .from("organization")
      .select("id")
      .ilike("vat_id", vat)
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  const name = e.supplier?.name?.trim();
  if (name && name.length > 3) {
    const { data } = await supabase
      .from("organization")
      .select("id")
      .ilike("name", `%${name.slice(0, 20).replace(/[%,]/g, "")}%`)
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

export async function extractIncoming(opts: Options = {}) {
  const { dryRun = false, limit = 20 } = opts;
  const client = new Anthropic({ apiKey: env.anthropicKey() });

  const docs = (
    await pagedSelect<{ id: string; pdf_storage_key: string | null; file_name: string | null }>(
      "incoming_document",
      "id, pdf_storage_key, file_name",
      ["status", "captured"],
    )
  ).slice(0, limit);

  let ok = 0;
  let failed = 0;

  for (const doc of docs) {
    if (!doc.pdf_storage_key) {
      failed += 1;
      continue;
    }
    try {
      const pdf = await getObjectBytes(doc.pdf_storage_key);
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdf.toString("base64"),
                },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      });
      const textPart = res.content.find((c) => c.type === "text");
      const e = parseJson(textPart && "text" in textPart ? textPart.text : "") as Extracted;

      if (dryRun) {
        console.log(
          `  ${doc.file_name}: ${e.supplier?.name ?? "?"} · ${e.doc_number ?? "?"} · ` +
            `${e.gross_amount ?? "?"} ${e.currency ?? ""} · ${e.line_items?.length ?? 0} Pos · conf ${e.confidence ?? "?"}`,
        );
        ok += 1;
        continue;
      }

      const supplierId = await findSupplier(e);
      const { error: uErr } = await supabase
        .from("incoming_document")
        .update({
          status: "extracted",
          doc_type: e.doc_type ?? "invoice",
          supplier_organization_id: supplierId,
          supplier_name: e.supplier?.name ?? null,
          supplier_vat_id: e.supplier?.vat_id ?? null,
          supplier_iban: e.supplier?.iban ?? null,
          doc_number: e.doc_number ?? null,
          doc_date: date(e.doc_date),
          service_date: date(e.service_date),
          due_date: date(e.due_date),
          currency: (e.currency ?? "EUR").slice(0, 3).toUpperCase(),
          net_amount: num(e.net_amount),
          tax_amount: num(e.tax_amount),
          gross_amount: num(e.gross_amount),
          tax_breakdown: e.tax_breakdown ?? null,
          extraction: e as unknown as Record<string, unknown>,
          extraction_model: MODEL,
          extraction_confidence: num(e.confidence),
          extracted_at: new Date().toISOString(),
        })
        .eq("id", doc.id);
      if (uErr) throw new Error(uErr.message);

      await supabase.from("incoming_document_item").delete().eq("incoming_document_id", doc.id);
      const items = (e.line_items ?? []).map((li, i) => ({
        incoming_document_id: doc.id,
        position: li.position ?? i + 1,
        description: li.description ?? null,
        quantity: num(li.quantity),
        unit_price: num(li.unit_price),
        tax_rate: num(li.tax_rate),
        net_amount: num(li.net_amount),
        raw: li,
      }));
      if (items.length) {
        const { error: iErr } = await supabase.from("incoming_document_item").insert(items);
        if (iErr) throw new Error(iErr.message);
      }
      ok += 1;
      process.stdout.write(`\r  extrahiert ${ok}/${docs.length}   `);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n  FEHLER ${doc.file_name}: ${msg}`);
      if (!dryRun) {
        await supabase
          .from("incoming_document")
          .update({ notes: `Extraktion fehlgeschlagen: ${msg.slice(0, 300)}` })
          .eq("id", doc.id);
      }
    }
  }
  process.stdout.write("\n");
  return { docs: docs.length, ok, failed, dryRun };
}
