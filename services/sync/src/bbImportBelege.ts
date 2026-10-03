import { createHash, randomUUID } from "node:crypto";
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { supabase } from "./supabase";
import { pagedSelect } from "./db";
import { putObject, prefix } from "./storage";
import { bbGetAll, bbPost } from "./bbutler";

/* --------------------------------------------------------------------------
 * BuchhaltungsButler-DATEV-Export (datenexport.zip) -> Eingangsrechnungen.
 * Der Export enthält EXTF_Buchungsstapel.csv (Kreditor, Aufwandskonto, BU,
 * Rechnungsnummer, Brutto, Buchungsnummer), EXTF_DebKred_Stamm (Kreditor-
 * Stammdaten inkl. EU-USt-IdNr) und Belege.zip (<Buchungsnummer>.pdf).
 * Importiert werden nur Eingangsrechnungen (Konto = Kreditor 70000-99999,
 * Gegenkonto = Aufwandskonto); Zahlungen/Ausgleiche/Ausgangsrechnungen werden
 * übersprungen. Status der neuen Belege: "reviewed" (in BB bereits verbucht).
 * Bereits in werk vorhandene Belege (gleiche Rechnungsnummer + Lieferant)
 * werden nicht doppelt angelegt, sondern nur ergänzt (Kontierung/Status).
 * -------------------------------------------------------------------------- */

