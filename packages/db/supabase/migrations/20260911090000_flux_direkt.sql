-- ============================================================================
-- flux-Produkt + Service-Overrides direkt an Regel/Stammartikel/Gruppe statt
-- über ein separates flux_template-Bündel. Eine Stelle weniger zu pflegen -
-- Standbogen (Signature/Nutzen/Druckbogen) kommt ohnehin schon automatisch aus
-- der standbogen-Tabelle (Format + PDF-Ausrichtung), Papier aus dem
-- Materialkatalog. Was bleibt: welches flux-Produkt, welche Service-Optionen.
--
-- Kaskade unverändert: Regel (Bauteil) > Stammartikel (Override) > Gruppe
-- (Default) - nur jetzt als direkte Felder statt FK auf flux_template.
-- ============================================================================

alter table public.opri_material_regel
  add column if not exists flux_product  text,
  add column if not exists flux_services jsonb not null default '{}'::jsonb;

alter table public.opri_stammartikel
  add column if not exists flux_services jsonb not null default '{}'::jsonb;

alter table public.opri_produkt_gruppe
  add column if not exists flux_services jsonb not null default '{}'::jsonb;

-- Bestehende Template-Zuordnungen in die neuen Spalten übernehmen (Papier-
-- Overrides wandern als Service-Einträge mit).
update public.opri_material_regel r
set flux_product = coalesce(r.flux_product, t.flux_product),
    flux_services = coalesce(t.services, '{}'::jsonb)
      || case when t.paper_type is not null
              then jsonb_build_object('Papiersorte', t.paper_type) else '{}'::jsonb end
      || case when t.paper_type_back is not null
              then jsonb_build_object('Papiersorte Rückseite', t.paper_type_back) else '{}'::jsonb end
from public.flux_template t
where r.flux_template_id = t.id;

update public.opri_stammartikel s
set flux_product = coalesce(s.flux_product, t.flux_product),
    flux_services = coalesce(t.services, '{}'::jsonb)
      || case when t.paper_type is not null
              then jsonb_build_object('Papiersorte', t.paper_type) else '{}'::jsonb end
      || case when t.paper_type_back is not null
              then jsonb_build_object('Papiersorte Rückseite', t.paper_type_back) else '{}'::jsonb end
from public.flux_template t
where s.flux_template_id = t.id;

update public.opri_produkt_gruppe g
set flux_product = coalesce(g.flux_product, t.flux_product),
    flux_services = coalesce(t.services, '{}'::jsonb)
      || case when t.paper_type is not null
              then jsonb_build_object('Papiersorte', t.paper_type) else '{}'::jsonb end
      || case when t.paper_type_back is not null
              then jsonb_build_object('Papiersorte Rückseite', t.paper_type_back) else '{}'::jsonb end
from public.flux_template t
where g.flux_template_id = t.id;

-- flux_template-Bündel + Verweise + den alten Text-Fallback entfernen.
alter table public.opri_material_regel drop column if exists flux_template_id;
alter table public.opri_stammartikel   drop column if exists flux_template_id;
alter table public.opri_stammartikel   drop column if exists flux_template;
alter table public.opri_produkt_gruppe drop column if exists flux_template_id;
alter table public.opri_produkt_gruppe drop column if exists flux_template;

drop table if exists public.flux_template;
