import { createHash } from "node:crypto";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { env } from "./env";
import { supabase } from "./supabase";
import { putObject, prefix } from "./storage";

type Options = {
  dryRun?: boolean;
  limit?: number;
  sinceDays?: number;
  all?: boolean;
};

type AttPart = {
  part: string;
  filename: string;
  size: number;
};

/** PDF-Anhänge in der bodyStructure finden. */
function findPdfParts(node: unknown, acc: AttPart[] = [], path = ""): AttPart[] {
  if (!node || typeof node !== "object") return acc;
  const n = node as Record<string, unknown>;
  const children = (n.childNodes ?? n.child ?? []) as unknown[];
  if (Array.isArray(children) && children.length) {
    children.forEach((c, i) => findPdfParts(c, acc, n.part ? `${n.part}` : `${i + 1}`));
  }
  const type = String(n.type ?? "").toLowerCase();
  const disp = String(n.disposition ?? "").toLowerCase();
  const params = (n.dispositionParameters ?? n.parameters ?? {}) as Record<string, string>;
  const filename = String(params.filename ?? params.name ?? "");
  const isPdf = type === "application/pdf" || /\.pdf$/i.test(filename);
  if (isPdf && (disp === "attachment" || disp === "inline" || filename)) {
    acc.push({
      part: String(n.part ?? path ?? "1"),
      filename: filename || "beleg.pdf",
      size: Number(n.size ?? 0),
    });
  }
  return acc;
}

export async function syncMailbox(opts: Options = {}) {
  const { dryRun = false, limit, sinceDays = 90, all = false } = opts;
  const startedAt = new Date();
  const host = env.imap.host();

  const client = new ImapFlow({
    host,
    port: env.imap.port(),
    secure: true,
    auth: { user: env.imap.user(), pass: env.imap.password() },
    logger: false,
    emitLogs: false,
  });
  client.on("error", () => {});

  try {
    await client.connect();
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    throw new Error(
      `IMAP-Verbindung zu ${host}:${env.imap.port()} fehlgeschlagen (${m}). ` +
        `IMAP_HOST / IMAP_PASSWORD in .env prüfen (Hetzner: ggf. wwwNNN.your-server.de).`,
    );
  }

  let msgs = 0;
  let pdfs = 0;
  let created = 0;
  let duplicates = 0;
  let ignored = 0;

  const ignoreSenders = env.imap.ignoreSenders();

  const lock = await client.getMailboxLock(env.imap.folder());
  try {
    const since = new Date(Date.now() - sinceDays * 86400_000);
    const uids = all
      ? await client.search({ all: true }, { uid: true })
      : await client.search({ since }, { uid: true });
    const list = (uids || []).slice(-1 * (limit ?? 10_000));

    for (const uid of list) {
      msgs += 1;
      const msg = (await client.fetchOne(
        String(uid),
        { uid: true, envelope: true, bodyStructure: true },
        { uid: true },
      )) as FetchMessageObject | false;
      if (!msg) continue;

      const parts = findPdfParts(msg.bodyStructure);
      if (parts.length === 0) continue;

      const env_ = msg.envelope;
      const messageId = env_?.messageId ?? `uid:${uid}`;
      const from = env_?.from?.[0]?.address ?? null;

      if (from && ignoreSenders.includes(from.toLowerCase())) {
        ignored += 1;
        if (!dryRun) {
          try {
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          } catch {
            /* egal */
          }
        }
        continue;
      }
      const subject = env_?.subject ?? null;
      const date = env_?.date ?? null;
      const year = (date ? new Date(date) : new Date()).toISOString().slice(0, 4);

      for (const p of parts) {
        pdfs += 1;
        const dedupKey = `mail:${createHash("sha1")
          .update(`${messageId}|${p.filename}|${p.size}`)
          .digest("hex")}`;

        const { data: exists } = await supabase
          .from("incoming_document")
          .select("id")
          .eq("dedup_key", dedupKey)
          .maybeSingle();
        if (exists) {
          duplicates += 1;
          continue;
        }
        if (dryRun) {
          created += 1;
          continue;
        }

        const { content } = await client.download(String(uid), p.part, { uid: true });
        const chunks: Buffer[] = [];
        for await (const ch of content) chunks.push(Buffer.from(ch));
        const buf = Buffer.concat(chunks);
        if (buf.length < 100) continue;

        const key = prefix.eingangsrechnung(year, dedupKey.slice(5));
        await putObject(key, buf, "application/pdf");

        const { error } = await supabase.from("incoming_document").insert({
          source: "email",
          status: "captured",
          email_message_id: messageId,
          email_from: from,
          email_subject: subject,
          email_date: date ? new Date(date).toISOString() : null,
          file_name: p.filename,
          pdf_storage_key: key,
          file_sha256: createHash("sha256").update(buf).digest("hex"),
          dedup_key: dedupKey,
        });
        if (error) throw new Error(`incoming_document: ${error.message}`);
        created += 1;
      }

      if (!dryRun) {
        try {
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        } catch {
          /* egal */
        }
      }
    }
  } finally {
    lock.release();
  }
  await client.logout();

  if (!dryRun) {
    await supabase.from("external_sync_state").upsert(
      {
        system: "imap",
        resource: "rechnungen",
        last_run_at: startedAt.toISOString(),
        last_status: "ok",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "system,resource" },
    );
  }

  return { messages: msgs, pdfAttachments: pdfs, created, duplicates, ignored, dryRun };
}
