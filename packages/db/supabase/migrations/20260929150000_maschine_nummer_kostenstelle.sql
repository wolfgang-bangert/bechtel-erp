-- ============================================================================
-- Maschine: interne Maschinen-/Gerätenummer + optionale Verknüpfung zu einer
-- Kostenstelle (mehrere Maschinen/Geräte dürfen sich eine Kostenstelle
-- teilen - nicht jedes Gerät braucht eine eigene, siehe Kostenstellenplan).
-- ============================================================================

alter table public.maschine
  add column if not exists nummer          text,
  add column if not exists cost_center_id  uuid references public.cost_center (id) on delete set null;

create unique index if not exists maschine_nummer_uidx
  on public.maschine (nummer) where nummer is not null;
