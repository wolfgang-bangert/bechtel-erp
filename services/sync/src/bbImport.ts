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

const GENERIC = /\b(gmbh|mbh|kg|ohg|ag|co|kgaa|ug|e\s?k|ev|e\s?v|gbr|inh|firma)\b/g;
function normName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c] as string)
    .replace(/ß/g, "ss")
    .replace(/&/g, " und ")
    .replace(/[.,'"\/()-]/g, " ")
    .replace(GENERIC, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function importBbParties(opts: Options = {}) {
  const { dryRun = false } = opts;

  const orgs = await pagedSelect<{
    id: string;
    name: string;
    customer_number: string | null;
    supplier_number: string | null;
  }>("organization", "id, name, customer_number, supplier_number");
  const addrs = await pagedSelect<{ organization_id: string; zip: string | null }>(
    "address",
    "organization_id, zip",
  );
  const zipByOrg = new Map<string, Set<string>>();
  for (const a of addrs) {
    if (!a.zip) continue;
    (zipByOrg.get(a.organization_id) ?? zipByOrg.set(a.organization_id, new Set()).get(a.organization_id)!).add(
      a.zip.slice(0, 5),
    );
  }
  const byNorm = new Map<string, typeof orgs>();
  for (const o of orgs) {
    const k = normName(o.name);
    if (!k) continue;
    (byNorm.get(k) ?? byNorm.set(k, []).get(k)!).push(o);
  }
  const customerNums = new Map(orgs.filter((o) => o.customer_number).map((o) => [o.customer_number!, o.id]));
  const supplierNums = new Map(orgs.filter((o) => o.supplier_number).map((o) => [o.supplier_number!, o.id]));

  async function run(file: string, kind: "debtor" | "creditor") {
    const parties = readJson<BbParty[]>(file);
    const numField = kind === "debtor" ? "customer_number" : "supplier_number";
    const takenNums = kind === "debtor" ? customerNums : supplierNums;
    const orgHasNum = (o: (typeof orgs)[number]) =>
      kind === "debtor" ? o.customer_number : o.supplier_number;

    let alreadyLinked = 0;
    let assigned = 0;
    let conflictNum = 0;
    const updates: { id: string; num: string; old: string | null; name: string }[] = [];
    const unmatched: Record<string, unknown>[] = [];
    const conflicts: Record<string, unknown>[] = [];

    for (const p of parties) {
      const num = String(p.postingaccount_number);
      if (takenNums.has(num)) {
        alreadyLinked += 1;
        continue;
      }
      const cand = byNorm.get(normName(p.name)) ?? [];
      let match: (typeof orgs)[number] | undefined;
      if (cand.length === 1) match = cand[0];
      else if (cand.length > 1 && p.zip) {
        const z = p.zip.slice(0, 5);
        const zHits = cand.filter((o) => zipByOrg.get(o.id)?.has(z));
        if (zHits.length === 1) match = zHits[0];
      }
      if (!match) {
        unmatched.push({
          nummer: num,
          name: p.name,
          plz: p.zip ?? "",
          ort: p.city ?? "",
          strasse: p.street ?? "",
          kandidaten: cand.length,
        });
        continue;
      }
      const old = orgHasNum(match) ?? null;
      if (old && old !== num) {
        conflicts.push({ org: match.name, alt: old, bb_neu: num, quelle: "BB gewinnt" });
        conflictNum += 1;
      }
      updates.push({ id: match.id, num, old, name: match.name });
      takenNums.set(num, match.id); // Doppelvergabe innerhalb des Laufs verhindern
      assigned += 1;
    }

    if (!dryRun) {
      for (const u of updates) {
        const { error } = await supabase
          .from("organization")
          .update({ [numField]: u.num })
          .eq("id", u.id);
        if (error) {
          conflicts.push({ org: u.name, alt: u.old, bb_neu: u.num, quelle: `FEHLER ${error.message}` });
        }
      }
    }

    writeCsv(file.replace(".json", "-offen.csv"), unmatched);
    if (conflicts.length) writeCsv(file.replace(".json", "-konflikte.csv"), conflicts);

    return { parties: parties.length, alreadyLinked, assigned, conflictNum, unmatched: unmatched.length };
  }

  const deb = await run("bb-debitoren.json", "debtor");
  const kre = await run("bb-kreditoren.json", "creditor");
  return { dryRun, debitoren: deb, kreditoren: kre };
}
