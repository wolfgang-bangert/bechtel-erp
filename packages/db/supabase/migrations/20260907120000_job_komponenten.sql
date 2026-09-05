-- Was ein Job zusammenführt (v.a. Binden/Aufhänger): Druck-Vorgänge + Zukauf-
-- Materialien (Aufsteller, Graupappe, Wire-O …). Nur zur Darstellung.
alter table public.job add column if not exists komponenten jsonb not null default '[]'::jsonb;
