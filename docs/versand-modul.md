# Versand-Modul — Spec

Grundlage: Anforderungen W. Bangert (01.09.2026) + bestehende Ninox-Implementierung
(Ninox hat das Modul schon gebaut — wir übernehmen Struktur & Stammdaten, bauen
es sauber in werk neu).

## Zwei Vorab-Recherchen

- **Keyline liefert keine Sendungen.** `/sales/orders` hat nur
  `deliver_at`, `shipping_costs`, `mixed_shipping`, `shipping_costs_billing_mode`
  und die `address`. Sendungen entstehen also **in werk**, angehängt an den
  gespiegelten `sales_order`.
- **Ninox hat die komplette Versandlogik** (>60 Versand-Tabellen). Relevant:
  - `EB Zonen Spedition` (PLZ → Zone), `FB Tarife nach kg` (Zone, kg-Staffel → Preis)
  - `FF Preise DPD/Post` (kg-Staffel, Frachtunternehmen, Produkt → Preis; „Produkt"
    = z. B. DPD parcel letter)
  - `XG Grundprodukt Kartoneinheiten` (Grundprodukt + Stückzahl-Spanne → Karton,
    Flag „Speditionsversand/Päckchen erlaubt") + `ZG Verpackungen` (Karton-Stammdaten:
    Maße, Gewicht, Volumen, FEFCO, Preis)
  - `Q Lieferadressen` + `R Lieferadresse Positionen` = **Verteilerliste**
    (Empfänger + welche Auftragsposition in welcher Menge dorthin)
  - `IE Sendungen` / `JE Sendungen Positionen`, `GF Versandplan` (Batch/Lauf),
    `BF/CF/KF/EH Lieferscheine…`, `NB DPD Versand` (DPD-API-Payload),
    `JB/SL/WE Etiketten/Labels`
  → **Ich ziehe EB/FB/FF/XG/ZG direkt per Ninox-API nach `imports/`** als
  Ausgangsdaten. Die Kartonlogik pro Produkt bauen wir nach.

---

## Datenmodell werk (Vorschlag)

### Stammdaten — Frachtpreise (Phase 1)

- **`carrier`**: code (dhl/dpd/post/wackler/…), name, aktiv, api_enabled.
- **`carrier_zone`**: carrier, `plz_prefix` (o. Land), zone. — Wackler/Spedition
  aus `EB`; DHL/DPD meist ohne Zone (national Einheits-/Staffelpreis).
