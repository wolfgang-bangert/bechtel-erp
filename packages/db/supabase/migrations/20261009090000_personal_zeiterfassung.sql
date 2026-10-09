-- ============================================================================
-- Personal + Zeiterfassung.
--
-- * Modul "personal" in der Rechteverwaltung. Anders als die übrigen Module
--   bekommen Admins es NICHT automatisch: nur ausdrücklich Freigegebene
--   (anfangs nur w.bangert) sehen Personaltabelle, Personal-Dokumente und die
--   Zeiten aller Mitarbeiter. Freigeben kann es nur, wer es selbst hat.
-- * personal: alle Felder der Ninox-Personalübersicht (Team GL), einmal
--   importiert (personal:import), danach wird in werk gepflegt.
--   Feldliste: packages/shared/src/personal/felder.ts.
-- * zeit_eintrag: Arbeitsblöcke (beginn/ende). Mitarbeiter stempeln nur über
--   stempeln() (Kommen / Pause / Weiter / Gehen) und sehen nur eigene Zeiten.
-- * dokument: neue Kategorie "personal" (Hotfolder-Ordner Personal) mit
--   Verknüpfung zur Person, nur für Personal-Berechtigte sichtbar.
-- ============================================================================

-- ---- Modul "personal" -------------------------------------------------------
alter table public.user_module_access drop constraint if exists user_module_access_module_check;
alter table public.user_module_access add constraint user_module_access_module_check
  check (module in ('vertrieb', 'onlineprinters', 'buchhaltung', 'versand', 'werkzeuge', 'einstellungen', 'personal'));

create or replace function public.has_personal_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_active from public.app_user where id = auth.uid()), false)
     and exists (select 1 from public.user_module_access
                  where user_id = auth.uid() and module = 'personal');
$$;
grant execute on function public.has_personal_access() to authenticated;

-- Rechte vergeben: Admin; das Modul "personal" nur, wer es selbst hat
drop policy if exists user_module_access_write on public.user_module_access;
create policy user_module_access_write on public.user_module_access
  for all
  using (public.has_role('admin') and (module <> 'personal' or public.has_personal_access()))
  with check (public.has_role('admin') and (module <> 'personal' or public.has_personal_access()));

-- Admin: alle Module außer "personal"; "personal" nur mit eigenem Eintrag
create or replace function public.my_module_levels()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not coalesce((select is_active from public.app_user where id = auth.uid()), true) then '{}'::jsonb
    when exists (select 1 from public.user_role where user_id = auth.uid() and role = 'admin') then
      jsonb_build_object('vertrieb', 'edit', 'onlineprinters', 'edit', 'buchhaltung', 'edit',
                         'versand', 'edit', 'werkzeuge', 'edit', 'einstellungen', 'edit', 'admin', true)
      || coalesce((select jsonb_build_object('personal', level) from public.user_module_access
                    where user_id = auth.uid() and module = 'personal'), '{}'::jsonb)
    else coalesce((select jsonb_object_agg(module, level) from public.user_module_access where user_id = auth.uid()), '{}'::jsonb)
  end;
$$;
grant execute on function public.my_module_levels() to authenticated;

insert into public.user_module_access (user_id, module, level)
select id, 'personal', 'edit' from public.app_user where lower(email::text) = 'w.bangert@bechtel-druck.de'
on conflict (user_id, module) do nothing;

