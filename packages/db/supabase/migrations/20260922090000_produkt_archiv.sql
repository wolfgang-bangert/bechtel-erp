-- Archiv der Originaldateien je Produkt (unveränderte Kunden-/Satz-PDFs).
-- Aus den Originalen entstehen die Einzeldateien der Produktteile
-- (produktteil_datei verweist mit quelle/seite_von/seite_bis darauf zurück).

create table public.produkt_archiv (
  id            uuid primary key default gen_random_uuid(),
  produkt_id    uuid not null references public.produkt (id) on delete cascade,
  file_id       uuid not null references public.file (id) on delete cascade,
  ordner        text not null
                check (ordner in ('hauptregister', 'unterregister', 'inhalt', 'deck')),
  original_name text not null,
  ip_key        text,                 -- z.B. '90', '91e', '09' (aus IP_<key>_...)
  seitenzahl    integer,
  size_bytes    bigint,
  created_at    timestamptz not null default now(),
  unique (produkt_id, ordner, original_name)
);
create index produkt_archiv_produkt_idx on public.produkt_archiv (produkt_id, ordner, ip_key);

alter table public.produkt_archiv enable row level security;
create policy produkt_archiv_read on public.produkt_archiv for select using (public.is_staff());
create policy produkt_archiv_write on public.produkt_archiv for all
  using (public.has_any_role(array['admin','office','production']::app_role[]))
  with check (public.has_any_role(array['admin','office','production']::app_role[]));
