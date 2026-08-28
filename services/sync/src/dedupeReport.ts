import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase";

/* --------------------------------------------------------------------------
 * Findet wahrscheinliche Dubletten unter den Organisationen (read-only).
 * findDuplicateGroups() liefert die Gruppen; dedupeReport() schreibt CSV.
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
  return base
    .split(" ")
    .filter((t) => t && !LEGAL.has(t) && !/^\d{1,3}$/.test(t))
    .join(" ")
    .trim();
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

export type DupeRow = {
  id: string;
  name: string;
  customer_segment: string | null;
  customer_number: string | null;
  supplier_number: string | null;
  vat_id: string | null;
  created_at: string;
  norm: string;
  zip: string;
  systems: string;
};

export type DupeGroup = {
  key: string;
  type: "USt-IdNr" | "Name+PLZ" | "Name" | "Nummer-Verweis";
  confidence: "hoch" | "mittel" | "niedrig";
  members: DupeRow[];
};

export async function findDuplicateGroups(): Promise<{
  groups: DupeGroup[];
  orgCount: number;
}> {
  const orgs = await pagedSelect<{
    id: string;
    name: string;
    customer_segment: string | null;
    customer_number: string | null;
    supplier_number: string | null;
    vat_id: string | null;
    created_at: string;
  }>(
    "organization",
    "id, name, customer_segment, customer_number, supplier_number, vat_id, created_at",
  );
  const addrs = await pagedSelect<{
    organization_id: string;
    zip: string | null;
    is_default: boolean;
  }>("address", "organization_id, zip, is_default");
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

  const rows: DupeRow[] = orgs.map((o) => ({
    ...o,
    norm: normName(o.name),
    zip: zipByOrg.get(o.id) ?? "",
    systems: [...(sysByOrg.get(o.id) ?? [])].sort().join("+") || "werk",
  }));
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const groups: DupeGroup[] = [];
  const seen = new Set<string>();
  const addGroup = (
    key: string,
    type: DupeGroup["type"],
    confidence: DupeGroup["confidence"],
    members: DupeRow[],
  ) => {
    if (members.length < 2) return;
    const tag = `${type}:${members.map((m) => m.id).sort().join("|")}`;
    if (seen.has(tag)) return;
    seen.add(tag);
    groups.push({ key, type, confidence, members });
  };
  const bucket = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const arr = m.get(k) ?? [];
    arr.push(v);
    m.set(k, arr);
  };

  // 1) gleiche USt-IdNr — "hoch" nur bei übereinstimmender PLZ (sonst Franchise)
  const byVat = new Map<string, DupeRow[]>();
  for (const r of rows) {
    const v = (r.vat_id || "").toUpperCase().replace(/\s+/g, "");
    if (v.length >= 6) bucket(byVat, v, r);
  }
  for (const [v, m] of byVat) {
    const zips = new Set(m.map((x) => x.zip).filter(Boolean));
    addGroup(v, "USt-IdNr", zips.size > 1 ? "niedrig" : "hoch", m);
  }

  // 2) Name + PLZ
  const byNameZip = new Map<string, DupeRow[]>();
  for (const r of rows) {
    if (r.norm && r.zip) bucket(byNameZip, `${r.norm}##${r.zip}`, r);
  }
  for (const [k, m] of byNameZip) addGroup(k, "Name+PLZ", "hoch", m);

  // 3) nur Name
  const byName = new Map<string, DupeRow[]>();
  for (const r of rows) if (r.norm.length >= 4) bucket(byName, r.norm, r);
  for (const [k, m] of byName) addGroup(k, "Name", "mittel", m);

  // 4) Debitor/Kreditor-Nummer einer Org == metadata-Nummer einer anderen
  const custNoToOrg = new Map<string, DupeRow>();
  for (const r of rows) if (r.customer_number) custNoToOrg.set(r.customer_number, r);
  const mdByOrg = new Map<string, Record<string, unknown>>();
  for (const r of refs) if (r.metadata) mdByOrg.set(r.organization_id, r.metadata);
  for (const r of rows) {
    const md = mdByOrg.get(r.id);
    for (const key of ["keyline_debitor", "keyline_creditor"]) {
      const num = md?.[key];
      if (!num) continue;
      const other = custNoToOrg.get(String(num));
      if (other && other.id !== r.id) {
        addGroup(String(num), "Nummer-Verweis", "mittel", [
          rowById.get(r.id)!,
          rowById.get(other.id)!,
        ]);
      }
    }
  }

  const rank = (c: string) => (c === "hoch" ? 0 : c === "mittel" ? 1 : 2);
  groups.sort(
    (a, b) => rank(a.confidence) - rank(b.confidence) || b.members.length - a.members.length,
  );
  return { groups, orgCount: orgs.length };
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function dedupeReport() {
  const { groups, orgCount } = await findDuplicateGroups();

  const header = [
    "gruppe", "typ", "konfidenz", "anzahl",
    "org_id", "name", "segment", "debitor", "kreditor", "ust_id", "plz", "quellen",
  ];
  const lines = [header.join(";")];
  const involved = new Set<string>();
  groups.forEach((g, i) => {
    for (const m of g.members) {
      involved.add(m.id);
      lines.push(
        [
          `G${i + 1}`, g.type, g.confidence, g.members.length,
          m.id, m.name, m.customer_segment ?? "", m.customer_number ?? "",
          m.supplier_number ?? "", m.vat_id ?? "", m.zip, m.systems,
        ].map(csvCell).join(";"),
      );
    }
  });

  const dir = fileURLToPath(new URL("../../../reports/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = `${dir}dedupe-organisationen-${date}.csv`;
  writeFileSync(file, lines.join("\n") + "\n", "utf8");

  const byType: Record<string, number> = {};
  for (const g of groups) byType[g.type] = (byType[g.type] ?? 0) + 1;

  return {
    orgs: orgCount,
    groups: groups.length,
    involved: involved.size,
    byType,
    highConfidence: groups.filter((g) => g.confidence === "hoch").length,
    file,
  };
}
