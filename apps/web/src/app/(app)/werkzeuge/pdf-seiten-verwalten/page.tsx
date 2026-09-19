import { PdfSeitenForm } from "./PdfSeitenForm";

export const dynamic = "force-dynamic";

export default function PdfSeitenVerwaltenPage() {
  return (
    <>
      <h1 style={{ marginBottom: 4 }}>PDF: Seiten verwalten</h1>
      <p className="lead" style={{ marginTop: 0 }}>
        Ein oder mehrere PDFs hochladen (werden nur temporär abgelegt), Seiten aus allen
        Dateien beliebig sortieren oder entfernen und als eine neue PDF herunterladen -
        deckt Umsortieren, einzelne Seiten löschen und Mehrfach-Merge ab.
      </p>
      <PdfSeitenForm />
    </>
  );
}
