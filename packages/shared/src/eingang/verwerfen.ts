import type { SupabaseClient } from "@supabase/supabase-js";

/* --------------------------------------------------------------------------
 * Eingangsbeleg verwerfen, ohne Bankzuordnungen zu verlieren.
 *
 * Hintergrund (GO Druck Media 261527/261528, Okt. 2026): Die Sammelüberweisung war dem Beleg zugeordnet, der
 * später als Dublette verworfen wurde. Die gebuchte Kopie mit derselben Rechnungsnummer blieb "offen" und stand
 * auf der Zahlungsliste, obwohl sie bezahlt war.
 *
 * Regel: Hat der zu verwerfende Beleg Bankzuordnungen (Zahlungen, Skonto-Zeilen mit ledger_account) oder ein
 * ausgebuchtes Skonto, wandern diese auf die nicht verworfene Kopie (die Dublette, gegen die verworfen wird, sonst
 * gleiche Rechnungsnummer + Lieferant) - aber nur, wenn die Kopie selbst noch keine Zuordnung hat. Sonst wird das
 * Verwerfen verhindert. Beim Löschen (pruneReceipts) gilt dasselbe, da ein Löschen die Zuordnungen mitlöscht.
 * -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export const MELDUNG_BANKZUORDNUNG = "Beleg hat Bankzuordnung – erst Zuordnung entfernen oder umhängen";

type DocInfo = {
  id: string;
  doc_number: string | null;
  doc_type: string;
  status: string;
  supplier_name: string | null;
  supplier_organization_id: string | null;
  gross_amount: number | null;
  skonto_amount: number | null;
};
const DOC_SELECT = "id, doc_number, doc_type, status, supplier_name, supplier_organization_id, gross_amount, skonto_amount";

const nm = (x: string | null | undefined) => (x ?? "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
const gleicherLieferant = (a: DocInfo, b: DocInfo) => {
  if (a.supplier_organization_id && a.supplier_organization_id === b.supplier_organization_id) return true;
  const na = nm(a.supplier_name), nb = nm(b.supplier_name);
  return na.length >= 4 && nb.length >= 4 && (na.startsWith(nb.slice(0, 6)) || nb.startsWith(na.slice(0, 6)));
};

/** Anzahl Bankzuordnungen (inkl. Skonto-Zeilen) je Beleg. */
async function zuordnungen(sb: Sb, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const { data, error } = await sb.from("bank_transaction_match").select("incoming_document_id").in("incoming_document_id", ids);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const id = r.incoming_document_id as string;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Nicht verworfene Kopien desselben Belegs (gleiche Rechnungsnummer, gleicher/ähnlicher Lieferant). */
export async function findeKopien(sb: Sb, doc: DocInfo): Promise<DocInfo[]> {
  const nr = doc.doc_number?.trim();
  if (!nr) return [];
  const { data, error } = await sb
    .from("incoming_document")
    .select(DOC_SELECT)
    .eq("doc_number", nr)
    .neq("id", doc.id)
    .neq("status", "rejected");
  if (error) throw new Error(error.message);
  return ((data ?? []) as DocInfo[]).filter((k) => gleicherLieferant(doc, k));
}

export type UmhaengenErgebnis =
  | { ok: true; umgehaengt: number; skonto: number; ziel: string | null }
  | { ok: false; grund: string };

/**
 * Hängt Bankzuordnungen und ausgebuchtes Skonto von `id` auf die Kopie um (`gegen` = Dublette, gegen die verworfen
 * wird; sonst eindeutig per Rechnungsnummer/Lieferant gesucht). Ohne Zuordnungen: ok, nichts zu tun.
 * Ändert den Status von `id` NICHT - das macht der Aufrufer (oder `verwirfEingangsbeleg`).
 */
export async function zuordnungenUmhaengen(sb: Sb, id: string, opts: { gegen?: string | null; dryRun?: boolean } = {}): Promise<UmhaengenErgebnis> {
  const { data: doc, error } = await sb.from("incoming_document").select(DOC_SELECT).eq("id", id).maybeSingle();
  if (error) return { ok: false, grund: error.message };
  if (!doc) return { ok: false, grund: "Beleg nicht gefunden" };
  const d = doc as DocInfo;
  const anzahl = (await zuordnungen(sb, [id])).get(id) ?? 0;
  const skonto = Number(d.skonto_amount ?? 0);
  if (anzahl === 0 && Math.abs(skonto) < 0.005) return { ok: true, umgehaengt: 0, skonto: 0, ziel: null };

  let ziel: DocInfo | null = null;
  if (opts.gegen) {
    const { data: g } = await sb.from("incoming_document").select(DOC_SELECT).eq("id", opts.gegen).maybeSingle();
    if (!g || (g as DocInfo).status === "rejected") return { ok: false, grund: `${MELDUNG_BANKZUORDNUNG} (Kopie ist selbst verworfen)` };
    ziel = g as DocInfo;
  } else {
    const kopien = await findeKopien(sb, d);
    // bei mehreren Kopien bevorzugt die mit gleichem Betrag
    const passend = kopien.filter((k) => Math.abs(Math.abs(k.gross_amount ?? 0) - Math.abs(d.gross_amount ?? 0)) <= 0.02);
    const wahl = passend.length ? passend : kopien;
    if (wahl.length !== 1)
      return { ok: false, grund: `${MELDUNG_BANKZUORDNUNG}${wahl.length ? " (mehrere Kopien gleicher Nummer)" : " (keine nicht verworfene Kopie)"}` };
    ziel = wahl[0];
  }
  const zielAnzahl = (await zuordnungen(sb, [ziel.id])).get(ziel.id) ?? 0;
  if (zielAnzahl > 0 || Math.abs(Number(ziel.skonto_amount ?? 0)) >= 0.005)
    return { ok: false, grund: `${MELDUNG_BANKZUORDNUNG} (Kopie ${ziel.doc_number ?? ziel.id.slice(0, 8)} hat selbst eine Zuordnung)` };
  if (opts.dryRun) return { ok: true, umgehaengt: anzahl, skonto, ziel: ziel.id };

  if (anzahl > 0) {
    const { error: me } = await sb.from("bank_transaction_match").update({ incoming_document_id: ziel.id }).eq("incoming_document_id", id);
    if (me) return { ok: false, grund: `Bankzuordnung nicht umhängbar: ${me.message}` };
  }
  if (Math.abs(skonto) >= 0.005) {
    const { error: se } = await sb.from("incoming_document").update({ skonto_amount: skonto }).eq("id", ziel.id);
    if (se) return { ok: false, grund: `Skonto nicht umhängbar: ${se.message}` };
    await sb.from("incoming_document").update({ skonto_amount: 0 }).eq("id", id);
  }
  // Der Match-Trigger rechnet nur den neuen Beleg nach - beide ausdrücklich.
  await sb.rpc("recalc_incoming_payment", { p_id: ziel.id });
  await sb.rpc("recalc_incoming_payment", { p_id: id });
  return { ok: true, umgehaengt: anzahl, skonto, ziel: ziel.id };
}

/**
 * Beleg verwerfen (status = 'rejected'). Bankzuordnungen wandern vorher auf die Kopie; geht das nicht, bleibt der
 * Beleg unverändert und es kommt `{ ok: false, grund }` zurück.
 */
export async function verwirfEingangsbeleg(
  sb: Sb,
  id: string,
  opts: { gegen?: string | null; notes?: string | null; extra?: Record<string, unknown> } = {},
): Promise<UmhaengenErgebnis> {
  const r = await zuordnungenUmhaengen(sb, id, { gegen: opts.gegen });
  if (!r.ok) return r;
  const patch: Record<string, unknown> = { ...(opts.extra ?? {}), status: "rejected" };
  if (opts.notes !== undefined) patch.notes = opts.notes;
  const { error } = await sb.from("incoming_document").update(patch).eq("id", id);
  if (error) return { ok: false, grund: error.message };
  return r;
}

export type FehlzuordnungFall = {
  verworfen: { id: string; doc_number: string | null; supplier_name: string | null; zuordnungen: number; skonto: number };
  kopien: { id: string; status: string; payment_status: string | null }[];
};

/**
 * Prüfung: verworfene Belege, die noch Bankzuordnungen oder Skonto tragen, samt nicht verworfener Kopien
 * gleicher Nummer. Mit `fix` werden die Zuordnungen umgehängt (wo eindeutig möglich).
 */
export async function pruefeVerworfeneMitZahlung(sb: Sb, opts: { fix?: boolean } = {}) {
  const ids = new Set<string>();
  for (let von = 0; ; von += 1000) {
    const { data: rows, error } = await sb
      .from("bank_transaction_match")
      .select("incoming_document_id")
      .not("incoming_document_id", "is", null)
      .order("id")
      .range(von, von + 999);
    if (error) throw new Error(error.message);
    for (const r of rows ?? []) ids.add(r.incoming_document_id as string);
    if ((rows ?? []).length < 1000) break;
  }
  const { data: mitSkonto } = await sb.from("incoming_document").select("id").eq("status", "rejected").neq("skonto_amount", 0);
  for (const r of mitSkonto ?? []) ids.add(r.id as string);

  const verworfen: DocInfo[] = [];
  const liste = [...ids];
  for (let i = 0; i < liste.length; i += 100) {
    const { data } = await sb.from("incoming_document").select(DOC_SELECT).in("id", liste.slice(i, i + 100)).eq("status", "rejected");
    verworfen.push(...((data ?? []) as DocInfo[]));
  }
  const anzahl = await zuordnungen(sb, verworfen.map((d) => d.id));

  const out = { fix: !!opts.fix, faelle: [] as (FehlzuordnungFall & { ergebnis?: string })[] };
  for (const d of verworfen) {
    const kopien = await findeKopien(sb, d);
    const { data: ps } = kopien.length
      ? await sb.from("incoming_document").select("id, payment_status").in("id", kopien.map((k) => k.id))
      : { data: [] as { id: string; payment_status: string | null }[] };
    const psMap = new Map((ps ?? []).map((p) => [p.id as string, p.payment_status as string | null]));
    const fall: FehlzuordnungFall & { ergebnis?: string } = {
      verworfen: {
        id: d.id,
        doc_number: d.doc_number,
        supplier_name: d.supplier_name,
        zuordnungen: anzahl.get(d.id) ?? 0,
        skonto: Number(d.skonto_amount ?? 0),
      },
      kopien: kopien.map((k) => ({ id: k.id, status: k.status, payment_status: psMap.get(k.id) ?? null })),
    };
    const r = await zuordnungenUmhaengen(sb, d.id, { dryRun: !opts.fix });
    fall.ergebnis = r.ok ? `${opts.fix ? "umgehängt" : "umhängbar"} → ${r.ziel} (${r.umgehaengt} Zuordnung(en))` : r.grund;
    out.faelle.push(fall);
  }
  return out;
}
