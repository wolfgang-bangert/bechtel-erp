# werk — Datenmodell

Dies ist das **Prüf-Dokument**. Lies es fokussiert auf die fünf teuren Bereiche
(siehe [architektur.md](architektur.md) §10). Feld­details sind billig zu ändern,
Entitäts-Zuschnitt und Beziehungen nicht.

Stand: 2026-08-28 · Slice 1 umgesetzt in
`packages/db/supabase/migrations/20260828120000_foundation.sql`

---

## Konventionen

| Thema | Regel |
|---|---|
| Primärschlüssel | `id uuid primary key default gen_random_uuid()` — Ausnahme: `app_user.id` = `auth.users.id`; `number_sequence.key` = Text |
| Zeitstempel | `created_at`, `updated_at` (`timestamptz`, Trigger); belegführend zusätzlich fachliches Datum (`invoice_date` …) |
| Geld | Beträge `numeric(14,2)`, Einzelpreise `numeric(14,4)`, `currency char(3) default 'EUR'`. Keine Fließkommazahlen. |
| Prozent | `numeric(6,3)` (z. B. `19.000`, `2.500`) |
| Status | `text` mit `check`-Liste **oder** Enum; belegführende Tabellen werden nie hart gelöscht → Status `cancelled` |
| Keyline | gespiegelte Tabellen: `keyline_id text unique`, `keyline_synced_at timestamptz`, `source text` (`keyline` \| `werk`) |
| Audit | Trigger `tg_audit` auf allen belegführenden/Stammdaten-Tabellen → `audit_log` |
| RLS | auf **jeder** Tabelle aktiv; Policies über `is_staff()`, `has_role()`, `customer_org_ids()` |
| Namen | Tabellen Singular, snake_case (`order_item`, nicht `orderItems`) |

Slice-Zuordnung je Modul steht in der Überschrift. „(Entwurf)" = wird im
jeweiligen Slice verfeinert, hier nur zur Gesamtsicht.

---

## Modul 1 — Plattform & Auth · Slice 1

### app_user
Profil zu `auth.users`. Eine Identität für Mitarbeiter **und** Kundenkontakte.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| kind | enum `app_user_kind` | `employee` \| `customer_contact` \| `system` |
| display_name | text | |
| email | citext | |
| is_active | bool | Login gesperrt wenn false |
| last_login_at | timestamptz | |

### user_role
Rollenzuweisung. Für `customer` an eine Organisation gebunden.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → app_user | |
| role | enum `app_role` | `admin`,`office`,`accounting`,`production`,`shipping`,`employee`,`customer`,`supplier` |
| organization_id | uuid → organization, null | gesetzt bei `role='customer'` bzw. `'supplier'` → begrenzt Sicht |

Rollen: `shipping` = Versand/Kommissionierung (Mitarbeiter, `is_staff`).
`supplier` = Lieferantenportal, auf eigene Organisation begrenzt (Slice 8),
analog zu `customer`.

Eindeutig je `(user_id, role, organization_id)`.

### audit_log
Vorher/Nachher-Protokoll, per Trigger befüllt.

| Feld | Typ | Notiz |
|---|---|---|
| id | bigint identity PK | |
| table_name | text | |
| row_id | text | |
| action | text | `insert` \| `update` \| `delete` |
| actor_user_id | uuid, null | `auth.uid()` zum Zeitpunkt |
| changed_at | timestamptz | |
| before / after | jsonb | vollständige Zeile |
| context | jsonb | optionaler Zusatz (Grund, Request-ID) |

### number_sequence
Lückenlose Nummernkreise. Funktion `next_number(key, date)` mit Zeilensperre.

| Feld | Typ | Notiz |
|---|---|---|
| key | text PK | `invoice`,`credit_note`,`quote`,`order`,`delivery_note`,`dunning`,`purchase_order`,`customer_number`,`supplier_number` |
| prefix / suffix | text | z. B. `RE-` |
| padding | int | Stellen mit führenden Nullen |
| period | text | `none` \| `year` (Jahres-Reset) |
| period_value | text | aktuelles Jahr |
| current_value | bigint | Zählerstand |