-- ---- Personal -----------------------------------------------------------------
create table if not exists public.personal (
  id                   uuid primary key default gen_random_uuid(),
  personalnummer       integer,
  anrede               text,
  vorname              text,
  nachname             text,
  geburtsdatum         date,
  geburtsort           text,
  staatsangehoerigkeit text,
  aufenthaltstitel     text,
  familienstand        text,
  kinder               text,
  strasse              text,
  hausnummer           text,
  plz                  text,
  ort                  text,
  land                 text,
  privat_email         text,
  privat_telefon       text,
  privat_mobil         text,
  email                text,
  telefon              text,
  mobil                text,
  notfall_name         text,
  notfall_telefon      text,
  status               text,
  position             text,
  taetigkeit           text,
  standort             text,
  abteilung            text,
  vorgesetzter         text,
  einstellungsart      text,
  dienstverhaeltnis    text,
  eintritt             date,
  austritt             date,
  arbeitszeitmodell    text,
  befristung           text,
  probezeit            text,
  wochenstunden        numeric,
  urlaubstage          numeric,
  gehalt_brutto        numeric(12,2),
  gehalt_zeitraum      text,
  lohnarten            text,
  zahlungsempfaenger   text,
  iban                 text,
  bic                  text,
  steuer_id            text,
  steuerklasse         text,
  kinderfreibetrag     text,
  konfession           text,
  minijob_besteuerung  text,
  weitere_einkuenfte   text,
  sozialversicherung   text,
  sv_nummer            text,
  rv_befreiung         boolean not null default false,
  krankenversicherung  text,
  krankenkasse         text,
  pkv_beitrag          numeric(12,2),
  ppv_beitrag          numeric(12,2),
  grad_behinderung     text,
  bav                  text,
  vwl                  text,
  beitrag_firma        numeric(12,2),
  beitrag_mitarbeiter  numeric(12,2),
  bereich              text,
  neue_struktur        text,
  moegliche_verwendung text,
  go                   boolean not null default false,
  ausklammern          boolean not null default false,
  notiz                text,
  aktiv                boolean not null default true,
  app_user_id          uuid unique references public.app_user (id) on delete set null,
  ninox_id             integer unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists personal_name_idx on public.personal (nachname, vorname);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.personal'::regclass) then
    perform public.attach_standard_triggers('public.personal'::regclass);
  end if;
end $$;
alter table public.personal enable row level security;

drop policy if exists personal_read on public.personal;
create policy personal_read on public.personal for select using (public.has_personal_access());
drop policy if exists personal_write on public.personal;
create policy personal_write on public.personal for all
  using (public.has_personal_access()) with check (public.has_personal_access());

-- Eigene Person (für Zeiterfassung), ohne Lesezugriff auf die Personaltabelle
create or replace function public.meine_personal_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.personal where app_user_id = auth.uid() and aktiv limit 1;
$$;
grant execute on function public.meine_personal_id() to authenticated;

-- ---- Zeiterfassung --------------------------------------------------------------
create table if not exists public.zeit_eintrag (
  id            uuid primary key default gen_random_uuid(),
  personal_id   uuid not null references public.personal (id) on delete cascade,
  beginn        timestamptz not null,
  ende          timestamptz,
  ende_grund    text check (ende_grund in ('pause', 'feierabend')),
  quelle        text not null default 'stempel' check (quelle in ('stempel', 'manuell')),
  notiz         text,
  geaendert_von uuid references public.app_user (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ende is null or ende > beginn)
);
create index if not exists zeit_eintrag_person_idx on public.zeit_eintrag (personal_id, beginn desc);
-- höchstens ein offener Block je Person
create unique index if not exists zeit_eintrag_offen_uq on public.zeit_eintrag (personal_id) where ende is null;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.zeit_eintrag'::regclass) then
    perform public.attach_standard_triggers('public.zeit_eintrag'::regclass);
  end if;
end $$;
alter table public.zeit_eintrag enable row level security;

drop policy if exists zeit_eintrag_read on public.zeit_eintrag;
create policy zeit_eintrag_read on public.zeit_eintrag for select
  using (public.has_personal_access() or personal_id = public.meine_personal_id());
drop policy if exists zeit_eintrag_write on public.zeit_eintrag;
create policy zeit_eintrag_write on public.zeit_eintrag for all
  using (public.has_personal_access()) with check (public.has_personal_access());

-- Stempeln für die eigene Person: 'kommen' / 'weiter' öffnen einen Block, 'pause' / 'gehen' schließen ihn.
create or replace function public.stempeln(p_aktion text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid := public.meine_personal_id();
  v_offen public.zeit_eintrag;
begin
  if v_pid is null then
    raise exception 'Dein Login ist mit keiner Person im Personal verknüpft.';
  end if;
  select * into v_offen from public.zeit_eintrag where personal_id = v_pid and ende is null for update;

  if p_aktion in ('kommen', 'weiter') then
    if v_offen.id is not null then
      raise exception 'Du bist schon eingestempelt (seit %).', to_char(v_offen.beginn at time zone 'Europe/Berlin', 'HH24:MI');
    end if;
    -- nie vor dem Ende des letzten Blocks beginnen (Pause und Weiter in derselben Minute)
    insert into public.zeit_eintrag (personal_id, beginn, quelle, geaendert_von)
    values (v_pid,
            greatest(date_trunc('minute', now()),
                     coalesce((select max(ende) from public.zeit_eintrag where personal_id = v_pid), '-infinity')),
            'stempel', auth.uid());
  elsif p_aktion in ('pause', 'gehen') then
    if v_offen.id is null then
      raise exception 'Du bist nicht eingestempelt.';
    end if;
    update public.zeit_eintrag
       set ende = greatest(date_trunc('minute', now()), beginn + interval '1 minute'),
           ende_grund = case when p_aktion = 'pause' then 'pause' else 'feierabend' end,
           geaendert_von = auth.uid()
     where id = v_offen.id;
  else
    raise exception 'Unbekannte Aktion %', p_aktion;
  end if;
  return jsonb_build_object('aktion', p_aktion, 'zeit', now());
end;
$$;
revoke all on function public.stempeln(text) from public;
grant execute on function public.stempeln(text) to authenticated;

-- ---- Personal-Dokumente -----------------------------------------------------------
alter table public.dokument drop constraint if exists dokument_kategorie_check;
alter table public.dokument add constraint dokument_kategorie_check
  check (kategorie in ('rapport', 'lieferschein', 'vertrag', 'personal', 'sonstiges'));
alter table public.dokument
  add column if not exists personal_id uuid references public.personal (id) on delete set null;
create index if not exists dokument_personal_idx on public.dokument (personal_id);

drop policy if exists dokument_read on public.dokument;
create policy dokument_read on public.dokument for select
  using (public.is_staff()
         and ((kategorie <> 'personal' and personal_id is null) or public.has_personal_access()));
drop policy if exists dokument_write on public.dokument;
create policy dokument_write on public.dokument for all
  using (public.has_any_role(array['admin','office','accounting','production']::app_role[])
         and ((kategorie <> 'personal' and personal_id is null) or public.has_personal_access()))
  with check (public.has_any_role(array['admin','office','accounting','production']::app_role[])
              and ((kategorie <> 'personal' and personal_id is null) or public.has_personal_access()));
