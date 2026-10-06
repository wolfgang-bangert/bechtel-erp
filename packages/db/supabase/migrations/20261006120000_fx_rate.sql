-- Wechselkurse (EZB-Referenzkurse) für die Umrechnung von Fremdwährungsbelegen in der UStVA.
-- units_per_eur: 1 EUR = x Fremdwährung (wie von der EZB veröffentlicht, z. B. USD 1,1634).
create table if not exists public.fx_rate (
  rate_date     date not null,
  currency      text not null,
  units_per_eur numeric(14,6) not null check (units_per_eur > 0),
  source        text not null default 'ECB',
  primary key (rate_date, currency)
);
alter table public.fx_rate enable row level security;
create policy fx_rate_staff_read on public.fx_rate for select using (public.is_staff());
create policy fx_rate_staff_write on public.fx_rate for all
  using (public.has_any_role(array['admin','accounting']::app_role[]))
  with check (public.has_any_role(array['admin','accounting']::app_role[]));

-- Manuell hinterlegter Kurs je Beleg (überschreibt den EZB-Tageskurs): 1 EUR = x Belegwährung
alter table public.incoming_document
  add column if not exists exchange_rate numeric(14,6);
