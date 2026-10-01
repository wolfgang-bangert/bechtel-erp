import type { Metadata } from "next";
import { Jost, Archivo, Archivo_Narrow } from "next/font/google";
import "./globals.css";

const headingFont = Jost({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-heading-sans",
  display: "swap",
});

// Schriften aus dem Bechtel-Druck-Designsystem (Pilot: Sidebar,
// Eingangsrechnungen) - über next/font selbst gehostet (DSGVO), nicht von
// Google geladen, obwohl die Quelle Google Fonts ist.
const bodyFont = Archivo({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});
const displayFont = Archivo_Narrow({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-archivo-narrow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "werk",
  description: "Admin-ERP",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      className={`${headingFont.variable} ${bodyFont.variable} ${displayFont.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
