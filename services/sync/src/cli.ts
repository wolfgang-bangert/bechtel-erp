import { syncKeylineOrganizations } from "./syncKeylineOrganizations";
import { syncKeylineAddresses } from "./syncKeylineAddresses";
import { syncNinoxFirmen } from "./syncNinoxFirmen";
import { syncNinoxPeople } from "./syncNinoxPeople";
import { syncNinoxAddresses } from "./syncNinoxAddresses";
import { syncKeylineOrders } from "./syncKeylineOrders";
import { syncKeylineInvoices, refreshKeylineInvoice } from "./syncKeylineInvoices";
import {
  bbAccounts,
  bbDebtors,
  bbCreditors,
  bbPostings,
  bbPing,
} from "./syncBButler";
import { syncNinoxOrders } from "./syncNinoxOrders";
import { syncNinoxInvoices } from "./syncNinoxInvoices";
import { dedupeReport } from "./dedupeReport";
import { dedupeMerge } from "./mergeOrganizations";
import { syncInvoicePdfs } from "./syncInvoicePdfs";
import { syncBankImport } from "./syncBankImport";
import { syncBankMatch } from "./syncBankMatch";
import { exportDatevExtf } from "./datevExtf";
import { syncMailbox } from "./syncMailbox";
import { extractIncoming } from "./extractIncoming";
import { purgeIncoming } from "./purgeIncoming";
import { pruneReceiptDuplicates } from "./pruneReceipts";
import { forwardDunnings } from "./forwardDunnings";
import { supabase } from "./supabase";

const cmd = process.argv[2] ?? "";
const flags = new Set(process.argv.slice(3));
const dryRun = flags.has("--dry-run");

function printConflicts(conflicts: string[]) {
  if (!conflicts.length) return;
  console.log(`\n${conflicts.length} Nummern-Kollisionen (Nummer nicht übernommen):`);
  for (const c of conflicts.slice(0, 30)) console.log(`  - ${c}`);
  if (conflicts.length > 30) console.log(`  … und ${conflicts.length - 30} weitere`);
}

