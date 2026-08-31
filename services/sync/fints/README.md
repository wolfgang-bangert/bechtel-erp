# FinTS-Anbindung (Kontoauszüge + später Überweisungen)

Direkter Bankzugang per FinTS 3.0 (PIN/TAN), kein Drittanbieter.

## Einrichtung (einmalig)

```bash
cd services/sync
python3 -m venv .fints-venv
.fints-venv/bin/pip install -r fints/requirements.txt
```

Banken in `imports/fints.txt` (gitignored), eine Zeile pro Bank:

```
kuerzel ; IBAN ; TAN-Verfahren (optional) ; Anmeldename ; FinTS-URL
```

PIN je Bank in der Repo-`.env`: `FINTS_PIN_<KUERZEL>` (Kürzel in GROSSBUCHSTABEN).

## Benutzung

```bash
pnpm --filter sync fints:setup --bank=ksk      # einmalig: TAN-Verfahren wählen, Zugang testen
pnpm --filter sync fints:pull  --bank=ksk --days=30   # Umsätze holen -> bank_transaction -> Abgleich
pnpm --filter sync fints:pull                   # alle Banken
```

`fints:pull` schreibt in denselben Pfad wie `bank:import` (Dedup über `dedup_key`)
und ruft danach `bank:match`. Der Verbindungs-Status je Bank liegt in
`imports/fints-state.<kuerzel>.b64` (gitignored).

## Hinweise

- **Produkt-Registrierung:** Für Dauerbetrieb eine FinTS-Produkt-ID bei der
  Deutschen Kreditwirtschaft registrieren (kostenlos) und als
  `FINTS_PRODUCT_ID` in `.env` setzen. Ohne läuft es meist, einige Banken
  drosseln aber.
- **TAN:** Umsatzabruf ist bei den meisten Banken TAN-frei. Überweisungen
  brauchen immer eine TAN (kommt in einem späteren Schritt).
- Wenn parallel CAMT-Dateien importiert werden, entstehen ggf. doppelte
  Buchungen (anderer `dedup_key`) — nach dem Umstieg keine Dateien mehr laden.
