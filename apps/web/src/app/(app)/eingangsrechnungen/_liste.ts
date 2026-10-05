/** Filter/Sortierung der Eingangsrechnungs-Liste - gemeinsam für die Liste und das Blättern im Detail. */
export type ListeParams = {
  status?: string;
  q?: string;
  sort?: string;
  dir?: string;
  payment_method?: string;
  monat?: string;
  ust?: string;
  /** "leer": nur Belege, bei denen mindestens eine Position (ohne verknüpften Beleg) kein Konto hat und am Beleg keins steht */
  konto?: string;
};

/** Zusatz fürs select(): Join, auf dem der Filter "ohne Konto" arbeitet. */
export function kontoJoin(sp: ListeParams): string {
  return sp.konto === "leer" ? ", fehlend:incoming_document_item!incoming_document_item_incoming_document_id_fkey!inner(ledger_account, linked_document_id)" : "";
}

// "2026-01" -> [2026-01-01, 2026-02-01)
export function monthRange(m: string): { from: string; to: string } | null {
  const mt = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(m);
  if (!mt) return null;
  const y = Number(mt[1]);
  const mo = Number(mt[2]);
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return { from: `${mt[1]}-${mt[2]}-01`, to: `${ny}-${String(nm).padStart(2, "0")}-01` };
}

export function applyListFilters<T extends { eq: Function; not: Function; gte: Function; lt: Function; or: Function; is: Function }>(
  q: T,
  sp: ListeParams,
): T {
  let r = q;
  const status = sp.status ?? "";
  const search = (sp.q ?? "").trim();
  const range = monthRange(sp.monat ?? "");
  if (status === "alle") {
    // "Alle": keine Einschränkung nach Status (auch verworfene, Avis und Sonstiges)
  } else if (status) r = r.eq("status", status);
  // Ohne Filter: Hinweisbelege und verworfene Belege (Dubletten u.a.) raus aus der Rechnungs-Prüfliste.
  else r = r.not("status", "in", "(advice,dunning,rejected)");
  if (sp.payment_method) r = r.eq("payment_method", sp.payment_method);
  if (sp.ust === "offen") r = r.eq("extraction->_ust->>status", "vorschlag");
  if (range) r = r.gte("doc_date", range.from).lt("doc_date", range.to);
  if (sp.konto === "leer") r = r.is("ledger_account", null).is("fehlend.ledger_account", null).is("fehlend.linked_document_id", null);
  if (search) {
    const like = `%${search.replace(/[%,]/g, "")}%`;
    r = r.or(`supplier_name.ilike.${like},email_from.ilike.${like}`);
  }
  return r;
}

export function sortSpec(sp: ListeParams): { column: string; ascending: boolean } {
  const dateColumn = sp.status === "advice" ? "advice_debit_date" : "doc_date";
  const column = sp.sort === "supplier" ? "supplier_name" : sp.sort === "eingang" ? "created_at" : dateColumn;
  return { column, ascending: sp.dir === "asc" };
}