Startwerte Debitoren `10000` / Kreditoren `70000` (SKR03, 5-stellige Personenkonten).

### setting
Firmenweite Konfiguration als Key/Value.

| Feld | Typ | Notiz |
|---|---|---|
| key | text PK | z. B. `company.address`, `invoice.footer`, `bank.details`, `tax.default_rate` |
| value | jsonb | |
| scope | text | `company` (später ggf. Mandant) |

### external_sync_state
Fortschritt der Sync-Worker je **Fremdsystem** + Ressource (Keyline, Ninox,
Xano-Import).

| Feld | Typ | Notiz |
|---|---|---|
| system | text | `keyline` \| `ninox` \| `xano` — Teil des PK |
| resource | text | `organizations`,`sales_orders`,`customer_invoices`,… — Teil des PK |
| last_run_at | timestamptz | |
| last_cursor | text | „geändert seit" |
| last_status | text | `ok` \| `error` |
| error | text | |

### file
Zentrale Dateiablage (Verweis auf Supabase Storage).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| kind | text | `print_data`,`proof`,`incoming_document`,`invoice_pdf`,`invoice_xml`,`attachment`,`export` |
| storage_path | text | Pfad im Bucket |
| filename | text | |
| mime | text | |
| size_bytes | bigint | |
| organization_id | uuid → organization, null | für RLS-Scoping im Portal |
| uploaded_by | uuid → app_user, null | |
| created_at | timestamptz | |

Fachliche Zuordnung über nullable FKs auf der Zielseite (`proof.file_id`,
`invoice.pdf_file_id`, `incoming_document.file_id`) bzw. `attachment` (Modul 11).

---

## Modul 2 — Stammdaten · Slice 1

### organization
Kunde **und/oder** Lieferant — **eine** Tabelle. Kundenbestände liegen aktuell
verteilt in Keyline (Akzidenz), Ninox (Kalender-Vertrieb) und Xano (Altbestand
Firmen) und werden hier zusammengeführt (siehe `organization_external_ref` und
[architektur.md](architektur.md) §5a).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| relation | enum `org_relation` | `customer` \| `supplier` \| `both` |
| customer_segment | text, null | `akzidenz` \| `kalender` \| `mixed` — steuert u. a. die führende Quelle |
| name | text | Anzeigename |
| legal_name | text, null | abweichende Firmierung |
| customer_number | text, null, unique | Debitor (aus Keyline übernommen, sonst `next_number`) |
| supplier_number | text, null, unique | Kreditor (`next_number('supplier_number')`) |
| vat_id | text, null | USt-IdNr |
| vat_id_valid | bool, null | VIES-Ergebnis |
| vat_id_checked_at | timestamptz, null | |
| tax_country | text | ISO-2, Default `DE` |
| default_tax_treatment | enum `tax_treatment` | vorbelegt aus Land + USt-IdNr |
| payment_terms_id | uuid → payment_terms, null | |
| price_group_id | uuid → price_group, null | |
| dunning_enabled | bool | Mahnsperre wenn false |
| email / phone / website | text, null | |
| notes | text, null | |

### organization_external_ref
Verknüpft eine Organisation mit ihren Datensätzen in Fremdsystemen und hält fest,
welches System **führend** ist.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organization | |
| system | text | `keyline` \| `ninox` \| `xano` \| `werk` |
| external_id | text | ID im Fremdsystem; `(system, external_id)` eindeutig |
| is_authoritative | bool | höchstens **eine** führende Quelle je Organisation |
| synced_at | timestamptz, null | |

### address
Mehrere Adressen je Organisation.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organization | |
| kind | enum `address_kind` | `billing` \| `shipping` \| `general` |
| is_default | bool | je kind höchstens eine |
| line1 / line2 | text | |
| zip / city | text | |
| country | text | ISO-2 |