async function main() {
  switch (cmd) {
    case "keyline:orgs": {
      console.log(
        `Keyline -> Supabase: Organisationen${dryRun ? "  (DRY RUN, nichts wird geschrieben)" : ""}`,
      );
      const r = await syncKeylineOrganizations({ dryRun });
      printConflicts(r.conflicts);
      console.log(
        `\nFertig. gesehen ${r.seen} — neu ${r.created}, aktualisiert ${r.updated}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    case "keyline:addresses": {
      console.log(`Keyline -> Supabase: Hauptadressen${dryRun ? "  (DRY RUN)" : ""}`);
      const r = await syncKeylineAddresses({ dryRun });
      console.log(
        `\nFertig. ${r.targets} Orgs geprüft, ${r.withAddress} mit Adresse — neu ${r.insert}, aktualisiert ${r.update}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    case "ninox:firmen": {
      console.log(
        `Ninox -> Supabase: Firmen (Kalenderkunden)${dryRun ? "  (DRY RUN)" : ""}`,
      );
      const r = await syncNinoxFirmen({ dryRun });
      printConflicts(r.conflicts);
      console.log(
        `\nZuordnung: ${r.matchedKeyline} über keylineOrgId, ${r.matchedNumber} über Debitornummer, ${r.matchedVat} über USt-IdNr`,
      );
      console.log(
        `Fertig. gesehen ${r.seen} — neu (Kalender) ${r.create}, mit bestehender Org verknüpft ${r.merge}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    case "ninox:addresses": {
      console.log(`Ninox -> Supabase: Adressen`+(dryRun?"  (DRY RUN)":""));
      const r = await syncNinoxAddresses({ dryRun });
      console.log(`\nFertig. gesehen ${r.seen} — neu ${r.insert}, aktualisiert ${r.update}, ohne Firma ${r.noOrg}, ohne Adresse ${r.noAddr}`+(dryRun?"  (DRY RUN)":""));
      break;
    }
    case "ninox:people": {
      console.log(`Ninox -> Supabase: Kontakte (people)${dryRun ? "  (DRY RUN)" : ""}`);
      const r = await syncNinoxPeople({ dryRun });
      console.log(
        `\nFertig. gesehen ${r.seen} — neu ${r.insert}, aktualisiert ${r.update}, ` +
          `ohne Firma ${r.orphans}, leer ${r.empty}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    case "keyline:orders": {
      const full = process.argv.includes("--full");
      const sinceArg = process.argv.find((a) => a.startsWith("--since="));
      const since = sinceArg ? new Date(sinceArg.split("=")[1]) : undefined;
      console.log(`Keyline -> Supabase: Aufträge${dryRun ? "  (DRY RUN)" : ""}`);
      const r = await syncKeylineOrders({ dryRun, full, since });
      console.log(
        `\nFertig. ${r.seen} Aufträge — geschrieben ${"orders" in r ? r.orders : 0}` +
          `${"items" in r ? `, Positionen ${r.items}` : ""}, ohne Org ${r.noOrg}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    case "keyline:invoices": {
      const full = process.argv.includes("--full");
      const sinceArg = process.argv.find((a) => a.startsWith("--since="));
      const since = sinceArg ? new Date(sinceArg.split("=")[1]) : undefined;
      console.log(`Keyline -> Supabase: Rechnungen${dryRun ? "  (DRY RUN)" : ""}`);
      const r = await syncKeylineInvoices({ dryRun, full, since });
      console.log(
        `\nFertig (${"mode" in r ? r.mode : "?"}). ${r.invoices} Rechnungen + ${r.creditNotes} Gutschriften — ` +
          `${"written" in r ? `geschrieben ${r.written}` : ""}, ohne Org ${r.noOrg}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    case "keyline:invoice": {
      const idArg = process.argv.find((a) => a.startsWith("--id="));
      if (!idArg) {
        console.error("--id=<keyline-id> erforderlich");
        process.exit(1);
      }
      const r = await refreshKeylineInvoice(Number(idArg.split("=")[1]));
      console.log(JSON.stringify(r, null, 1));
      break;
    }
    case "ninox:orders": {
      console.log(`Ninox -> Supabase: Aufträge${dryRun ? "  (DRY RUN)" : ""}`);
      const r = await syncNinoxOrders({ dryRun });
      console.log(
        `\nFertig. ${r.seen} Aufträge, ${"items" in r ? r.items : 0} Positionen, ohne Org ${r.noOrg}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    case "ninox:invoices": {
      console.log(`Ninox -> Supabase: Rechnungen${dryRun ? "  (DRY RUN)" : ""}`);
      const r = await syncNinoxInvoices({ dryRun });
      console.log(
        `\nFertig. ${r.seen} Rechnungen, ${"items" in r ? r.items : 0} Positionen, ohne Org ${r.noOrg}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    case "pdf:invoices": {
      const lim = process.argv.find((a) => a.startsWith("--limit="));
      const limit = lim ? Number(lim.split("=")[1]) : undefined;
      console.log(`Rechnungs-PDFs -> Hetzner S3${dryRun ? "  (DRY RUN)" : ""}${limit ? "  limit " + limit : ""}`);
      const r = await syncInvoicePdfs({ dryRun, limit });
      console.log("\n" + JSON.stringify(r));
      break;
    }
    case "bank:import": {
      const fp = process.argv.find((a) => a.startsWith("--file="));
      if (!fp) { console.log("  pnpm --filter sync bank:import --file=auszug.xml [--dry-run]"); process.exit(1); }
      console.log(`CAMT.053-Import ${fp.split("=")[1]}${dryRun ? "  (DRY RUN)" : ""}`);
      console.log(JSON.stringify(await syncBankImport({ file: fp.split("=")[1], dryRun }), null, 1));
      break;
    }
    case "bank:match": {
      console.log(`Bank-Umsätze <-> offene Rechnungen${dryRun ? "  (DRY RUN)" : ""}`);
      console.log(JSON.stringify(await syncBankMatch({ dryRun }), null, 1));
      break;
    }
    case "datev:extf": {
      const arg = (n: string) => {
        const p = process.argv.find((a) => a.startsWith(n + "="));
        return p ? p.split("=")[1] : undefined;
      };
      const from = arg("--from");
      const to = arg("--to");
      if (!from || !to) {
        console.log("  pnpm --filter sync datev:extf --from=2025-01-01 --to=2025-12-31 [--dry-run]");
        process.exit(1);
      }
      console.log(`DATEV EXTF-Buchungsstapel ${from} … ${to}${dryRun ? "  (DRY RUN)" : ""}`);
      const r = await exportDatevExtf({ from, to, dryRun });
      console.log(
        `\n${r.invoices} Rechnungen im Zeitraum — ${r.booked} gebucht (${r.lines} Buchungszeilen).`,
      );
      console.log(
        `übersprungen ${r.skipped}: ${r.skips.noNumber} ohne Rechnungsnummer (Entwurf), ` +
          `${r.skips.noDebitor} ohne Debitorennummer, ${r.skips.badDebitor} ungültige Debitorennummer`,
      );
      console.log(`Summe (Rg − GS): ${r.grossTotal.toLocaleString("de-DE")} EUR`);
      console.log(`Datei: ${r.file}`);
      console.log(`SHA-256: ${r.sha256}`);
      break;
    }
    case "mail:fetch": {
      const val = (n: string) => {
        const p = process.argv.find((a) => a.startsWith(n + "="));
        return p ? Number(p.split("=")[1]) : undefined;
      };
      console.log(`Postfach abrufen${dryRun ? "  (DRY RUN)" : ""}`);
      console.log(
        JSON.stringify(
          await syncMailbox({
            dryRun,
            limit: val("--limit"),
            sinceDays: val("--since"),
            all: process.argv.includes("--all"),
          }),
          null,
          1,
        ),
      );
      break;
    }
    case "incoming:extract": {
      const lim = process.argv.find((a) => a.startsWith("--limit="));
      console.log(`Eingangsbelege extrahieren${dryRun ? "  (DRY RUN)" : ""}`);
      console.log(JSON.stringify(await extractIncoming({ dryRun, limit: lim ? Number(lim.split("=")[1]) : 20 }), null, 1));
      break;
    }
    case "incoming:purge": {
      const p = process.argv.find((a) => a.startsWith("--from="));
      console.log("Eingangsbelege löschen");
      console.log(
        JSON.stringify(
          await purgeIncoming({ dryRun, from: p ? p.split("=")[1] : undefined }),
          null,
          1,
        ),
      );
      break;
    }
    case "bb:ping": {
      console.log(JSON.stringify(await bbPing(), null, 1));
      break;
    }
    case "bb:accounts": {
      console.log("BuchhaltungsButler → Kontenrahmen holen …");
      console.log(JSON.stringify(await bbAccounts(), null, 1));
      break;
    }
    case "bb:debtors": {
      console.log("BuchhaltungsButler → Debitoren holen …");
      console.log(JSON.stringify(await bbDebtors(), null, 1));
      break;
    }
    case "bb:creditors": {
      console.log("BuchhaltungsButler → Kreditoren holen …");
      console.log(JSON.stringify(await bbCreditors(), null, 1));
      break;
    }
    case "bb:postings": {
      const from = process.argv.find((a) => a.startsWith("--from="))?.split("=")[1];
      const to = process.argv.find((a) => a.startsWith("--to="))?.split("=")[1];
      console.log("BuchhaltungsButler → Buchungen holen …");
      console.log(JSON.stringify(await bbPostings({ from, to }), null, 1));
      break;
    }
    case "incoming:prune-receipts": {
      console.log(`Redundante Receipts entfernen${dryRun ? "  (DRY RUN)" : ""}`);
      console.log(JSON.stringify(await pruneReceiptDuplicates({ dryRun }), null, 1));
      break;
    }
    case "incoming:forward-dunning": {
      console.log(`Mahnungen weiterleiten${dryRun ? "  (DRY RUN)" : ""}`);
      console.log(JSON.stringify(await forwardDunnings({ dryRun }), null, 1));
      break;
    }
    case "dedupe:orgs": {
      console.log("Dubletten-Report Organisationen (nur lesen) …");
      const r = await dedupeReport();
      console.log(
        `\n${r.orgs} Organisationen — ${r.groups} Verdachtsgruppen ` +
          `(${r.highConfidence} mit hoher Konfidenz), ${r.involved} Orgs betroffen`,
      );
      console.log("nach Typ:", r.byType);
      console.log(`CSV: ${r.file}`);
      break;
    }
    case "dedupe:merge": {
      const flagVal = (name: string): string | undefined => {
        const p = process.argv.find((a) => a.startsWith(name + "="));
        return p ? p.split("=")[1] : undefined;
      };
      const conf = flagVal("--confidence") === "mittel" ? "mittel" : "hoch";
      const excl = flagVal("--exclude"); const only = flagVal("--only");
      console.log(`Dubletten zusammenführen (Konfidenz ${conf})${dryRun ? "  (DRY RUN)" : ""}`);
      const r = await dedupeMerge({
        dryRun, confidence: conf,
        exclude: excl ? new Set(excl.split(",")) : undefined,
        only: only ? new Set(only.split(",")) : undefined,
      });
      console.log(`\n${r.dryRun ? "Plan" : "Fertig"}: ${r.groups} Gruppen, ${r.merges} Zusammenführungen${"failed" in r && r.failed ? `, ${r.failed} Fehler` : ""}`);
      break;
    }
    default:
      console.log("Verwendung:");
      console.log("  pnpm --filter sync keyline:orgs        [--dry-run]");
      console.log("  pnpm --filter sync keyline:addresses   [--dry-run]");
      console.log("  pnpm --filter sync ninox:firmen        [--dry-run]");
      console.log("  pnpm --filter sync ninox:people        [--dry-run]");
      console.log("  pnpm --filter sync ninox:addresses     [--dry-run]");
      console.log("  pnpm --filter sync keyline:orders      [--dry-run] [--full] [--since=ISO]");
      console.log("  pnpm --filter sync keyline:invoices    [--dry-run] [--full] [--since=ISO]");
      console.log("  pnpm --filter sync keyline:invoice     --id=<keyline-id>");
      console.log("  pnpm --filter sync ninox:orders        [--dry-run]");
      console.log("  pnpm --filter sync ninox:invoices      [--dry-run]");
      console.log("  pnpm --filter sync mail:fetch          [--dry-run] [--limit=N] [--since=DAYS] [--all]");
      console.log("  pnpm --filter sync incoming:extract    [--dry-run] [--limit=N]");
      console.log("  pnpm --filter sync incoming:purge      --from=<absender> [--dry-run]");
      console.log("  pnpm --filter sync incoming:prune-receipts   [--dry-run]");
      console.log("  pnpm --filter sync incoming:forward-dunning  [--dry-run]");
      console.log("  pnpm --filter sync dedupe:orgs");
      console.log("  pnpm --filter sync dedupe:merge  [--dry-run] [--confidence=mittel] [--exclude=G1,G7] [--only=G12]");
      process.exit(1);
  }
}

main().catch(async (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\nFEHLER: ${msg}`);
  const map: Record<string, { system: string; resource: string }> = {
    "keyline:orgs": { system: "keyline", resource: "organizations" },
    "keyline:addresses": { system: "keyline", resource: "addresses" },
    "ninox:firmen": { system: "ninox", resource: "firmen" },
    "ninox:people": { system: "ninox", resource: "people" },
    "ninox:addresses": { system: "ninox", resource: "addresses" },
    "keyline:orders": { system: "keyline", resource: "orders" },
    "keyline:invoices": { system: "keyline", resource: "invoices" },
    "ninox:orders": { system: "ninox", resource: "orders" },
    "ninox:invoices": { system: "ninox", resource: "invoices" },
  };
  const s = map[cmd];
  if (s && !dryRun) {
    await supabase
      .from("external_sync_state")
      .upsert(
        {
          ...s,
          last_run_at: new Date().toISOString(),
          last_status: "error",
          error: msg.slice(0, 500),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "system,resource" },
      )
      .then(() => undefined, () => undefined);
  }
  process.exit(1);
});
