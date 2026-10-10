import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";
import { supabase } from "./supabase";
import { getObjectBytes, pdfFuerKi } from "./storage";
import { MODEL, bestellnummern, parseJson } from "./extractIncoming";
import { namensSchluessel } from "./organisationFinden";

/**
 * Eingangsbelege gegen ihr PDF prüfen (v. a. aus BuchhaltungsButler übernommene Amazon-Belege ohne Bestellnummer
 * und mit teils falschem Lieferanten): die KI liest Verkäufer, Rechnungsnummer, Betrag und Bestellnummer(n).
 * Gespeichert werden die Bestellnummern (für die Zuordnung in /bank) und das Prüfergebnis in pdf_pruefung -
 * Lieferant/Betrag werden NICHT überschrieben; Abweichungen erscheinen auf /eingangsrechnungen/pruefung.
 *   Standard: Amazon-artige Belege (Lieferant Amazon/Cursor, Rechnungsnummer DE6…/PL6…/CZ6…/FR6…/IT6…/ES6…)
 *   --nummer=LIKE       nur diese Rechnungsnummern     --neu   auch schon geprüfte noch einmal
 */
type Options = { dryRun?: boolean; limit?: number; nummer?: string; neu?: boolean };

const PROMPT = `Du bekommst eine Rechnung (PDF). Antworte ausschließlich mit JSON ohne Markdown:
{
  "verkaeufer": string|null,          // wer die Rechnung ausstellt (bei Amazon-Marktplatz der Händler, sonst z. B. "Amazon EU S.à r.l.")
  "verkaeufer_ust_id": string|null,
  "amazon": boolean,                  // Rechnung über Amazon (Amazon selbst oder Marktplatz-Händler)
  "rechnungsnummer": string|null,
  "rechnungsdatum": "YYYY-MM-DD"|null,
  "betrag_brutto": number|null,       // Rechnungsbetrag brutto (bei Gutschrift positiv)
  "waehrung": string|null,
  "gutschrift": boolean,
  "bestellnummern": [string]          // Bestellnummer(n), bei Amazon Format 123-1234567-1234567; [] wenn keine
}
Nichts erfinden, Unbekanntes als null.`;

type Pdf = {
  verkaeufer?: string | null;
  verkaeufer_ust_id?: string | null;
  amazon?: boolean;
  rechnungsnummer?: string | null;
  rechnungsdatum?: string | null;
  betrag_brutto?: number | null;
  waehrung?: string | null;
  gutschrift?: boolean;
  bestellnummern?: (string | null)[] | null;
};

const ohneLeer = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toUpperCase();
const ersterSchluessel = (s: string | null | undefined) => namensSchluessel(s ?? "").split(" ").filter((w) => w.length > 2)[0] ?? "";

export async function belegePdfPruefen(opts: Options = {}) {
  const { dryRun = false, limit = 200, neu = false } = opts;
  const client = new Anthropic({ apiKey: env.anthropicKey() });

  let q = supabase
    .from("incoming_document")
    .select("id, doc_number, doc_date, gross_amount, supplier_name, pdf_storage_key, payment_status")
    .neq("status", "rejected")
    .not("pdf_storage_key", "is", null)
    .order("doc_date")
    .limit(limit);
  q = opts.nummer
    ? q.ilike("doc_number", opts.nummer)
    : q.or(
        "supplier_name.ilike.%amazon%,supplier_name.ilike.cursor,doc_number.ilike.DE6%,doc_number.ilike.PL6%,doc_number.ilike.CZ6%,doc_number.ilike.FR6%,doc_number.ilike.IT6%,doc_number.ilike.ES6%",
      );
  if (!neu) q = q.is("pdf_pruefung", null);
  const { data: docs, error } = await q;
  if (error) throw new Error(error.message);

  const ergebnis = { belege: docs?.length ?? 0, ok: 0, abweichungen: 0, mitBestellnummer: 0, fehler: [] as string[], beispiele: [] as string[], dryRun };
  for (const d of docs ?? []) {
    try {
      const pdf = pdfFuerKi(await getObjectBytes(d.pdf_storage_key!));
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 1500,
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
      const t = res.content.find((c) => c.type === "text");
      const e = parseJson(t && "text" in t ? t.text : "") as Pdf;

      const abweichungen: string[] = [];
      if (e.rechnungsnummer && d.doc_number && ohneLeer(e.rechnungsnummer) !== ohneLeer(d.doc_number))
        abweichungen.push(`Rechnungsnummer im PDF: ${e.rechnungsnummer}`);
      if (typeof e.betrag_brutto === "number" && d.gross_amount != null && Math.abs(Math.abs(e.betrag_brutto) - Math.abs(Number(d.gross_amount))) > 0.01)
        abweichungen.push(`Betrag im PDF: ${e.betrag_brutto.toFixed(2)} ${e.waehrung ?? ""}`.trim());
      const pdfV = ersterSchluessel(e.verkaeufer);
      const wV = ersterSchluessel(d.supplier_name);
      // Amazon-Käufe (auch Marktplatz-Händler) laufen bewusst unter dem Kreditor Amazon – kein Abweichungsgrund
      const amazonKauf = !!e.amazon && /amazon/i.test(d.supplier_name ?? "");
      if (pdfV && wV && pdfV !== wV && !amazonKauf) abweichungen.push(`Verkäufer im PDF: ${e.verkaeufer}`);

      const best = bestellnummern(e.bestellnummern);
      if (best) ergebnis.mitBestellnummer++;
      if (abweichungen.length) ergebnis.abweichungen++;
      if (ergebnis.beispiele.length < 15 && (abweichungen.length || best))
        ergebnis.beispiele.push(`${d.doc_number}: ${best?.join(",") ?? "–"}${abweichungen.length ? " | " + abweichungen.join("; ") : ""}`);
      ergebnis.ok++;
      if (dryRun) continue;
      const { error: u } = await supabase
        .from("incoming_document")
        .update({
          bestellnummern: best,
          pdf_pruefung: {
            verkaeufer: e.verkaeufer ?? null,
            verkaeufer_ust_id: e.verkaeufer_ust_id ?? null,
            amazon: !!e.amazon,
            rechnungsnummer: e.rechnungsnummer ?? null,
            rechnungsdatum: e.rechnungsdatum ?? null,
            betrag_brutto: e.betrag_brutto ?? null,
            waehrung: e.waehrung ?? null,
            gutschrift: !!e.gutschrift,
            abweichungen,
            geprueft_at: new Date().toISOString(),
          },
        })
        .eq("id", d.id);
      if (u) throw new Error(u.message);
    } catch (err) {
      ergebnis.fehler.push(`${d.doc_number}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return ergebnis;
}
