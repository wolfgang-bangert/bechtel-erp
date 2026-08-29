import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// .env liegt im Repo-Wurzelverzeichnis (drei Ebenen über services/sync/src).
// fileURLToPath dekodiert %20 in Pfaden mit Leerzeichen ("neues ERP").
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Fehlende Umgebungsvariable ${name}. In der .env im Repo-Wurzelverzeichnis eintragen.`,
    );
  }
  return v.trim();
}

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  keylineBase: (process.env.KEYLINE_API_BASE || "https://app.keyline-mis.com/api/v2").replace(
    /\/+$/,
    "",
  ),
  keylineKey: required("KEYLINE_API_KEY"),
  ninox: {
    base: () => required("NINOX_API_BASE").replace(/\/+$/, ""),
    key: () => required("NINOX_API_KEY"),
    team: () => required("NINOX_TEAM_ID"),
    database: () => required("NINOX_DATABASE_ID"),
    customerTableId: () => (process.env.NINOX_CUSTOMER_TABLE_ID || "L").trim(),
  },
  datev: {
    beraterNr: () => required("DATEV_BERATER_NR"),
    mandantenNr: () => required("DATEV_MANDANTEN_NR"),
    wjBeginnDDMM: () => (process.env.DATEV_WJ_BEGINN || "0101").trim(),
    sachkontoLen: () => Number(process.env.DATEV_SACHKONTO_LEN || 4),
  },
};
