-- Abweichender Abrechnungsbetrag je Auftrag (z.B. Teil-Reklamation).
-- null = Listenpreis (bzw. 0 bei Rekla/nicht berechnet). Die Begründung steht in rekla_vermerk.
alter table public.portal_order
  add column if not exists betrag_abweichend numeric(14,2);
