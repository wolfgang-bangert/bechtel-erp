-- ============================================================================
-- flux-Templates: benanntes Bündel { product, services, Drucker, Standbogen }
-- für die Übergabe an flux (createOrder → orderItems[]). Das Papier kommt NICHT
-- aus dem Template, sondern aus dem Materialkatalog (material.flux_paper_type) –
-- so reicht ein Template je Format/Nutzen/Farbigkeit, das Papier ergänzt der
-- Resolver je Druckjob aus dem aufgelösten Material.
--
-- Zuordnung mit Cascade: opri_material_regel → opri_stammartikel → opri_produkt_gruppe.
-- ============================================================================

create table public.flux_template (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,        -- "Opri A5 2-2 4/4", "Opri Umschlag 300g" …
  flux_product    text not null,               -- flux-Produktname ("Opri_A5_2-2_4/4")
  flux_product_id text,                        -- "{uuid}" aus /api/products (optional)
  printer_name    text,                        -- Drucker aus /api/printers (optional)
  signature       text,                        -- Standbogen aus /api/signatures (optional)
  paper_type      text,                        -- Override PAPERTYPE (sonst aus Material)
  paper_type_back text,                        -- Override "Papiersorte Rückseite"
  services        jsonb not null default '{}'::jsonb,  -- { "Farbiger Druck": "Farbe", … } Name→Name
  extra           jsonb not null default '{}'::jsonb,  -- freie orderItem-Felder
  is_active       boolean not null default true,
  notiz           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- flux-Papiersorte je Katalog-Material (Name wie in /api/paper-types)
alter table public.material add column if not exists flux_paper_type text;

-- Template-Zuordnung (Regel gewinnt vor Stammartikel vor Gruppe)
alter table public.opri_material_regel
  add column if not exists flux_template_id uuid references public.flux_template (id) on delete set null;
alter table public.opri_stammartikel
  add column if not exists flux_template_id uuid references public.flux_template (id) on delete set null;
alter table public.opri_produkt_gruppe
  add column if not exists flux_template_id uuid references public.flux_template (id) on delete set null;

do $$
begin
  perform public.attach_standard_triggers('public.flux_template'::regclass);
  alter table public.flux_template enable row level security;
  create policy flux_template_read on public.flux_template for select using (public.is_staff());
  create policy flux_template_write on public.flux_template for all
    using (public.has_any_role(array['admin','office','production']::app_role[]))
    with check (public.has_any_role(array['admin','office','production']::app_role[]));
end $$;
