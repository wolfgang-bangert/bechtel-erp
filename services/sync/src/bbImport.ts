import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase";
import { pagedSelect } from "./db";

type Options = { dryRun?: boolean };

const imports = (name: string) =>
  fileURLToPath(new URL(`../../../imports/${name}`, import.meta.url));

const readJson = <T = unknown>(name: string): T =>
  JSON.parse(readFileSync(imports(name), "utf8")) as T;

function writeCsv(name: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  writeFileSync(
    imports(name),
    [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\r\n"),
    "latin1",
  );
}

// --- Kontenrahmen -----------------------------------------------------------

type BbAccount = {
  postingaccount_number: string | null;
  name: string;
  type: string; // postingaccount | account | debtor | creditor | ...
  subtype: string | null;
};

/** SKR03-Nummernkreis → ledger_account.kind */
function skr03Kind(numStr: string): "revenue" | "expense" | "asset" | "liability" | "other" {
  const n = parseInt(numStr, 10);
  if (!Number.isFinite(n)) return "other";
  if (n < 1000) return "asset"; // Anlagevermögen
  if (n < 1600) return "asset"; // Umlauf/Finanz/Forderungen
  if (n < 2000) return "liability"; // Verbindlichkeiten (16xx–19xx)
  if (n < 3000) return "other"; // neutrale Abgrenzung
  if (n < 8000) return "expense"; // Wareneingang, Material, Betriebsaufwand
  if (n < 8900) return "revenue"; // Erlöse
  return "other"; // Vortrags-/Statistikkonten
}

export async function importBbAccounts(opts: Options = {}) {
  const { dryRun = false } = opts;
  const all = readJson<BbAccount[]>("bb-konten.json");

  // 1) Sachkonten -> ledger_account
  const sachkonten = all.filter((a) => a.type === "postingaccount" && a.postingaccount_number);
  const existing = new Set(
    (await pagedSelect<{ number: string }>("ledger_account", "number")).map((r) => r.number),
  );
  const rows = sachkonten.map((a) => ({
    number: String(a.postingaccount_number),
    name: a.name,
    kind: skr03Kind(String(a.postingaccount_number)),
    is_system: false,
    is_active: true,
  }));
  const toInsert = rows.filter((r) => !existing.has(r.number));
  const toUpdate = rows.filter((r) => existing.has(r.number));

  // 2) Geldkonten -> bank_account.ledger_account (per IBAN-Endziffern im Namen)
  const geld = all.filter((a) => a.type === "account" && a.postingaccount_number);
  const banks = await pagedSelect<{ id: string; iban: string; label: string; ledger_account: string | null }>(
    "bank_account",
    "id, iban, label, ledger_account",
  );
  const bankLinks: { bank: string; iban: string; konto: string; name: string }[] = [];
  for (const g of geld) {
    const digits = (g.name.match(/(\d[\d ]{4,})/g) ?? [])
      .map((d) => d.replace(/\D/g, ""))
      .filter((d) => d.length >= 5);
    const hit = banks.find((b) =>
      digits.some((d) => b.iban.replace(/\s/g, "").endsWith(d)),
    );
    if (hit) {
      bankLinks.push({
        bank: hit.label,
        iban: hit.iban,
        konto: String(g.postingaccount_number),
        name: g.name,
      });
    }
  }

  if (!dryRun) {
    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await supabase.from("ledger_account").insert(toInsert.slice(i, i + 500));
      if (error) throw new Error(`ledger_account insert: ${error.message}`);
    }
    for (let i = 0; i < toUpdate.length; i += 500) {
      const { error } = await supabase
        .from("ledger_account")
        .upsert(toUpdate.slice(i, i + 500), { onConflict: "number" });
      if (error) throw new Error(`ledger_account upsert: ${error.message}`);
    }
    for (const l of bankLinks) {
      await supabase
        .from("bank_account")
        .update({ ledger_account: l.konto })
        .eq("iban", l.iban);
    }
  }

  return {
    dryRun,
    sachkonten: rows.length,
    neu: toInsert.length,
    aktualisiert: toUpdate.length,
    eigene: sachkonten.filter((a) => a.subtype === "individual").length,
    geldkonten_verknuepft: bankLinks,
  };
}

// --- Debitoren / Kreditoren ----------------------------------------------------

type BbParty = {
  type: string;
  name: string;
  postingaccount_number: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  sales_tax_id_eu: string | null;
  iban: string | null;
};

const GENERIC =
  /\b(gmbh|mbh|kg|kgaa|ohg|ag|co|ug|ek|ev|gbr|inh|firma|fa|die|der|das|und)\b/g;
