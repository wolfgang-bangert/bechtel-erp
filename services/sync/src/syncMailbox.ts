import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "./env";
import { supabase } from "./supabase";
import { putObject, prefix } from "./storage";

type Options = { dryRun?: boolean; limit?: number; unseenOnly?: boolean };

const isPdf = (name: string, ct: string) =>
  /\.pdf$/i.test(name || "") || /pdf/i.test(ct || "");

export async function syncMailbox(opts: Options = {}) {
  const { dryRun = false, limit, unseenOnly = false } = opts;
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
  // ImapFlow wirft sonst unbehandelte 'error'-Events -> Node-Crash
  client.on("error", () => {});

  try {
    await client.connect();
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    throw new Error(
      `IMAP-Verbindung zu ${host}:${env.imap.port()} fehlgeschlagen (${m}). ` +
        `IMAP_HOST / IMAP_PASSWORD in .env prüfen.`,
    );
  }
  let seenMsgs = 0;
  let pdfs = 0;
  let created = 0;
  let duplicates = 0;
  const captured: string[] = [];

  const lock = await client.getMailboxLock(env.imap.folder());
  try {
    const range = unseenOnly ? { seen: false } : "1:*";
    for await (const msg of client.fetch(range, {
      source: true,
      envelope: true,
      flags: true,
      uid: true,
    })) {
      if (limit && seenMsgs >= limit) break;
      seenMsgs += 1;
      const parsed = await simpleParser(msg.source as Buffer);
      const messageId = parsed.messageId ?? `uid:${msg.uid}`;
      const from =
        parsed.from?.value?.[0]?.address ?? parsed.from?.text ?? null;
      const subject = parsed.subject ?? null;
      const date = parsed.date ?? msg.envelope?.date ?? null;

      const atts = (parsed.attachments ?? []).filter((a) =>
        isPdf(a.filename ?? "", a.contentType ?? ""),
      );
      for (const att of atts) {
        pdfs += 1;
        const content = att.content as Buffer;
        const sha = createHash("sha256").update(content).digest("hex");
        const dedupKey = `mail:${createHash("sha1")
          .update(`${messageId}|${att.filename ?? ""}|${content.length}`)
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

        const year = (date ? new Date(date) : new Date())
          .toISOString()
          .slice(0, 4);
        const key = prefix.eingangsrechnung(year, dedupKey.slice(5));
        await putObject(key, content, "application/pdf");

        const { data: ins, error } = await supabase
          .from("incoming_document")
          .insert({
            source: "email",
            status: "captured",
            email_message_id: messageId,
            email_from: from,
            email_subject: subject,
            email_date: date ? new Date(date).toISOString() : null,
            file_name: att.filename ?? "beleg.pdf",
            pdf_storage_key: key,
            file_sha256: sha,
            dedup_key: dedupKey,
          })
          .select("id")
          .single();
        if (error) throw new Error(`incoming_document: ${error.message}`);
        captured.push((ins as { id: string }).id);
        created += 1;
      }

      if (!dryRun && atts.length > 0) {
        try {
          await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
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

  return { messages: seenMsgs, pdfAttachments: pdfs, created, duplicates, dryRun };
}
