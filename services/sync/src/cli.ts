import { syncKeylineOrganizations } from "./syncKeylineOrganizations";
import { supabase } from "./supabase";

const cmd = process.argv[2] ?? "";
const flags = new Set(process.argv.slice(3));
const dryRun = flags.has("--dry-run");

async function main() {
  switch (cmd) {
    case "keyline:orgs": {
      console.log(
        `Keyline -> Supabase: Organisationen${dryRun ? "  (DRY RUN, nichts wird geschrieben)" : ""}`,
      );
      const r = await syncKeylineOrganizations({ dryRun });
      if (r.conflicts.length) {
        console.log(`\n${r.conflicts.length} Nummern-Kollisionen (Nummer nicht übernommen):`);
        for (const c of r.conflicts) console.log(`  - ${c}`);
      }
      console.log(
        `\nFertig. gesehen ${r.seen} — neu ${r.created}, aktualisiert ${r.updated}` +
          (dryRun ? "  (DRY RUN)" : ""),
      );
      break;
    }
    default:
      console.log("Verwendung:");
      console.log("  pnpm --filter sync keyline:orgs [--dry-run]");
      process.exit(1);
  }
}

main().catch(async (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\nFEHLER: ${msg}`);
  if (cmd === "keyline:orgs" && !dryRun) {
    await supabase
      .from("external_sync_state")
      .upsert(
        {
          system: "keyline",
          resource: "organizations",
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
