export const SHIPMENT_STATUS = [
  "erfasst",
  "gepackt",
  "etikettiert",
  "uebergeben",
  "zugestellt",
  "storniert",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  erfasst: "erfasst",
  gepackt: "gepackt",
  etikettiert: "etikettiert",
  uebergeben: "übergeben",
  zugestellt: "zugestellt",
  storniert: "storniert",
};
