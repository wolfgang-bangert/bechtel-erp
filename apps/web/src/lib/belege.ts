import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { putObject } from "@/lib/storage";
import type { DokumentKategorie } from "@/lib/dokumente";

/**
 * Gemeinsamer erster Schritt für Eingangsbelege und Ablage-Dokumente - genutzt vom manuellen Upload,
 * vom Handy-Scan (/scannen) und vom Nextcloud-Hotfolder. Der Supabase-Client kommt vom Aufrufer
 * (Nutzer-Client mit RLS bzw. Service-Client für n8n).
 */

export type Erfasst = { status: "neu"; key: string } | { status: "doppelt" };

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * Eingangsbeleg anlegen: PDF ablegen + incoming_document "captured" (wie mail:fetch). Die KI-Extraktion
 * stößt der Aufrufer danach einmal über extraktionAnstossen an.
 */
export async function eingangsbelegErfassen(
  sb: SupabaseClient,
  bytes: Buffer,
  fileName: string,
  contentType = "application/pdf",
): Promise<Erfasst> {
  const sha = sha256(bytes);
  const dedupKey = `upload:${sha}`;
  const { data: exists } = await sb.from("incoming_document").select("id").eq("dedup_key", dedupKey).maybeSingle();
  if (exists) return { status: "doppelt" }; // identischer Beleg schon erfasst
  // dieselbe Datei aus anderem Kanal (Mail, BB-Import) zählt ebenfalls als schon erfasst
  const { data: sameFile } = await sb.from("incoming_document").select("id").eq("file_sha256", sha).limit(1);
  if (sameFile && sameFile.length) return { status: "doppelt" };

  const key = `eingangsrechnungen/${new Date().getFullYear()}/${randomUUID()}.pdf`;
  await putObject(key, bytes, contentType);
  const { error } = await sb.from("incoming_document").insert({
    source: "upload",
    file_name: fileName,
    pdf_storage_key: key,
    file_sha256: sha,
    dedup_key: dedupKey,
  });
  if (error) throw new Error(error.message);
  return { status: "neu", key };
}

/** KI-Extraktion (incoming:extract im sync-Container) für neu erfasste Belege anstoßen. */
export async function extraktionAnstossen(sb: SupabaseClient): Promise<void> {
  await sb.from("sync_request").insert({ job: "incoming:extract", params: {} });
}

/** KI-Erkennung der Dokumentablage (dokumente:extract im sync-Container) anstoßen: Partner, Datum, Titel, Zuordnung. */
export async function dokumentErkennungAnstossen(sb: SupabaseClient): Promise<void> {
  await sb.from("sync_request").insert({ job: "dokumente:extract", params: {} });
}

export type DokumentDaten = {
  kategorie: DokumentKategorie;
  titel: string;
  datum?: string | null;
  partner?: string | null;
  notiz?: string | null;
  seiten?: number | null;
  quelle: "scan" | "upload";
  erfasstVon?: string | null;
};

/** Ablage-Dokument anlegen (Tabelle dokument); Firma nur bei eindeutigem Namenstreffer verknüpfen. */
export async function dokumentAnlegen(
  sb: SupabaseClient,
  bytes: Buffer,
  fileName: string,
  d: DokumentDaten,
): Promise<Erfasst> {
  const sha = sha256(bytes);
  const { data: schon } = await sb.from("dokument").select("id").eq("file_sha256", sha).limit(1);
  if (schon && schon.length) return { status: "doppelt" };

  let organizationId: string | null = null;
  if (d.partner) {
    const { data: orgs } = await sb
      .from("organization")
      .select("id")
      .ilike("name", d.partner.replace(/[\\%_]/g, (c) => "\\" + c))
      .limit(2);
    if (orgs && orgs.length === 1) organizationId = orgs[0].id;
  }

  const key = `dokumente/${new Date().getFullYear()}/${randomUUID()}.pdf`;
  await putObject(key, bytes, "application/pdf");
  const { error } = await sb.from("dokument").insert({
    kategorie: d.kategorie,
    titel: d.titel,
    dokument_datum: d.datum ?? null,
    partner_name: d.partner ?? null,
    organization_id: organizationId,
    notiz: d.notiz ?? null,
    file_name: fileName,
    storage_key: key,
    file_sha256: sha,
    seiten: d.seiten ?? null,
    quelle: d.quelle,
    erfasst_von: d.erfasstVon ?? null,
  });
  if (error) throw new Error(error.message);
  return { status: "neu", key };
}
