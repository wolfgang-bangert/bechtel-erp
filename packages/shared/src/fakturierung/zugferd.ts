/**
 * ZUGFeRD/Factur-X-Einbettung für werk-native Rechnungen, via node-zugferd
 * (BASIC-Profil - der vom Projekt selbst empfohlene GoBD-Mindeststandard,
 * deutlich weniger Pflichtfelder als EN16931/EXTENDED, dadurch kleinere
 * Angriffsfläche für Mapping-Fehler in einer noch jungen Bibliothek, Stand
 * v0.1.1-beta). Reine Funktion, kein Supabase-Zugriff - die aufrufende
 * Action lädt alle Daten vorher.
 *
 * WICHTIG: node-zugferd ist Beta-Software. Die eingebaute XSD-Validierung
 * (`strict`-Modus) braucht lokal Java (xsd-schema-validator) - ohne Java
 * bricht sie mit "Failed to compile helper" ab, deshalb hier `strict: false`.
 * Das ersetzt den manuellen Check nicht: vor dem ersten echten Versand einer
 * erzeugten Rechnung unbedingt die eingebettete XML mit einem unabhängigen
 * ZUGFeRD/Factur-X-Validator prüfen (z.B. den kostenlosen FNFE-/KoSIT-Validator).
 */
import { zugferd } from "node-zugferd";
import { BASIC } from "node-zugferd/profile/basic";

const invoicer = zugferd({ profile: BASIC, strict: false });

export type ZugferdAdresse = {
  line1?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null; // ISO-3166 alpha-2, z.B. "DE"
};

export type ZugferdPartei = {
  name: string;
  address?: ZugferdAdresse | null;
  vat_id?: string | null;
};

export type ZugferdPosition = {
  description: string;
  net_amount: number;
};

export type ZugferdInput = {
  verkaeufer: ZugferdPartei;
  kaeufer: ZugferdPartei;
  invoice_number: string;
  invoice_date: string; // YYYY-MM-DD
  positionen: ZugferdPosition[];
  net_total: number;
  tax_total: number;
  gross_total: number;
  tax_rate: number; // z.B. 19
};

const money = (n: number) => Math.round(n * 100) / 100;

type CountryCode = typeof invoicer.$Infer.Schema extends {
  transaction: { tradeAgreement: { seller: { postalAddress: { countryCode: infer C } } } };
}
  ? C
  : never;

function buildData(input: ZugferdInput) {
  const land = (c?: string | null) => (c || "DE") as CountryCode;
  return {
    number: input.invoice_number,
    typeCode: "380", // Commercial Invoice (UNTDID 1001)
    issueDate: new Date(input.invoice_date),
    transaction: {
      tradeAgreement: {
        seller: {
          name: input.verkaeufer.name,
          postalAddress: { countryCode: land(input.verkaeufer.address?.country) },
          ...(input.verkaeufer.vat_id
            ? { taxRegistration: { vatIdentifier: input.verkaeufer.vat_id } }
            : {}),
        },
        buyer: {
          name: input.kaeufer.name,
          postalAddress: { countryCode: land(input.kaeufer.address?.country) },
          ...(input.kaeufer.vat_id
            ? { taxRegistration: { vatIdentifier: input.kaeufer.vat_id } }
            : {}),
        },
      },
      tradeDelivery: {},
      line: input.positionen.map((p, i) => ({
        identifier: String(i + 1),
        tradeProduct: { name: p.description },
        tradeAgreement: { grossTradePrice: { chargeAmount: money(p.net_amount) } },
        tradeDelivery: { billedQuantity: { amount: 1, unitMeasureCode: "C62" } },
        tradeSettlement: {
          tradeTax: { typeCode: "VAT", categoryCode: "S", rateApplicablePercent: input.tax_rate },
          monetarySummation: { lineTotalAmount: money(p.net_amount) },
        },
      })),
      tradeSettlement: {
        currencyCode: "EUR",
        vatBreakdown: [
          {
            calculatedAmount: money(input.tax_total),
            typeCode: "VAT",
            basisAmount: money(input.net_total),
            categoryCode: "S",
            rateApplicablePercent: input.tax_rate,
          },
        ],
        monetarySummation: {
          lineTotalAmount: money(input.net_total),
          taxBasisTotalAmount: money(input.net_total),
          taxTotal: { amount: money(input.tax_total), currencyCode: "EUR" },
          grandTotalAmount: money(input.gross_total),
          duePayableAmount: money(input.gross_total),
        },
      },
    },
  } satisfies typeof invoicer.$Infer.Schema;
}

/**
 * Bettet die ZUGFeRD-XML (factur-x.xml) in das übergebene Basis-PDF ein -
 * Ergebnis ist ein PDF/A-3b, menschen- und maschinenlesbar zugleich. Die
 * node-zugferd-Instanz selbst bietet keine aufrufbare Validierungsmethode
 * (Stand v0.1.1-beta) - der Hinweis unten ersetzt den manuellen externen
 * Validator-Check vor dem ersten echten Versand nicht.
 */
export async function erzeugeZugferdPdf(
  basisPdf: Uint8Array,
  input: ZugferdInput,
  csvAnhang?: { filename: string; content: string },
): Promise<{ pdf: Uint8Array; validationWarning: string }> {
  const data = buildData(input);
  const invoice = invoicer.create(data);

  const pdfA = await invoice.embedInPdf(Buffer.from(basisPdf), {
    metadata: { title: `Rechnung ${input.invoice_number}` },
    additionalFiles: csvAnhang
      ? [
          {
            filename: csvAnhang.filename,
            content: Buffer.from(csvAnhang.content, "utf-8"),
            mimeType: "text/csv",
            description: "Auftragspositionen je Kalenderwoche",
            relationship: "Supplement",
          },
        ]
      : undefined,
  });
  return {
    pdf: pdfA,
    validationWarning:
      "ZUGFeRD ist Beta-Software (node-zugferd v0.1.1-beta) - vor dem ersten echten Versand " +
      "die eingebettete XML mit einem unabhängigen ZUGFeRD/Factur-X-Validator prüfen.",
  };
}
