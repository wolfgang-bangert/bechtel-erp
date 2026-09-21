import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { ArchivUpload } from "./ArchivUpload";
import { EinzeldateienButton, LoeschenButton } from "./Aktionen";

export const dynamic = "force-dynamic";

const ORDNER: { key: string; label: string }[] = [
  { key: "hauptregister", label: "Hauptregister" },
  { key: "unterregister", label: "Unterregister" },
  { key: "inhalt", label: "Inhalt" },
  { key: "deck", label: "Deck- und Faltblätter" },
];

type Row = {
  id: string;
  ordner: string;
  original_name: string;
  ip_key: string | null;
  seitenzahl: number | null;
  size_bytes: number | null;
  file: { storage_path: string } | null;
};

const fmtMb = (b: number | null) => (b == null ? "—" : `${(b / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`);

export default async function ProduktArchivPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: produkt } = await supabase.from("produkt").select("id, name").eq("id", id).maybeSingle();
  if (!produkt) notFound();

  const { data, error } = await supabase
    .from("produkt_archiv")
    .select("id, ordner, original_name, ip_key, seitenzahl, size_bytes, file:file_id(storage_path)")
    .eq("produkt_id", id)
    .order("ip_key")
    .order("original_name");
  const rows = (data ?? []) as unknown as Row[];

  const mitUrl = await Promise.all(
    rows.map(async (r) => ({
      ...r,
      url: r.file ? await signedGetUrl(r.file.storage_path, 1800, r.original_name) : null,
    })),
  );

  const summeBytes = rows.reduce((a, r) => a + (r.size_bytes ?? 0), 0);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Archiv: {produkt.name}</h1>
        <Link href={`/produkte/${id}`} className="ghost" style={{ padding: "7px 12px" }}>
          ← Produkt
        </Link>
      </div>
      <p className="lead">
        Originaldateien dieses Produkts, unverändert abgelegt. Daraus entstehen die Einzeldateien der Produktteile
        (Register werden je Reiter herausgelöst, Inhaltsdateien nur zugeordnet). {rows.length} Dateien ·{" "}
        {fmtMb(summeBytes)}.
      </p>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <h2>Hochladen</h2>
      <ArchivUpload
        produktId={id}
        vorhanden={rows.map((r) => ({ name: r.original_name, size: Number(r.size_bytes ?? 0) }))}
      />

      <h2 style={{ marginTop: 26 }}>Einzeldateien</h2>
      <EinzeldateienButton produktId={id} />

      {ORDNER.map((o) => {
        const liste = mitUrl.filter((r) => r.ordner === o.key);
        if (!liste.length) return null;
        return (
          <section key={o.key} style={{ marginTop: 22 }}>
            <h2 style={{ marginBottom: 4 }}>
              {o.label} <span className="count">{liste.length}</span>
            </h2>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>IP</th>
                    <th>Datei</th>
                    <th style={{ textAlign: "right" }}>Seiten</th>
                    <th style={{ textAlign: "right" }}>Größe</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {liste.map((r) => (
                    <tr key={r.id}>
                      <td className="count">{r.ip_key ?? "—"}</td>
                      <td>
                        {r.url ? (
                          <a href={r.url} target="_blank" rel="noreferrer">
                            {r.original_name}
                          </a>
                        ) : (
                          r.original_name
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>{r.seitenzahl ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{fmtMb(r.size_bytes)}</td>
                      <td>
                        <LoeschenButton archivId={r.id} produktId={id} name={r.original_name} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
