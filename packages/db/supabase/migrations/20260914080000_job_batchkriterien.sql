-- ============================================================================
-- Batch-Kriterien direkt auf dem Arbeitsvorgang speichern statt nur im
-- zusammengesetzten batch.schluessel-String zu verstecken.
--
-- Bisher wurden z.B. "verfahren" und "aufhaenger" nur zur Laufzeit berechnet,
-- um den Batch-Schlüssel zu bauen, und dann verworfen - auf der Job-Zeile
-- selbst standen sie nicht. Ebenso fehlten bei Druck-Jobs die Wire-O-Werte
-- (durchmesser/teilung/schlaufen/spiralfarbe) des zugehörigen Bindevorgangs
-- desselben Auftrags, obwohl sie in dessen Druck-Batch-Schlüssel einfließen.
--
-- Grund: neue, frei definierbare Batch-Gruppierungen (mehrstufig, pro
-- Abteilung) sollen direkt auf echten Job-Spalten filtern/gruppieren können,
-- statt den Schlüssel-String zu parsen oder Werte erneut herzuleiten.
-- ============================================================================

alter table public.job
  add column if not exists verfahren  text,
  add column if not exists aufhaenger boolean not null default false;

comment on column public.job.verfahren is
  'Druckverfahren (digital/offset) - bisher nur im Batch-Schlüssel von Druck-Jobs.';
comment on column public.job.aufhaenger is
  'Kalenderaufhänger wird bei diesem Auftrag montiert (auftragsweite Eigenschaft, gilt für alle Job-Typen desselben Auftrags).';
