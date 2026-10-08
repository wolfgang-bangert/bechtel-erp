-- Modulrechte: je Mitarbeiter und Modul "ansehen" oder "bearbeiten" (kein Eintrag = kein Zugriff).
-- Admin (Rolle admin) hat alle Module. Die Durchsetzung in der Oberfläche läuft über die Middleware
-- (my_module_levels), die Absicherung der Tabellen (RLS) folgt in einem zweiten Schritt.
create table public.user_module_access (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.app_user (id) on delete cascade,
  module     text not null check (module in ('vertrieb', 'onlineprinters', 'buchhaltung', 'versand', 'werkzeuge', 'einstellungen')),
  level      text not null check (level in ('view', 'edit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module)
);
create index user_module_access_user_idx on public.user_module_access (user_id);

select public.attach_standard_triggers('public.user_module_access'::regclass);
alter table public.user_module_access enable row level security;

create policy user_module_access_read on public.user_module_access
  for select using (user_id = auth.uid() or public.has_role('admin'));
create policy user_module_access_write on public.user_module_access
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- Alle Modulrechte des angemeldeten Nutzers als {"modul": "view"|"edit"}; Admin: alle "edit" + admin=true.
-- Deaktivierte Konten bekommen nichts.
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
    else coalesce((select jsonb_object_agg(module, level) from public.user_module_access where user_id = auth.uid()), '{}'::jsonb)
  end;
$$;
grant execute on function public.my_module_levels() to authenticated;

-- Bestehende Mitarbeiter (ohne Admin) behalten vorerst ihren bisherigen Zugriff:
-- alle Module bearbeiten, Einstellungen nur ansehen. Der Admin schränkt danach pro Person ein.
insert into public.user_module_access (user_id, module, level)
select distinct ur.user_id, m.module, m.level
  from public.user_role ur
  join public.app_user au on au.id = ur.user_id
  cross join (values ('vertrieb', 'edit'), ('onlineprinters', 'edit'), ('buchhaltung', 'edit'),
                     ('versand', 'edit'), ('werkzeuge', 'edit'), ('einstellungen', 'view')) as m(module, level)
 where ur.role in ('office', 'accounting', 'production', 'shipping', 'employee')
   and not exists (select 1 from public.user_role a where a.user_id = ur.user_id and a.role = 'admin')
on conflict (user_id, module) do nothing;