### contact
Ansprechpartner; wird zum Portal-Login, sobald `app_user_id` gesetzt ist.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organization | |
| app_user_id | uuid → app_user, null | Portalzugang |
| first_name / last_name | text | |
| email | citext | |
| phone | text, null | |
| position | text, null | |
| is_primary | bool | |
| keyline_id | text, null | |

### payment_terms

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| name | text | „14 Tage netto", „30 Tage / 2 % Skonto 10 Tage" |
| net_days | int | |
| discount_percent | numeric(6,3) | Skonto |
| discount_days | int | |

### price_group
Kundenpreisgruppe — globaler Rabatt auf Wire-O-Listenpreise (Feinsteuerung je
Produkt später).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| name | text | |
| discount_percent | numeric(6,3) | |
| notes | text, null | |

### employee

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| app_user_id | uuid → app_user, null | null = erfasst, aber kein Login |
| personnel_number | text unique | |
| first_name / last_name | text | |
| hire_date / leave_date | date, null | |
| weekly_hours | numeric(5,2) | Sollstunden/Woche |
| working_time_model_id | uuid → working_time_model, null | |
| vacation_entitlement_days | numeric(5,2) | Jahresanspruch (Basis) |
| cost_center_id | uuid → cost_center, null | |
| is_active | bool | |

### working_time_model
Sollzeit-Verteilung für Soll/Ist der Zeiterfassung.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| name | text | „Vollzeit 5 Tage", „Teilzeit Mo–Mi" |
| minutes_per_weekday | jsonb | `{ "mon":480, "tue":480, … }` |
| break_rule | jsonb | gesetzl. Pausen (ab 6 h → 30 min, ab 9 h → 45 min) |

### cost_center
Kostenstelle (für DATEV / Auswertung).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| number | text unique | |
| name | text | |
| is_active | bool | |

---

## Modul 3 — Buchhaltungs-Stammdaten · Slice 1

`ledger_account` und `tax_code` sind **voll benutzerverwaltbar** — im Admin-ERP
gibt es eine **Kontenverwaltung** (CRUD für Sachkonten, Steuerschlüssel,
Kostenstellen). Die mitgelieferten Einträge tragen `is_system = true`: umbenennbar
und deaktivierbar, aber nicht löschbar (DB-Trigger). Eigene Konten legt ihr frei an.

### ledger_account
Sachkonto SKR03. Erlös- und Aufwandskonten für Kontierung + DATEV.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| number | text unique | i. d. R. 4-stellig (SKR03); Länge konfigurierbar über `datev_settings` |
| name | text | |
| kind | text | `revenue` \| `expense` \| `asset` \| `liability` \| `other` |
| default_tax_code_id | uuid → tax_code, null | |
| is_system | bool | mitgeliefert, nicht löschbar |
| is_active | bool | |

Seed (Vorschlag, mit Steuerberater bestätigen): 8400 Erlöse 19 %, 8300 Erlöse 7 %,
8336 steuerfreie innergem. Lieferung, 8120 steuerfreie Umsätze Ausfuhr (Drittland),
8200 Erlöse; 3400 Wareneingang 19 % VSt, 4600 Werbekosten, 4900 sonstige betr.
Aufwendungen, 4930 Bürobedarf, 4980 Betriebsbedarf.

### tax_code
Steuerschlüssel: Satz + DATEV-BU-Schlüssel + Behandlung.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| code | text unique | `UST19`,`UST7`,`RC_EU`,`IGL_EU`,`AUSFUHR_CH`,`VST19`,`VST7` … |
| name | text | |
| rate | numeric(6,3) | `19.000`, `7.000`, `0.000` |
| treatment | enum `tax_treatment` | |
| datev_tax_key | text, null | BU-Schlüssel (vom Steuerberater) |
| direction | text | `output` (Erlös) \| `input` (Vorsteuer) |
| is_system | bool | mitgeliefert, nicht löschbar |

### datev_settings
Einmal-Konfiguration für den Export.

