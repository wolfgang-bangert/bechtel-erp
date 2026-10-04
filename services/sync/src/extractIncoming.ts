import { createHash, randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { seitenNeuZusammenstellen, seitenzahl } from "@werk/shared/pdf/seiten";
import { env } from "./env";
import { supabase } from "./supabase";
import { getObjectBytes, putObject, deleteObject, prefix } from "./storage";
import { pagedSelect } from "./db";
import { pruefeUst, loadOwnVatId, type UstTaxCode } from "./ustCheck";
import { pruneReceiptDuplicates } from "./pruneReceipts";
import { forwardDunnings } from "./forwardDunnings";

type Options = { dryRun?: boolean; limit?: number };

export const MODEL = "claude-sonnet-5";

export const PROMPT = `Du bekommst einen Eingangsbeleg (PDF) einer deutschen Druckerei.
Extrahiere die Daten und antworte ausschließlich mit JSON, ohne Markdown, in genau dieser Struktur:

{
  "doc_type": "invoice" | "credit_note" | "receipt" | "payment_advice" | "dunning" | "other" | "unknown",
  "supplier": { "name": string|null, "vat_id": string|null, "iban": string|null, "address": string|null },
  "marketplace": string|null,   // siehe Regel zu Marktplatz-Rechnungen unten
  "doc_number": string|null,
  "doc_date": "YYYY-MM-DD"|null,
  "service_date": "YYYY-MM-DD"|null,
  "due_date": "YYYY-MM-DD"|null,
  "currency": string,           // meist "EUR"
  "net_amount": number|null,    // Gesamt netto
  "tax_amount": number|null,    // Gesamt USt
  "gross_amount": number|null,  // Gesamt brutto / Zahlbetrag
  "payment_method": "card" | "paypal" | null,  // siehe Regel unten
  "vat_check": {                // wörtliche USt-Angaben des Belegs, siehe Regel unten
    "reverse_charge": boolean,           // Beleg nennt ausdrücklich Reverse Charge/§ 13b/Steuerschuldnerschaft des Leistungsempfängers
    "tax_free_reason": string|null,      // Begründung für 0 % / steuerfrei, wörtlich ("steuerfrei nach § 4 UStG", "Kleinunternehmer § 19", "innergemeinschaftliche Lieferung", "Drittland"…)
    "statement": string|null             // kurzer wörtlicher USt-Hinweis des Belegs, z.B. "MwSt 19 % 12,92"
  },
  "tax_breakdown": { "<satz in prozent>": <ust-betrag> },   // z.B. {"19": 12.34}
  "line_items": [
    { "position": number|null, "description": string, "quantity": number|null,
      "unit_price": number|null, "tax_rate": number|null, "net_amount": number|null,
      "sku": string|null,                 // Artikelnummer/SKU/Art.-Nr. des LIEFERANTEN
      "reference_text": string|null,      // Referenz-/Kommissionstext der Position (z.B. "Referenztext: W7-MN-2S Filseck")
      "order_references": [string] }      // Auftragsreferenzen der Position, siehe Regel unten
  ],
  "payment_terms": {
    "net_due_date": "YYYY-MM-DD"|null,    // Nettofälligkeit (Datum)
    "net_days": number|null,              // falls nur "zahlbar innerhalb 30 Tagen" angegeben
    "discount_date": "YYYY-MM-DD"|null,   // letzter Tag mit Skonto
    "discount_days": number|null,         // falls nur "2% Skonto innerhalb 14 Tagen"
    "discount_percent": number|null,      // Skontosatz in Prozent, z.B. 2
    "discount_amount": number|null        // Skontobetrag in Währung, falls genannt
  },
  "payee": {
    "differs": boolean,                   // true, wenn NICHT an den Lieferanten selbst gezahlt wird
    "name": string|null,                  // Name des abweichenden Zahlungsempfängers
    "iban": string|null,                  // dessen IBAN
    "reason": string|null                 // "Insolvenzverwalter" | "Abtretung/Factoring" | "Inkasso" | ...
  },
  "advice": {
    "debit_date": "YYYY-MM-DD"|null,        // angekündigtes Belastungsdatum
    "mandate_reference": string|null,
    "creditor_id": string|null,             // Gläubiger-ID (DE...)
    "referenced_doc_numbers": [string],     // Rechnungsnummer(n), auf die sich das Avis bezieht
    "total_amount": number|null             // Gesamt-Lastschriftbetrag
  },
  "dunning": {
    "level": number|null,                   // Mahnstufe (1, 2, 3 …)
    "referenced_doc_numbers": [string],     // angemahnte Rechnungsnummer(n)
    "amount_due": number|null,              // offener Betrag inkl. Gebühren
    "dunning_fee": number|null,             // Mahngebühr / Verzugskosten
    "deadline": "YYYY-MM-DD"|null           // neue Zahlungsfrist
  },
  "confidence": number,         // 0..1, wie sicher die Extraktion insgesamt ist
  "split_pages": [[number, number]] | null   // siehe Regel zu Sammel-PDFs unten
}

Regeln:
- "split_pages": NUR setzen, wenn dieses PDF MEHRERE eigenständige, voneinander
  unabhängige Rechnungen/Gutschriften enthält (typisch: Sammel-PDF aus einem
  Bestellportal mit mehreren Marktplatz-Verkäufern, erkennbar an mehreren
  unterschiedlichen Rechnungsnummern und/oder Verkäufern/Lieferanten, oft auch
  je eigenem "Seite 1 von 1"-Vermerk). Dann ein Eintrag [Startseite, Endseite]
  (1-indiziert, inklusive) PRO Rechnung, in Reihenfolge, alle Seiten des PDFs
  müssen genau einem Eintrag zugeordnet sein. Die restlichen Felder oben
  (supplier, doc_number, Beträge, line_items, ...) dürfen dann leer/null
  bleiben - sie werden bei Erkennung von split_pages verworfen und jede
  Teil-Rechnung separat neu extrahiert. Bei einer normalen Rechnung (auch mit
  mehreren Seiten, die zusammengehören, z.B. mit Positionsliste auf Seite 2):
  split_pages = null, restliche Felder wie gewohnt füllen.
- line_items[].description: der VOLLSTÄNDIGE Positionstext, nichts weglassen und
  nichts zusammenfassen. Übernimm ALLE Textzeilen, die zu der Position gehören,
  aus allen Spalten (z.B. Auftragsnummer des Lieferanten, Referenz-/Kommissionstext,
  Rabatt, Leistungsdatum, Zolltarifnummer, Gewicht, Format/Maße, Zertifikate,
  Produktionszeit, Lieferhinweise, Material, Ausführung). Jede Zeile getrennt durch
  "\\n", in der Lesereihenfolge. Rein dekorative Elemente (Logos, Vorschaubilder)
  weglassen.
- line_items[].sku: Artikelnummer / SKU / Art.-Nr. / Produktnummer des LIEFERANTEN
  für diese Position, falls auf dem Beleg vorhanden, sonst null. Keine Auftrags-
  oder Rechnungsnummer.
- line_items[].order_references: Die Referenz(en), mit denen der Aussteller die Position
  einem Kundenauftrag zuordnet (Felder wie "Referenztext", "Ihre Referenz", "Kommission",
  "Projekt", "Ihre Bestellnummer"). Nur das eigentliche Kennzeichen, ohne Beiwerk:
  aus "Referenztext: W7-MN-2S Filseck" wird ["W7-MN-2S"]. Stehen mehrere Referenzen
  da (z.B. "W7-MN-2S, W7-MN-3T"), je eine pro Eintrag. Nicht gemeint: die Auftrags-/
  Rechnungsnummer des Lieferanten selbst. Keine Referenz = [].
- USt STRIKT vom Beleg übernehmen, niemals berechnen, schätzen oder "üblich" annehmen:
  "tax_breakdown" nur aus den auf dem Beleg ausgewiesenen MwSt-/USt-Zeilen (Satz → Betrag),
  "tax_amount" = dort ausgewiesene Summe, "line_items[].tax_rate" nur, wenn der Satz für die
  Position erkennbar ist (sonst null). Weist der Beleg keine USt aus, bleibt tax_breakdown {}
  und tax_amount 0/null. "vat_check.reverse_charge" nur true, wenn der Beleg das ausdrücklich
  schreibt. Bei Zweifel immer null/false/{} statt zu raten.
- Weist der Beleg mehrere Steuergruppen/Steuersätze aus (z.B. Zeilen mit Kennzeichen wie "(20)" und "(33)",
  deren Legende "Steuergruppe … 0,00 %" bzw. "… 19,00 %" lautet), ordne JEDER Position über dieses Kennzeichen
  ihren Satz zu (line_items[].tax_rate, auch 0) und fasse die Zeilen nicht zusammen. tax_breakdown enthält
  je ausgewiesenem Satz den USt-Betrag (für 0 % den Betrag 0).
- Beträge als Zahl mit Punkt als Dezimaltrenner, ohne Währungssymbol.
- Unbekannte Felder = null. Wenn es keine Positionsaufstellung gibt, line_items = [].
- doc_type "payment_advice" NUR für ein Zahlungs-/Lastschriftavis: Titel/Text wie
  "Lastschrift-Avis", "Lastschriftavis", "Avis SEPA-(Firmen-)Lastschrift",
  "Einzugsavis", "Belastungsanzeige", "Zahlungsavis". Ein Avis kündigt eine
  Kontobelastung an, hat KEINE eigene Leistungsbeschreibung/Positionen und
  verweist auf eine oder mehrere bereits existierende Rechnungsnummern.
  Dann: "referenced_doc_numbers" = diese Rechnungsnummern, "advice.total_amount"
  = Summe der Lastschrift, "advice.debit_date" = Belastungsdatum. line_items = [].
- doc_type "dunning" für eine Mahnung / Zahlungserinnerung / Zahlungsaufforderung:
  fordert die Zahlung einer bereits gestellten Rechnung an, oft mit Mahnstufe
  und Mahngebühr. Dann: "dunning.referenced_doc_numbers" = angemahnte
  Rechnungsnummer(n), "dunning.amount_due" = offener Betrag, "dunning.level" =
  Mahnstufe, "dunning.deadline" = neue Frist. line_items = [].
- doc_type "other" für Dokumente, die KEIN buchbarer Beleg sind und weder Mahnung noch Zahlungsavis: AGB,
  Widerrufsbelehrung, Datenschutzhinweise, Werbung/Newsletter, Preislisten, Kataloge, Angebote,
  Auftragsbestätigungen, Lieferscheine, Verträge, Zertifikate, reine Anschreiben. Diese haben keinen
  Rechnungsbetrag zum Zahlen. Im Zweifel zwischen "invoice" und "other": hat das Dokument eine Rechnungsnummer
  UND einen Zahlbetrag, ist es "invoice". Bei "other" bleiben Beträge/line_items leer (null/[]).
- Für nicht zutreffende Belege bleiben "advice" und "dunning" mit null/[] gefüllt.
- "payment_terms": aus den Zahlungsbedingungen lesen ("Zahlbar bis …",
  "2% Skonto bis TT.MM., netto bis TT.MM.", "Zahlung innerhalb 14 Tagen mit
  2% Skonto, 30 Tage netto"). Wenn nur Tage genannt sind, "net_days"/
  "discount_days" füllen (die Datumsfelder darfst du null lassen). Ist keine
  Skontoregel angegeben, discount_* = null.
- "payee.differs" = true bei Hinweisen wie "Zahlung ausschließlich an …",
  "Insolvenzverwalter", "Forderung wurde abgetreten an …", "Factoring", "RatePay"/
  "Ratepay", "Inkasso", oder wenn der Kontoinhaber vom Lieferantennamen abweicht.
  Dann "payee.name"/"payee.iban"/"payee.reason" füllen. Sonst differs=false.
- "marketplace": Rechnungssteller (supplier) ist rechtlich der eigentliche
  Verkäufer/Kreditor - bei manchen Bestellportalen (z.B. Amazon Marketplace,
  eBay) tritt aber die Plattform als reiner Vermittler auf, erkennbar z.B. an
  "Verkauft von <Drittanbieter>" bei gleichzeitigem Hinweis auf die Plattform
  (Kundenservice-Link wie amazon.de/contact-us, Layout/Bestellnummernformat,
  Domain in Absenderadresse). Dann marketplace = Name der Plattform (z.B.
  "Amazon") - der Drittanbieter bleibt trotzdem der eigentliche supplier.name
  (Kreditor für die Buchhaltung). Sonst marketplace = null.
- "payment_method": NUR setzen, wenn der Beleg selbst explizit eine Zahlung
  per Kreditkarte ("Kreditkarte", "Kartenzahlung", "Visa", "Mastercard",
  maskierte Kartennummer wie "**** 1234") oder per PayPal ("PayPal", "Bezahlt
  mit PayPal") ausweist - dann "card" bzw. "paypal". Solche Beträge landen
  nicht als Einzelzahlung auf dem Kontoauszug, sondern gebündelt in einer
  Kreditkarten-/PayPal-Sammelabrechnung. Bei normaler Überweisung/Lastschrift
  oder wenn nichts dazu erkennbar ist: payment_method = null.`;

export function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("keine JSON-Antwort");
  const body = text.slice(start);
  try {
    // gierig bis zur letzten schließenden Klammer
    const end = body.lastIndexOf("}");
    return JSON.parse(body.slice(0, end + 1));
  } catch {
    return JSON.parse(repairTruncatedJson(body));
  }
}

