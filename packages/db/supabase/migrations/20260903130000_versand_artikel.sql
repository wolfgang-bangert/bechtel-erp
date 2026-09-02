-- ============================================================================
-- Versandartikel-Stamm: wiederkehrende Sendungsinhalte mit Gewicht je Einheit.
-- In der Positionserfassung wählbar → Positionsgewicht = Menge × gewicht_kg.
-- ============================================================================

create table public.versand_artikel (
  id          uuid primary key default gen_random_uuid(),
  bezeichnung text not null,
  einheit     text not null default 'Stk',
  gewicht_kg  numeric(10,3) not null default 0,   -- kg je Einheit
  ean         text,
  notiz       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index versand_artikel_aktiv_idx on public.versand_artikel (is_active);

alter table public.shipment_item
  add column versand_artikel_id uuid references public.versand_artikel (id) on delete set null;

do $$
begin
  perform public.attach_standard_triggers('public.versand_artikel'::regclass);
  execute 'alter table public.versand_artikel enable row level security';
  execute $f$
    create policy versand_artikel_read on public.versand_artikel for select
      using (public.is_staff());
    create policy versand_artikel_write on public.versand_artikel for all
      using (public.has_any_role(array['admin','office','shipping']::app_role[]))
      with check (public.has_any_role(array['admin','office','shipping']::app_role[]));
  $f$;
end $$;
