import nodemailer from "nodemailer";
import { env } from "./env";

let cached: nodemailer.Transporter | null = null;

function transport(): nodemailer.Transporter {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: env.smtp.host(),
    port: env.smtp.port(),
    secure: env.smtp.secure(),
    auth: { user: env.smtp.user(), pass: env.smtp.password() },
  });
  return cached;
}

export function mailerConfigured(): boolean {
  return env.smtp.configured();
}

export type Attachment = { filename: string; content: Buffer; contentType?: string };

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
}): Promise<void> {
  await transport().sendMail({
    from: env.smtp.from(),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });
}