| Feld | Typ | Notiz |
|---|---|---|
| id | int PK = 1 | Singleton |
| berater_nr | text | DATEV-Beraternummer |
| mandanten_nr | text | Mandantennummer |
| skr | text | `03` |
| sachkonto_length | int | 4 |
| personenkonto_length | int | 5 |
| fiscal_year_start | text | `01-01` |

---

## Modul 4 — Wire-O-Shop & Kalkulation · Slice 5 (Entwurf)

### Wire-O-Optionsliste (bitte prüfen / ergänzen)

Diese Optionen werden je Produkt als `product_option` + `product_option_value`
gepflegt. Startvorschlag — **hier ergänzen, was fehlt:**

| Option (`key`) | Beispielwerte | wirkt auf Kalkulation |
|---|---|---|
| `format` | A4, A5, A3, DIN lang, quadratisch, individuell | Nutzen/Bogen |
| `orientation` | Hochformat, Querformat | Nutzen/Bogen |
| `inner_pages` | Seitenzahl Innenteil (Zahl) | Bogenanzahl, Wire-O-Durchmesser |
| `inner_paper` | 90 g, 120 g, 170 g gestrichen/ungestrichen … | Bogenpreis |
| `inner_print` | 4/4, 1/1, 4/0, gemischt | Klicks |
| `cover` | Karton 250–350 g, mit/ohne Kaschierung | Bogen + Kaschierung |
| `cover_print` | 4/0, 4/4 | Klicks |
| `lamination` | keine, matt, glänzend, Soft-Touch | pro Bogen |
| `back_cover` | Karton, Graupappe, transparent | Material |
| `wire_color` | schwarz, silber, weiß | Wire-O-Preis |
| `binding_edge` | lange Seite, kurze Seite | — |
| `calendar_header` | ohne, Kopfkarton (Wandkalender) | Material + Stanzen |
| `calendar_hanger` | ohne, Wire-O-Aufhänger, Öse/Nietöse | pro Stück |
| `punching` | ohne, Aufhängebohrung, Euroloch | pro Stück |
| `tabs` / `index` | ohne, Griffregister, Stanzregister (Anzahl) | Weiterverarbeitung |
| `perforation` | ohne, je Blatt, Abrisskante | Weiterverarbeitung |
| `corner_round` | ohne, Ecken rund | pro Stück/Bund |
| `first_last_sheet` | ohne, PP-Deckblatt vorn/hinten | Material |
| `shrink_wrap` / `packaging` | lose, einzeln folienverpackt, Bündel à … | Verpackung |
| `numbering` | ohne, fortlaufend nummeriert | Weiterverarbeitung |

### product
Wire-O-Produkt (Wandkalender, Tischkalender, Notizbuch, Handbuch …).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| sku | text unique | |
| name / description | text | |
| type | text | vorerst `wire_o` |
| cost_parameter_set_id | uuid → cost_parameter_set | aktiver Parametersatz |
| portal_visible | bool | im Portal/Shop wählbar |
| is_active | bool | |

### product_option
Konfigurierbare Eigenschaft.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| product_id | uuid → product | |
| key | text | siehe Wire-O-Optionsliste oben |
| label | text | |
| input_type | text | `select` \| `number` \| `bool` |
| sort | int | |

### product_option_value

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| product_option_id | uuid → product_option | |
| value | text | |
| label | text | |
| cost_modifier_type | text | `flat` \| `per_unit` \| `per_sheet` \| `none` |
| cost_modifier_value | numeric(14,4) | |
| sort | int | |

### cost_parameter_set
Rechenraten für das Kostenmodell (versioniert über `valid_from`).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| name | text | |
| valid_from | date | |
| click_price_color / click_price_bw | numeric(14,4) | je SRA3-Seite |
| setup_fee | numeric(14,2) | Rüstpauschale je Auftrag |
| binding_minutes_per_unit | numeric(8,3) | Wire-O binden je Stück |
| machine_rate_binding | numeric(14,2) | €/h Bindemaschine |
| lamination_price_per_sheet | numeric(14,4) | |
| cutting_fee | numeric(14,2) | |
| drilling_fee_per_unit | numeric(14,4) | Wandkalender-Bohrung |
| waste_sheets_setup | int | Makulatur Rüsten |
| waste_percent | numeric(6,3) | Fortdruck-Makulatur |
| margin_percent | numeric(6,3) | Aufschlag auf Selbstkosten |

