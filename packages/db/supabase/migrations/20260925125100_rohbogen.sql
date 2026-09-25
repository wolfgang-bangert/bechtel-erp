-- ============================================================================
-- Rohbögen: die vom Lieferanten gekauften, ungeschnittenen Bogenformate
-- (z.B. 63x88cm), aus denen Druckbögen (public.druckbogen) geschnitten werden.
-- Gleiches Muster wie format/druckbogen (20260905100000_vernutzung.sql).
--
-- material_bezug bekommt zusätzlich rohbogen_id/druckbogen_id, um statt
-- Freitext auf diesen Katalog zu verweisen (bestehende format-Spalte bleibt
-- als Altlast/Fallback erhalten, additiv).
-- ============================================================================

create table public.rohbogen (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,          -- 63x88, 65x92, 70x100
  name       text not null,
  breite_mm  numeric(8,1) not null,
  hoehe_mm   numeric(8,1) not null,
  is_active  boolean not null default true,
  notiz      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  perform public.attach_standard_triggers('public.rohbogen'::regclass);
  alter table public.rohbogen enable row level security;
  create policy rohbogen_read on public.rohbogen for select using (public.is_staff());
  create policy rohbogen_write on public.rohbogen for all
    using (public.has_any_role(array['admin','office','production']::app_role[]))
    with check (public.has_any_role(array['admin','office','production']::app_role[]));
end $$;

insert into public.rohbogen (code, name, breite_mm, hoehe_mm) values
  ('63x88',  '63 × 88 cm',  630,  880),
  ('65x92',  '65 × 92 cm',  650,  920),
  ('70x100', '70 × 100 cm', 700, 1000)
on conflict (code) do nothing;

alter table public.material_bezug
  add column if not exists rohbogen_id   uuid references public.rohbogen  (id) on delete set null,
  add column if not exists druckbogen_id uuid references public.druckbogen(id) on delete set null;
