import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Fehlende Umgebungsvariable ${name}`);
  return v;
}

const client = () =>
  new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: need("S3_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: need("S3_ACCESS_KEY"),
      secretAccessKey: need("S3_SECRET_KEY"),
    },
  });

/**
 * Kurzlebiger GET-Link (Default 10 min). null bei fehlender Konfiguration.
 * `download` erzwingt den Download mit dem angegebenen Dateinamen statt der
 * Inline-Anzeige im Browser.
 */
export async function signedGetUrl(
  key: string,
  expiresIn = 600,
  download?: string,
): Promise<string | null> {
  try {
    return await getSignedUrl(
      client(),
      new GetObjectCommand({
        Bucket: need("S3_BUCKET"),
        Key: key,
        ...(download
          ? {
              ResponseContentDisposition: `attachment; filename="${download.replace(/["\\]/g, "_")}"`,
            }
          : {}),
      }),
      { expiresIn },
    );
  } catch {
    return null;
  }
}

/** Objekt-Bytes lesen (für Server Actions, die eine Datei bearbeiten müssen). */
export async function getObjectBytes(key: string): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({ Bucket: need("S3_BUCKET"), Key: key }),
  );
  const chunks: Buffer[] = [];
  for await (const c of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(c));
  }
  return Buffer.concat(chunks);
}

/** Objekt hochladen (überschreibt vorhandenes). */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({ Bucket: need("S3_BUCKET"), Key: key, Body: body, ContentType: contentType }),
  );
}