### substrate
Bogen/Papier.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| name | text | |
| format | text | `SRA3`,… |
| grammage | int | g/m² |
| price_per_sheet | numeric(14,4) | |
| is_cover / is_inner | bool | Verwendbarkeit |
| material_id | uuid → material, null | Bestandskopplung |

### wire_binding
Wire-O-Kämme.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| diameter_mm | numeric(5,1) | |
| max_sheets | int | Blockstärke-Grenze |
| color | text | `black`,`silver`,`white` |
| price_per_unit | numeric(14,4) | |
| material_id | uuid → material, null | |

### calculation_run
Ein Kalkulationslauf → erzeugt/aktualisiert Zeilen in `price_matrix`.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| product_id | uuid → product | |
| cost_parameter_set_id | uuid → cost_parameter_set | |
| config | jsonb | fixierte Optionswerte |
| quantities | int[] | Staffelmengen |
| created_by | uuid → app_user | |
| note | text, null | |

### price_matrix
Materialisierte Preise — der Shop liest **nur** hier.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| product_id | uuid → product | |
| variant_hash | text | Hash der Optionskombination |
| config | jsonb | gewählte Optionen |
| quantity | int | Staffelmenge |
| calculated_price | numeric(14,2) | aus Kostenmodell |
| override_price | numeric(14,2), null | manuell |
| effective_price | numeric(14,2) | generiert: `coalesce(override, calculated)` |
| valid_from | date | |
| source | text | `calc` \| `manual` |

Eindeutig je `(product_id, variant_hash, quantity, valid_from)`.

---

## Modul 5 — Vertrieb · Slice 5/6 (Entwurf)

### quote
Angebot. Shop-Angebote entstehen in werk; Keyline-Angebote (Entwurfs-Orders)
werden hierher gespiegelt.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| quote_number | text unique | `next_number('quote')` |
| organization_id | uuid → organization | |
| contact_id | uuid → contact, null | |
| status | text | `draft`,`sent`,`accepted`,`declined`,`expired` |
| valid_until | date | |
| currency | char(3) | `EUR` |
| net_total / tax_total / gross_total | numeric(14,2) | Cache |
| notes | text, null | |
| source | text | `werk` \| `keyline` |
| keyline_id | text, null | |

### quote_item

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| quote_id | uuid → quote | |
| position | int | |
| product_id | uuid → product, null | null bei Freitext/Keyline |
| description | text | |
| config | jsonb, null | Wire-O-Konfiguration |
| quantity | numeric(14,3) | |
| unit_price | numeric(14,4) | |
| discount_percent | numeric(6,3) | |
| tax_code_id | uuid → tax_code | |
| line_net / line_tax / line_gross | numeric(14,2) | |

### order
Auftrag. `type` unterscheidet Herkunft.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| order_number | text unique | `next_number('order')` |
| type | text | `shop` \| `keyline` \| `manual` |
| organization_id | uuid → organization | |
| contact_id | uuid → contact, null | |
| quote_id | uuid → quote, null | Herkunft |
| status | text | `open`,`in_production`,`delivered`,`invoiced`,`closed`,`cancelled` |
| currency | char(3) | |
| requested_delivery_date | date, null | |
| billing_address_id / shipping_address_id | uuid → address, null | |
| price_group_id | uuid → price_group, null | |
| net_total / tax_total / gross_total | numeric(14,2) | Cache |
| notes | text, null | |
| source | text | `werk` \| `keyline` |
| keyline_id | text, null | |

### order_item
Analog `quote_item`, zusätzlich `keyline_id`, `delivered_quantity`,
`invoiced_quantity`.