- **`carrier_rate`**: carrier, produkt (z. B. „Paket", „parcel letter",
  „Palette"), zone (nullable), `kg_von`, `kg_bis`, `preis`, gilt_ab, gilt_bis.
  - **DHL**: eine Zeile „Paket" `0–31,5 kg` → Einheitspreis.
  - **DPD**: mehrere Zeilen (Staffel) + Zeile „parcel letter".
  - **Post**: Staffel für Mailings.
  - **Wackler**: je Zone eine kg-Staffel (aus `FB`).
- **UI `/einstellungen/frachtpreise`**: Tabelle je Carrier, Zeilen pflegbar,
  Gültigkeitszeitraum, Import-Button (CSV).

### Preisvergleich (Phase 1)

Funktion `frachtvergleich({ carrier?, plz, land, packstuecke: [{gewicht}], gesamtgewicht })`
→ je Carrier-Variante:
- **Paketvarianten** (DHL / DPD / Post): Summe über Packstücke, je Packstück
  Tarifzeile nach Gewicht (+ Zone) → Gesamt.
- **Speditionsvariante** (Wackler): Gesamtgewicht → Zone (PLZ) → `FB`-Staffel.
- Ausgabe: Liste sortiert nach Preis, günstigste markiert, mit „N Pakete DHL vs.
  1 Palette Spedition".

### Sendung & Packstücke (Phase 2)

- **`shipment`**: nummer, `carrier_id`, produkt, status
  (geplant/gepackt/etikettiert/übergeben/zugestellt/storniert),
  versanddatum, gewicht_gesamt, frankatur, waehrung, zollwert (CH),
  begleitpapiere (keine/proforma/…), tracking_number, tracking_url,
  retourenadresse, notiz.
- **Verknüpfung (Pflicht, mind. eine):** `sales_order_id` (Keyline/Ninox-Auftrag),
  **oder** `organization_id` + optional `contact_id` (Muster/frei).
  Eine Sendung darf **mehrere Aufträge** referenzieren → n:m
  `shipment_order (shipment_id, sales_order_id)`.
- **`shipment_recipient`**: pro Empfängeradresse (bei Verteilerliste 1..n) —
  addressee, strasse, hausnr, plz, ort, land, ansprechpartner, telefon, email,
  abw_versandweg, abw_paketzahl, quelle (auftrag/verteilerliste/manuell).
- **`shipment_package`**: shipment_recipient, `packaging_id` (Karton) o. „Palette",
  gewicht, laenge, breite, hoehe, tracking_number (je Packstück), label (S3).
- **`shipment_item`**: shipment_recipient, `sales_order_item_id` **oder**
  manuelle Position (beschreibung, menge), menge. → Grundlage Lieferschein.

### Verteilerlisten-Import (Phase 3)

- **`distribution_import`**: quelle-Datei (S3), auftrag(e), status, zeilen-jsonb.
- Seite **`/versand/verteiler/[id]`**: die per Excel/CSV importierten Zeilen
  sichtbar, prüfbar, korrigierbar (Adresse, Menge, Produkt), dann „übernehmen"
  → erzeugt `shipment_recipient` + `shipment_item`.
- Mapping-Vorlage speicherbar (Spaltenzuordnung je Kunde).

### Kartonberechnung (Phase 3)

- **`product_packaging`**: grundprodukt/produkt, `stueck_von`, `stueck_bis`,
  `packaging_id`, spedition_erlaubt. — aus `XG`.
- Funktion `packe(produkt, menge)` → Liste Packstücke (Karton + Stückzahl je
  Karton + Restkarton), Gesamtgewicht. Speist Preisvergleich & Packliste.

### Dokumente (Phase 4)

- **Lieferschein-PDF**: Kopf (werk-Firmenprofil), Empfänger, Positionen aus
  `shipment_item` (mit Stückzahl) **+ manuelle Positionen**, Packstück-Übersicht,
  optional Unterverteiler. Ablage S3, `datev_export`-artiges Protokoll.
- **Proforma-Rechnung** (Land = CH): Positionen mit Zollwert, Zolltarifnummer
  je Position (`UG Zolltarifnummern` aus Ninox), Ursprungsland, Frankatur.
- **Etiketten-Modul** (`/versand/etiketten`): frei gestaltbare Labels
  (Vorlage = Felder + Positionen auf einem Layout), Datenquelle
  Sendung/Empfänger/Packstück, Druck als PDF/ZPL. Eigenständig, auch ohne
  Sendung nutzbar (mind. Verknüpfung Kunde/Kontakt).

### Carrier-APIs (Phase 5)

- **DHL** (Post & DHL API / Geschäftskundenversand): Label + Trackingnummer je
  Packstück. `DHL_*` in `.env`.
- **DPD** (Cloud/Classic): Payload-Felder liegen in Ninox `NB` schon gemappt
  (RNAME1, RSTREET, WEIGHT, PARCELCOUNT, SHIPMENTID, PARCELNO …). `DPD_*` in `.env`.
- **Wackler**: eigene API — Doku anfordern. Speditionsauftrag + Palettenavis.
- Tracking-Push (DHL/DPD) → Status auf `shipment` / `shipment_package`.

### Frachtkosten-Auswertung (Phase 2, „semantisch")

- **`shipment_cost`**: shipment, carrier, betrag, `kostenstelle` (4730), zone,
  gewicht, quelle (kalkuliert/rechnung), verknüpft mit `incoming_document` wenn
  die Frachtrechnung reinkommt. → Auswertung nach Carrier / Zone / Kunde / Monat.

---

## Bauabschnitte

1. **Frachtpreise**: Schema `carrier` / `carrier_zone` / `carrier_rate`,
   Pflege-UI, CSV-Import, **Preisvergleich-Funktion + kleine Vergleichsseite**.
   → Ninox-Daten (EB/FB/FF) ziehe ich als Startbestand.
2. **Sendung / Packstück / Position** Schema + Erfassungs-UI, `shipment_cost`,
   Lieferschein-PDF.
3. **Verteilerlisten-Import** + Review-Seite; **Kartonberechnung** (`XG`/`ZG`).
4. **Proforma CH**; **Etiketten-Modul** (Designer).
5. **Carrier-APIs** DHL → DPD → Wackler; Tracking-Push.

---

## Offene Punkte

- [ ] Wackler-API-Doku (Endpunkte, Auth, Speditionsauftrag/Avis)
- [ ] DHL: welches Produkt/Verfahren (Paket DE, Warenpost, …), GK-Vertragsdaten
- [ ] DPD: Cloud-API oder Classic; Depot/Kundennummer
- [ ] Post: welche Mailing-Produkte + Preisliste
- [ ] Etiketten: Format(e) (A6-Thermo, A4-Bogen …), Drucker (ZPL/PDF)
- [ ] Verteilerlisten: kommen die immer als Excel vom Kunden, oder auch aus Ninox?
- [ ] „Pos1..Pos15" in Ninox `IE Sendungen` — was ist das (feste Positionsraster)?
- [ ] Absenderadresse(n) / mehrere Werke?
