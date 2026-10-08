import type { Viewport } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Handy: Inhalt bis in die Ränder (Notch) nutzen; Eingabefelder haben 16px, damit iOS nicht hineinzoomt.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Eigenes, schlankes Layout für das Scannen mit dem Handy - ohne die breite Sidebar des Admin-ERP. */
export default async function ScannenLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return (
    <div className="scan-shell">
      <header className="scan-head">
        <Link href="/start" className="scan-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-bechtel-light.svg" alt="Bechtel Druck" />
          <span>werk · Scannen</span>
        </Link>
        <Link href="/dokumente" className="scan-headlink">
          Ablage →
        </Link>
      </header>
      <main className="scan-main">{children}</main>
    </div>
  );
}