/**
 * Repariert eine abgeschnittene JSON-Antwort (max_tokens erreicht): schneidet
 * hinter dem letzten vollständigen Array-/Objekt-Element ab und schließt offene
 * Klammern + Strings. Reicht, um Kopfdaten und die bis dahin gelesenen
 * Positionen zu retten.
 */
function repairTruncatedJson(s: string): string {
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  let lastSafe = -1; // Index nach einem Element-Ende auf Tiefe >= 1
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length >= 1) lastSafe = i + 1;
    } else if (ch === "," && stack.length >= 1) lastSafe = i;
  }
  let head = lastSafe > 0 ? s.slice(0, lastSafe) : s;
  if (head.endsWith(",")) head = head.slice(0, -1);
  // offene Struktur anhand einer frischen Analyse schließen
  inStr = false;
  esc = false;
  const close: string[] = [];
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") close.push("}");
    else if (ch === "[") close.push("]");
    else if (ch === "}" || ch === "]") close.pop();
  }
  if (inStr) head += '"';
  return head + close.reverse().join("");
}

export type Extracted = {
  doc_type?: string;
  supplier?: { name?: string | null; vat_id?: string | null; iban?: string | null };
  marketplace?: string | null;
  payment_method?: "card" | "paypal" | null;
  doc_number?: string | null;
  doc_date?: string | null;
  service_date?: string | null;
  due_date?: string | null;
  currency?: string;
  net_amount?: number | null;
  tax_amount?: number | null;
  gross_amount?: number | null;
  tax_breakdown?: Record<string, number>;
  vat_check?: { reverse_charge?: boolean | null; tax_free_reason?: string | null; statement?: string | null } | null;
  line_items?: {
    position?: number | null;
    description?: string;
    quantity?: number | null;
    unit_price?: number | null;
    tax_rate?: number | null;
    net_amount?: number | null;
    sku?: string | null;
    reference_text?: string | null;
    order_references?: (string | null)[] | null;
  }[];
  advice?: {
    debit_date?: string | null;
    mandate_reference?: string | null;
    creditor_id?: string | null;
    referenced_doc_numbers?: (string | null)[] | null;
    total_amount?: number | null;
  } | null;
  dunning?: {
    level?: number | null;
    referenced_doc_numbers?: (string | null)[] | null;
    amount_due?: number | null;
    dunning_fee?: number | null;
    deadline?: string | null;
  } | null;
  payment_terms?: {
    net_due_date?: string | null;
    net_days?: number | null;
    discount_date?: string | null;
    discount_days?: number | null;
    discount_percent?: number | null;
    discount_amount?: number | null;
  } | null;
  payee?: {
    differs?: boolean | null;
    name?: string | null;
    iban?: string | null;
    reason?: string | null;
  } | null;
  confidence?: number;
  split_pages?: [number, number][] | null;
};

