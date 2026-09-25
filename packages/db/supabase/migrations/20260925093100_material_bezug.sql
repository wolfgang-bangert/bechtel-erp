-- ============================================================================
-- Material-Bezugsquellen (gelagertes/geliefertes Material) + Umbuchen.
--
-- `material` bleibt die abstrakte Bedarfs-Ebene (Grammatur/Sorte, vom
-- opri-Resolver berechnet). `material_bezug` ist die konkrete, kaufmännische
-- Ebene: ein Material kann mehrere Bezugsquellen haben (Lieferant, Format,
-- Lagerort, Bestand) - z.B. Rohbogen 63x88cm von Berberich ("Juwel Offset")
-- im Rohbogenlager, daraus geschnitten (Nutzen) Druckbogen im Druckbogenlager.
-- Umbuchen (Rohbogen -> Druckbogen) ist eine bewusste Aktion, kein
-- Automatismus - Schneiden ist ein realer Vorgang zu einem Zeitpunkt.
-- ============================================================================

create table public.material_bezug (
  id                uuid primary key default gen_random_uuid(),
  material_id       uuid not null references public.material (id) on delete cascade,
  lieferant_org_id  uuid references public.organization (id) on delete set null,
  bezeichnung       text not null,          -- Lieferanten-Produktname, z.B. "Juwel Offset"
  format            text,                   -- z.B. "63 x 88 cm"
  lagerort          text,                   -- Freitext, z.B. "Rohbogenlager"
  einheit           text not null default 'Bogen',
  bestand           numeric(14,3) not null default 0,
  mindestbestand    numeric(14,3),
  einkaufspreis     numeric(12,4),
  quelle_bezug_id   uuid references public.material_bezug (id) on delete set null,
  nutzen            integer,                -- Ausbringung je Einheit der Quelle (z.B. 4)
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index material_bezug_material_idx on public.material_bezug (material_id);
create index material_bezug_quelle_idx on public.material_bezug (quelle_bezug_id);

create table public.material_umbuchung (
  id               uuid primary key default gen_random_uuid(),
  quelle_bezug_id  uuid not null references public.material_bezug (id) on delete restrict,
  ziel_bezug_id    uuid not null references public.material_bezug (id) on delete restrict,
  quelle_menge     numeric(14,3) not null,
  ziel_menge       numeric(14,3) not null,
  nutzen_verwendet integer,
  erstellt_von     uuid references auth.users (id),
  erstellt_am      timestamptz not null default now()
);

-- Atomar: Quelle abbuchen, Ziel zubuchen, Bewegung protokollieren.
create or replace function public.material_umbuchen(
  p_quelle_id uuid,
  p_ziel_id   uuid,
  p_menge     numeric
) returns public.material_umbuchung
language plpgsql
as $$
declare
  v_quelle public.material_bezug;
  v_ziel   public.material_bezug;
  v_ziel_menge numeric;
  v_log    public.material_umbuchung;
begin
  if p_menge <= 0 then raise exception 'Menge muss positiv sein.'; end if;

  select * into v_quelle from public.material_bezug where id = p_quelle_id for update;
  if not found then raise exception 'Quelle nicht gefunden.'; end if;

  select * into v_ziel from public.material_bezug where id = p_ziel_id for update;
  if not found then raise exception 'Ziel nicht gefunden.'; end if;
  if v_ziel.quelle_bezug_id is distinct from v_quelle.id then
    raise exception 'Ziel wird nicht aus dieser Quelle geschnitten.';
  end if;
  if v_quelle.bestand < p_menge then
    raise exception 'Nicht genug Bestand (% vorhanden, % angefordert).', v_quelle.bestand, p_menge;
  end if;

  v_ziel_menge := p_menge * coalesce(v_ziel.nutzen, 1);

  update public.material_bezug set bestand = bestand - p_menge, updated_at = now() where id = v_quelle.id;
  update public.material_bezug set bestand = bestand + v_ziel_menge, updated_at = now() where id = v_ziel.id;

  insert into public.material_umbuchung
    (quelle_bezug_id, ziel_bezug_id, quelle_menge, ziel_menge, nutzen_verwendet, erstellt_von)
  values (v_quelle.id, v_ziel.id, p_menge, v_ziel_menge, v_ziel.nutzen, auth.uid())
  returning * into v_log;

  return v_log;
end;
$$;

-- ---------------------------------------------------------------- Trigger + RLS
do $$
declare t text;
begin
  foreach t in array array['material_bezug'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
  end loop;
  foreach t in array array['material_bezug', 'material_umbuchung'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','production']::app_role[]))
        with check (public.has_any_role(array['admin','office','production']::app_role[]));
    $f$, t);
  end loop;
end $$;
