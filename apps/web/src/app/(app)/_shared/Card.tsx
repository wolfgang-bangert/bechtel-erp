/** Deutlich abgegrenzter Block (runde Ecken + Rahmen) für Detailseiten -
 *  einheitliches Layout-Raster für Eingangsrechnungen/Rechnungen & Co.
 *  Stil nach dem Bechtel-Druck-Designsystem (bd-card, siehe globals.css). */
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
    <div className="bd-card" style={style}>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
}
