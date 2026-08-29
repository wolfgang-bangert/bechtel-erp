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

async function fetchNinoxCePdf(recId: string): Promise<Buffer | null> {
  const n = env.ninox;
  const base = `${n.base()}/teams/${n.team()}/databases/${n.database()}/tables/CE/records/${recId}/files`;
  const headers = { Authorization: `Bearer ${n.key()}` };
  const list = await fetch(base, { headers });
  if (!list.ok) return null;
  const files = (await list.json()) as unknown;
  const names = Array.isArray(files)
    ? (files as string[]).filter((f) => String(f).toLowerCase().endsWith(".pdf"))
    : [];
  if (names.length === 0) return null;
  const dl = await fetch(`${base}/${encodeURIComponent(names[0])}`, { headers });
  if (!dl.ok) return null;
  return Buffer.from(await dl.arrayBuffer());
}

export async function syncInvoicePdfs(opts: Options = {}) {
  const { dryRun = false, limit } = opts;
  const startedAt = new Date();

  let q = supabase
    .from("sales_invoice")
    .select("id, source, external_id, invoice_number, invoice_date")
    .in("pdf_status", ["unknown", "error"])
    .order("invoice_date", { ascending: false, nullsFirst: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  if (error) throw new Error(`sales_invoice lesen: ${error.message}`);
  const rows = (data ?? []) as Row[];

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
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  let done = 0;

  await pool(candidates, 3, async (r) => {
    const year = (r.invoice_date ?? "0000").slice(0, 4);
    const extId = r.external_id ?? r.id;
    try {
      let pdf: Buffer | null = null;
      if (r.source === "keyline") {
        const klId = Number(extId.split(":").pop());
        pdf = await fetchKeylineInvoicePdf(klId);
      } else {
        const recId = extId.split(":").pop() ?? "";
        pdf = await fetchNinoxCePdf(recId);
      }
      if (pdf && pdf.length > 100) {
        const key = prefix.ausgangsrechnung(year, `${r.source}-${extId.replace(/[^\w.-]/g, "_")}`);
        await putObject(key, pdf, "application/pdf");
        updates.push({
          id: r.id,
          patch: { pdf_storage_key: key, pdf_status: "available", pdf_synced_at: new Date().toISOString() },
        });
        results.available += 1;
      } else {
        updates.push({ id: r.id, patch: { pdf_status: "none", pdf_synced_at: new Date().toISOString() } });
        results.none += 1;
      }
    } catch {
      updates.push({ id: r.id, patch: { pdf_status: "error", pdf_synced_at: new Date().toISOString() } });
      results.error += 1;
    }
    done += 1;
    if (done % 50 === 0) process.stdout.write(`\r  ${done}/${candidates.length}   `);
  });
  process.stdout.write(`\r  ${done}/${candidates.length}   \n`);

  for (const part of chunk(updates, 100)) {
    await Promise.all(
      part.map((u) => supabase.from("sales_invoice").update(u.patch).eq("id", u.id)),
    );
  }

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
