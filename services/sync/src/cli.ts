import { syncKeylineOrganizations } from "./syncKeylineOrganizations";
import { syncKeylineAddresses } from "./syncKeylineAddresses";
import { syncNinoxFirmen } from "./syncNinoxFirmen";
import { syncNinoxPeople } from "./syncNinoxPeople";
import { dedupeReport } from "./dedupeReport";
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
    default:
      console.log("Verwendung:");
      console.log("  pnpm --filter sync keyline:orgs        [--dry-run]");
      console.log("  pnpm --filter sync keyline:addresses   [--dry-run]");
      console.log("  pnpm --filter sync ninox:firmen        [--dry-run]");
      console.log("  pnpm --filter sync ninox:people        [--dry-run]");
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
