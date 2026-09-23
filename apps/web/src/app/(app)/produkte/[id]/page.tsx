import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signedGetUrl } from "@/lib/storage";
import { registerMm } from "@werk/shared/produkt/register";
import { kapitelKennung } from "@werk/shared/produkt/kennung";
import { KapitelName, TeilZeile, type MaterialOpt, type Teil } from "./ui";
import { AlleKapitelPdfsButton, KapitelPdfButton, KapitelPdfLink } from "./KapitelAktionen";

export const dynamic = "force-dynamic";

type TeilRow = {
  id: string;
  typ: string;
  kapitel_id: string | null;
  hauptregister_teil_id: string | null;
  nr: string | null;
  titel: string | null;
  material_id: string | null;
  farbigkeit: string | null;
  seitenzahl: number | null;
  register_teile: number | null;
  register_position: number | null;
  sortierung: number;
  attribute: { dateien?: { ip: string }[] } | null;
  dateien: { id: string; reihenfolge: number; file: { filename: string; storage_path: string } | null }[];
};

type KapitelRow = {
  id: string;
  nr: string;
  hauptregister_teil_id: string | null;
  name: string;
  sortierung: number;
  file_id: string | null;
  file: { filename: string; storage_path: string } | null;
};

const fmtMm = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function ProduktPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: produkt } = await supabase
    .from("produkt")
    .select("id, name, art, sprache, beschreibung")
    .eq("id", id)
    .maybeSingle();
  if (!produkt) notFound();

  const [{ data: teileRaw }, { data: kapitelRaw }, { data: typRaw }, { data: matRaw }] = await Promise.all([
    supabase
      .from("produktteil")
      .select(
        "id, typ, kapitel_id, hauptregister_teil_id, nr, titel, material_id, farbigkeit, seitenzahl, register_teile, register_position, sortierung, attribute, " +
          "dateien:produktteil_datei(id, reihenfolge, file:file_id(filename, storage_path))",
      )
      .eq("produkt_id", id)
      .order("sortierung"),
    supabase
      .from("produkt_kapitel")
      .select("id, nr, hauptregister_teil_id, name, sortierung, file_id, file:file_id(filename, storage_path)")
      .eq("produkt_id", id)
      .order("sortierung"),
    supabase.from("produktteil_typ").select("key, label"),
    supabase.from("material").select("id, name, name_kurz").eq("is_active", true).order("name"),
  ]);

  const teile = (teileRaw ?? []) as unknown as TeilRow[];
  const kapitel = (kapitelRaw ?? []) as unknown as KapitelRow[];
  const typLabel = new Map((typRaw ?? []).map((t) => [t.key as string, t.label as string]));
  const materialien: MaterialOpt[] = (matRaw ?? []).map((m) => ({
    id: m.id as string,
    label: (m.name_kurz as string | null) || (m.name as string),
  }));

  const toTeil = async (t: TeilRow): Promise<Teil> => ({
    id: t.id,
    typLabel: typLabel.get(t.typ) ?? t.typ,
    nr: t.nr,
    titel: t.titel,
    material_id: t.material_id,
    farbigkeit: t.farbigkeit,
    seitenzahl: t.seitenzahl,
    registerText:
      t.register_position != null
        ? `Pos ${t.register_position}/${t.register_teile ?? 10} · ${fmtMm(registerMm(t.register_position, 297, t.register_teile ?? 10))} mm`
        : null,
    dateien: await Promise.all(
      [...(t.dateien ?? [])]
        .filter((d) => d.file)
        .sort((a, b) => a.reihenfolge - b.reihenfolge)
        .map(async (d) => ({
          id: d.id,
          filename: d.file!.filename,
          url: await signedGetUrl(d.file!.storage_path, 1800),
          quelle: null,
        })),
    ),
    ips: (t.attribute?.dateien ?? []).map((d) => d.ip),
  });

  const vorspann = await Promise.all(
    teile.filter((t) => !t.kapitel_id && !t.hauptregister_teil_id && t.typ !== "hauptregister").map(toTeil),
  );
  const hauptregister = teile.filter((t) => t.typ === "hauptregister");

  const kapitelBlock = async (k: KapitelRow) => {
    const kt = teile.filter((t) => t.kapitel_id === k.id);
    const ur = kt.find((t) => t.typ === "unterregister");
    const kapitelPdfUrl = k.file ? await signedGetUrl(k.file.storage_path, 1800, k.file.filename) : null;
    const kennung = kapitelKennung(produkt.sprache, k.nr, ur?.register_position ?? null, ur?.register_teile ?? null);
    return (
      <details key={k.id} style={{ marginBottom: 6 }}>
        <summary
          style={{
            cursor: "pointer",
            display: "flex",
            gap: 14,
            alignItems: "center",
            padding: "7px 10px",
            background: "var(--tag-bg)",
            borderRadius: 6,
          }}
        >
          <strong style={{ width: 50 }}>{k.nr}</strong>
          <span className="w-name">{k.name}</span>
          <span className="count">
            {ur?.register_position != null
              ? `${fmtMm(registerMm(ur.register_position, 297, ur.register_teile ?? 10))} mm`
              : ""}
          </span>
          {kapitelPdfUrl && <KapitelPdfLink href={kapitelPdfUrl} />}
          <KapitelPdfButton kapitelId={k.id} />
        </summary>
        <div style={{ padding: "8px 4px 4px 14px" }}>
          <KapitelName produktId={id} kapitelId={k.id} name={k.name} />
          <p className="count" style={{ marginTop: -4, marginBottom: 8 }}>
            Kennung (Rand-Stempel): <strong>{kennung}</strong>
          </p>
          {await Promise.all(
            kt
              .sort((a, b) => a.sortierung - b.sortierung)
              .map(async (t) => (
                <TeilZeile key={t.id} produktId={id} teil={await toTeil(t)} materialien={materialien} />
              )),
          )}
        </div>
      </details>
    );
  };

  const ohneHr = kapitel.filter((k) => !k.hauptregister_teil_id);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>
          {produkt.name} {produkt.sprache && <span className="tag">{String(produkt.sprache).toUpperCase()}</span>}
        </h1>
        <div className="toolbar" style={{ gap: 8 }}>
          <Link href={`/produkte/${id}/archiv`} className="ghost" style={{ padding: "7px 12px" }}>
            Archiv (Originale) →
          </Link>
          <Link href="/produkte" className="ghost" style={{ padding: "7px 12px" }}>
            ← Produkte
          </Link>
        </div>
      </div>
      <p className="lead">
        {kapitel.length} Kapitel · {teile.length} Produktteile. Ein Kapitel besteht aus Unterregister + Inhalt; das
        Hauptregister ist ein eigener Teil. Klick auf einen Produktteil öffnet die Details zum Bearbeiten.
      </p>

      <AlleKapitelPdfsButton produktId={id} />

      <h2>Vorspann</h2>
      <div className="rows">
        {vorspann.map((t) => (
          <TeilZeile key={t.id} produktId={id} teil={t} materialien={materialien} />
        ))}
      </div>

      {ohneHr.length > 0 && (
        <>
          <h2 style={{ marginTop: 22 }}>Ohne Hauptregister</h2>
          {await Promise.all(ohneHr.map(kapitelBlock))}
        </>
      )}

      {await Promise.all(
        hauptregister.map(async (hr) => {
          const intro = teile.filter((t) => !t.kapitel_id && t.hauptregister_teil_id === hr.id);
          const ks = kapitel.filter((k) => k.hauptregister_teil_id === hr.id);
          return (
            <section key={hr.id} style={{ marginTop: 22 }}>
              <h2 style={{ marginBottom: 6 }}>
                Hauptregister {hr.nr}: {hr.titel}
              </h2>
              <div className="rows" style={{ marginBottom: 8 }}>
                <TeilZeile produktId={id} teil={await toTeil(hr)} materialien={materialien} />
                {await Promise.all(
                  intro.map(async (t) => (
                    <TeilZeile key={t.id} produktId={id} teil={await toTeil(t)} materialien={materialien} />
                  )),
                )}
              </div>
              {ks.length === 0 ? (
                <p className="count">Keine Unterregister.</p>
              ) : (
                await Promise.all(ks.map(kapitelBlock))
              )}
            </section>
          );
        }),
      )}
    </>
  );
}
