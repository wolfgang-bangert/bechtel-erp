/** Deutlich abgegrenzter Block (runde Ecken + Rahmen) für Detailseiten -
 *  einheitliches Layout-Raster für Eingangsrechnungen/Rechnungen & Co. */
export function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 16,
        marginBottom: 16,
        background: "var(--panel)",
        ...style,
      }}
    >
      {title && <h2 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h2>}
      {children}
    </div>
  );
}
