/**
 * Job-/Batch-Erzeugung – zentrale Logik in @werk/shared/druck.
 * Dieser Re-Export hält den bestehenden Importpfad `@/lib/druck/materialize` stabil.
 */
export { erzeugeJobs, mkSchluessel, BATCH_KEYS_DEFAULT } from "@werk/shared/druck";
export type { MaterializeResult } from "@werk/shared/druck";
