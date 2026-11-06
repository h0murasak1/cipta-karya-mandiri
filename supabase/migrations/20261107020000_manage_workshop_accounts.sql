begin;

alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

drop policy if exists "profiles_read_self_or_owner" on public.profiles;
create policy "profiles_read_self_or_owner" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_owner_or_admin());

drop policy if exists "profiles_owner_manage" on public.profiles;
drop policy if exists "profiles_admin_read_active_workshop" on public.profiles;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'workshop'
  )
  on conflict (id) do update
  set email = excluded.email;
  return new;
end;
$$;

drop policy if exists "company_settings_owner_update" on public.company_settings;
create policy "company_settings_owner_update" on public.company_settings
for update to authenticated
using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists "audit_logs_owner_read" on public.audit_logs;
create policy "audit_logs_owner_read" on public.audit_logs
for select to authenticated
using (public.is_owner_or_admin());

commit;
