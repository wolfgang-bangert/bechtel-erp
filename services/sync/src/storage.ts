import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Fehlende Umgebungsvariable ${name}`);
  return v.trim();
}

const bucket = () => required("S3_BUCKET");

const client = () =>
  new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: required("S3_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY"),
      secretAccessKey: required("S3_SECRET_KEY"),
    },
  });

/** Objekt hochladen (überschreibt vorhandenes). */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Kurzlebiger GET-Link (Default 10 min). */
export async function signedGetUrl(key: string, expiresIn = 600): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  );
}

/** Ordner-Präfixe im Bucket. */
export const prefix = {
  ausgangsrechnung: (year: string, id: string) =>
    `ausgangsrechnungen/${year}/${id}.pdf`,
  eingangsrechnung: (year: string, id: string) =>
    `eingangsrechnungen/${year}/${id}.pdf`,
  beleg: (year: string, id: string) => `belege/${year}/${id}.pdf`,
};

export { GetObjectCommand };
