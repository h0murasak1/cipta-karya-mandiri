-- Project assignment and private photo access migration.
-- Prerequisite: the supplied Supabase schema has been applied.
-- Grants Workshop access only to projects explicitly assigned to that profile.
-- New photo object paths must use: <project-uuid>/<random-filename>.

begin;

create table if not exists public.project_assignments (
  project_id uuid not null
    references public.projects(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  assigned_by uuid
    references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create index if not exists idx_project_assignments_profile_project
  on public.project_assignments(profile_id, project_id);

alter table public.project_assignments enable row level security;
grant select, insert, delete on public.project_assignments to authenticated;

drop policy if exists "profiles_admin_read_active_workshop" on public.profiles;
create policy "profiles_admin_read_active_workshop" on public.profiles
for select to authenticated
using (
  public.is_owner_or_admin()
  and role = 'workshop'::public.app_role
  and is_active = true
);

create or replace function public.can_assign_workshop(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and public.is_owner_or_admin()
    and exists (
      select 1
      from public.profiles p
      where p.id = p_profile_id
        and p.role = 'workshop'::public.app_role
        and p.is_active = true
    ),
    false
  );
$$;

revoke all on function public.can_assign_workshop(uuid) from public;
grant execute on function public.can_assign_workshop(uuid) to authenticated;

drop policy if exists "project_assignments_read" on public.project_assignments;
create policy "project_assignments_read" on public.project_assignments
for select to authenticated
using (
  public.is_owner_or_admin()
  or (
    public.current_app_role() = 'workshop'::public.app_role
    and profile_id = auth.uid()
  )
);

drop policy if exists "project_assignments_admin_insert" on public.project_assignments;
create policy "project_assignments_admin_insert" on public.project_assignments
for insert to authenticated
with check (
  public.is_owner_or_admin()
  and assigned_by = auth.uid()
  and public.can_assign_workshop(profile_id)
);

drop policy if exists "project_assignments_admin_delete" on public.project_assignments;
create policy "project_assignments_admin_delete" on public.project_assignments
for delete to authenticated
using (public.is_owner_or_admin());

drop policy if exists "projects_internal_read" on public.projects;
drop policy if exists "projects_assigned_or_admin_read" on public.projects;
create policy "projects_assigned_or_admin_read" on public.projects
for select to authenticated
using (
  public.is_owner_or_admin()
  or (
    public.current_app_role() = 'workshop'::public.app_role
    and exists (
      select 1
      from public.project_assignments pa
      where pa.project_id = projects.id
        and pa.profile_id = auth.uid()
    )
  )
);

drop policy if exists "progress_internal_read" on public.project_progress;
create policy "progress_internal_read" on public.project_progress
for select to authenticated
using (
  public.is_owner_or_admin()
  or exists (
    select 1
    from public.projects p
    where p.id = project_progress.project_id
  )
);

drop policy if exists "progress_internal_insert" on public.project_progress;
create policy "progress_internal_insert" on public.project_progress
for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.projects p
    where p.id = project_progress.project_id
  )
);

drop policy if exists "photos_internal_read" on public.project_photos;
create policy "photos_internal_read" on public.project_photos
for select to authenticated
using (
  public.is_owner_or_admin()
  or exists (
    select 1
    from public.projects p
    where p.id = project_photos.project_id
  )
);

drop policy if exists "photos_internal_insert" on public.project_photos;
create policy "photos_internal_insert" on public.project_photos
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and (storage.foldername(storage_path))[1] = project_id::text
  and exists (
    select 1
    from public.projects p
    where p.id = project_photos.project_id
  )
);

insert into storage.buckets (id, name, public)
values ('project-photos', 'project-photos', false)
on conflict (id) do nothing;

do $$
begin
  if exists (
    select 1
    from storage.buckets
    where id = 'project-photos'
      and public = true
  ) then
    raise exception 'The project-photos bucket already exists as public; make it private before applying this proposal.';
  end if;
end;
$$;