### proof
Freigabe im Portal.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| order_id | uuid → order | |
| order_item_id | uuid → order_item, null | |
| file_id | uuid → file | Proof-PDF |
| status | text | `pending`,`approved`,`rejected` |
| decided_by_contact_id | uuid → contact, null | |
| decided_at | timestamptz, null | |
| comment | text, null | |

---

## Modul 6 — Produktion · Slice 8 (Entwurf)

### production_job

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| order_id | uuid → order | |
| barcode | text unique | Scan in der App |
| type | text | `wire_o` \| `keyline` |
| current_stage | text | siehe unten |
| due_date | date, null | |
| keyline_id | text, null | Statusspiegel bei Keyline-Jobs |

### production_stage_event
Statuskette Wire-O: `prepress` → `print` → `laminate` → `cut` → `drill` →
`wire_o` → `pack` → `ship`.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| production_job_id | uuid → production_job | |
| stage | text | |
| status | text | `pending`,`in_progress`,`done` |
| started_at / finished_at | timestamptz, null | |
| employee_id | uuid → employee, null | |
| note | text, null | |

---

## Modul 7 — Fakturierung & Offene Posten · Slice 3 (Entwurf)

### invoice
**werk führend für alle Kundenrechnungen.** Nummer erst bei Festschreibung,
danach unveränderlich.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| invoice_number | text unique, null | `next_number('invoice')` bei Festschreibung |
| type | text | `invoice`,`partial`(Abschlag),`final`(Schluss),`collective`(Sammel),`credit_note` |
| status | text | `draft`,`finalized`,`sent`,`partly_paid`,`paid`,`cancelled` |
| organization_id | uuid → organization | |
| contact_id | uuid → contact, null | |
| billing_address_snapshot | jsonb | eingefroren |
| payment_terms_snapshot | jsonb | eingefroren |
| tax_treatment | enum `tax_treatment` | |
| currency | char(3) | `EUR` |
| invoice_date | date | |
| service_date | date, null | Leistungsdatum |
| service_period_start / _end | date, null | bei Sammelrechnung |
| due_date | date | |
| net_total / tax_total / gross_total | numeric(14,2) | |
| paid_total | numeric(14,2) | aus `payment_allocation` |
| open_amount | numeric(14,2) | generiert: `gross_total - paid_total` |
| rounding | numeric(14,2) | |
| footer_text | text, null | |
| einvoice_format | text, null | `zugferd` \| `xrechnung` |
| pdf_file_id / xml_file_id | uuid → file, null | |
| corrects_invoice_id | uuid → invoice, null | Storno-Bezug |
| canceled_by_invoice_id | uuid → invoice, null | |
| finalized_at / finalized_by | | Festschreibung |
| source | text | `werk` \| `keyline` |
| keyline_id | text, null | gespiegelte Keyline-Rechnung (nicht neu erzeugt) |

### invoice_item

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| invoice_id | uuid → invoice | |
| position | int | |
| order_item_id | uuid → order_item, null | |
| description | text | |
| quantity | numeric(14,3) | |
| unit_price | numeric(14,4) | |
| discount_percent | numeric(6,3) | |
| tax_code_id | uuid → tax_code | |
| ledger_account_id | uuid → ledger_account | Erlöskonto |
| cost_center_id | uuid → cost_center, null | |
| net_amount / tax_amount / gross_amount | numeric(14,2) | |

### invoice_order_link
Sammelrechnung: mehrere Aufträge → eine Rechnung.

| invoice_id | uuid → invoice |
| order_id | uuid → order |
| PK (invoice_id, order_id) |

### advance_invoice_link
Schlussrechnung zieht Abschlagsrechnungen ab.

| final_invoice_id | uuid → invoice |
| advance_invoice_id | uuid → invoice |
| deducted_net / deducted_tax | numeric(14,2) |

