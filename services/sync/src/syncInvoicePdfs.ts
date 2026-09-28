import { fetchKeylineInvoicePdf } from "./keyline";
import { env } from "./env";
import { supabase } from "./supabase";
import { chunk } from "./db";
import { putObject, prefix } from "./storage";

type Options = { dryRun?: boolean; limit?: number };

type Row = {
  id: string;
  source: string;
  external_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  raw: Record<string, unknown> | null;
};

async function pool<T, R>(items: T[], c: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function w() {
    for (;;) {
      const k = i++;
      if (k >= items.length) return;
      out[k] = await fn(items[k]);
    }
  }
  await Promise.all(Array.from({ length: c }, w));
  return out;
}

/**
 * Die Rechnung selbst (Tabelle CE) hat zwar Datei-Felder, die bleiben in
 * der Praxis leer - das eigentliche PDF hängt an einem verknüpften
 * Dokumente-Datensatz (Tabelle LC, Feld "Dokumente" auf CE). Ein Beleg
 * kann mehrere Dokumente verknüpft haben (z.B. Korrektur) - das nach
 * "Datum + Uhrzeit" neueste gewinnt.
 */
async function fetchNinoxInvoicePdf(raw: Record<string, unknown> | null): Promise<Buffer | null> {
  const docIds = (raw?.["Dokumente"] as number[] | undefined) ?? [];
  if (!docIds.length) return null;

  const n = env.ninox;
  const base = `${n.base()}/teams/${n.team()}/databases/${n.database()}`;
  const headers = { Authorization: `Bearer ${n.key()}` };

  const docs: { id: number; datum: string }[] = [];
  for (const id of docIds) {
    const res = await fetch(`${base}/tables/LC/records/${id}`, { headers });
    if (!res.ok) continue;
    const rec = (await res.json().catch(() => null)) as { fields?: Record<string, unknown> } | null;
    docs.push({ id, datum: String(rec?.fields?.["Datum + Uhrzeit"] ?? "") });
  }
  docs.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  const newest = docs[0];
  if (!newest) return null;

  const filesRes = await fetch(`${base}/tables/LC/records/${newest.id}/files`, { headers });
  if (!filesRes.ok) return null;
  const files = (await filesRes.json().catch(() => null)) as { name: string }[] | null;
  if (!Array.isArray(files) || files.length === 0) return null;
  const pdf = files.find((f) => f.name.toLowerCase().endsWith(".pdf")) ?? files[0];

  const dl = await fetch(`${base}/tables/LC/records/${newest.id}/files/${encodeURIComponent(pdf.name)}`, {
    headers,
  });
  if (!dl.ok) return null;
  return Buffer.from(await dl.arrayBuffer());
}

export async function syncInvoicePdfs(opts: Options = {}) {
  const { dryRun = false, limit } = opts;
  const startedAt = new Date();

  const rows: Row[] = [];
  const pageSize = 1000;
  let fromRow = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("sales_invoice")
      .select("id, source, external_id, invoice_number, invoice_date, raw")
      .in("pdf_status", ["unknown", "error"])
      .order("invoice_date", { ascending: false, nullsFirst: false })
      .range(fromRow, fromRow + pageSize - 1);
    if (error) throw new Error(`sales_invoice lesen: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < pageSize || (limit && rows.length >= limit)) break;
    fromRow += pageSize;
  }
  if (limit) rows.length = Math.min(rows.length, limit);

  // Keyline nur bei festgeschriebenen (Nummer vorhanden -> PDF existiert)
  const candidates = rows.filter(
    (r) => r.source === "ninox" || (r.source === "keyline" && r.invoice_number),
  );

  if (dryRun) {
    return {
      unknown: rows.length,
      candidates: candidates.length,
      keyline: candidates.filter((r) => r.source === "keyline").length,
      ninox: candidates.filter((r) => r.source === "ninox").length,
      dryRun,
    };
  }

  const results = { available: 0, none: 0, error: 0 };
  let pending: { id: string; patch: Record<string, unknown> }[] = [];
  let done = 0;
  let flushing = false;

  async function flush(force = false) {
    if (flushing || (!force && pending.length < 50)) return;
    flushing = true;
    const batch = pending;
    pending = [];
    for (const part of chunk(batch, 100)) {
      await Promise.all(
        part.map((u) => supabase.from("sales_invoice").update(u.patch).eq("id", u.id)),
      );
    }
    flushing = false;
  }

  await pool(candidates, 3, async (r) => {
    const year = (r.invoice_date ?? "0000").slice(0, 4);
    const extId = r.external_id ?? r.id;
    try {
      let pdf: Buffer | null = null;
      if (r.source === "keyline") {
        const klId = Number(extId.split(":").pop());
        pdf = await fetchKeylineInvoicePdf(klId);
      } else {
        pdf = await fetchNinoxInvoicePdf(r.raw);
      }
      if (pdf && pdf.length > 100) {
        const key = prefix.ausgangsrechnung(year, `${r.source}-${extId.replace(/[^\w.-]/g, "_")}`);
        await putObject(key, pdf, "application/pdf");
        pending.push({ id: r.id, patch: { pdf_storage_key: key, pdf_status: "available", pdf_synced_at: new Date().toISOString() } });
        results.available += 1;
      } else {
        pending.push({ id: r.id, patch: { pdf_status: "none", pdf_synced_at: new Date().toISOString() } });
        results.none += 1;
      }
    } catch {
      pending.push({ id: r.id, patch: { pdf_status: "error", pdf_synced_at: new Date().toISOString() } });
      results.error += 1;
    }
    done += 1;
    if (done % 50 === 0) process.stdout.write(`\r  ${done}/${candidates.length} (verf. ${results.available})   `);
    await flush();
  });
  await flush(true);
  process.stdout.write(`\r  ${done}/${candidates.length}   \n`);

  await supabase.from("external_sync_state").upsert(
    {
      system: "storage",
      resource: "invoice_pdfs",
      last_run_at: startedAt.toISOString(),
      last_status: "ok",
      error: results.error ? `${results.error} Fehler` : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "system,resource" },
  );

  return { candidates: candidates.length, ...results, dryRun };
}
