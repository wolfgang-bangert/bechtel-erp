-- ============================================================================
-- Fakturiermodul-MVP (Slice 3, Start): werk-native Rechnungen.
-- Erster Fall: laufende Sammelrechnung an Onlineprinters, eine Position je
-- festgeschriebener Wochen-Abrechnung ("Druckaufträge KW … gem. Aufstellung").
-- Die Rechnung bleibt offen, bis der Nutzer sie abschließt - das ist der
-- Hebel für wöchentlich/monatlich, kein eigener Umschalt-Modus nötig.
-- ============================================================================

create table public.invoice (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text unique,                 -- erst bei Festschreibung (next_number('invoice'))
  type            text not null default 'collective'
                    check (type in ('invoice', 'collective', 'credit_note')),
  status          text not null default 'offen' check (status in ('offen', 'festgeschrieben')),
  organization_id uuid not null references public.organization (id),
  invoice_date    date,                         -- erst bei Festschreibung
  net_total       numeric(14,2) not null default 0,
  tax_total       numeric(14,2) not null default 0,
  gross_total     numeric(14,2) not null default 0,
  pdf_storage_key text,                         -- PDF+ZUGFeRD+CSV-Anhang, nach Festschreibung
  source          text not null default 'werk',
  notiz           text,
  finalized_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index invoice_org_idx on public.invoice (organization_id);

create table public.invoice_item (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoice (id) on delete cascade,
  position      int not null,
  description   text,
  abrechnung_id uuid references public.abrechnung (id),  -- Rückbezug: welche Woche
  net_amount    numeric(14,2) not null default 0,
  tax_code_id   uuid references public.tax_code (id),
  tax_amount    numeric(14,2) not null default 0,
  gross_amount  numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index invoice_item_invoice_idx on public.invoice_item (invoice_id);

alter table public.abrechnung add column if not exists invoice_id uuid references public.invoice (id);

-- Onlineprinters-Portal mit der bestehenden Keyline-Organisation verknüpfen
-- (Rechnungsempfänger der Sammelrechnung).
update public.portal set organization_id = 'd649a15c-a126-4b5d-8ddc-cb73b9e9ff9d'
  where code = 'onlineprinters' and organization_id is null;

-- ---- Trigger + RLS ----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['invoice', 'invoice_item'] loop
    perform public.attach_standard_triggers(format('public.%I', t)::regclass);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_read on public.%1$s for select using (public.is_staff());
      create policy %1$s_write on public.%1$s for all
        using (public.has_any_role(array['admin','office','accounting']::app_role[]))
        with check (public.has_any_role(array['admin','office','accounting']::app_role[]));
    $f$, t);
  end loop;
end $$;
