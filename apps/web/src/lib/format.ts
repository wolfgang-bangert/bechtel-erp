export function fmtEur(n: number | null | undefined): string {
  if (n == null) return "–";
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "–";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString("de-DE");
}

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n == null) return "–";
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