### payment
Zahlungen — Ein- und Ausgang.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| direction | text | `in` (Kunde zahlt) \| `out` (wir zahlen Lieferant) |
| organization_id | uuid → organization | |
| date | date | |
| amount | numeric(14,2) | |
| method | text | `bank`,`cash`,`card`,`paypal` |
| reference | text, null | Verwendungszweck |
| bank_transaction_id | uuid → bank_transaction, null | |
| unapplied_amount | numeric(14,2) | generiert: `amount - Summe(allocations)` |

### payment_allocation
Teilzuordnung Zahlung ↔ Beleg (n:m).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| payment_id | uuid → payment | |
| invoice_id | uuid → invoice, null | bei `direction='in'` |
| incoming_document_id | uuid → incoming_document, null | bei `direction='out'` |
| amount | numeric(14,2) | |

Genau eines von `invoice_id` / `incoming_document_id` gesetzt.

### bank_transaction
Import aus CAMT/MT940/CSV.

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| import_batch | text | |
| booking_date / value_date | date | |
| amount | numeric(14,2) | Vorzeichen = Richtung |
| currency | char(3) | |
| counterparty_name / counterparty_iban | text, null | |
| purpose | text, null | |
| raw | jsonb | Originalzeile |
| matched_payment_id | uuid → payment, null | |

### dunning_run / dunning_notice / dunning_level_config

| dunning_run | id, created_at, created_by |
| dunning_notice | id, dunning_run_id, organization_id, level (1–3), invoice_ids uuid[], fee, interest, total_due, pdf_file_id, status (`created`,`sent`), sent_at |
| dunning_level_config | level PK, min_days_overdue, fee, interest_percent, text_template |

---

## Modul 8 — Vorbereitende Buchhaltung · Slice 4 (Entwurf)

### incoming_document
Eingangsbeleg (Lieferantenrechnung, Kassenbon, Bewirtung, Fahrtkosten).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| doc_type | text | `invoice`,`receipt`,`credit_note` |
| supplier_organization_id | uuid → organization, null | null bis erkannt |
| doc_number | text, null | Belegnummer des Lieferanten |
| doc_date | date, null | |
| net_amount / tax_amount / gross_amount | numeric(14,2) | |
| currency | char(3) | |
| tax_code_id | uuid → tax_code, null | Vorsteuer-Schlüssel |
| ledger_account_id | uuid → ledger_account, null | Aufwandskonto |
| cost_center_id | uuid → cost_center, null | |
| purchase_order_id | uuid → purchase_order, null | Kopplung Einkauf |
| due_date | date, null | |
| payment_status | text | `open`,`paid` |
| paid_at | date, null | |
| file_id | uuid → file | Scan |
| ocr_raw | jsonb, null | Roh-OCR |
| ocr_confidence | numeric(5,2), null | |
| status | text | `captured`,`reviewed`,`booked`,`exported` |
| captured_by / reviewed_by | uuid → app_user, null | |
| notes | text, null | |

### datev_export
Protokoll jedes an den Steuerberater übergebenen Exports (unveränderlich).

| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| kind | text | `buchungsstapel`,`debitoren`,`kreditoren`,`sachkonten` |
| format | text | `EXTF` |
| period_start / period_end | date | |
| file_id | uuid → file | erzeugte CSV |
| row_count | int | |
| file_hash | text | SHA-256 |
| created_at / created_by | | |

### datev_export_line
Nachvollziehbarkeit: welche Quelle steckt in welchem Export.

| export_id | uuid → datev_export |
| source_table | text |
| source_id | uuid |

---

## Modul 9 — Einkauf & Material · Slice 8 (Entwurf)

| Tabelle | Kernfelder |
|---|---|
| purchase_order | id, po_number (`next_number`), supplier_organization_id, status (`draft`,`ordered`,`partly_received`,`received`,`closed`), order_date, expected_date, currency, related_order_id (auftragsbezogen, null), created_by |
| purchase_order_item | id, purchase_order_id, position, material_id (null), description, quantity, unit, unit_price, tax_code_id, received_quantity |
| goods_receipt | id, purchase_order_id, date, received_by, note |
| goods_receipt_item | id, goods_receipt_id, purchase_order_item_id, quantity, batch, note |
| material | id, sku, name, category (`substrate`,`wire`,`consumable`,`other`), unit, stock_tracked, min_stock, default_supplier_id, last_price |
| stock_movement | id, material_id, quantity (+/−), reason (`receipt`,`consumption`,`correction`,`inventory`), reference_table, reference_id, at, by — Bestand = Summe(quantity) |

