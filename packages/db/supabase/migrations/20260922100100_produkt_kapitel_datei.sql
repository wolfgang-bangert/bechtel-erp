-- Zusammengeführte Druck-PDF je Kapitel (Unterregister-Reiter + Inhalt in
-- einer Datei statt separat je Produktteil).
alter table public.produkt_kapitel
  add column if not exists file_id uuid references public.file (id) on delete set null;
