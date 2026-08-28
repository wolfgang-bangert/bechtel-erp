// Geteilte Konstanten und Typen für apps/web, apps/app und services/*.
// Datenbank-Typen werden generiert: `pnpm gen:types` → ./database.types.ts

export * from "./tax.js";

export const APP_ROLES = [
  "admin",
  "office",
  "accounting",
  "production",
  "shipping",
  "employee",
  "customer",
  "supplier",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Rollen mit internem Zugriff (entspricht public.is_staff() in der DB). */
export const STAFF_ROLES: readonly AppRole[] = [
  "admin",
  "office",
  "accounting",
  "production",
  "shipping",
  "employee",
];

/** Nummernkreis-Schlüssel (siehe public.number_sequence). */
export const NUMBER_SEQUENCES = [
  "quote",
  "order",
  "invoice",
  "credit_note",
  "delivery_note",
  "dunning",
  "purchase_order",
  "customer_number",
  "supplier_number",
] as const;
export type NumberSequenceKey = (typeof NUMBER_SEQUENCES)[number];