/** Prüft, ob die vom Modell gelieferten Seitenbereiche gültig sind: sortiert,
 *  lückenlos, deckt genau 1..pageCount ab. Bei Zweifel lieber ablehnen (dann
 *  läuft die normale Einzelrechnungs-Extraktion weiter) als einen kaputten
 *  Split zu erzeugen. */
function validSplitRanges(ranges: [number, number][], pageCount: number): boolean {
  if (ranges.length < 2) return false;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let next = 1;
  for (const [start, end] of sorted) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start !== next) return false;
    next = end + 1;
  }
  return next - 1 === pageCount;
}

type CapturedDoc = {
  id: string;
  pdf_storage_key: string | null;
  file_name: string | null;
  email_subject: string | null;
  source: string;
  email_message_id: string | null;
  email_from: string | null;
  email_date: string | null;
  dedup_key: string;
};

/**
 * Teilt ein Sammel-PDF mit mehreren eigenständigen Rechnungen (laut KI-
 * erkannten Seitenbereichen) in eigene Teil-PDFs auf, legt je eine neue
 * "captured"-Zeile an (übernimmt Quelle/E-Mail-Metadaten vom Original) und
 * entfernt das Sammel-Dokument. Gibt false zurück (kein Split durchgeführt),
 * wenn die Seitenbereiche ungültig sind - dann läuft die normale
 * Einzelrechnungs-Extraktion für dieses Dokument einfach weiter.
 */
