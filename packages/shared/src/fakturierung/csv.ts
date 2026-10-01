/**
 * CSV für Onlineprinters-Rechnungsupload (Format laut Vorlage des Nutzers):
 * order_number;order_price;invoice_reference;invoice_date - eine Zeile je
 * Auftrag, über alle in der Rechnung enthaltenen Wochen hinweg. Reine
 * Funktion, kein Supabase-Zugriff.
 *
 * Format-Annahme (Vorlage hat nur den Header, keine Musterzeile):
 * Dezimalpunkt, Datum YYYY-MM-DD - vor dem ersten echten Export mit
 * Onlineprinters verifizieren.
 */
export type OnlineprintersCsvZeile = {
  order_number: string;
  order_price: number;
};

export function erzeugeOnlineprintersCsv(
  zeilen: OnlineprintersCsvZeile[],
  invoice_reference: string,
  invoice_date: string, // YYYY-MM-DD
): string {
  const lines = ["order_number;order_price;invoice_reference;invoice_date"];
  for (const z of zeilen) {
    if (!z.order_number) continue;
    lines.push(
      [z.order_number, z.order_price.toFixed(2), invoice_reference, invoice_date].join(";"),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
