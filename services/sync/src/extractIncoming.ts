import { createHash, randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { seitenNeuZusammenstellen, seitenzahl } from "@werk/shared/pdf/seiten";
import { env } from "./env";
import { supabase } from "./supabase";
import { getObjectBytes, putObject, deleteObject, prefix } from "./storage";
import { pagedSelect } from "./db";
import { pruneReceiptDuplicates } from "./pruneReceipts";
import { forwardDunnings } from "./forwardDunnings";

type Options = { dryRun?: boolean; limit?: number };

const MODEL = "claude-sonnet-5";

const PROMPT = `Du bekommst einen Eingangsbeleg (PDF) einer deutschen Druckerei.
Extrahiere die Daten und antworte ausschließlich mit JSON, ohne Markdown, in genau dieser Struktur:

{
  "doc_type": "invoice" | "credit_note" | "receipt" | "payment_advice" | "dunning" | "unknown",
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
  "tax_breakdown": { "<satz in prozent>": <ust-betrag> },   // z.B. {"19": 12.34}
  "line_items": [
    { "position": number|null, "description": string, "quantity": number|null,
      "unit_price": number|null, "tax_rate": number|null, "net_amount": number|null }
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

function parseJson(text: string): unknown {
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

type Extracted = {
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
  line_items?: {
    position?: number | null;
    description?: string;
    quantity?: number | null;
    unit_price?: number | null;
    tax_rate?: number | null;
    net_amount?: number | null;
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
      "id, pdf_storage_key, file_name, email_subject, source, email_message_id, email_from, email_date, dedup_key",
      ["status", "captured"],
    )
  ).slice(0, limit);

  // Vorkontierungs-Regeln (Lieferant → Aufwandskonto) als Vorschlag.
  const rules = new Map<
    string,
    {
      expense_account: string;
      tax_code_id: string | null;
      confidence: number | null;
      payment_method: string | null;
    }
  >(
    (
      await pagedSelect<{
        organization_id: string;
        expense_account: string;
        tax_code_id: string | null;
        confidence: number | null;
        is_active: boolean;
        payment_method: string | null;
      }>(
        "posting_rule",
        "organization_id, expense_account, tax_code_id, confidence, is_active, payment_method",
      )
    )
      .filter((r) => r.is_active)
      .map((r) => [
        r.organization_id,
        {
          expense_account: r.expense_account,
          tax_code_id: r.tax_code_id,
          confidence: r.confidence,
          payment_method: r.payment_method,
        },
      ]),
  );

  // Vorsteuer-Schlüssel nach Satz — der Satz selbst kommt aus der Rechnung.
  const taxByRate = new Map<number, string>(
    (
      await pagedSelect<{ id: string; rate: number; direction: string; is_active: boolean }>(
        "tax_code",
        "id, rate, direction, is_active",
      )
    )
      .filter((t) => t.direction === "input" && t.is_active)
      .map((t) => [Math.round(Number(t.rate)), t.id]),
  );
  const rateToCode = (rate: unknown): string | null => {
    const r = Math.round(Number(rate));
    return Number.isFinite(r) && taxByRate.has(r) ? taxByRate.get(r)! : null;
  };
  /** dominanter USt-Satz aus einer tax_breakdown */
  const dominantRate = (tb: Record<string, number> | undefined): number | null => {
    const keys = Object.keys(tb ?? {});
    if (!keys.length) return null;
    return Number(keys.sort((a, b) => ((tb![b] ?? 0) - (tb![a] ?? 0)))[0]);
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
      const isAdvice =
        e.doc_type === "payment_advice" ||
        (!confidentDocType && looksLikeAdvice(doc.file_name, doc.email_subject));
      const isDunning =
        !isAdvice &&
        (e.doc_type === "dunning" ||
          (!confidentDocType && dunningContext) ||
          isDuplicateInDunningContext);
      const isHint = isAdvice || isDunning;

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
          : num(e.gross_amount);

      if (dryRun) {
        const tag = isAdvice ? "AVIS" : isDunning ? "MAHNUNG" : null;
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

      const supplierId = await findSupplier(e);
      const rule = !isHint && supplierId ? rules.get(supplierId) : undefined;

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
          status: isAdvice ? "advice" : isDunning ? "dunning" : "extracted",
          doc_type: isAdvice
            ? "payment_advice"
            : isDunning
              ? "dunning"
              : (e.doc_type ?? "invoice"),
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
          // Vorkontierungs-Vorschlag aus posting_rule (Lieferant → Aufwandskonto).
          // Steuerschlüssel aus dem USt-Satz der Rechnung, sonst aus der Regel.
          ledger_account: rule?.expense_account ?? null,
          tax_code_id: isHint
            ? null
            : (rateToCode(dominantRate(e.tax_breakdown)) ?? rule?.tax_code_id ?? null),
          extraction: {
            ...(e as unknown as Record<string, unknown>),
            _vorkontierung: rule
              ? { account: rule.expense_account, confidence: rule.confidence, source: "posting_rule" }
              : null,
          },
          extraction_model: MODEL,
          extraction_confidence: num(e.confidence),
          extracted_at: new Date().toISOString(),
          notes: null,
        })
        .eq("id", doc.id);
      if (uErr) throw new Error(uErr.message);

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
            tax_code_id: rateToCode(li.tax_rate) ?? rule?.tax_code_id ?? null,
            raw: li,
          }));
      if (items.length) {
        const { error: iErr } = await supabase.from("incoming_document_item").insert(items);
        if (iErr) throw new Error(iErr.message);
      }
      ok += 1;
      if (isAdvice) advice += 1;
      if (isDunning) dunning += 1;
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
