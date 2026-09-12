-- ============================================================================
-- Standbogen (flux-Signature) je Format + Ausrichtung.
--
-- Der Standbogen richtet sich nach Produktformat und Ausrichtung
-- (z. B. "A4" vs. "A4 quer"). Der Resolver matcht die Auflösung eines Auftrags
-- gegen diese Tabelle und setzt `flux_signature` auf den Druckzeilen.
-- Vorrang: standbogen > flux_template.signature (Fallback) > manueller Override
-- im FluxSendPanel.
-- ============================================================================

create table public.standbogen (
  id             uuid primary key default gen_random_uuid(),
  bezeichnung    text not null,
  format         text not null,                    -- matcht resolve_result.attribute.format
  ausrichtung    text check (ausrichtung in ('Hochformat', 'Querformat')),  -- null = gilt für beide
  flux_signature text not null,                    -- exakter Name aus flux /signatures
  notiz          text,
  aktiv          boolean not null default true,
  sortierung     integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Ein Standbogen je (Format, Ausrichtung); ausrichtung null = eigener Schlüssel.
create unique index standbogen_format_ausrichtung_idx
  on public.standbogen (format, coalesce(ausrichtung, ''));

-- ---------------------------------------------------------------- Trigger + RLS
do $$
begin
  perform public.attach_standard_triggers('public.standbogen'::regclass);
  alter table public.standbogen enable row level security;
  create policy standbogen_read on public.standbogen
    for select using (public.is_staff());
  create policy standbogen_write on public.standbogen
    for all
    using (public.has_any_role(array['admin','office','production']::app_role[]))
    with check (public.has_any_role(array['admin','office','production']::app_role[]));
end $$;
