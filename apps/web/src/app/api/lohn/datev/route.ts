import { NextResponse, type NextRequest } from "next/server";
import { amount, buildFile, clean, ddmm, N_COLS, q, raw, type ExtfStamm } from "@werk/shared/datev/extf";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * DATEV-EXTF-Buchungsstapel der Lohnbuchungen (für den Steuerberater): alle importierten Zeilen der
 * Lohnabrechnung im gewählten Zeitraum, unverändert (Konto 1755 an Gegenkonto, S/H, BU, Belegfelder, KOST).
 * GET /api/lohn/datev?jahr=2026&von=01&bis=09
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const jahr = sp.get("jahr") ?? "";
  const von = sp.get("von") ?? "01";
  const bis = sp.get("bis") ?? "12";
  if (!/^\d{4}$/.test(jahr) || !/^(0[1-9]|1[0-2])$/.test(von) || !/^(0[1-9]|1[0-2])$/.test(bis) || von > bis) {
    return NextResponse.json({ error: "Zeitraum ungültig (jahr=YYYY, von/bis=MM)" }, { status: 400 });
  }
  const berater = process.env.DATEV_BERATER_NR?.trim();
  const mandant = process.env.DATEV_MANDANTEN_NR?.trim();
  if (!berater || !mandant) {
    return NextResponse.json({ error: "DATEV_BERATER_NR / DATEV_MANDANTEN_NR sind nicht gesetzt." }, { status: 500 });
  }
  const stamm: ExtfStamm = {
    beraterNr: berater,
    mandantenNr: mandant,
    wjBeginnDDMM: (process.env.DATEV_WJ_BEGINN || "0101").trim(),
    sachkontoLen: Number(process.env.DATEV_SACHKONTO_LEN || 4),
  };
  const from = `${jahr}-${von}-01`;
  const to = new Date(Date.UTC(+jahr, +bis, 0)).toISOString().slice(0, 10);

  const sb = await createClient();
  type P = {
    amount: number;
    soll_haben: "S" | "H";
    konto: string;
    gegenkonto: string;
    bu_schluessel: string | null;
    beleg_datum: string | null;
    belegfeld1: string | null;
    belegfeld2: string | null;
    buchungstext: string | null;
    kost1: string | null;
    kost2: string | null;
    position: number;
    payroll_import: { period_start: string | null; period_end: string | null } | null;
  };
  const rows: P[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb
      .from("payroll_booking")
      .select(
        "amount, soll_haben, konto, gegenkonto, bu_schluessel, beleg_datum, belegfeld1, belegfeld2, buchungstext, kost1, kost2, position, payroll_import:import_id(period_start, period_end)",
      )
      .range(f, f + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as unknown as P[]));
    if (!data || data.length < 1000) break;
  }
  const datum = (p: P) => p.beleg_datum ?? p.payroll_import?.period_end ?? "";
  const imZeitraum = rows
    .filter((p) => datum(p) >= from && datum(p) <= to)
    .sort((a, b) => datum(a).localeCompare(datum(b)) || a.position - b.position);
  if (!imZeitraum.length) return NextResponse.json({ error: "Keine Lohnbuchungen im Zeitraum." }, { status: 404 });

  const lines = imZeitraum.map((p) => {
    const c = new Array<string>(N_COLS).fill("");
    c[0] = raw(amount(p.amount));
    c[1] = q(p.soll_haben);
    c[2] = q("EUR");
    c[6] = raw(p.konto);
    c[7] = raw(p.gegenkonto);
    c[8] = p.bu_schluessel ? q(p.bu_schluessel) : "";
    c[9] = raw(ddmm(datum(p)));
    c[10] = q(clean(p.belegfeld1 ?? "", 36));
    c[11] = q(clean(p.belegfeld2 ?? "", 12));
    c[13] = q(clean(p.buchungstext ?? "", 60));
    c[36] = q(clean(p.kost1 ?? "", 36));
    c[37] = q(clean(p.kost2 ?? "", 36));
    return c.join(";");
  });
  const buf = buildFile(stamm, lines, from, to, `Lohnbuchungen ${from} bis ${to}`);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "text/csv; charset=windows-1252",
      "Content-Disposition": `attachment; filename="EXTF_Lohn_${from}_${to}.csv"`,
    },
  });
}
