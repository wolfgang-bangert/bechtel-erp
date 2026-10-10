import type { SupabaseClient } from "@supabase/supabase-js";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type AkontoPosten = { matchId: string; txId: string; datum: string; betrag: number; eingang: boolean };

/** Offene Akonto-Zahlungen einer Organisation (Zuordnungen kind = 'akonto'). */
export async function akontoPosten(sb: SupabaseClient, orgId: string): Promise<AkontoPosten[]> {
  const { data } = await sb
    .from("bank_transaction_match")
    .select("id, amount, bank_transaction_id, bank_transaction:bank_transaction_id(booking_date, amount)")
    .eq("organization_id", orgId)
    .eq("kind", "akonto");
  return ((data ?? []) as unknown as { id: string; amount: number; bank_transaction_id: string; bank_transaction: { booking_date: string; amount: number } | { booking_date: string; amount: number }[] | null }[])
    .map((m) => {
      const t = Array.isArray(m.bank_transaction) ? m.bank_transaction[0] : m.bank_transaction;
      return { matchId: m.id, txId: m.bank_transaction_id, datum: t?.booking_date ?? "", betrag: r2(Math.abs(m.amount)), eingang: (t?.amount ?? 0) >= 0 };
    })
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

const STICHTAG = "2025-12-31";
const AB = "2026-01-01";

export type OffeneRechnung = { id: string; datum: string; offen: number };

/**
 * Offene Rechnungen einer Organisation für die Akonto-Verrechnung, älteste zuerst. werk kennt Zahlungen erst ab
 * 2026: vor dem Stichtag zählen nur Rechnungen aus den offenen Posten (op_vortrag, laut BuchhaltungsButler) mit
 * dem dortigen Betrag abzüglich der in werk erfassten Zahlungen; ab 2026 der offene Betrag aus werk.
 */
export async function offeneRechnungen(sb: SupabaseClient, orgId: string, eingang: boolean): Promise<OffeneRechnung[]> {
  const { data: org } = await sb.from("organization").select("customer_number, supplier_number").eq("id", orgId).maybeSingle();
  const nr = (eingang ? org?.customer_number : org?.supplier_number) ?? null;
  const vortrag = new Map<string, number>();
  if (nr) {
    const { data: op } = await sb
      .from("op_vortrag")
      .select("nummer, offen")
      .eq("stichtag", STICHTAG)
      .eq("art", eingang ? "forderung" : "verbindlichkeit")
      .eq("partner_nr", nr);
    for (const o of op ?? []) vortrag.set(String(o.nummer).replace(/\s+/g, ""), Number(o.offen));
  }
  type Z = { id: string; nummer: string | null; datum: string | null; offen: number; bezahlt: number };
  const zeilen: Z[] = eingang
    ? (
        (
          await sb
            .from("sales_invoice")
            .select("id, invoice_number, invoice_date, open_amount, paid_total")
            .eq("organization_id", orgId)
            .eq("kind", "invoice")
            .gt("open_amount", 0.005)
            .limit(2000)
        ).data ?? []
      ).map((r) => ({ id: r.id, nummer: r.invoice_number, datum: r.invoice_date, offen: Number(r.open_amount), bezahlt: Number(r.paid_total ?? 0) }))
    : (
        (
          await sb
            .from("incoming_document")
            .select("id, doc_number, doc_date, open_amount, paid_total")
            .eq("supplier_organization_id", orgId)
            .eq("doc_type", "invoice")
            .neq("status", "rejected")
            .gt("open_amount", 0.005)
            .limit(2000)
        ).data ?? []
      ).map((r) => ({ id: r.id, nummer: r.doc_number, datum: r.doc_date, offen: Number(r.open_amount), bezahlt: Number(r.paid_total ?? 0) }));

  const out: OffeneRechnung[] = [];
  for (const z of zeilen) {
    const datum = z.datum ?? "";
    if (datum >= AB) {
      out.push({ id: z.id, datum, offen: r2(z.offen) });
      continue;
    }
    const op = vortrag.get((z.nummer ?? "").replace(/\s+/g, ""));
    if (op == null) continue; // vor 2026 und nicht in den offenen Posten → war schon bezahlt
    const offen = r2(Math.min(z.offen, op - z.bezahlt));
    if (offen > 0.005) out.push({ id: z.id, datum, offen });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Akonto mit den ältesten offenen Rechnungen verrechnen (siehe offeneRechnungen): jede Akonto-Zuordnung wird
 * (soweit möglich) in Rechnungs-Zuordnungen derselben Bankzeile umgewandelt. Ein Rest bleibt als Akonto stehen.
 * Die offenen Beträge der Rechnungen führen die Datenbank-Trigger nach.
 */
export async function akontoVerrechnen(sb: SupabaseClient, orgId: string): Promise<{ verrechnet: number; rechnungen: number; rest: number }> {
  const posten = await akontoPosten(sb, orgId);
  let verrechnet = 0;
  let rechnungen = 0;
  let rest = 0;
  const offenJeSeite = new Map<boolean, OffeneRechnung[]>();
  for (const p of posten) {
    if (!offenJeSeite.has(p.eingang)) offenJeSeite.set(p.eingang, await offeneRechnungen(sb, orgId, p.eingang));
    const offen = offenJeSeite.get(p.eingang)!;
    let betrag = p.betrag;
    for (const r of offen) {
      if (betrag <= 0.005) break;
      const teil = r2(Math.min(betrag, r.offen));
      if (teil <= 0.005) continue;
      const { error } = await sb.from("bank_transaction_match").insert({
        bank_transaction_id: p.txId,
        ...(p.eingang ? { sales_invoice_id: r.id } : { incoming_document_id: r.id }),
        amount: teil,
        auto: false,
        note: "aus Akonto verrechnet",
      });
      if (error?.code === "23505") {
        // Bankzeile ist dieser Rechnung schon zugeordnet → vorhandene Zuordnung erhöhen
        const spalte = p.eingang ? "sales_invoice_id" : "incoming_document_id";
        const { data: alt } = await sb.from("bank_transaction_match").select("id, amount").eq("bank_transaction_id", p.txId).eq(spalte, r.id).is("ledger_account", null).maybeSingle();
        if (!alt) throw new Error(error.message);
        const { error: e2 } = await sb.from("bank_transaction_match").update({ amount: r2(Math.abs(alt.amount) + teil) }).eq("id", alt.id);
        if (e2) throw new Error(e2.message);
      } else if (error) throw new Error(error.message);
      r.offen = r2(r.offen - teil);
      betrag = r2(betrag - teil);
      verrechnet = r2(verrechnet + teil);
      rechnungen++;
    }
    const { error: u } =
      betrag <= 0.005
        ? await sb.from("bank_transaction_match").delete().eq("id", p.matchId)
        : await sb.from("bank_transaction_match").update({ amount: betrag }).eq("id", p.matchId);
    if (u) throw new Error(u.message);
    rest = r2(rest + Math.max(0, betrag));
  }
  return { verrechnet, rechnungen, rest };
}
