import type { SupabaseClient } from "@supabase/supabase-js";
import { alleSachkonten } from "@/lib/sachkonten";

/** Bezeichnungen für Kontonummern: Sachkonten, Geldkonten (Bank), Debitoren und Kreditoren. */
export async function kontoNamen(sb: SupabaseClient, nummern: string[]): Promise<Map<string, string>> {
  const namen = new Map<string, string>();
  const [{ data: sach }, { data: bank }] = await Promise.all([
    alleSachkonten(sb),
    sb.from("bank_account").select("ledger_account, label"),
  ]);
  for (const s of sach ?? []) namen.set(s.number as string, s.name as string);
  for (const b of bank ?? []) if (b.ledger_account) namen.set(b.ledger_account as string, `Bank ${b.label}`);
  const personen = nummern.filter((n) => /^\d{5,6}$/.test(n) && !namen.has(n));
  for (let i = 0; i < personen.length; i += 200) {
    const teil = personen.slice(i, i + 200);
    const { data } = await sb
      .from("organization")
      .select("name, customer_number, supplier_number")
      .or(`customer_number.in.(${teil.join(",")}),supplier_number.in.(${teil.join(",")})`);
    for (const o of data ?? []) {
      if (o.customer_number && teil.includes(o.customer_number)) namen.set(o.customer_number, `Debitor ${o.name}`);
      if (o.supplier_number && teil.includes(o.supplier_number)) namen.set(o.supplier_number, `Kreditor ${o.name}`);
    }
  }
  return namen;
}
