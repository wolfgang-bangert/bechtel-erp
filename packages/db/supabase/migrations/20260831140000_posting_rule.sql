-- ============================================================================
-- Vorkontierungs-Regel: pro Lieferant ein Standard-Aufwandskonto (+ Steuer-
-- schlüssel). Gelernt aus der BuchhaltungsButler-Historie oder manuell gepflegt.
-- Wird beim Erfassen einer Eingangsrechnung als Vorschlag eingetragen.
-- ============================================================================

create table public.posting_rule (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organization (id) on delete cascade,
  expense_account  text not null,                                   -- SKR03-Aufwandskonto
  tax_code_id      uuid references public.tax_code (id) on delete set null,
  source           text not null default 'manual'
                     check (source in ('manual', 'learned')),
  sample_count     integer not null default 0,
  confidence       numeric(4,3),
  is_active        boolean not null default true,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id)
);
create index posting_rule_org_idx on public.posting_rule (organization_id);

do $$
begin
  perform public.attach_standard_triggers('public.posting_rule'::regclass);
  execute 'alter table public.posting_rule enable row level security';
end $$;

create policy pr_read  on public.posting_rule for select
  using (public.has_any_role(array['admin','accounting','office']::app_role[]));
create policy pr_write on public.posting_rule for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));
