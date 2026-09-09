import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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
