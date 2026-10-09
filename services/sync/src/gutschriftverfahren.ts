import { supabase } from "./supabase";
import { generateInvoiceBooking } from "./syncInvoiceBookings";
import { MELDUNG_BANKZUORDNUNG } from "@werk/shared/eingang/verwerfen";

/* --------------------------------------------------------------------------
 * Gutschriftverfahren: Der Kunde stellt die Abrechnung aus und überweist (z.B. Festool-Konsignationsabrechnung).
 * Das ist unser Umsatz, kein Eingangsbeleg. Ist die Organisation des Belegs so markiert, wird aus dem gerade
 * ausgelesenen Eingangsbeleg eine Ausgangsrechnung (sales_invoice, mit PDF und Erlösbuchung) und der Eingangsbeleg
 * verworfen. Gibt true zurück, wenn der Beleg übernommen wurde.
 * -------------------------------------------------------------------------- */
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function gutschriftverfahrenPruefen(docId: string, opts: { ohneBuchhaltung?: boolean } = {}): Promise<boolean> {
  const { data: doc } = await supabase
    .from("incoming_document")
    .select(
      "id, doc_type, status, doc_number, doc_date, net_amount, tax_amount, gross_amount, currency, pdf_storage_key, supplier_organization_id, tax_breakdown",
    )
    .eq("id", docId)
    .maybeSingle();
  if (!doc || !doc.supplier_organization_id || !doc.doc_number || !doc.doc_date) return false;
  if (!["invoice", "credit_note"].includes(doc.doc_type) || doc.status === "rejected") return false;
  if (doc.gross_amount == null || doc.net_amount == null) return false;

  const { data: org } = await supabase
    .from("organization")
    .select("id, name, gutschriftverfahren")
    .eq("id", doc.supplier_organization_id)
    .maybeSingle();
  if (!org?.gutschriftverfahren) return false;

  // Ein Beleg mit Bankzuordnung wird nicht stillschweigend verworfen (die Zahlung gehört dann zur Ausgangsrechnung)
  const { count: zuordnungen } = await supabase
    .from("bank_transaction_match")
    .select("id", { count: "exact", head: true })
    .eq("incoming_document_id", docId);
  if (zuordnungen) {
    console.warn(`  Gutschriftverfahren ${doc.doc_number}: ${MELDUNG_BANKZUORDNUNG}`);
    return false;
  }

  const nr = doc.doc_number.trim();
  const { data: ex } = await supabase.from("sales_invoice").select("id").eq("invoice_number", nr).limit(1);
  if (ex && ex.length) {
    await supabase
      .from("incoming_document")
      .update({ status: "rejected", notes: `Gutschriftverfahren ${org.name}: Ausgangsrechnung ${nr} existiert bereits` })
      .eq("id", docId);
    return true;
  }

  const net = r2(Math.abs(Number(doc.net_amount)));
  const tax = r2(Math.abs(Number(doc.tax_amount ?? 0)));
  const gross = r2(Math.abs(Number(doc.gross_amount)));
  const rate = net > 0 ? Math.round((tax / net) * 100) : 19;
  const ext = `gutschriftverfahren:${org.id}:${nr}`;
  const { data: inv, error } = await supabase
    .from("sales_invoice")
    .insert({
      source: "werk",
      external_id: ext,
      organization_id: org.id,
      invoice_number: nr,
      kind: "invoice",
      invoice_date: doc.doc_date,
      net_total: net,
      tax_total: tax,
      gross_total: gross,
      tax_breakdown: doc.tax_breakdown ?? { [String(rate)]: tax },
      currency: doc.currency ?? "EUR",
      pdf_storage_key: doc.pdf_storage_key,
      pdf_status: doc.pdf_storage_key ? "available" : "none",
      raw: { quelle: `Gutschriftverfahren ${org.name} (per Mail)`, eingangsbeleg: docId },
      ohne_buchhaltung: !!opts.ohneBuchhaltung,
      ohne_buchhaltung_grund: opts.ohneBuchhaltung ? "Archiv: Abrechnung bereits 2025 bezahlt und gebucht (nur zum Auffinden abgelegt)" : null,
      synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !inv) throw new Error(`Gutschriftverfahren ${nr}: ${error?.message ?? "keine Ausgangsrechnung"}`);

  // Positionen: aus den ausgelesenen Belegzeilen, sonst eine Sammelposition
  const { data: items } = await supabase
    .from("incoming_document_item")
    .select("position, description, quantity, unit_price, net_amount, tax_rate")
    .eq("incoming_document_id", docId)
    .order("position");
  const rows = (items ?? []).filter((i) => i.net_amount != null);
  const useItems = rows.length > 0 && Math.abs(rows.reduce((s, i) => s + Math.abs(Number(i.net_amount)), 0) - net) <= 0.05;
  const positionen = useItems
    ? rows.map((i, k) => ({
        sales_invoice_id: inv.id,
        source: "werk",
        external_id: `${ext}:${k + 1}`,
        position: k + 1,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price != null ? Math.abs(Number(i.unit_price)) : null,
        tax_rate: i.tax_rate ?? rate,
        net_amount: Math.abs(Number(i.net_amount)),
      }))
    : [
        {
          sales_invoice_id: inv.id,
          source: "werk",
          external_id: `${ext}:1`,
          position: 1,
          description: `Abrechnung ${nr} (${org.name})`,
          quantity: 1,
          unit_price: net,
          tax_rate: rate,
          net_amount: net,
        },
      ];
  await supabase.from("sales_invoice_item").insert(positionen);
  if (!opts.ohneBuchhaltung) await generateInvoiceBooking(inv.id);
  await supabase
    .from("incoming_document")
    .update({
      status: "rejected",
      notes: `Gutschriftverfahren ${org.name}: als Ausgangsrechnung ${nr} übernommen (${org.name} stellt aus und überweist)`,
    })
    .eq("id", docId);
  return true;
}
