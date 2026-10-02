import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { PortalPullButton } from "./PortalPullButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
type Search = { q?: string; state?: string; gruppe?: string; stamm?: string; page?: string };

type Attr = Record<string, unknown>;

/** Kompakte Attributzeile auf Deutsch. */
function attrLine(a: Attr | null | undefined): string {
  if (!a) return "";
  const p: string[] = [];
  if (a.format) p.push(String(a.format));
  if (a.blatt != null) p.push(`${a.blatt} Blatt`);
  else if (a.seiten != null) p.push(`${a.seiten} Seiten`);
  if (a.grammatur_g != null)
    p.push(`${a.grammatur_g} g${a.oberflaeche ? ` ${a.oberflaeche}` : ""}${/offset/i.test(String(a.sorte ?? "")) ? " Offset" : ""}`);
  if (a.farbigkeit) p.push(String(a.farbigkeit));
  if (a.farbe) p.push(String(a.farbe));
  if (a.bindung || a.bindeseite)
    p.push(`Wire-O${a.spiralfarbe ? ` ${a.spiralfarbe}` : ""}${a.bindeseite ? `, ${a.bindeseite}` : ""}`);
  if (a.cello && a.cello !== "keine") p.push(`Cello ${a.cello}`);
  if (a.deckblatt) p.push("Deckblatt");
  if (a.kalenderaufhaenger) p.push("Kalenderaufhänger");
  if (a.ausrichtung) p.push(String(a.ausrichtung));
  return p.join(" · ");
}

function Adr({ a }: { a: Record<string, unknown> | null }) {
  if (!a) return <span className="bd-mute">—</span>;
  const g = (k: string) => (a[k] == null ? "" : String(a[k]));
  const lines = [
    g("company"),
    g("name"),
    [g("street"), g("addition1")].filter(Boolean).join(" "),
    [g("zip"), g("city")].filter(Boolean).join(" "),
    g("country"),
  ].filter(Boolean);
  return <div style={{ whiteSpace: "pre-line", lineHeight: 1.35 }}>{lines.join("\n")}</div>;
}

