/**
 * Service-Overrides aus einem <FluxProductFields>-Formular lesen: `svc_keys`
 * (JSON-Array der im gewählten Produkt sichtbaren Service-Namen) + je Service
 * ein `svc__<Name>`-Feld. Leerer Wert löscht den Override, sonst wird er
 * gesetzt. Nicht sichtbare (weil Produktwechsel) Overrides in `base` bleiben
 * erhalten, außer sie stehen explizit in svc_keys.
 */
export function parseFluxServices(
  fd: FormData,
  base: Record<string, unknown> = {},
): Record<string, unknown> {
  const services: Record<string, unknown> = { ...base };
  let svcKeys: string[] = [];
  try {
    svcKeys = JSON.parse(String(fd.get("svc_keys") ?? "[]"));
  } catch {
    svcKeys = [];
  }
  for (const k of svcKeys) {
    const v = String(fd.get(`svc__${k}`) ?? "").trim();
    if (v) services[k] = v;
    else delete services[k];
  }
  return services;
}