drop policy if exists "project_photos_objects_read" on storage.objects;
create policy "project_photos_objects_read" on storage.objects
for select to authenticated
using (
  bucket_id = 'project-photos'
  and (
    public.is_owner_or_admin()
    or (
      public.current_app_role() = 'workshop'::public.app_role
      and exists (
        select 1
        from public.project_assignments pa
        where pa.project_id::text = (storage.foldername(name))[1]
          and pa.profile_id = auth.uid()
      )
    )
  )
);

drop policy if exists "project_photos_guard_select" on storage.objects;
create policy "project_photos_guard_select" on storage.objects
as restrictive for select to public
using (
  bucket_id <> 'project-photos'
  or public.is_owner_or_admin()
  or (
    public.current_app_role() = 'workshop'::public.app_role
    and exists (
      select 1
      from public.project_assignments pa
      where pa.project_id::text = (storage.foldername(name))[1]
        and pa.profile_id = auth.uid()
    )
  )
);

drop policy if exists "project_photos_objects_insert" on storage.objects;
create policy "project_photos_objects_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'project-photos'
  and (
    public.is_owner_or_admin()
    or (
      public.current_app_role() = 'workshop'::public.app_role
      and exists (
        select 1
        from public.project_assignments pa
        where pa.project_id::text = (storage.foldername(name))[1]
          and pa.profile_id = auth.uid()
      )
    )
  )
);

drop policy if exists "project_photos_guard_insert" on storage.objects;
create policy "project_photos_guard_insert" on storage.objects
as restrictive for insert to public
with check (
  bucket_id <> 'project-photos'
  or public.is_owner_or_admin()
  or (
    public.current_app_role() = 'workshop'::public.app_role
    and exists (
      select 1
      from public.project_assignments pa
      where pa.project_id::text = (storage.foldername(name))[1]
        and pa.profile_id = auth.uid()
    )
  )
);

drop policy if exists "project_photos_objects_update" on storage.objects;
create policy "project_photos_objects_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'project-photos'
  and public.is_owner_or_admin()
)
with check (
  bucket_id = 'project-photos'
  and public.is_owner_or_admin()
);

drop policy if exists "project_photos_guard_update" on storage.objects;
create policy "project_photos_guard_update" on storage.objects
as restrictive for update to public
using (
  bucket_id <> 'project-photos'
  or public.is_owner_or_admin()
)
with check (
  bucket_id <> 'project-photos'
  or public.is_owner_or_admin()
);

drop policy if exists "project_photos_objects_delete" on storage.objects;
create policy "project_photos_objects_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'project-photos'
  and public.is_owner_or_admin()
);

drop policy if exists "project_photos_guard_delete" on storage.objects;
create policy "project_photos_guard_delete" on storage.objects
as restrictive for delete to public
using (
  bucket_id <> 'project-photos'
  or public.is_owner_or_admin()
);

create or replace function public.audit_project_assignment_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_profile_id uuid;
begin
  if tg_op = 'INSERT' then
    v_project_id := new.project_id;
    v_profile_id := new.profile_id;
    insert into public.audit_logs (actor_id, action, table_name, record_id, details)
    values (
      auth.uid(),
      'project.assignment.created',
      'project_assignments',
      v_project_id::text || ':' || v_profile_id::text,
      jsonb_build_object('project_id', v_project_id, 'profile_id', v_profile_id)
    );
    return new;
  end if;

  v_project_id := old.project_id;
  v_profile_id := old.profile_id;
  insert into public.audit_logs (actor_id, action, table_name, record_id, details)
  values (
    auth.uid(),
    'project.assignment.deleted',
    'project_assignments',
    v_project_id::text || ':' || v_profile_id::text,
    jsonb_build_object('project_id', v_project_id, 'profile_id', v_profile_id)
  );
  return old;
end;
$$;

drop trigger if exists trg_audit_project_assignment_change
  on public.project_assignments;
create trigger trg_audit_project_assignment_change
after insert or delete on public.project_assignments
for each row execute function public.audit_project_assignment_change();

commit;