---

## Modul 10 — Zeiterfassung (gesetzlich) · Slice 7 (Entwurf)

| Tabelle | Kernfelder |
|---|---|
| time_entry | id, employee_id, work_date, clock_in timestamptz, clock_out timestamptz null, source (`app`,`terminal`,`manual`), device_id, note |
| break_entry | id, time_entry_id, start_at, end_at |
| time_correction | id, time_entry_id, field, old_value, new_value, reason, requested_by, approved_by, at — **Original bleibt, Korrektur wird angehängt** |
| time_day_summary | id, employee_id, date, target_minutes, worked_minutes, break_minutes, balance_minutes, status (`open`,`closed`,`corrected`) |
| absence | id, employee_id, type (`vacation`,`sick`,`special`,`unpaid`,`overtime_comp`), start_date, end_date, half_day_start bool, half_day_end bool, days numeric, status (`requested`,`approved`,`rejected`,`cancelled`), decided_by, decided_at, note |
| vacation_account | id, employee_id, year, entitlement_days, carried_over_days, taken_days (Summe aus absence), remaining_days (generiert) |
| work_time_account | id, employee_id, period (`YYYY-MM`), balance_minutes — Gleitzeitsaldo |

Revisionssicher: kein Hard-Delete; `time_entry` nach Tagesabschluss nur über
`time_correction` änderbar; alles im `audit_log`.

---

## Modul 11 — Portal & Kommunikation · Slice 6 (Entwurf)

| Tabelle | Kernfelder |
|---|---|
| portal_invitation | id, organization_id, contact_id, email, token, expires_at, accepted_at |
| message | id, thread_type (`order`,`quote`,`proof`), thread_id, sender_user_id, body, created_at, visible_to_customer bool |
| attachment | id, owner_table, owner_id, file_id — generische Datei-Verknüpfung |

RLS Portal: `organization_id in (select customer_org_ids())` auf `order`, `quote`,
`invoice`, `file`, `proof`, `message`.

---

## Source-of-Truth-Matrix

Siehe [architektur.md](architektur.md) §5.

---

## Offene Punkte (bitte bei der Prüfung entscheiden)

Erledigt aus der ersten Runde: Rechnungsnummer `RE-2026-00001` ✓ · eine
`organization`-Tabelle ✓ · Debitorennummer aus Keyline übernehmen ✓ · Rollen
`shipping` + `supplier` ergänzt ✓ · Kontenverwaltung (`is_system`) ✓ · Kalenderkunden
= Ninox-Hoheit ✓.

Noch offen:

1. **Stammdaten-Konsolidierung** (siehe [architektur.md](architektur.md) §5a):
   Wie identifizieren wir Dubletten zwischen Keyline / Ninox / Xano — über
   USt-IdNr, sonst Name + PLZ? Gibt es eine „Leit"-Liste, die gewinnt?
2. **Sammelrechnung-Rhythmus:** monatlich fix, oder pro Kunde konfigurierbar?
3. **Abschlagsrechnung:** mit oder ohne Bezug zu konkreten `order_item`s
   (anteilige vs. freie Beträge)?
4. **Zeiterfassung-Erfassungsweg:** nur Mitarbeiter-App, oder auch ein festes
   Terminal (Tablet) in der Produktion?
5. **Wire-O-Optionsliste** (oben in Modul 4): vollständig? Was fehlt?
6. **Versand:** eigener Lieferschein-Nummernkreis vorhanden (`delivery_note` →
   `LS-`). Braucht der Versand mehr als Lieferschein + Versandlabel + Tracking —
   z. B. Teillieferungen, Packstücke, Sammelversand?
