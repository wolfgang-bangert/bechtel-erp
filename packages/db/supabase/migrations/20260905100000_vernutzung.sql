-- ============================================================================
-- Formate + Druckbögen + Vernutzung (Nutzen je Endformat auf einem Bogen).
-- Allgemein (Kalkulation, Batching, Produktionsauftrag), nicht portalspezifisch.
-- ============================================================================

create table public.format (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,          -- A4, A4_halb, A5_quadrat, 85x55
  name       text not null,
  breite_mm  numeric(8,1),
  hoehe_mm   numeric(8,1),
  kategorie  text not null default 'din' check (kategorie in ('din', 'quadrat', 'sonder')),
  is_active  boolean not null default true,
  notiz      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.druckbogen (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,         -- SRA3, SRA3plus, SRA2 …
  name        text not null,
  breite_mm   numeric(8,1) not null,
  hoehe_mm    numeric(8,1) not null,
  greifer_mm  numeric(6,1) not null default 0,   -- nutzbare Höhe = hoehe_mm - greifer_mm
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  notiz       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.vernutzung (
  id            uuid primary key default gen_random_uuid(),
  format_id     uuid not null references public.format (id) on delete cascade,
  druckbogen_id uuid not null references public.druckbogen (id) on delete cascade,
  nutzen        integer not null default 1,
  anordnung     text,                         -- "2×1", "4×2"
  gedreht       boolean not null default false,
  randzugabe_mm numeric(6,1) not null default 4,
  ist_standard  boolean not null default false,
  quelle        text not null default 'manuell' check (quelle in ('berechnet', 'manuell')),
  notiz         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (format_id, druckbogen_id)
);
create index vernutzung_format_idx on public.vernutzung (format_id);

do $$
declare t text;
begin
  foreach t in array array['format', 'druckbogen', 'vernutzung'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','production']::app_role[]))
        with check (public.has_any_role(array['admin','office','production']::app_role[]));
    $f$, t);
  end loop;
end $$;

-- Endformate (DIN exakt; halb/Quadrat/Sonder-Maße bitte prüfen/ergänzen)
insert into public.format (code, name, breite_mm, hoehe_mm, kategorie) values
  ('A2',        'DIN A2',        420, 594, 'din'),
  ('A3',        'DIN A3',        297, 420, 'din'),
  ('A4',        'DIN A4',        210, 297, 'din'),
  ('A5',        'DIN A5',        148, 210, 'din'),
  ('A6',        'DIN A6',        105, 148, 'din'),
  ('DL',        'DIN lang (DL)',  99, 210, 'din'),
  ('A3_halb',   'A3 halb',       297, 145, 'sonder'),
  ('A4_halb',   'A4 halb',       210, 100, 'sonder'),
  ('A3_quadrat','A3-Quadrat',    297, 297, 'quadrat'),
  ('A4_quadrat','A4-Quadrat',    210, 210, 'quadrat'),
  ('A5_quadrat','A5-Quadrat',    148, 148, 'quadrat'),
  ('40x40',     '40 × 40 cm',    400, 400, 'sonder'),
  ('85x55',     '8,5 × 5,5 cm',   85,  55, 'sonder')
on conflict (code) do nothing;

-- Druckbögen (Standardmaße; SRA3 als Vorgabe)
insert into public.druckbogen (code, name, breite_mm, hoehe_mm, is_default) values
  ('SRA3',      'SRA3 (320 × 450)',       320, 450, true),
  ('SRA3plus',  'SRA3+ (330 × 487)',      330, 487, false),
  ('SRA2',      'SRA2 (450 × 640)',       450, 640, false),
  ('B2',        'B2 (500 × 707)',         500, 707, false),
  ('70x100',    '70 × 100 cm',            700,1000, false)
on conflict (code) do nothing;
