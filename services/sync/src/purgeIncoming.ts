import { supabase } from "./supabase";
import { deleteObject } from "./storage";

type Options = { dryRun?: boolean; from?: string };

/**
 * Löscht Eingangsbelege (inkl. Positionen via ON DELETE CASCADE und der
 * zugehörigen PDF-Objekte im S3) eines bestimmten Absenders. Gedacht für
 * versehentlich ins Postfach gelangte eigene Ausgangsrechnungen.
 */
export async function purgeIncoming(opts: Options = {}) {
  const { dryRun = false, from } = opts;
  if (!from) throw new Error("--from=<absender> erforderlich");
  const sender = from.trim().toLowerCase();

  const { data, error } = await supabase
    .from("incoming_document")
    .select("id, email_from, email_subject, doc_number, gross_amount, pdf_storage_key, status")
    .ilike("email_from", `%${sender}%`);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  console.log(`${rows.length} Belege von "${sender}"${dryRun ? "  (DRY RUN)" : ""}`);
  for (const r of rows) {
    console.log(
      `  ${String(r.status).padEnd(10)} ${r.doc_number ?? "—"}  ${r.gross_amount ?? "—"}  ${r.email_subject ?? ""}`,
    );
  }
  if (rows.length === 0 || dryRun) {
    return { matched: rows.length, deletedRows: 0, deletedObjects: 0, dryRun };
  }

  let deletedObjects = 0;
  for (const r of rows) {
    if (!r.pdf_storage_key) continue;
    try {
      await deleteObject(r.pdf_storage_key);
      deletedObjects += 1;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`  S3-Löschen fehlgeschlagen (${r.pdf_storage_key}): ${m}`);
    }
  }

  const ids = rows.map((r) => r.id);
  const { error: dErr } = await supabase.from("incoming_document").delete().in("id", ids);
  if (dErr) throw new Error(dErr.message);

  return { matched: rows.length, deletedRows: ids.length, deletedObjects, dryRun };
}
