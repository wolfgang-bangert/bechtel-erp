import { supabase } from "./supabase";
import { deleteObject } from "./storage";

type Options = { dryRun?: boolean; quiet?: boolean };

type Row = {
  id: string;
  doc_type: string;
  status: string;
  doc_number: string | null;
  supplier_name: string | null;
  gross_amount: number | null;
  pdf_storage_key: string | null;
};

// Belege, an denen schon gearbeitet wurde, bleiben unangetastet.
const SAFE_TO_DELETE = new Set(["captured", "extracted"]);

/**
 * Viele SaaS-Anbieter (WEWEB, Anthropic, Celonis, Carbone …) schicken denselben
 * Beleg doppelt: einmal als "receipt" ("Your receipt from …") und einmal als
 * echte Rechnung. Der Receipt ist redundant, sobald eine Rechnung/Gutschrift
 * mit derselben Belegnummer existiert — dann wird er gelöscht (Zeile + PDF).
 */
export async function pruneReceiptDuplicates(opts: Options = {}) {
  const { dryRun = false, quiet = false } = opts;

  const { data, error } = await supabase
    .from("incoming_document")
    .select("id, doc_type, status, doc_number, supplier_name, gross_amount, pdf_storage_key");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  const invoiceNumbers = new Set(
    rows
      .filter((r) => (r.doc_type === "invoice" || r.doc_type === "credit_note") && r.doc_number)
      .map((r) => r.doc_number as string),
  );

  const victims = rows.filter(
    (r) =>
      r.doc_type === "receipt" &&
      r.doc_number &&
      invoiceNumbers.has(r.doc_number) &&
      SAFE_TO_DELETE.has(r.status),
  );

  if (!quiet || victims.length) {
    console.log(`${victims.length} redundante Receipts${dryRun ? "  (DRY RUN)" : ""}`);
    for (const v of victims) {
      console.log(`  ${v.doc_number} · ${v.supplier_name ?? "?"} · ${v.gross_amount ?? "?"}`);
    }
  }
  if (dryRun || victims.length === 0) {
    return { matched: victims.length, deletedRows: 0, deletedObjects: 0, dryRun };
  }

  let deletedObjects = 0;
  for (const v of victims) {
    if (!v.pdf_storage_key) continue;
    try {
      await deleteObject(v.pdf_storage_key);
      deletedObjects += 1;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`  S3-Löschen fehlgeschlagen (${v.pdf_storage_key}): ${m}`);
    }
  }

  const ids = victims.map((v) => v.id);
  const { error: dErr } = await supabase.from("incoming_document").delete().in("id", ids);
  if (dErr) throw new Error(dErr.message);

  return { matched: victims.length, deletedRows: ids.length, deletedObjects, dryRun };
}
