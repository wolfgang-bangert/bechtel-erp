import type { Metadata } from "next";
import { Jost } from "next/font/google";
import "./globals.css";

const headingFont = Jost({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-heading-sans",
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
    <html lang="de" className={headingFont.variable}>
      <body>{children}</body>
    </html>
  );
}
