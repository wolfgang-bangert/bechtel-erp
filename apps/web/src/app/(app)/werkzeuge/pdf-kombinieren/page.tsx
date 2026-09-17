import { PdfKombinierenForm } from "./PdfKombinierenForm";

export const dynamic = "force-dynamic";

export default function PdfKombinierenPage() {
  return (
    <>
      <h1 style={{ marginBottom: 4 }}>PDF: Seiten nebeneinander</h1>
      <p className="lead" style={{ marginTop: 0 }}>
        PDF hochladen (wird nur temporär abgelegt), zwei Seiten wählen und als eine
        doppelt breite Seite herunterladen - z. B. Seite 1 + letzte Seite aus 18x A4 zu
        1x A3 (Umschlag/Deckblatt-Fall).
      </p>
      <PdfKombinierenForm />
    </>
  );
}
