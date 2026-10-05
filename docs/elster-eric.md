# ELSTER-Versand der Umsatzsteuer-Voranmeldung (Stufe 2)

Ziel: Voranmeldungen und berichtigte Anmeldungen direkt aus werk (`/ustva`) ans Finanzamt senden. Technisch geht das nur über
**ERiC** (ELSTER Rich Client), die C-Bibliothek der Finanzverwaltung. Bis dahin dient die **Eingabehilfe** auf `/ustva`
(Zahlen wie ELSTER rechnet, Fälligkeit) zum Ausfüllen in Mein ELSTER.

## Was der Nutzer beschaffen muss (nicht automatisierbar)

1. **Registrierung als Softwarehersteller** im ELSTER-Entwicklerportal (https://www.elster.de/eportal/infoseite/entwickler).
   Das Bayerische Landesamt für Steuern prüft, ob Softwareherstellung beabsichtigt ist, und schickt per E-Mail die Zugangsdaten
   (dauert einige Tage). Hinweis: Bei Eigenentwicklung für das eigene Unternehmen im Antrag so begründen; Rückfragen über das
   Herstellerforum (forum.elster.de/herstellerforum).
2. **Hersteller-ID** beantragen (im Entwicklerbereich unter „Anträge und Formulare“). Aus Forenberichten kann das mehrere Wochen dauern.
3. **ERiC-Paket** (Linux x64, aktuelle Version) und **ERiC-Common** (XSD-Schemata, Beispiel-XML) aus dem Entwicklerbereich laden.
4. **ELSTER-Zertifikat** der Firma (Datei .pfx + PIN) aus Mein ELSTER; Datei und PIN selbst als Secret auf dem Server hinterlegen
   (nie in den Chat/ins Repository).
5. Für Tests: ERiC-Testmodus mit dem Testmerker und den ERiC-Testzertifikaten.

## Was werk dann bekommt (Entwicklung, sobald ERiC vorliegt)

- Tabelle `elster_uebermittlung` (Monat, Art Voranmeldung/Berichtigung, Kennzahlen als JSON, XML, Testmerker ja/nein, Status,
  Transferticket, Serverantwort/Protokoll-PDF, gesendet von/am).
- XML-Erzeugung für `Anmeldungssteuern/UStVA` (Namespace/Version je Jahr aus den ERiC-Schemata; Kz in Schema-Reihenfolge;
  Berichtigung = Kz 10) und Validierung gegen die XSD **vor** dem Senden.
- ERiC-Wrapper im sync-Container (koffi/FFI auf `libericapi`), Funktionen: Prüfen (nur validieren), Senden Test, Senden Produktiv.
- UI auf `/ustva`: Meldung vorbereiten -> Vorschau aller Kennzahlen -> **Bestätigungsdialog** -> Senden; Protokoll am Monat.
  Produktivversand nur nach ausdrücklicher Bestätigung je Meldung, nie automatisch.
- Mein-ELSTER-Import als Zwischenweg: UStVA-XML hochladen füllt das Formular vor (kein automatischer Versand).

## Reihenfolge der Meldungen (mit Dauerfristverlängerung: Fälligkeit 10. des übernächsten Monats)

Eingereicht sind Januar bis Mai 2026. Offen: Juni (fällig 10.08.), Juli (10.09.), August (10.10.), September (10.11.).
Berichtigungen Januar-Mai erst nach Klärung mit dem Steuerberater (siehe `imports/ustva-abgleich-jan-mai.md`).