function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c] as string)
    .replace(/ß/g, "ss")
    .replace(/&/g, " und ")
    .replace(/\(ehemals[^)]*\)?/g, " ")
    .replace(/[.,'"\/()\-:]/g, " ")
    .replace(GENERIC, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const tokens = (s: string) => normName(s).split(" ").filter((t) => t.length > 1);
const sortedName = (s: string) => tokens(s).slice().sort().join(" ");
function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}
/** "Ringstraße 4a" -> { street: "ringstr", hnr: "4a" } */
function splitBbStreet(s: string | null): { street: string; hnr: string } {
  const raw = (s ?? "").trim();
  const m = raw.match(/^(.*?)[\s,]+(\d+\s*[a-z]?)\s*$/i);
  const street = normName((m ? m[1] : raw).replace(/stra(ss|ß)e|str\b/gi, "str"));
  return { street: street.replace(/\s+/g, ""), hnr: (m ? m[2] : "").replace(/\s+/g, "").toLowerCase() };
}

export async function importBbParties(opts: Options = {}) {
  const { dryRun = false } = opts;

  type Org = {
    id: string;
    name: string;
    customer_number: string | null;
    supplier_number: string | null;
  };
  const orgs = await pagedSelect<Org>(
    "organization",
    "id, name, customer_number, supplier_number",
  );
  const addrs = await pagedSelect<{
    organization_id: string;
    zip: string | null;
    street: string | null;
    house_number: string | null;
  }>("address", "organization_id, zip, street, house_number");

  const zipByOrg = new Map<string, Set<string>>();
  const addrByOrg = new Map<string, { zip: string; street: string; hnr: string }[]>();
  for (const a of addrs) {
    if (a.zip) {
      (zipByOrg.get(a.organization_id) ??
        zipByOrg.set(a.organization_id, new Set()).get(a.organization_id)!).add(a.zip.slice(0, 5));
    }
    (addrByOrg.get(a.organization_id) ?? addrByOrg.set(a.organization_id, []).get(a.organization_id)!).push({
      zip: (a.zip ?? "").slice(0, 5),
      street: normName((a.street ?? "").replace(/stra(ss|ß)e|str\b/gi, "str")).replace(/\s+/g, ""),
      hnr: (a.house_number ?? "").replace(/\s+/g, "").toLowerCase(),
    });
  }

  const byNorm = new Map<string, Org[]>();
  const bySorted = new Map<string, Org[]>();
  const push = (m: Map<string, Org[]>, k: string, o: Org) => {
    if (!k) return;
    (m.get(k) ?? m.set(k, []).get(k)!).push(o);
  };
  for (const o of orgs) {
    push(byNorm, normName(o.name), o);
    push(bySorted, sortedName(o.name), o);
  }
  const customerNums = new Map(orgs.filter((o) => o.customer_number).map((o) => [o.customer_number!, o.id]));
  const supplierNums = new Map(orgs.filter((o) => o.supplier_number).map((o) => [o.supplier_number!, o.id]));

  async function run(file: string, kind: "debtor" | "creditor") {
    const parties = readJson<BbParty[]>(file);
    const numField = kind === "debtor" ? "customer_number" : "supplier_number";
    const takenNums = kind === "debtor" ? customerNums : supplierNums;
    const orgHasNum = (o: Org) => (kind === "debtor" ? o.customer_number : o.supplier_number);

    let alreadyLinked = 0;
    let assigned = 0;
    let conflictNum = 0;
    const updates: { id: string; num: string; old: string | null; name: string }[] = [];
    const suggestions: Record<string, unknown>[] = [];
    const conflicts: Record<string, unknown>[] = [];
    const byTier: Record<string, number> = {};

    const disambig = (cands: Org[], p: BbParty): Org | undefined => {
      if (cands.length === 1) return cands[0];
      const z = (p.zip ?? "").slice(0, 5);
      let hits = z ? cands.filter((o) => zipByOrg.get(o.id)?.has(z)) : cands;
      if (hits.length === 1) return hits[0];
      const bb = splitBbStreet(p.street);
      if (bb.hnr) {
        const h = hits.filter((o) =>
          (addrByOrg.get(o.id) ?? []).some(
            (a) => a.hnr === bb.hnr && (!z || a.zip === z) && (!bb.street || a.street === bb.street),
          ),
        );
        if (h.length === 1) return h[0];
      }
      return undefined;
    };

    for (const p of parties) {
      const num = String(p.postingaccount_number);
      if (takenNums.has(num)) {
        alreadyLinked += 1;
        continue;
      }
      const bbNorm = normName(p.name);
      const bbTok = tokens(p.name);
      let match: Org | undefined;
      let tier = "";

      // T1 exakt
      match = disambig(byNorm.get(bbNorm) ?? [], p);
      if (match) tier = "exakt";
      // T2 Wortreihenfolge egal
      if (!match) {
        match = disambig(bySorted.get(sortedName(p.name)) ?? [], p);
        if (match) tier = "sortiert";
      }
      // T3 in BB abgeschnittener Name → Org beginnt mit BB-Name
      if (!match && bbNorm.length >= 16) {
        const pref = orgs.filter((o) => normName(o.name).startsWith(bbNorm));
        match = disambig(pref, p);
        if (match) tier = "prefix";
      }
      // T4 Adresse: PLZ + Hausnummer + Straße, ein Namens-Token gemeinsam
      if (!match && p.zip) {
        const z = p.zip.slice(0, 5);
        const bb = splitBbStreet(p.street);
        if (bb.hnr) {
          const a = orgs.filter((o) =>
            (addrByOrg.get(o.id) ?? []).some(
              (x) => x.zip === z && x.hnr === bb.hnr && (!bb.street || x.street === bb.street),
            ),
          );
          const a2 = a.filter((o) => jaccard(tokens(o.name), bbTok) >= 0.34);
          if (a2.length === 1) {
            match = a2[0];
            tier = "adresse";
          }
        }
      }

      if (match) {
        const old = orgHasNum(match) ?? null;
        if (old && old !== num) {
          conflicts.push({ org: match.name, alt: old, bb_neu: num, tier });
          conflictNum += 1;
        }
        updates.push({ id: match.id, num, old, name: match.name });
        takenNums.set(num, match.id);
        assigned += 1;
        byTier[tier] = (byTier[tier] ?? 0) + 1;
        continue;
      }

      // kein sicherer Treffer → besten Kandidaten vorschlagen
      let best: Org | undefined;
      let bestScore = 0;
      for (const o of orgs) {
        const sc = jaccard(tokens(o.name), bbTok);
        if (sc > bestScore) {
          bestScore = sc;
          best = o;
        }
      }
      suggestions.push({
        bb_nummer: num,
        bb_name: p.name,
        bb_plz: p.zip ?? "",
        bb_ort: p.city ?? "",
        bb_strasse: p.street ?? "",
        vorschlag_org_id: bestScore >= 0.4 ? (best?.id ?? "") : "",
        vorschlag_org_name: bestScore >= 0.4 ? (best?.name ?? "") : "",
        score: bestScore.toFixed(2),
        UEBERNEHMEN: "",
      });
    }

    if (!dryRun) {
      for (const u of updates) {
        const { error } = await supabase
          .from("organization")
          .update({ [numField]: u.num })
          .eq("id", u.id);
        if (error) conflicts.push({ org: u.name, alt: u.old, bb_neu: u.num, tier: `FEHLER ${error.message}` });
      }
    }

    suggestions.sort((a, b) => Number(b.score) - Number(a.score));
    writeCsv(file.replace(".json", "-zuordnung.csv"), suggestions);
    if (conflicts.length) writeCsv(file.replace(".json", "-konflikte.csv"), conflicts);

    return {
      parties: parties.length,
      alreadyLinked,
      assigned,
      byTier,
      conflictNum,
      offen: suggestions.length,
      mitVorschlag: suggestions.filter((s) => s.vorschlag_org_id).length,
    };
  }

  const deb = await run("bb-debitoren.json", "debtor");
  const kre = await run("bb-kreditoren.json", "creditor");
  return { dryRun, debitoren: deb, kreditoren: kre };
}

// --- Zuordnungs-CSV zurücklesen ----------------------------------------------

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ";") {
      cur.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      if (cur.some((x) => x !== "")) rows.push(cur);
      cur = [];
    } else field += c;
  }
  if (field !== "" || cur.length) {
    cur.push(field);
    if (cur.some((x) => x !== "")) rows.push(cur);
  }
  const head = rows.shift() ?? [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());