async function trySplitMultiInvoice(
  doc: CapturedDoc,
  ranges: [number, number][],
  pdf: Buffer,
): Promise<CapturedDoc[] | false> {
  const pageCount = await seitenzahl(pdf);
  if (!validSplitRanges(ranges, pageCount)) return false;

  const year = (doc.email_date ? new Date(doc.email_date) : new Date()).getFullYear().toString();
  const uploaded: string[] = [];
  const children: CapturedDoc[] = [];
  try {
    for (let i = 0; i < ranges.length; i++) {
      const [start, end] = ranges[i];
      const reihenfolge = Array.from({ length: end - start + 1 }, (_, j) => ({
        dateiIndex: 0,
        seite: start + j,
      }));
      const bytes = await seitenNeuZusammenstellen([pdf], reihenfolge);
      const key = prefix.eingangsrechnung(year, randomUUID());
      await putObject(key, Buffer.from(bytes), "application/pdf");
      uploaded.push(key);

      const fileName = `${doc.file_name ?? "beleg.pdf"} (Teil ${i + 1}/${ranges.length})`;
      const dedupKey = `${doc.dedup_key}#${i + 1}`;
      const { data: inserted, error } = await supabase
        .from("incoming_document")
        .insert({
          source: doc.source,
          email_message_id: doc.email_message_id,
          email_from: doc.email_from,
          email_subject: doc.email_subject,
          email_date: doc.email_date,
          file_name: fileName,
          pdf_storage_key: key,
          file_sha256: createHash("sha256").update(bytes).digest("hex"),
          dedup_key: dedupKey,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message ?? "Teil-Dokument konnte nicht angelegt werden.");
      children.push({
        id: inserted.id,
        pdf_storage_key: key,
        file_name: fileName,
        email_subject: doc.email_subject,
        source: doc.source,
        email_message_id: doc.email_message_id,
        email_from: doc.email_from,
        email_date: doc.email_date,
        dedup_key: dedupKey,
      });
    }
  } catch (err) {
    await Promise.all(uploaded.map((k) => deleteObject(k).catch(() => {})));
    throw err;
  }

  await supabase.from("incoming_document").delete().eq("id", doc.id);
  if (doc.pdf_storage_key) await deleteObject(doc.pdf_storage_key).catch(() => {});
  return children;
}

/** Datum + n Tage → "YYYY-MM-DD". */
function addDays(iso: string | null, days: number | null | undefined): string | null {
  if (!iso || days == null || !Number.isFinite(days)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

/** Betreff/Dateiname deuten auf ein Zahlungs-/Lastschriftavis hin. */
function looksLikeAdvice(...parts: (string | null | undefined)[]): boolean {
  const s = parts.filter(Boolean).join(" ").toLowerCase();
  return /\bavis\b|lastschrift[-\s]?avis|einzugsavis|belastungsanzeige|zahlungsavis|sepa-?(firmen)?lastschrift/.test(
    s,
  );
}

/** Betreff/Dateiname deuten auf eine Mahnung hin. */
function looksLikeDunning(...parts: (string | null | undefined)[]): boolean {
  const s = parts.filter(Boolean).join(" ").toLowerCase();
  return /mahnung|mahnstufe|zahlungserinnerung|zahlungsaufforderung|letzte\s+erinnerung|verzug|inkasso|payment\s+reminder|overdue|dunning/.test(
    s,
  );
}

/** doppelte Elemente entfernen, leere raus, alles getrimmt. */
function cleanRefs(...lists: ((string | null)[] | null | undefined)[]): string[] {
  return Array.from(
    new Set(
      lists
        .flatMap((l) => l ?? [])
        .map((s) => String(s ?? "").trim())
        .filter(Boolean),
    ),
  );
}

/** Zusatzfelder einer Positionszeile: Lieferanten-Artikelnummer und Referenztext. */
export const itemExtras = (li: NonNullable<Extracted["line_items"]>[number]) => ({
  supplier_sku: li.sku?.trim() || null,
  order_reference: li.reference_text?.trim() || null,
});

/**
 * Auftragsreferenzen aus dem Beleg als Zuordnungen der Position anlegen (je Referenz
 * eine Zeile, Betrag gleichmäßig verteilt - der Nutzer korrigiert im Beleg). Existiert
 * ein sales_order mit dieser Nummer, wird er verknüpft; sonst bleibt nur der Text.
 * `inserted` muss in derselben Reihenfolge wie `lineItems` stehen.
 */
export async function seedAllocations(
  inserted: { id: string; net_amount: number | null }[],
  lineItems: NonNullable<Extracted["line_items"]>,
): Promise<void> {
  const refsOf = (li: (typeof lineItems)[number]) =>
    Array.from(new Set((li.order_references ?? []).map((r) => r?.trim()).filter((r): r is string => !!r)));
  const all = Array.from(new Set(lineItems.flatMap(refsOf)));
  if (!all.length) return;
  // Keyline zeigt "W7-MN-2S", gespeichert ist "W7MN2S".
  const norm = (r: string) => r.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const { data: orders } = await supabase
    .from("sales_order")
    .select("id, order_number")
    .in("order_number", Array.from(new Set(all.map(norm))));
  const byNumber = new Map((orders ?? []).map((o) => [o.order_number as string, o.id as string]));
  const rows: Record<string, unknown>[] = [];
  lineItems.forEach((li, k) => {
    const item = inserted[k];
    const refs = refsOf(li);
    if (!item || !refs.length) return;
    const net = Number(item.net_amount ?? 0);
    const share = Math.round((net / refs.length) * 100) / 100;
    refs.forEach((ref, j) => {
      rows.push({
        incoming_document_item_id: item.id,
        link_type: "sales_order",
        order_ref: ref,
        sales_order_id: byNumber.get(norm(ref)) ?? null,
        amount: j === refs.length - 1 ? Math.round((net - share * (refs.length - 1)) * 100) / 100 : share,
      });
    });
  });
  if (rows.length) {
    const { error } = await supabase.from("incoming_document_allocation").insert(rows);
    if (error) throw new Error(error.message);
  }
}

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
    await pagedSelect<{
      id: string;
      pdf_storage_key: string | null;
      file_name: string | null;
      email_subject: string | null;
      source: string;
      email_message_id: string | null;
      email_from: string | null;
      email_date: string | null;
      dedup_key: string;
    }>(
      "incoming_document",
      "id, pdf_storage_key, file_name, email_subject, source, email_message_id, email_from, email_date, dedup_key, force_invoice",
      ["status", "captured"],
    )
  ).slice(0, limit);

  // Vorkontierung je Lieferant (Standard-Aufwandskonto/Zahlart an der Organisation) als Vorschlag.
  const rules = new Map<
    string,
    { expense_account: string | null; confidence: number | null; payment_method: string | null }
  >(
    (
      await pagedSelect<{
        id: string;
        default_expense_account: string | null;
        default_payment_method: string | null;
        vorkontierung_confidence: number | null;
      }>("organization", "id, default_expense_account, default_payment_method, vorkontierung_confidence")
    )
      .filter((o) => o.default_expense_account || o.default_payment_method)
      .map((o) => [
        o.id,
        {
          expense_account: o.default_expense_account,
          confidence: o.vorkontierung_confidence,
          payment_method: o.default_payment_method,
        },
      ]),
  );

  // Vorsteuer-Schlüssel (Eingang). Welcher gilt, entscheidet pruefeUst streng - der
  // Satz allein reicht nicht (19 % gibt es als Standard UND als §13b).
  const taxCodes: UstTaxCode[] = (
    await pagedSelect<{ id: string; code: string; rate: number; treatment: string; direction: string; is_active: boolean }>(
      "tax_code",
      "id, code, rate, treatment, direction, is_active",
    )
  )
    .filter((t) => t.direction === "input" && t.is_active)
    .map((t) => ({ id: t.id, code: t.code, rate: Number(t.rate), treatment: t.treatment }));
  const ownVatId = await loadOwnVatId();
  const zeroCodeId = taxCodes.find((c) => c.treatment === "tax_free_other" && Math.round(c.rate) === 0)?.id ?? null;
  const stdByRate = (rate: unknown): string | null => {
    const r = Math.round(Number(rate));
    return taxCodes.find((c) => c.treatment === "standard_de" && Math.round(c.rate) === r)?.id ?? null;
  };

  let ok = 0;
  let failed = 0;
  let advice = 0;
  let dunning = 0;

  for (const doc of docs) {
    if (!doc.pdf_storage_key) {
      failed += 1;
      continue;
    }
    try {
      const pdf = await getObjectBytes(doc.pdf_storage_key);
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
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

      // Sammel-PDF mit mehreren eigenständigen Rechnungen (z.B. Amazon-
      // Marktplatz-Sammelbeleg mit mehreren Verkäufern in einer Datei):
      // in Einzel-PDFs pro Rechnung aufteilen, jede als eigenes "captured"-
      // Dokument neu anlegen (übernimmt Quelle/E-Mail-Metadaten vom Original)
      // und das Sammel-Dokument entfernen. Die neuen Teil-Dokumente werden
      // direkt an die Verarbeitungsliste angehängt (for...of läuft über die
      // Länge zum jeweiligen Iterationszeitpunkt, sieht also Push während
      // des Laufs) - keine Wartezeit bis zum nächsten Cron-Tick. Kein
      // Rekursions-Risiko, da ein einzelnes Split-Ergebnis nie wieder
      // split_pages liefern sollte (jede Teil-PDF enthält nur noch eine
      // Rechnung).
      if (e.split_pages && (await seitenzahl(pdf).then((n) => validSplitRanges(e.split_pages!, n)))) {
        if (dryRun) {
          console.log(
            `  ${doc.file_name}: SAMMEL-PDF → ${e.split_pages.length} Rechnungen (Seiten ${e.split_pages
              .map(([a, b]) => `${a}-${b}`)
              .join(", ")})`,
          );
        } else {
          const children = await trySplitMultiInvoice(doc, e.split_pages, pdf);
          if (children) docs.push(...children);
        }
        ok += 1;
        continue;
      }

      // Hinweisbelege (Avis / Mahnung) erkennen — KI-Klassifikation, mit
      // Betreff/Dateiname als Fallback für eine UNSICHERE KI-Antwort
      // (doc_type fehlt/unknown). Betreff/Dateiname gelten für ALLE Anhänge
      // derselben Mail gleichermaßen - eine "Zahlungserinnerung UND Rechnung
      // XY"-Mail enthält fast immer (≈99 %) nur die bereits bekannte
      // Rechnung nochmal als Anhang (Dublette). Der seltene Fall einer
      // tatsächlich neuen Rechnung im selben Anhang wird per Dublettenabgleich
      // erkannt: KI sagt "invoice" UND Betreff/Dateiname klingen nach Mahnung
      // → nur dann als Mahnung einsortieren, wenn dieselbe Rechnungsnummer
      // bereits an anderer Stelle existiert, sonst normal als neue, buchbare
      // Rechnung behandeln. Beide Hinweistypen landen nicht in der
      // Kreditoren-Prüfliste, sondern in eigenem Status, ohne Positionen.
      const confidentDocType = new Set(["invoice", "credit_note", "receipt"]).has(e.doc_type ?? "");
      const dunningContext = looksLikeDunning(doc.file_name, doc.email_subject);
      let isDuplicateInDunningContext = false;
      if (confidentDocType && dunningContext && e.doc_number?.trim()) {
        let dupQuery = supabase
          .from("incoming_document")
          .select("id")
          .eq("doc_number", e.doc_number.trim())
          .neq("id", doc.id)
          .limit(1);
        if (e.supplier?.name?.trim()) {
          dupQuery = dupQuery.ilike("supplier_name", `%${e.supplier.name.trim()}%`);
        }
        const { data: dup } = await dupQuery.maybeSingle();
        isDuplicateInDunningContext = !!dup;
      }
      // Vom Nutzer zur Rechnung erklärt ("Als Rechnung behandeln"): nie als Mahnung/Sonstiges einsortieren.
      const forceInvoice = Boolean((doc as { force_invoice?: boolean }).force_invoice);
      const isAdvice =
        !forceInvoice &&
        (e.doc_type === "payment_advice" ||
          (!confidentDocType && looksLikeAdvice(doc.file_name, doc.email_subject)));
      const isOther = !forceInvoice && !isAdvice && e.doc_type === "other";
      const isDunning =
        !forceInvoice &&
        !isAdvice &&
        !isOther &&
        (e.doc_type === "dunning" ||
          (!confidentDocType && dunningContext) ||
          isDuplicateInDunningContext);
      // "Sonstiges" = Mahnungen + sonstige Dokumente ohne Buchungsrelevanz (Status 'dunning')
      const isSonstiges = isDunning || isOther;
      const isHint = isAdvice || isSonstiges;

      // Rechnungsnummer(n), auf die sich der Hinweisbeleg bezieht.
      const refs = cleanRefs(
        e.advice?.referenced_doc_numbers,
        e.dunning?.referenced_doc_numbers,
        // bei Avis/Mahnung ist die "doc_number" oft schon die Rechnungsnummer
        isHint && e.doc_number ? [e.doc_number] : [],
      );
      const hintAmount = isAdvice
        ? (num(e.advice?.total_amount) ?? num(e.gross_amount))
        : isDunning
          ? (num(e.dunning?.amount_due) ?? num(e.gross_amount))
          : isOther
            ? null
            : num(e.gross_amount);

      if (dryRun) {
        const tag = isAdvice ? "AVIS" : isDunning ? "MAHNUNG" : isOther ? "SONSTIGES" : null;
        console.log(
          tag
            ? `  ${doc.file_name}: ${tag} · ${e.supplier?.name ?? "?"} · Rg [${refs.join(", ") || "?"}] · ` +
                `${hintAmount ?? "?"} ${e.currency ?? ""}`
            : `  ${doc.file_name}: ${e.supplier?.name ?? "?"} · ${e.doc_number ?? "?"} · ` +
                `${e.gross_amount ?? "?"} ${e.currency ?? ""} · ${e.line_items?.length ?? 0} Pos · conf ${e.confidence ?? "?"}`,
        );
        ok += 1;
        continue;
      }

      // Die eigene USt-IdNr. steht beim Empfänger; die KI liest sie gelegentlich als Lieferanten-
      // Nummer (v.a. bei Anbietern ohne eigene). Nie als Lieferanten-USt-IdNr. verwenden - sonst
      // wird der Beleg an die Organisation gehängt, die diese Nummer trägt.
      if (ownVatId && e.supplier?.vat_id && e.supplier.vat_id.replace(/\s+/g, "").toUpperCase() === ownVatId) {
        e.supplier.vat_id = null;
      }
      const supplierId = await findSupplier(e);
      const rule = !isHint && supplierId ? rules.get(supplierId) : undefined;

      // Strenge USt-Prüfung: Schlüssel nur bei eindeutigem Befund, sonst Vorschlag.
      let supplierCountry: string | null = null;
      let supplierKind: "service" | "goods" | null = null;
      if (!isHint && supplierId) {
        const { data: org } = await supabase
          .from("organization")
          .select("vat_id, foreign_supply_kind")
          .eq("id", supplierId)
          .maybeSingle();
        const orgVat = (org?.vat_id ?? "").replace(/\s/g, "").toUpperCase();
        const m = /^[A-Za-z]{2}/.exec(orgVat && orgVat !== ownVatId ? orgVat : "");
        supplierCountry = m ? m[0].toUpperCase() : null;
        supplierKind = (org?.foreign_supply_kind as "service" | "goods" | null) ?? null;
      }
      const ust = isHint ? null : pruefeUst(e, { codes: taxCodes, supplierCountry, supplierKind, ownVatId });

      // Marktplatz-Rechnungen (z.B. Amazon-Marktplatz-Verkäufer): Suche nach
      // "amazon" soll den Beleg auch dann finden, wenn der eigentliche
      // Rechnungssteller (Kreditor) ein Drittanbieter ist - Zuordnung/
      // Kontierung bleibt am echten Lieferantennamen, nur die Anzeige/Suche
      // bekommt die Plattform angehängt.
      const marketplace = !isHint ? e.marketplace?.trim() || null : null;
      const supplierNameDisplay = e.supplier?.name
        ? marketplace
          ? `${e.supplier.name} (${marketplace})`
          : e.supplier.name
        : null;

      // Zahlungsziele: Datum bevorzugen, sonst aus Belegdatum + Tagen rechnen.
      const docDate = date(e.doc_date);
      const t = e.payment_terms ?? {};
      const netDue = isHint
        ? null
        : (date(t.net_due_date) ?? addDays(docDate, t.net_days) ?? date(e.due_date));
      const discDate = isHint
        ? null
        : (date(t.discount_date) ?? addDays(docDate, t.discount_days));
      const discPct = isHint ? null : num(t.discount_percent);
      const discAmt = isHint
        ? null
        : (num(t.discount_amount) ??
          (discPct != null && num(e.gross_amount) != null
            ? Math.round(num(e.gross_amount)! * (discPct / 100) * 100) / 100
            : null));

      // abweichender Zahlungsempfänger
      const payeeName = isHint ? null : (e.payee?.name?.trim() || null);
      const payeeDiffers =
        !isHint &&
        Boolean(
          e.payee?.differs ||
            (payeeName && payeeName.toLowerCase() !== (e.supplier?.name ?? "").toLowerCase()),
        );

      const { error: uErr } = await supabase
        .from("incoming_document")
        .update({
          status: isAdvice ? "advice" : isSonstiges ? "dunning" : "extracted",
          doc_type: isAdvice
            ? "payment_advice"
            : isDunning
              ? "dunning"
              : isOther
                ? "other"
                : forceInvoice && ["other", "dunning", "payment_advice", "unknown"].includes(e.doc_type ?? "")
                  ? "invoice"
                  : (e.doc_type ?? "invoice"),
          force_invoice: forceInvoice,
          supplier_organization_id: supplierId,
          supplier_name: supplierNameDisplay,
          supplier_vat_id: e.supplier?.vat_id ?? null,
          supplier_iban: e.supplier?.iban ?? null,
          doc_number: e.doc_number ?? null,
          doc_date: docDate,
          service_date: date(e.service_date),
          due_date: netDue ?? date(e.due_date),
          net_due_date: netDue,
          discount_date: discDate,
          discount_percent: discPct,
          discount_amount: discAmt,
          payee_differs: payeeDiffers,
          payee_name: payeeDiffers ? payeeName : null,
          payee_iban: payeeDiffers ? (e.payee?.iban?.replace(/\s+/g, "") || null) : null,
          payee_reason: payeeDiffers ? (e.payee?.reason?.trim() || null) : null,
          currency: (e.currency ?? "EUR").slice(0, 3).toUpperCase(),
          net_amount: isHint ? null : num(e.net_amount),
          tax_amount: isHint ? null : num(e.tax_amount),
          gross_amount: isHint ? hintAmount : num(e.gross_amount),
          // Original-Rechnungsbetrag in Fremdwährung (zur Anzeige) - der Beleg
          // selbst nennt nur diesen Betrag, nicht den tatsächlich in EUR
          // abgebuchten Betrag (der kommt erst über Kontoauszug/Verknüpfung
          // und wird dann manuell in net_amount/tax_amount/gross_amount
          // korrigiert; diese bleiben die für DATEV maßgeblichen EUR-Beträge).
          fx_gross_amount:
            !isHint && (e.currency ?? "EUR").slice(0, 3).toUpperCase() !== "EUR"
              ? num(e.gross_amount)
              : null,
          payment_method: isHint ? null : (e.payment_method ?? rule?.payment_method ?? null),
          tax_breakdown: isHint ? null : (e.tax_breakdown ?? null),
          advice_debit_date: isAdvice ? date(e.advice?.debit_date) : null,
          advice_reference: isHint && refs.length ? refs : null,
          forwarded_at: null,
          // Vorkontierungs-Vorschlag aus der Organisation (Lieferant → Aufwandskonto).
          // Steuerschlüssel aus dem USt-Satz der Rechnung, sonst aus der Regel.
          ledger_account: rule?.expense_account ?? null,
          // nur bei "sicher" - sonst bleibt der Schlüssel leer bis der Nutzer bestätigt
          tax_code_id: ust?.status === "sicher" ? ust.tax_code_id : null,
          extraction: {
            ...(e as unknown as Record<string, unknown>),
            _ust: ust,
            _vorkontierung: rule
              ? { account: rule.expense_account, confidence: rule.confidence, source: "organization" }
              : null,
          },
          extraction_model: MODEL,
          extraction_confidence: num(e.confidence),
          extracted_at: new Date().toISOString(),
          notes: null,
        })
        .eq("id", doc.id);
      if (uErr) throw new Error(uErr.message);

      // Dublette: gleiche Rechnungsnummer + gleicher Betrag + ähnlicher Lieferant wie ein anderer, nicht verworfener
      // Beleg (z.B. gleiche Rechnung per Mail UND aus BB) -> dieser Beleg wird verworfen, der ältere bleibt.
      const nrDup = e.doc_number?.trim();
      const grossDup = num(e.gross_amount);
      if (!isHint && nrDup && grossDup != null) {
        const nm = (x: string | null | undefined) => (x ?? "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
        const { data: cands } = await supabase
          .from("incoming_document")
          .select("id, supplier_name, supplier_organization_id, gross_amount, created_at")
          .eq("doc_number", nrDup)
          .neq("id", doc.id)
          .neq("status", "rejected");
        const other = (cands ?? []).find(
          (c) =>
            Math.abs(Math.abs(c.gross_amount ?? 0) - Math.abs(grossDup)) <= 0.02 &&
            (c.supplier_organization_id === supplierId ||
              (nm(c.supplier_name).length >= 4 && nm(supplierNameDisplay).startsWith(nm(c.supplier_name).slice(0, 6))) ||
              (nm(supplierNameDisplay).length >= 4 && nm(c.supplier_name).startsWith(nm(supplierNameDisplay).slice(0, 6)))),
        );
        if (other) {
          await supabase
            .from("incoming_document")
            .update({ status: "rejected", notes: `Dublette von Beleg ${other.id} (gleiche Rechnungsnummer und Betrag)` })
            .eq("id", doc.id);
          ok += 1;
          continue;
        }
      }

      await supabase.from("incoming_document_item").delete().eq("incoming_document_id", doc.id);
      const items = isHint
        ? []
        : (e.line_items ?? []).map((li, i) => ({
            incoming_document_id: doc.id,
            position: li.position ?? i + 1,
            description: li.description ?? null,
            quantity: num(li.quantity),
            unit_price: num(li.unit_price),
            tax_rate: num(li.tax_rate),
            net_amount: num(li.net_amount),
            ledger_account: rule?.expense_account ?? null,
            tax_code_id: ust?.status === "sicher" ? (num(li.tax_rate) === 0 ? zeroCodeId : (stdByRate(li.tax_rate) ?? ust.tax_code_id)) : null,
            ...itemExtras(li),
            raw: li,
          }));
      if (items.length) {
        const { data: ins, error: iErr } = await supabase
          .from("incoming_document_item")
          .insert(items)
          .select("id, net_amount");
        if (iErr) throw new Error(iErr.message);
        await seedAllocations(ins ?? [], e.line_items ?? []);
      }
      ok += 1;
      if (isAdvice) advice += 1;
      if (isSonstiges) dunning += 1;
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

  // Nachlauf: redundante Receipts entfernen, erkannte Mahnungen weiterleiten.
  // Fehler hier sind nicht fatal für die Extraktion.
  let receiptsPruned = 0;
  let dunningsForwarded = 0;
  if (!dryRun) {
    try {
      receiptsPruned = (await pruneReceiptDuplicates({ quiet: true })).deletedRows;
    } catch (err) {
      console.error(`  Receipt-Bereinigung übersprungen: ${err instanceof Error ? err.message : err}`);
    }
    try {
      dunningsForwarded = (await forwardDunnings({ quiet: true })).sent;
    } catch (err) {
      console.error(`  Mahnungs-Weiterleitung übersprungen: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { docs: docs.length, ok, advice, dunning, failed, receiptsPruned, dunningsForwarded, dryRun };
}