type Options = { file: string; dryRun?: boolean; ohnePdf?: boolean };

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
const normName = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c] as string)
    .replace(/ß/g, "ss")
    .replace(/\b(gmbh|mbh|kg|ag|co|ug|ek|e\.k\.|ohg|se|ltd|inc|llc)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ";") {
      row.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      f = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== "" || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

const dec = (b: Uint8Array) => new TextDecoder("windows-1252").decode(b);
const num = (s: string) => Number((s ?? "").replace(/\./g, "").replace(",", "."));

function rateFromBu(bu: string): { rate: number; rc: boolean; known: boolean } {
  const b = bu.trim();
  if (b === "" || b === "0") return { rate: 0, rc: false, known: true };
  if (b === "9") return { rate: 19, rc: false, known: true };
  if (b === "8") return { rate: 7, rc: false, known: true };
  if (b === "94") return { rate: 0, rc: true, known: true };
  return { rate: 0, rc: false, known: false };
}

type Line = { gross: number; rate: number; rc: boolean; konto: string; text: string; bu: string; known: boolean };
type Beleg = {
  nr: string; // Buchungsnummer
  kreditor: string;
  docNr: string;
  datum: string;
  credit: boolean;
  lines: Line[];
};

export async function importBbBelege(opts: Options) {
  const { dryRun = false, ohnePdf = false } = opts;

  // ---- Datei(en) einlesen --------------------------------------------------
  let path = opts.file;
  if (statSync(path).isDirectory()) {
    const z = readdirSync(path).find((n) => /\.zip$/i.test(n));
    if (!z) throw new Error(`Keine ZIP-Datei in ${path}`);
    path = join(path, z);
  }
  const outer = await JSZip.loadAsync(readFileSync(path));
  const entry = (re: RegExp) => Object.values(outer.files).find((f) => re.test(f.name));
  const stapelE = entry(/Buchungsstapel.*\.csv$/i);
  const stammE = entry(/DebKred_Stamm.*\.csv$/i);
  const belegeE = entry(/Belege\.zip$/i);
  if (!stapelE) throw new Error("EXTF_Buchungsstapel.csv nicht im Export gefunden");
  const belegeZip = belegeE ? await JSZip.loadAsync(await belegeE.async("uint8array")) : null;

  const stapel = parseCsv(dec(await stapelE.async("uint8array")));
  const meta = stapel[0];
  const hdr = stapel[1];
  const ix = (name: string) => hdr.indexOf(name);
  const cUmsatz = ix("Umsatz (ohne Soll/Haben-Kz)");
  const cSH = ix("Soll/Haben-Kennzeichen");
  const cKonto = ix("Konto");
  const cGegen = ix("Gegenkonto (ohne BU-Schlüssel)");
  const cBu = ix("BU-Schlüssel");
  const cDatum = ix("Belegdatum");
  const cBeleg1 = ix("Belegfeld 1");
  const cText = ix("Buchungstext");
  const cInfoArt = ix("Beleginfo - Art 1");
  const cInfoInh = ix("Beleginfo - Inhalt 1");
  const year = (meta[14] ?? "").slice(0, 4) || String(new Date().getFullYear());

  // ---- Kreditor-Stamm ------------------------------------------------------
  const kred = new Map<string, { name: string; vat: string | null }>();
  if (stammE) {
    const st = parseCsv(dec(await stammE.async("uint8array")));
    const h = st[1];
    const i = (n: string) => h.indexOf(n);
    for (const r of st.slice(2)) {
      const konto = r[i("Konto")];
      const name =
        r[i("Name (Adressattyp Unternehmen)")] ||
        [r[i("Vorname (Adressattyp natürl. Person)")], r[i("Name (Adressattyp natürl. Person)")]]
          .filter(Boolean)
          .join(" ") ||
        r[i("Name (Adressattyp keine Angabe)")];
      const vat = `${r[i("EU-Land")] ?? ""}${r[i("EU-UStID")] ?? ""}`.trim();
      if (konto) kred.set(konto, { name: name ?? "", vat: vat || null });
    }
  }

  // ---- Eingangsrechnungen aus den Buchungszeilen bilden ---------------------
  const stats = { zeilen: 0, eingangsZeilen: 0, zahlung: 0, uebrige: 0 };
  const belege = new Map<string, Beleg>();
  const unknownBu = new Map<string, number>();
  for (const r of stapel.slice(2)) {
    stats.zeilen++;
    const konto = r[cKonto];
    const gegen = r[cGegen];
    const isKred = /^\d{5}$/.test(konto) && Number(konto) >= 70000;
    if (!isKred) {
      stats.uebrige++;
      continue;
    }
    if (/^12\d\d$/.test(gegen)) {
      stats.zahlung++;
      continue;
    }
    stats.eingangsZeilen++;
    const nr = r[cInfoArt] === "Buchungsnummer" ? r[cInfoInh] : "";
    const docNr = r[cBeleg1] ?? "";
    const key = nr || `${konto}|${docNr}`;
    const bu = rateFromBu(r[cBu] ?? "");
    if (!bu.known) unknownBu.set(r[cBu], (unknownBu.get(r[cBu]) ?? 0) + 1);
    const dd = r[cDatum] ?? "";
    const datum = dd.length === 4 ? `${year}-${dd.slice(2, 4)}-${dd.slice(0, 2)}` : "";
    const b =
      belege.get(key) ??
      ({ nr, kreditor: konto, docNr, datum, credit: r[cSH] === "S", lines: [] } as Beleg);
    b.lines.push({
      gross: num(r[cUmsatz]),
      rate: bu.rate,
      rc: bu.rc,
      konto: gegen,
      text: r[cText] ?? "",
      bu: r[cBu] ?? "",
      known: bu.known,
    });
    belege.set(key, b);
  }

  // ---- Unbekannte BU-Schlüssel (z.B. 401 ab Juni): Satz am BB-Beleg nachschlagen ----
  // BB setzt dort einen Platzhalter-Schlüssel; der tatsächliche USt-Satz steht
  // nur am Beleg (receipts/get/{id}.vat). Fehlt er auch dort, bleibt der Satz
  // unbekannt -> Beleg wird als "extrahiert" statt "geprüft" angelegt.
  const satzNachgeschlagen = { belege: 0, gefunden: 0, ohneTreffer: 0, ohneSatz: 0 };
  const needLookup = [...belege.values()].filter((b) => b.lines.some((l) => !l.known));
  if (needLookup.length) {
    const von = (meta[14] ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const bis = (meta[15] ?? "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const list = await bbGetAll<{ id_by_customer: string; invoicenumber: string | null; amount: string }>(
      "receipts/get",
      { list_direction: "inbound", date_from: von, date_to: bis },
    );
    const byNr = new Map<string, typeof list>();
    for (const rc of list) byNr.set(norm(rc.invoicenumber), [...(byNr.get(norm(rc.invoicenumber)) ?? []), rc]);
    for (const b of needLookup) {
      satzNachgeschlagen.belege++;
      const gross = r2(b.lines.reduce((s, l) => s + l.gross, 0));
      const cand = (byNr.get(norm(b.docNr)) ?? []).find((rc) => Math.abs(Math.abs(Number(rc.amount)) - Math.abs(gross)) <= 0.011);
      if (!cand) {
        satzNachgeschlagen.ohneTreffer++;
        continue;
      }
      const det = (await bbPost<{ vat: string | null }>(`receipts/get/${cand.id_by_customer}`)).data;
      const vat = det?.vat == null || det.vat === "" ? null : Number(det.vat);
      if (vat == null || !Number.isFinite(vat)) {
        satzNachgeschlagen.ohneSatz++;
        continue;
      }
      satzNachgeschlagen.gefunden++;
      for (const l of b.lines) if (!l.known) { l.rate = Math.round(vat); l.known = true; }
    }
  }

  // ---- Referenzdaten aus werk ----------------------------------------------
  const orgs = await pagedSelect<{ id: string; name: string; supplier_number: string | null }>(
    "organization",
    "id, name, supplier_number",
  );
  const orgByNr = new Map(orgs.filter((o) => o.supplier_number).map((o) => [o.supplier_number!, o]));
  const orgByName = new Map(orgs.map((o) => [normName(o.name), o]));
  const { data: tcs } = await supabase.from("tax_code").select("id, code").in("code", ["VST19", "VST7", "VST13B"]);
  const tc = (code: string) => tcs?.find((t) => t.code === code)?.id ?? null;
  const codeFor = (l: Line) => (l.rc ? tc("VST13B") : l.rate === 19 ? tc("VST19") : l.rate === 7 ? tc("VST7") : null);

  type Ex = {
    id: string;
    doc_number: string | null;
    status: string;
    gross_amount: number | null;
    ledger_account: string | null;
    tax_code_id: string | null;
    supplier_organization_id: string | null;
    supplier_name: string | null;
    dedup_key: string;
    doc_type: string;
  };
  const existing = await pagedSelect<Ex>(
    "incoming_document",
    "id, doc_number, status, gross_amount, ledger_account, tax_code_id, supplier_organization_id, supplier_name, dedup_key, doc_type",
  );
  const byDedup = new Set(existing.map((e) => e.dedup_key));
  const byNr = new Map<string, Ex[]>();
  for (const e of existing) {
    if (!e.doc_number || !["invoice", "credit_note"].includes(e.doc_type)) continue;
    const k = norm(e.doc_number);
    byNr.set(k, [...(byNr.get(k) ?? []), e]);
  }

  // ---- Import ---------------------------------------------------------------
  const out = {
    belegeImExport: belege.size,
    angelegt: 0,
    schonImportiert: 0,
    mitPdf: 0,
    ohnePdf: 0,
    duplikatErgaenzt: 0,
    duplikatAbweichung: [] as string[],
    duplikatVerworfenUebersprungen: 0,
    ohneOrganisation: [] as string[],
    unbekannteBU: Object.fromEntries(unknownBu),
    satzNachgeschlagen,
    satzUnbekanntBelege: [] as string[],
    fehler: [] as string[],
  };
  const stand = new Date().toISOString();

  for (const b of belege.values()) {
    const dedupKey = `bb:${b.nr || `${b.kreditor}|${b.docNr}`}`;
    if (byDedup.has(dedupKey)) {
      out.schonImportiert++;
      continue;
    }
    const gross = r2(b.lines.reduce((s, l) => s + l.gross, 0));
    const satzOffen = b.lines.some((l) => !l.known);
    if (satzOffen) out.satzUnbekanntBelege.push(`${b.docNr} ${kred.get(b.kreditor)?.name ?? b.kreditor}`);
    const stamm = kred.get(b.kreditor);
    const org = orgByNr.get(b.kreditor) ?? orgByName.get(normName(stamm?.name));
    const supplierName = org?.name ?? stamm?.name ?? `Kreditor ${b.kreditor}`;
    if (!org) out.ohneOrganisation.push(`${b.kreditor} ${stamm?.name ?? ""}`);

    // Zeilen -> Netto/Steuer
    const items = b.lines.map((l) => {
      const net = r2(l.gross / (1 + l.rate / 100));
      return { l, net, tax: r2(l.gross - net) };
    });
    const net = r2(items.reduce((s, x) => s + x.net, 0));
    const tax = r2(items.reduce((s, x) => s + x.tax, 0));
    const biggest = [...items].sort((a, c) => c.l.gross - a.l.gross)[0];
    const breakdown: Record<string, number> = {};
    for (const x of items) if (x.l.rate > 0) breakdown[String(x.l.rate)] = r2((breakdown[String(x.l.rate)] ?? 0) + x.tax);

    // Duplikat gegen bestehende werk-Belege?
    const cands = byNr.get(norm(b.docNr)) ?? [];
    const dup = cands.find(
      (e) =>
        (org && e.supplier_organization_id === org.id) ||
        normName(e.supplier_name) === normName(supplierName) ||
        (!!e.supplier_name && normName(supplierName).includes(normName(e.supplier_name).slice(0, 8))),
    );
    if (dup) {
      if (dup.status === "rejected") {
        out.duplikatVerworfenUebersprungen++;
        continue;
      }
      const diff = Math.abs(Math.abs(dup.gross_amount ?? 0) - Math.abs(gross));
      if (diff > 0.02) {
        out.duplikatAbweichung.push(`${b.docNr} ${supplierName}: werk ${dup.gross_amount} / BB ${gross}`);
        continue;
      }
      if (!dryRun) {
        const patch: Record<string, unknown> = {};
        if (!dup.ledger_account) patch.ledger_account = biggest.l.konto;
        if (!dup.tax_code_id && codeFor(biggest.l)) patch.tax_code_id = codeFor(biggest.l);
        if (dup.status === "extracted" && !satzOffen) {
          patch.status = "reviewed";
          patch.reviewed_at = stand;
        }
        if (Object.keys(patch).length) {
          const { error } = await supabase.from("incoming_document").update(patch).eq("id", dup.id);
          if (error) out.fehler.push(`${b.docNr}: ${error.message}`);
        }
      }
      out.duplikatErgaenzt++;
      continue;
    }

    // PDF
    let key: string | null = null;
    let sha: string | null = null;
    const pdfEntry = ohnePdf ? null : belegeZip?.file(`${b.nr}.pdf`);
    if (pdfEntry && !dryRun) {
      const bytes = Buffer.from(await pdfEntry.async("uint8array"));
      sha = createHash("sha256").update(bytes).digest("hex");
      key = prefix.eingangsrechnung(b.datum.slice(0, 4) || year, `bb-${b.nr}-${randomUUID().slice(0, 8)}`);
      await putObject(key, bytes, "application/pdf");
    }
    if (pdfEntry) out.mitPdf++;
    else out.ohnePdf++;

    if (dryRun) {
      out.angelegt++;
      continue;
    }

    const { data: doc, error } = await supabase
      .from("incoming_document")
      .insert({
        source: "api",
        doc_type: b.credit ? "credit_note" : "invoice",
        status: satzOffen ? "extracted" : "reviewed",
        reviewed_at: satzOffen ? null : stand,
        file_name: pdfEntry ? `${b.docNr || b.nr}.pdf` : null,
        pdf_storage_key: key,
        file_sha256: sha,
        dedup_key: dedupKey,
        supplier_organization_id: org?.id ?? null,
        supplier_name: supplierName,
        supplier_vat_id: stamm?.vat ?? null,
        doc_number: b.docNr || null,
        doc_date: b.datum || null,
        net_amount: net,
        tax_amount: tax,
        gross_amount: gross,
        tax_breakdown: Object.keys(breakdown).length ? breakdown : null,
        ledger_account: biggest.l.konto,
        tax_code_id: codeFor(biggest.l),
        notes: `Import aus BuchhaltungsButler (Buchungsnummer ${b.nr || "–"})${satzOffen ? " - USt-Satz in BB nicht gesetzt, bitte prüfen" : ""}`,
      })
      .select("id")
      .single();
    if (error || !doc) {
      out.fehler.push(`${b.docNr} ${supplierName}: ${error?.message ?? "kein Ergebnis"}`);
      continue;
    }
    const { error: iErr } = await supabase.from("incoming_document_item").insert(
      items.map((x, i) => ({
        incoming_document_id: doc.id,
        position: i + 1,
        description: x.l.text || null,
        tax_rate: x.l.rate,
        net_amount: x.net,
        ledger_account: x.l.konto,
        tax_code_id: codeFor(x.l),
      })),
    );
    if (iErr) out.fehler.push(`${b.docNr} Positionen: ${iErr.message}`);
    out.angelegt++;
  }

  const orgCount: Record<string, number> = {};
  for (const o of out.ohneOrganisation) orgCount[o] = (orgCount[o] ?? 0) + 1;
  return { datei: path, jahr: year, ...stats, ...out, ohneOrganisation: orgCount, dryRun };
}
