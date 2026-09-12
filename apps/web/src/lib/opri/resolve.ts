/**
 * onlineprinters-Auflösung – zentrale Logik in @werk/shared/opri.
 * Dieser Re-Export hält den bestehenden Importpfad `@/lib/opri/resolve` stabil.
 */
export {
  resolvePortalOrder,
  resolveOne,
  loadResolveRefData,
  loadGruppenMaps,
  applyOptionAttrs,
  decodeFormat,
  PORTAL_ORDER_RESOLVE_SELECT,
} from "@werk/shared/opri";
export type {
  ResolveResult,
  MaterialZeile,
  RefData,
  GruppenMaps,
  GruppeInfo,
  OrderInput,
} from "@werk/shared/opri";
