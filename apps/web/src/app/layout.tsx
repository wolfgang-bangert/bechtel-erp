import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Schriften liegen im Repo (src/app/fonts, siehe README dort): kein Abruf von
// Google Fonts beim Build, keine Verbindung zu Google zur Laufzeit (DSGVO).
const headingFont = localFont({
  src: [
    { path: "./fonts/jost-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jost-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-heading-sans",
  display: "swap",
});

// Schriften aus dem Bechtel-Druck-Designsystem.
const bodyFont = localFont({
  src: [
    { path: "./fonts/archivo-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/archivo-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/archivo-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-archivo",
  display: "swap",
});
const displayFont = localFont({
  src: [
    { path: "./fonts/archivo-narrow-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/archivo-narrow-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
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
