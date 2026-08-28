import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase";

/* --------------------------------------------------------------------------
 * Reiner Report: findet wahrscheinliche Dubletten unter den Organisationen.
 * Schreibt NICHTS in die Datenbank. Ergebnis als CSV in reports/.
 * -------------------------------------------------------------------------- */

const LEGAL = new Set([
  "gmbh", "mbh", "co", "kg", "kgaa", "ag", "ug", "ohg", "gbr", "gbmh", "se",
  "ev", "e", "v", "ek", "inc", "ltd", "llc", "und", "the", "haftungsbeschraenkt",
]);

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");
}

function normName(name: string): string {
  const base = stripDiacritics((name || "").toLowerCase())
    .replace(/[.,/&+\-–—()"'`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = base
    .split(" ")
    .filter((t) => t && !LEGAL.has(t) && !/^\d{1,3}$/.test(t));
  return tokens.join(" ").trim();
}

async function pagedSelect<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + size - 1);
    if (error) throw new Error(`${table} lesen: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
    from += size;
  }
  return out;
}

type Org = {
  id: string;
  name: string;
  customer_segment: string | null;
  customer_number: string | null;
  supplier_number: string | null;
  vat_id: string | null;
};

type Row = Org & {
  norm: string;
  zip: string;
  systems: string;
};

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function dedupeReport() {
  const orgs = await pagedSelect<Org>(
    "organization",
    "id, name, customer_segment, customer_number, supplier_number, vat_id",
  );
  const addrs = await pagedSelect<{ organization_id: string; zip: string | null; is_default: boolean }>(
    "address",
    "organization_id, zip, is_default",
  );
  const refs = await pagedSelect<{
    organization_id: string;
    system: string;
    metadata: Record<string, unknown> | null;
  }>("organization_external_ref", "organization_id, system, metadata");

  const zipByOrg = new Map<string, string>();
  for (const a of addrs) {
    if (!a.zip) continue;
    if (a.is_default || !zipByOrg.has(a.organization_id)) {
      zipByOrg.set(a.organization_id, String(a.zip).trim());
    }
  }
  const sysByOrg = new Map<string, Set<string>>();
  for (const r of refs) {
    if (!sysByOrg.has(r.organization_id)) sysByOrg.set(r.organization_id, new Set());
    sysByOrg.get(r.organization_id)!.add(r.system);
    if (!zipByOrg.has(r.organization_id)) {
      const plz = r.metadata?.["plz"];
      if (plz) zipByOrg.set(r.organization_id, String(plz).trim());
    }
  }

  const rows: Row[] = orgs.map((o) => ({
    ...o,
    norm: normName(o.name),
    zip: zipByOrg.get(o.id) ?? "",
    systems: [...(sysByOrg.get(o.id) ?? [])].sort().join("+") || "werk",
  }));

  type Group = { key: string; type: string; confidence: string; members: Row[] };
  const groups: Group[] = [];
  const seenPair = new Set<string>();

  const addGroup = (key: string, type: string, confidence: string, members: Row[]) => {
    if (members.length < 2) return;
    const sig = members.map((m) => m.id).sort().join("|");
    const tag = `${type}:${sig}`;
    if (seenPair.has(tag)) return;
    seenPair.add(tag);
    groups.push({ key, type, confidence, members });
  };

  // 1) gleiche USt-IdNr — "hoch" nur, wenn die bekannten PLZ übereinstimmen.
  //    Mehrere verschiedene PLZ = geteilte Konzern-/Franchise-USt-IdNr
  //    (z. B. Esso-/Shell-Tankstellen), keine Dublette -> "niedrig".
  const byVat = new Map<string, Row[]>();
  for (const r of rows) {
    const v = (r.vat_id || "").toUpperCase().replace(/\s+/g, "");
    if (v.length < 6) continue;
    (byVat.get(v) ?? byVat.set(v, []).get(v)!).push(r);
  }
  for (const [v, m] of byVat) {
    const zips = new Set(m.map((x) => x.zip).filter(Boolean));
    addGroup(v, "USt-IdNr", zips.size > 1 ? "niedrig" : "hoch", m);
  }

  // 2) gleicher normalisierter Name + PLZ
  const byNameZip = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.norm || !r.zip) continue;
    const k = `${r.norm}##${r.zip}`;
    (byNameZip.get(k) ?? byNameZip.set(k, []).get(k)!).push(r);
  }
  for (const [k, m] of byNameZip) addGroup(k, "Name+PLZ", "hoch", m);

  // 3) gleicher normalisierter Name (ohne PLZ-Bestätigung)
  const byName = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.norm.length < 4) continue;
    (byName.get(r.norm) ?? byName.set(r.norm, []).get(r.norm)!).push(r);
  }
  for (const [k, m] of byName) addGroup(k, "Name", "mittel", m);

  // 4) Debitornummer einer Org == Debitornummer-Metadatum einer anderen Org
  const custNoToOrg = new Map<string, Row>();
  for (const r of rows) if (r.customer_number) custNoToOrg.set(r.customer_number, r);
  const refByOrg = new Map<string, Record<string, unknown>>();
  for (const r of refs) if (r.metadata) refByOrg.set(r.organization_id, r.metadata);
  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    const md = refByOrg.get(r.id);
    for (const key of ["keyline_debitor", "keyline_creditor"]) {
      const num = md?.[key];
      if (!num) continue;
      const other = custNoToOrg.get(String(num));
      if (other && other.id !== r.id) {
        addGroup(String(num), "Nummer-Verweis", "mittel", [r, other].map((x) => rowById.get(x.id)!));
      }
    }
  }

  const rank = (c: string) => (c === "hoch" ? 0 : c === "mittel" ? 1 : 2);
  groups.sort(
    (a, b) => rank(a.confidence) - rank(b.confidence) || b.members.length - a.members.length,
  );

  // CSV
  const header = [
    "gruppe", "typ", "konfidenz", "anzahl",
    "org_id", "name", "segment", "debitor", "kreditor", "ust_id", "plz", "quellen",
  ];
  const lines = [header.join(";")];
  let groupNo = 0;
  const involved = new Set<string>();
  for (const g of groups) {
    groupNo += 1;
    for (const m of g.members) {
      involved.add(m.id);
      lines.push(
        [
          `G${groupNo}`, g.type, g.confidence, g.members.length,
          m.id, m.name, m.customer_segment ?? "", m.customer_number ?? "",
          m.supplier_number ?? "", m.vat_id ?? "", m.zip, m.systems,
        ].map(csvCell).join(";"),
      );
    }
  }

  const dir = fileURLToPath(new URL("../../../reports/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = `${dir}dedupe-organisationen-${date}.csv`;
  writeFileSync(file, lines.join("\n") + "\n", "utf8");

  const byType: Record<string, number> = {};
  for (const g of groups) byType[g.type] = (byType[g.type] ?? 0) + 1;

  return {
    orgs: orgs.length,
    groups: groups.length,
    involved: involved.size,
    byType,
    highConfidence: groups.filter((g) => g.confidence === "hoch").length,
    file,
  };
}