/**
 * Liest eine bearbeitete `bb-*-zuordnung.csv` und trägt die Entscheidungen ein.
 * Spalte UEBERNEHMEN:  x / ja / 1  → Vorschlag übernehmen · <org-id> → diese Org ·
 * leer / nein / skip → überspringen.
 */
export async function applyBbParties(opts: { file: string; dryRun?: boolean }) {
  const { file, dryRun = false } = opts;
  const kind: "debtor" | "creditor" = /kreditor/i.test(file) ? "creditor" : "debtor";
  const numField = kind === "debtor" ? "customer_number" : "supplier_number";
  const rows = parseCsv(readFileSync(imports(file), "latin1"));

  let applied = 0;
  let skipped = 0;
  const errors: Record<string, unknown>[] = [];

  for (const r of rows) {
    const dec = (r.UEBERNEHMEN ?? "").trim().toLowerCase();
    const num = (r.bb_nummer ?? "").trim();
    if (!num || dec === "" || dec === "nein" || dec === "skip") {
      skipped += 1;
      continue;
    }
    let orgId = "";
    if (isUuid(dec)) orgId = dec.trim();
    else if (["x", "ja", "1", "ok"].includes(dec)) orgId = (r.vorschlag_org_id ?? "").trim();
    if (!isUuid(orgId)) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      applied += 1;
      continue;
    }
    const { error } = await supabase
      .from("organization")
      .update({ [numField]: num })
      .eq("id", orgId);
    if (error) errors.push({ bb_nummer: num, org_id: orgId, fehler: error.message });
    else applied += 1;
  }

  return { file, kind, applied, skipped, errors };
}