export default async function DruckauftraegePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const state = sp.state ?? "";
  const gruppe = sp.gruppe ?? "";
  const stamm = sp.stamm ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const [{ data: gruppen }, { data: stammartikel }, { data: lastPull }] = await Promise.all([
    supabase.from("opri_produkt_gruppe").select("id, kuerzel, name").order("kuerzel"),
    supabase.from("opri_stammartikel").select("id, sku, name, gruppe_id").order("sku").limit(2000),
    supabase
      .from("sync_request")
      .select("status, requested_at, finished_at, error")
      .eq("job", "portal:pull")
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const gruppeName = new Map((gruppen ?? []).map((g) => [g.kuerzel as string, g.name as string]));
  const gruppeIdByKuerzel = new Map((gruppen ?? []).map((g) => [g.kuerzel as string, g.id as string]));
  const stammName = new Map((stammartikel ?? []).map((s) => [s.id as string, `${s.sku} — ${s.name}`]));
  // Stammartikel-Auswahl auf die gewählte Produktgruppe eingrenzen
  const selGruppeId = gruppe ? gruppeIdByKuerzel.get(gruppe) : undefined;
  const stammOptionen = (stammartikel ?? []).filter(
    (s) => !selGruppeId || s.gruppe_id === selGruppeId,
  );

  let query = supabase
    .from("portal_order")
    .select(
      "id, external_reference, portal_state, description, quantity, ship_to, resolve_result, " +
        "items:portal_order_item(count), files:portal_order_file(typ, storage_key)",
      { count: "exact" },
    );
  if (state) query = query.eq("portal_state", state);
  if (gruppe) query = query.eq("resolve_result->>gruppe", gruppe);
  if (stamm) query = query.eq("resolve_result->>stammartikel_id", stamm);
  if (q) {
    const like = `%${q.replace(/[%,]/g, "")}%`;
    query = query.or(`external_reference.ilike.${like},description.ilike.${like}`);
  }

  const res = await query.order("received_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const error = res.error;
  const total = res.count ?? 0;
  const rows = (res.data ?? []) as unknown as {
    id: string;
    external_reference: string | null;
    portal_state: string | null;
    description: string | null;
    quantity: number | null;
    ship_to: Record<string, unknown> | null;
    resolve_result: { gruppe?: string; stammartikel_id?: string; attribute?: Attr } | null;
    items: { count: number }[];
    files: { typ: string; storage_key: string | null }[];
  }[];

  const withThumbs = await Promise.all(
    rows.map(async (r) => {
      const key = r.files?.find((f) => f.typ === "thumbnail" && f.storage_key)?.storage_key ?? null;
      return { ...r, thumb: key ? await signedGetUrl(key, 900) : null };
    }),
  );

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (patch: Partial<Search>) => {
    const u = new URLSearchParams();
    const merged = { q, state, gruppe, stamm, page: String(page), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "1") u.set(k, String(v));
    const str = u.toString();
    return str ? `/druckauftraege?${str}` : "/druckauftraege";
  };

  const stateTone = (st: string | null): "neutral" | "info" | "success" | "danger" =>
    st === "FINISHED" ? "success" : st === "NEW" ? "info" : st && /CANCEL/i.test(st) ? "danger" : "neutral";

  return (
    <div className="content-wide bd-page">
      <div className="bd-head">
        <div>
          <h1>Druckaufträge</h1>
          <p className="bd-lead" style={{ marginBottom: 16 }}>
            Eingehende Aufträge von OnlinePrinters. Automatisch täglich 5:30 Uhr, oder oben manuell
            anstoßen (holt neue Aufträge + aktualisiert Status bestehender, auch auf FINISHED).
          </p>
        </div>
        <PortalPullButton last={lastPull ?? null} />
      </div>

      <form className="bd-toolbar" method="get">
        <div className="bd-field" style={{ width: 210 }}>
          <label className="bd-field-label" htmlFor="q">Suche</label>
          <input className="bd-field-input" id="q" name="q" defaultValue={q} placeholder="Referenz / Beschreibung" />
        </div>
        <div className="bd-field" style={{ width: 180 }}>
          <label className="bd-field-label" htmlFor="gruppe">Produktgruppe</label>
          <select className="bd-field-input" id="gruppe" name="gruppe" defaultValue={gruppe}>
            <option value="">alle</option>
            {(gruppen ?? []).map((g) => (
              <option key={g.kuerzel as string} value={g.kuerzel as string}>
                {g.name as string}
              </option>
            ))}
          </select>
        </div>
        <div className="bd-field" style={{ width: 270 }}>
          <label className="bd-field-label" htmlFor="stamm">
            Stammartikel{gruppe ? "" : " (erst Gruppe wählen)"}
          </label>
          <select className="bd-field-input" id="stamm" name="stamm" defaultValue={stamm}>
            <option value="">alle</option>
            {stammOptionen.map((s) => (
              <option key={s.id as string} value={s.id as string}>
                {s.sku as string} — {s.name as string}
              </option>
            ))}
          </select>
        </div>
        <div className="bd-field" style={{ width: 120 }}>
          <label className="bd-field-label" htmlFor="state">Status</label>
          <input className="bd-field-input" id="state" name="state" defaultValue={state} placeholder="NEW …" />
        </div>
        <button className="bd-btn bd-btn-secondary" type="submit">Filtern</button>
        {(gruppe || stamm || state || q) && <Link className="bd-link" href="/druckauftraege">zurücksetzen</Link>}
        <div className="bd-spacer" />
        <span className="bd-mute">{total.toLocaleString("de-DE")} Aufträge</span>
      </form>

      {error && <div className="banner-err">Fehler beim Laden: {error.message}</div>}

      <div className="table-scroll">
        <table className="bd-table">
          <thead>
            <tr>
              <th style={{ width: 56 }}></th>
              <th className="bd-num" style={{ width: 78 }}>Auflage</th>
              <th>Produkt</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 300 }}>Lieferanschrift</th>
            </tr>
          </thead>
          <tbody>
            {withThumbs.map((r) => {
              const rr = r.resolve_result;
              const produkt = (rr?.gruppe && gruppeName.get(rr.gruppe)) || r.description || "—";
              const sub = attrLine(rr?.attribute);
              const stammSku =
                rr?.stammartikel_id && stammName.get(rr.stammartikel_id)
                  ? stammName.get(rr.stammartikel_id)!.split(" — ")[0]
                  : null;
              return (
                <tr key={r.id}>
                  <td>
                    {r.thumb ? (
                      <span className="thumb-zoom">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.thumb}
                          alt=""
                          style={{ width: 48, height: 62, objectFit: "cover", borderRadius: 2, border: "1px solid var(--bd-line)" }}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.thumb} alt="" className="zoom" />
                      </span>
                    ) : (
                      <div
                        style={{ width: 48, height: 62, borderRadius: 2, border: "1px dashed var(--bd-line-strong)", background: "var(--bd-surface-100)" }}
                      />
                    )}
                  </td>
                  <td className="bd-num" style={{ fontWeight: 600, fontSize: 15 }}>
                    {r.quantity != null ? Number(r.quantity).toLocaleString("de-DE") : "—"}
                  </td>
                  <td className="wrap">
                    <Link href={`/druckauftraege/${r.id}`} style={{ fontSize: 15, fontWeight: 600, color: "var(--bd-rot)" }}>
                      <span style={{ color: "var(--bd-ink-muted)" }}>{r.external_reference}</span>
                      {"  "}
                      {produkt}
                    </Link>
                    {sub && <span className="bd-sub">{sub}</span>}
                    {(stammSku || r.items?.[0]?.count) && (
                      <span className="bd-sub">
                        {[stammSku, `${r.items?.[0]?.count ?? 0} Pos.`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`bd-status t-${stateTone(r.portal_state)}`}>
                      <span className="bd-status-mark" />
                      {r.portal_state ?? "?"}
                    </span>
                  </td>
                  <td className="wrap bd-mute"><Adr a={r.ship_to} /></td>
                </tr>
              );
            })}
            {!withThumbs.length && (
              <tr>
                <td colSpan={5} className="bd-mute">Keine Druckaufträge.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="bd-actions" style={{ marginTop: 16 }}>
          {page > 1 && (
            <Link className="bd-btn bd-btn-secondary" href={href({ page: String(page - 1) })}>
              ← zurück
            </Link>
          )}
          <span className="bd-mute">Seite {page} / {lastPage}</span>
          {page < lastPage && (
            <Link className="bd-btn bd-btn-secondary" href={href({ page: String(page + 1) })}>
              weiter →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
