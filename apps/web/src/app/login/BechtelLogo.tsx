export function BechtelLogo() {
  return (
    <div style={{ marginBottom: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-bechtel.svg" alt="Bechtel Druck" style={{ height: 34, display: "block" }} />
      <span
        style={{
          display: "block",
          marginTop: 6,
          fontSize: 11,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        werk
      </span>
    </div>
  );
}
