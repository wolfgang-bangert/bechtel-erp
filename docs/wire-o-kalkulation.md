# Wire-O-Kalkulation — Modell & Datenstruktur

Grundlage: `imports/wire o kalkulation.xlsx` (bestehende Excel-Kalkulation,
Blatt „Tabellenblatt1"), `dbo-zz_diameterdoublewire-*.csv` (Durchmesser-Tabelle),
`dbo-zz_costcenter-*.csv` (Kostenstellen).

Ziel: eine **einzige Kalkulations-Engine**, die
1. der Kunde im Portal selbst zieht (Preis für Menge X),
2. der Vertrieb intern für Anfragen/Angebote nutzt,
3. eine **Mengenstaffel** rechnet (mehrere Mengen auf einmal).

`→ ?` = hier brauche ich von dir eine Zahl / Entscheidung.

---

## 1. So rechnet die bestehende Excel (rekonstruiert)

Prozess-Kalkulation für **Offset**-Weiterverarbeitung. Je Prozess:

| Prozess (Excel-Zeile) | Minutensatz | Kostenstelle (Vorschlag) |
|---|---|---|
| Schneiden | 70 €/h `→ bestätigen` | 5xxx Schneidemaschine |
| Zusammentragen | 60 €/h | 5401 Collator — **entfällt bei Digitaldruck** |
| Binden (Wire-O) | 120 €/h | 5xxx Wire-O-Bindemaschine `→ welche?` |
| Zusatzleistungen | 40 €/h | `→ ?` |
| Verpacken | 40 €/h | 55xx Verpackung |

Rechenweg je Prozess:
```
Maschinenminuten = f(Auflage, Seiten, Papier, Nutzen …)      [aufgerundet]
Prozesskosten (Job) = Minuten × Minutensatz / 60
Kosten/Stück        = Prozesskosten / Auflage
VK/Stück            = Kosten/Stück × Marge-Faktor (1,15 = 15 %)
```
Summe VK/Stück über alle Prozesse = **Stückpreis**.

**Blockstärke** ≈ Σ(Seiten × Papier-g/m² × 1,1 / 1000) mm → bestimmt über die
Durchmesser-Tabelle **Teilung (2:1 / 3:1)**, **Wire-O-Durchmesser** und
**Loop-Preis pro 1000**.
**Loop-Anzahl** = Bindeseite / 12,7 (2:1) bzw. / 8,53 (3:1), minus Aufhängebügel×3.

**Fracht**: Gewicht des Auftrags → Zone (aus PLZ-Präfix) → Frachtstaffel Wackler.

### Was in der Excel fehlt / neu dazu kommt

- **Digitaldruck (Klick)** — das eigentliche Verfahren. `→` Klickpreis s/w & farbig,
  Klicks = Seiten × Auflage (× 2 bei 4/4?), Rüstklicks/Rüstzeit.
- **Papierpreis** — Excel kennt nur die Grammatur (für die Blockstärke),
  keinen Preis. `→` je Papiersorte: Preis (€/1000 Bogen **oder** €/kg), Format,
  Nutzen, Makulatur-%.
- **Offset als Fremdbeschaffung** — Zukaufpreis als eigene Position
  (Kostenstelle 2003 FL Offsetdruck / 2006 FL Digitaldruck).
- **Aufhänger** (Wandkalender) — Preis pro 1000 Stück (SPRINTIS-Artikel),
  Montagezeit.
- **Rüstzeiten** je Prozess separat (heute in den Formeln versteckt) — treibt die
  Staffel: kleine Menge = hoher Stückpreis.

---

## 2. Produkttypen

Grobe Unterscheidung (deine Vorgabe):

| Typ | Merkmal |
|---|---|
| **Wandkalender** | Wire-O **mit Aufhänger** |
| übrige (Tisch, Notizbuch, Präsentation, …) | Wire-O **ohne Aufhänger** |

`→` Reicht diese Zweiteilung fürs erste, oder brauchen die anderen Typen je
eigene Standardwerte (Format, Papier, Verpackung)?

---

## 3. Datenmodell (Vorschlag)

### Stammdaten (Admin-pflegbar)

- **`work_center`** (Prozess-/Maschinenstelle): name, cost_center, `rate_per_hour`,
  `setup_minutes`, aktiv. — Quelle: `costcenter`-CSV + eure Stundensätze `→`
- **`wire_binding`** (aus der Durchmesser-CSV + Blatt „Wire O Berechnung"):
  block_thk_min, block_thk_max, teilung (2:1/3:1), durchmesser_zoll,
  durchmesser_mm, loops_pro_spule, preis_pro_spule, **preis_pro_1000_loops**.
- **`paper`**: name, grammatur, format (z. B. 63×88), nutzen, `preis_pro_1000_bogen`,
  makulatur_pct. `→ Liste eurer Papiere`
- **`hanger`** (Aufhänger): name, `preis_pro_1000`, montagezeit_sec_pro_stk.
  `→ aus den SPRINTIS-Artikeln`
- **`freight_zone`** (Wackler): plz2 → zone; **`freight_rate`**: kg_von, kg_bis,
  zone → preis. — direkt aus dem Excel-Blatt „Frachtabelle Wackler".
- **`click_price`**: verfahren (sw/farbe), preis_pro_klick, rüstklicks. `→`
- **`setting` `wire_o.margin_default`** = 1,15 `→ bestätigen / je Prozess?`

### Produkt / Kalkulation

- **`calc_product`**: typ (wandkalender/…), name, default-Werte (Format,
  Standard-Papier, Verpackungseinheit …).
- **`calc_request`** (eine Anfrage/Angebot/Portal-Abfrage): kunde (optional),
  produkt, Eingaben (Bindeseite mm, Länge mm, Auflage/Mengen, PLZ, Aufhänger j/n,
  Optionen), Verfahren (digital/offset-fremd).
- **`calc_component`**: pro Bestandteil (Deckblatt, Faltblatt, Inhalt, Register,
  Umschlag …) → seiten, papier, farbigkeit (4/4, 4/0 …).
- **`calc_result`**: je Menge → Positionen (Prozess/Material/Fracht mit Kosten),
  Kosten/Stück, VK/Stück, Gesamt. Nachvollziehbar gespeichert.

---

## 4. Mengenstaffel

Staffeln sind **kundenindividuell** + freie Stückzahlen. Also **keine festen
Stufen im System** — stattdessen:

- Anfrage nennt 1..n Mengen (frei), Engine rechnet jede.
- Optional: Standard-Staffel-Vorschlag (z. B. 100/250/500/1000) als Startwert.
- Portal: Kunde gibt eine Menge ein → ein Preis. „Ab X günstiger" als Hinweis.

`→` Willst du je Kunde eine **hinterlegte Staffel** (Preis eingefroren) oder
immer live gerechnet?

---

## 5. Bauabschnitte

1. **Stammdaten-Tabellen + Import** der 3 CSVs + Papier-/Klick-/Aufhänger-Liste
   von dir.
2. **Engine** (`packages/shared` o. `services`): reine Funktion
   `kalkuliere(request, menge) → result`. Deckungsgleich mit der Excel für
   einen Referenzfall (dein 500er-Beispiel muss aufs Cent passen).
3. **Interne UI** `/kalkulation`: Eingabemaske, Ergebnis + Staffel, „als Angebot".
4. **Portal-Ansicht**: reduzierte Eingabe, Preis, „Anfrage senden".

---

## Offene Punkte (Sammlung — bitte ergänzen)

- [ ] Stundensätze je Prozess/Maschine
- [ ] Digitaldruck: Klickpreise (s/w, farbig), Rüstung
- [ ] Papierliste mit Preisen + Formaten + Nutzen
- [ ] Aufhänger-Typen + Preise + Montagezeit
- [ ] weitere Optionen (Register, Veredelung, Deckblatt-Varianten, Eckenrundung,
      Cellophanierung, …)
- [ ] Marge: global 15 % oder je Prozess / je Produkt / je Kundengruppe?
- [ ] Ist die Blockstärke-Formel (g/m² × 1,1 / 1000) so korrekt, oder habt ihr
      echte Papier-Volumen (spez. Dicke)?
- [ ] gilt die Wackler-Frachttabelle noch (Stand?) und für alle Sendungen?
