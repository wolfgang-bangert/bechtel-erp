import { supabase } from "./supabase";

/**
 * Organisation zu einem erkannten Partner (Eingangsrechnung, Dokument) finden - und auf Wunsch neu
 * anlegen, wenn es keine gibt. Neu angelegte bekommen angelegt_durch gesetzt und lassen sich unter
 * /organisationen ("automatisch angelegt") prüfen und per Warenkorb mit Dubletten verschmelzen.
 */
export type Partner = {
  name?: string | null;
  vat_id?: string | null;
  address?: string | null;
  email?: string | null;
};

export type Eigene = { vatId: string; namen: string[] };

/** Rechtsformen/Füllwörter für den Namensvergleich weglassen: "Müller GmbH & Co. KG" ≈ "Müller". */
const RECHTSFORM =
  /\b(gmbh|mbh|ag|kg|kgaa|ohg|gbr|ug|haftungsbeschränkt|e\.?\s?k\.?|e\.?\s?v\.?|co|ltd|limited|inc|llc|plc|sa|sarl|srl|bv|nv|se|und|and|the)\b/g;

export function namensSchluessel(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(RECHTSFORM, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Platzhalter statt Firmenname ("Kreditor 70000", "Lieferant Nr. 12", nur Ziffern) - nie anlegen. */
export function keinFirmenname(name: string): boolean {
  const n = name.trim();
  return (
    /^\d[\d\s./-]*$/.test(n) ||
    /^(kreditor|debitor|lieferant|kunde|kunden|konto|creditor|supplier|vendor)\s*(nr\.?|nummer|no\.?|#)?\s*[:.]?\s*\d+$/i.test(n)
  );
}

const normVat = (v: string | null | undefined) => (v ?? "").replace(/[\s.-]+/g, "").toUpperCase();

/** Eigene Firma (USt-IdNr. + Namen aus dem Firmenprofil) - nie als Partner verwenden oder anlegen. */
export async function ladeEigene(): Promise<Eigene> {
  const { data } = await supabase.from("setting").select("value").eq("key", "company.profile").maybeSingle();
  const p = (data?.value ?? {}) as { vat_id?: string; name?: string; legal_name?: string; short_name?: string };
  const namen = [p.name, p.legal_name, p.short_name, "Bechtel Druck"]
    .filter((n): n is string => !!n)
    .map(namensSchluessel)
    .filter((n) => n.length > 3);
  return { vatId: normVat(p.vat_id), namen: [...new Set(namen)] };
}

export function istEigene(p: Partner, eigene: Eigene): boolean {
  const vat = normVat(p.vat_id);
  if (vat && eigene.vatId && vat === eigene.vatId) return true;
  const k = p.name ? namensSchluessel(p.name) : "";
  return !!k && eigene.namen.some((n) => k === n || k.startsWith(n + " ") || n.startsWith(k + " "));
}

/** Suchen: 1. USt-IdNr. exakt, 2. Name ohne Rechtsform exakt, 3. Namensanfang unscharf (wie bisher). */
export async function findeOrganisation(p: Partner): Promise<string | null> {
  const vat = normVat(p.vat_id);
  if (vat.length > 4) {
    const { data } = await supabase.from("organization").select("id").ilike("vat_id", vat).limit(1).maybeSingle();
    if (data) return data.id;
  }
  const name = p.name?.trim();
  if (!name || keinFirmenname(name)) return null;
  const schluessel = namensSchluessel(name);
  // kurze Namen ("IHK", "3M"): nur exakt - unscharf würden sie überall treffen
  if (name.length <= 3) {
    const { data } = await supabase.from("organization").select("id").ilike("name", name.replace(/[\\%_]/g, "")).limit(1).maybeSingle();
    return data?.id ?? null;
  }
  // Vorauswahl über das erste Wort im Original (mit Umlauten), verglichen wird dann der Schlüssel
  const erstesWort = name.match(/[\p{L}\p{N}]{3,}/u)?.[0];
  if (erstesWort && schluessel) {
    const { data } = await supabase
      .from("organization")
      .select("id, name, legal_name")
      .or(`name.ilike.%${erstesWort}%,legal_name.ilike.%${erstesWort}%`)
      .limit(200);
    const exakt = (data ?? []).filter(
      (o) => namensSchluessel(o.name) === schluessel || (o.legal_name && namensSchluessel(o.legal_name) === schluessel),
    );
    if (exakt.length) return exakt[0].id;
  }
  // bisheriges Verhalten (findSupplier): Satzzeichen als Platzhalter, erste 20 Zeichen
  const { data } = await supabase
    .from("organization")
    .select("id")
    .ilike("name", `%${name.slice(0, 20).replace(/[^\p{L}\p{N}]+/gu, "%")}%`)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Finden oder anlegen. Liefert null, wenn kein brauchbarer Name erkannt wurde oder es die eigene Firma ist.
 * `relation`: supplier (Lieferant/Handwerker) oder customer.
 */
export async function findeOderLegeAn(
  p: Partner,
  opts: { herkunft: "eingangsrechnung" | "dokument"; relation?: "supplier" | "customer"; eigene: Eigene; dryRun?: boolean },
): Promise<{ id: string | null; neu: boolean }> {
  if (istEigene(p, opts.eigene)) return { id: null, neu: false };
  const vorhanden = await findeOrganisation(p);
  if (vorhanden) return { id: vorhanden, neu: false };

  const name = p.name?.trim().replace(/\s+/g, " ");
  if (!name || name.length < 2 || keinFirmenname(name)) return { id: null, neu: false };
  if (opts.dryRun) return { id: null, neu: true };

  const vat = normVat(p.vat_id) || null;
  const land = vat && /^[A-Z]{2}/.test(vat) && vat.slice(0, 2) !== "EL" ? vat.slice(0, 2) : "DE";
  const { data, error } = await supabase
    .from("organization")
    .insert({
      name,
      relation: opts.relation ?? "supplier",
      vat_id: vat,
      tax_country: land,
      email: p.email?.trim() || null,
      angelegt_durch: opts.herkunft,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Organisation anlegen (${name}): ${error.message}`);

  const adresse = p.address?.trim().replace(/\s*\n\s*/g, ", ");
  if (adresse) {
    // Adresse kommt unstrukturiert aus der KI: PLZ/Ort herausziehen, Rest als Zeile 1
    const m = /(?:^|,\s*)(?:D-)?(\d{5})\s+([^,]+)\s*(?:,\s*(Deutschland|Germany))?\s*$/i.exec(adresse);
    await supabase.from("address").insert({
      organization_id: data.id,
      kind: "billing",
      is_default: true,
      line1: m ? adresse.slice(0, m.index).replace(/,\s*$/, "") || adresse : adresse,
      zip: m?.[1] ?? null,
      city: m?.[2]?.trim() ?? null,
      country: land,
    });
  }
  return { id: data.id, neu: true };
}
