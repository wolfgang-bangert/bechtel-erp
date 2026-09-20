-- ============================================================================
-- flux-Webhook-Events: Katalog aller Events, die sich in flux als Webhook
-- aktivieren lassen (aus der flux-UI abgeschrieben, flux hat keine API dafür).
-- Reine Verwaltungs-/Dokumentationstabelle:
--   - aktiv_in_flux  pflegt der Nutzer manuell (Abgleich mit dem, was er in
--                    flux tatsächlich angeschaltet hat)
--   - opri_bezug     ob das Event sich einem opri-Auftrag zuordnen lässt
--                    (Auftragsposten/Arbeitsschritte/Farbdeckung/Druckauftrag-
--                    Status) oder reine Drucker-/Stammdaten-Änderung ist
--   - status_optionen nur beim einzigen Event mit Unteroptionen
--                    ("Druckauftrag: Status geändert")
--   - verarbeitet_in_werk beschreibt, ob/wie werk das Event schon auswertet
--                    (aktuell nur der Status-Webhook, siehe
--                    /api/flux/webhook + setting.flux_status_map)
-- ============================================================================

create table public.flux_webhook_event (
  id                   uuid primary key default gen_random_uuid(),
  key                  text not null unique,
  label                text not null,
  gruppe               text not null check (gruppe in ('auftrag', 'drucker', 'stammdaten')),
  opri_bezug           boolean not null default false,
  status_optionen      text[] not null default '{}',
  aktiv_in_flux        boolean not null default false,
  verarbeitet_in_werk  text,
  notiz                text,
  sortierung           integer not null default 100,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

do $$
begin
  perform public.attach_standard_triggers('public.flux_webhook_event'::regclass);
  alter table public.flux_webhook_event enable row level security;
  create policy flux_webhook_event_read on public.flux_webhook_event for select using (public.is_staff());
  create policy flux_webhook_event_write on public.flux_webhook_event for all
    using (public.has_any_role(array['admin','office','production']::app_role[]))
    with check (public.has_any_role(array['admin','office','production']::app_role[]));
end $$;

-- ---------------------------------------------------------------- Katalog (Stand flux-UI 2026-09)
insert into public.flux_webhook_event
  (key, label, gruppe, opri_bezug, status_optionen, aktiv_in_flux, verarbeitet_in_werk, sortierung)
values
  ('auftragsposten_uebertragen', 'Auftragsposten: Auftrag wurde übertragen', 'auftrag', true, '{}', false, null, 10),
  ('arbeitsschritte_status_geaendert', 'Arbeitsschritte: Status geändert', 'auftrag', true, '{}', false, null, 20),
  ('farbdeckung_erstellt', 'Farbdeckung: Erstellt', 'auftrag', true, '{}', false, null, 30),
  ('druckauftrag_status_geaendert', 'Druckauftrag: Status geändert', 'auftrag', true,
    array[
      'Gedruckt', 'Drucken wird vorbereitet', 'Warte auf Drucker', 'Druckt', 'Druckerwarnung',
      'Fehler beim Drucken', 'Laufender Prozess', 'Druck geplant', 'Abgebrochen',
      'Testdruck gedruckt', 'Fehldruck', 'Fehlerhaft', 'Drucken pausiert', 'Drucker ist offline',
      'Unbekannt', 'Druckerfehler'
    ],
    true,
    'Wird verarbeitet: aktualisiert portal_order.flux_status/flux_work_step und (über setting.flux_status_map) den Job-Status - siehe /api/flux/webhook.',
    40),
  ('drucker_status_geaendert', 'Drucker: Status geändert', 'drucker', false, '{}', false, null, 50),
  ('drucker_geaendert', 'Drucker: Geändert', 'drucker', false, '{}', false, null, 60),
  ('drucker_cluster_geaendert', 'Drucker-Cluster: Geändert', 'drucker', false, '{}', false, null, 70),
  ('produkte_geaendert', 'Produkte: Geändert', 'stammdaten', false, '{}', false, null, 80),
  ('dienste_geaendert', 'Dienste: Geändert', 'stammdaten', false, '{}', false, null, 90),
  ('papiersorten_geaendert', 'Papiersorten: Geändert', 'stammdaten', false, '{}', false, null, 100),
  ('rollenstandbogen_geaendert', 'Rollenstandbogen: Geändert', 'stammdaten', false, '{}', false, null, 110),
  ('standbogen_geaendert', 'Standbogen: Geändert', 'stammdaten', false, '{}', false, null, 120)
on conflict (key) do nothing;
