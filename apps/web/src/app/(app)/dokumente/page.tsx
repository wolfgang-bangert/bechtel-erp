import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { DOKUMENT_KATEGORIEN, istDokumentKategorie } from "@/lib/dokumente";
import { LoeschenButton } from "./LoeschenButton";
import { NextcloudAbholen } from "../_shared/NextcloudAbholen";
import { nextcloudKonfiguriert } from "@/lib/nextcloud/webdav";
import { hotfolderName } from "@/lib/nextcloud/hotfolder";

export const dynamic = "force-dynamic";

export default async function DokumentePage({
  searchParams,
}: {
  searchParams: Promise<{ kategorie?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const kategorie = sp.kategorie && istDokumentKategorie(sp.kategorie) ? sp.kategorie : "";
  const q = (sp.q ?? "").trim();

  const supabase = await createClient();
  const { data: personalRecht } = await supabase.rpc("has_personal_access");
  const darfPersonal = personalRecht === true;
  let query = supabase
    .from("dokument")
    .select("id, kategorie, titel, dokument_datum, partner_name, organization_id, personal_id, notiz, seiten, created_at, extraktion_status, extraktion_fehler")
    .order("dokument_datum", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (kategorie) query = query.eq("kategorie", kategorie);
  if (q) {
    const muster = `%${q.replace(/[\\%_,()]/g, " ")}%`;
    query = query.or(`titel.ilike.${muster},partner_name.ilike.${muster},notiz.ilike.${muster}`);
  }
  const { data: dokumente, error } = await query;

  return (
    <>
      <div className="bd-head">
        <h1>Dokumente</h1>
        <div className="bd-actions">
          <Link href="/scannen?ziel=dokument" className="bd-btn bd-btn-primary">
            📷 Dokument scannen
          </Link>
        </div>
      </div>
      <div style={{ margin: "8px 0 12px" }}>
        <NextcloudAbholen konfiguriert={nextcloudKonfiguriert()} ordner={hotfolderName()} />
      </div>
      <p className="lead">
        Ablage für Papierdokumente ohne Buchung – Handwerker-Rapporte, Lieferscheine, Verträge. Am einfachsten mit dem
        Handy über <Link href="/scannen?ziel=dokument">/scannen</Link> erfassen. Eingangsrechnungen gehören nicht hierher,
        sondern zu den <Link href="/eingangsrechnungen">Eingangsrechnungen</Link> (dort gibt es KI-Erkennung und Buchung).
        Aus der Nextcloud: PDFs in <code>{hotfolderName()}/Rapporte</code>, <code>/Lieferscheine</code>,{" "}
        <code>/Personal</code> (nur mit Recht Personal) oder <code>/Sonstiges</code> legen und „Aus Nextcloud holen“ drücken.
      </p>

      <form className="bd-toolbar" method="get">
        <div className="bd-field">
          <label className="bd-field-label">Suche</label>
          <input className="bd-field-input" name="q" defaultValue={q} placeholder="Titel, Firma, Notiz…" style={{ minWidth: 220 }} />
        </div>
        <div className="bd-field">
          <label className="bd-field-label">Art</label>
          <select className="bd-field-input" name="kategorie" defaultValue={kategorie}>
            <option value="">alle</option>
            {Object.entries(DOKUMENT_KATEGORIEN).filter(([k]) => k !== "personal" || darfPersonal).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="bd-btn">
          Filtern
        </button>
      </form>

      {error && <div className="banner-err">Fehler: {error.message}</div>}

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Art</th>
              <th>Titel</th>
              <th>Firma</th>
              <th>Notiz</th>
              <th style={{ textAlign: "right" }}>Seiten</th>
              <th>erfasst</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(dokumente ?? []).map((d) => (
              <tr key={d.id}>
                <td className="count">{fmtDate(d.dokument_datum)}</td>
                <td>
                  <span className="tag">{istDokumentKategorie(d.kategorie) ? DOKUMENT_KATEGORIEN[d.kategorie] : d.kategorie}</span>
                </td>
                <td className="wrap">
                  <a href={`/dokumente/${d.id}/pdf`} target="_blank" rel="noreferrer">
                    {d.titel}
                  </a>
                </td>
                <td className="wrap">
                  {d.personal_id ? (
                    <Link href={`/personal/${d.personal_id}`}>{d.partner_name ?? "Person"}</Link>
                  ) : d.organization_id ? (
                    <Link href={`/organisationen/${d.organization_id}`}>{d.partner_name}</Link>
                  ) : (
                    d.partner_name
                  )}
                  {d.extraktion_status === "offen" && <span className="tag" title="KI liest Partner, Datum und Titel">wird erkannt …</span>}
                  {d.extraktion_status === "fehler" && (
                    <span className="tag" title={d.extraktion_fehler ?? ""}>
                      Erkennung fehlgeschlagen
                    </span>
                  )}
                </td>
                <td className="wrap count">{d.notiz}</td>
                <td style={{ textAlign: "right" }}>{d.seiten}</td>
                <td className="count">{fmtDate(d.created_at)}</td>
                <td>
                  <LoeschenButton id={d.id} />
                </td>
              </tr>
            ))}
            {(dokumente ?? []).length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)" }}>
                  {q || kategorie ? "Keine passenden Dokumente." : "Noch keine Dokumente abgelegt."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
