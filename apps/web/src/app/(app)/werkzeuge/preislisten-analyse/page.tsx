import { PreislistenAnalyseForm } from "./PreislistenAnalyseForm";

export const dynamic = "force-dynamic";

export default function PreislistenAnalysePage() {
  return (
    <>
      <h1 style={{ marginBottom: 4 }}>Preislisten-Analyse</h1>
      <p className="lead" style={{ marginTop: 0 }}>
        Ordner mit einer Preisliste (Register/Unterregister/Inhalt-PDFs) auswählen - zeigt
        Seitenzahl je Ordner/Datei und eine grobe farbig/s-w-Schätzung, z. B. für eine
        Druckkosten-Kalkulation. Alles läuft im Browser, nichts wird hochgeladen.
      </p>
      <PreislistenAnalyseForm />
    </>
  );
}
