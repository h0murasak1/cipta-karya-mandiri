-- ============================================================
-- CIPTA KARYA MANDIRI - SUPABASE DATABASE SCHEMA
-- BRD version: 1.1
-- Database: Supabase PostgreSQL
--
-- IMPORTANT:
-- 1. Review this script in a development project before production.
-- 2. Create the first Owner account, then promote its profile role
--    using the administrative SQL shown at the end of this file.
-- 3. Public invoice access MUST be implemented through a secure
--    Edge Function/RPC that hashes the raw QR token and returns
--    only approved invoice fields. Do not expose invoices directly.
-- ============================================================

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('owner', 'admin', 'workshop');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_status as enum
    ('waiting_confirmation', 'waiting_work', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transaction_type as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum
    ('draft', 'issued', 'partially_paid', 'paid', 'cancelled');
exception when duplicate_object then null; end $$;

-- -------------------------
-- User profiles and roles
-- -------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.app_role not null default 'workshop',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'workshop'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('owner', 'admin'), false);
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'owner', false);
$$;

-- -------------------------
-- Company settings
-- -------------------------
create table if not exists public.company_settings (
  id boolean primary key default true check (id = true),
  company_name text not null default 'Cipta Karya Mandiri',
  legal_entity text not null default 'CV Dua Putra Bersaudara',
  address text,
  phone text,
  email text,
  logo_path text,
  invoice_prefix text not null default 'INV',
  invoice_footer text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.company_settings (id)
values (true)
on conflict (id) do nothing;

-- -------------------------
-- Customers and project categories
-- -------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();

create table if not exists public.project_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.project_categories (name) values
  ('Kanopi'), ('Pagar'), ('Railing'), ('Teralis'), ('Pintu Besi'), ('Lainnya')
on conflict (name) do nothing;

-- -------------------------
-- Projects and progress
-- -------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  category_id uuid references public.project_categories(id) on delete set null,
  title text not null,
  description text,
  location text,
  contract_value numeric(14,2) not null default 0 check (contract_value >= 0),
  start_date date,
  target_completion_date date,
  actual_completion_date date,
  status public.project_status not null default 'waiting_confirmation',
  internal_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    target_completion_date is null
    or start_date is null
    or target_completion_date >= start_date
  )
);

drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at before update on public.projects
for each row execute function public.set_updated_at();

create table if not exists public.project_progress (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  progress_date timestamptz not null default now(),
  stage_name text not null,
  progress_percent numeric(5,2) not null check (progress_percent >= 0 and progress_percent <= 100),
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  progress_id uuid references public.project_progress(id) on delete set null,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -------------------------
-- Transaction categories and financial transactions
-- -------------------------
create table if not exists public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  transaction_type public.transaction_type not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (transaction_type, name)
);

insert into public.transaction_categories (transaction_type, name) values
  ('income', 'Pembayaran Invoice'),
  ('income', 'Pemasukan Lainnya'),
  ('expense', 'Material'),
  ('expense', 'Upah Tenaga Kerja'),
  ('expense', 'Transportasi'),
  ('expense', 'Operasional'),
  ('expense', 'Pengeluaran Lainnya')
on conflict (transaction_type, name) do nothing;

-- -------------------------
-- Invoices and invoice items
-- -------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  status public.invoice_status not null default 'draft',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  public_token_hash text unique,
  token_created_at timestamptz,
  token_revoked_at timestamptz,
  public_note text,
  internal_note text,
  issued_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= issue_date),
  check (discount_amount <= subtotal + tax_amount)
);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at before update on public.invoices
for each row execute function public.set_updated_at();

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit text not null default 'unit',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  line_total numeric(14,2) not null default 0 check (line_total >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- -------------------------
-- Payments and cash transactions
-- -------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  payment_method text not null default 'cash',
  reference_number text,
  notes text,
  received_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type public.transaction_type not null,
  category_id uuid references public.transaction_categories(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_id uuid unique references public.payments(id) on delete set null,
  transaction_date timestamptz not null default now(),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  attachment_path text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (payment_id is null or transaction_type = 'income')
);

-- Atomic payment recording: creates payment + income transaction,
-- then refreshes invoice status. Call from authenticated client.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_at timestamptz default now(),
  p_payment_method text default 'cash',
  p_reference_number text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_invoice public.invoices%rowtype;
  v_paid_total numeric(14,2);
  v_category_id uuid;
begin
  if auth.uid() is null or not public.is_owner_or_admin() then
    raise exception 'Not authorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status in ('draft', 'cancelled') then
    raise exception 'Invoice is not payable';
  end if;

  select coalesce(sum(amount), 0) into v_paid_total
  from public.payments
  where invoice_id = p_invoice_id;

  if v_paid_total + p_amount > v_invoice.total_amount then
    raise exception 'Payment exceeds invoice outstanding balance';
  end if;

  insert into public.payments (
    invoice_id, amount, paid_at, payment_method,
    reference_number, notes, received_by
  ) values (
    p_invoice_id, p_amount, coalesce(p_paid_at, now()),
    coalesce(p_payment_method, 'cash'), p_reference_number,
    p_notes, auth.uid()
  ) returning id into v_payment_id;

  select id into v_category_id
  from public.transaction_categories
  where transaction_type = 'income'
    and name = 'Pembayaran Invoice'
    and is_active = true
  limit 1;

  insert into public.transactions (
    transaction_type, category_id, project_id, customer_id,
    invoice_id, payment_id, transaction_date, amount,
    description, recorded_by
  ) values (
    'income', v_category_id, v_invoice.project_id, v_invoice.customer_id,
    p_invoice_id, v_payment_id, coalesce(p_paid_at, now()), p_amount,
    'Pembayaran invoice ' || v_invoice.invoice_number, auth.uid()
  );

  v_paid_total := v_paid_total + p_amount;

  update public.invoices
  set status = case
    when v_paid_total >= total_amount then 'paid'::public.invoice_status
    else 'partially_paid'::public.invoice_status
  end
  where id = p_invoice_id;

  return v_payment_id;
end;
$$;

-- Read-only view for balances and overdue display.
create or replace view public.invoice_balances
with (security_invoker = true)
as
select
  i.id,
  i.invoice_number,
  i.customer_id,
  i.project_id,
  i.issue_date,
  i.due_date,
  i.status,
  i.total_amount,
  coalesce(sum(p.amount), 0)::numeric(14,2) as paid_amount,
  greatest(i.total_amount - coalesce(sum(p.amount), 0), 0)::numeric(14,2) as outstanding_amount,
  case
    when i.status = 'cancelled' then 'cancelled'
    when i.status = 'draft' then 'draft'
    when coalesce(sum(p.amount), 0) >= i.total_amount then 'paid'
    when i.due_date is not null and i.due_date < current_date then 'overdue'
    when coalesce(sum(p.amount), 0) > 0 then 'partially_paid'
    else 'issued'
  end as display_status
from public.invoices i
left join public.payments p on p.invoice_id = i.id
group by i.id;

-- -------------------------
-- Audit logs
-- -------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -------------------------
-- Indexes
-- -------------------------
create index if not exists idx_customers_name on public.customers using gin (to_tsvector('simple', name));
create index if not exists idx_projects_customer on public.projects(customer_id);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_progress_project_date on public.project_progress(project_id, progress_date desc);
create index if not exists idx_photos_project on public.project_photos(project_id);
create index if not exists idx_transactions_date on public.transactions(transaction_date desc);
create index if not exists idx_transactions_type_date on public.transactions(transaction_type, transaction_date desc);
create index if not exists idx_transactions_project on public.transactions(project_id);
create index if not exists idx_invoices_customer on public.invoices(customer_id);
create index if not exists idx_invoices_project on public.invoices(project_id);
create index if not exists idx_invoices_issue_date on public.invoices(issue_date desc);
create index if not exists idx_payments_invoice_date on public.payments(invoice_id, paid_at desc);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);

-- -------------------------
-- Row Level Security
-- -------------------------
alter table public.profiles enable row level security;
alter table public.company_settings enable row level security;
alter table public.customers enable row level security;
alter table public.project_categories enable row level security;
alter table public.projects enable row level security;
alter table public.project_progress enable row level security;
alter table public.project_photos enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.transactions enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users read their own profile; owner can read/manage all profiles.
drop policy if exists "profiles_read_self_or_owner" on public.profiles;
create policy "profiles_read_self_or_owner" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_owner());

drop policy if exists "profiles_owner_manage" on public.profiles;
create policy "profiles_owner_manage" on public.profiles
for all to authenticated
using (public.is_owner())
with check (public.is_owner());

-- Company settings
drop policy if exists "company_settings_read_internal" on public.company_settings;
create policy "company_settings_read_internal" on public.company_settings
for select to authenticated using (true);

drop policy if exists "company_settings_owner_update" on public.company_settings;
create policy "company_settings_owner_update" on public.company_settings
for update to authenticated
using (public.is_owner()) with check (public.is_owner());

-- Customers and categories
drop policy if exists "customers_admin_all" on public.customers;
create policy "customers_admin_all" on public.customers
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

drop policy if exists "project_categories_read_internal" on public.project_categories;
create policy "project_categories_read_internal" on public.project_categories
for select to authenticated using (true);

drop policy if exists "project_categories_admin_manage" on public.project_categories;
create policy "project_categories_admin_manage" on public.project_categories
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

-- Projects: internal users can read; owner/admin manage; workshop can read.
drop policy if exists "projects_internal_read" on public.projects;
create policy "projects_internal_read" on public.projects
for select to authenticated using (public.current_app_role() in ('owner','admin','workshop'));

drop policy if exists "projects_admin_manage" on public.projects;
create policy "projects_admin_manage" on public.projects
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

-- Progress and project photos
drop policy if exists "progress_internal_read" on public.project_progress;
create policy "progress_internal_read" on public.project_progress
for select to authenticated using (public.current_app_role() in ('owner','admin','workshop'));

drop policy if exists "progress_internal_insert" on public.project_progress;
create policy "progress_internal_insert" on public.project_progress
for insert to authenticated
with check (public.current_app_role() in ('owner','admin','workshop'));

drop policy if exists "progress_admin_update_delete" on public.project_progress;
create policy "progress_admin_update_delete" on public.project_progress
for update to authenticated
using (public.is_owner_or_admin()) with check (public.is_owner_or_admin());

drop policy if exists "progress_admin_delete" on public.project_progress;
create policy "progress_admin_delete" on public.project_progress
for delete to authenticated using (public.is_owner_or_admin());

drop policy if exists "photos_internal_read" on public.project_photos;
create policy "photos_internal_read" on public.project_photos
for select to authenticated using (public.current_app_role() in ('owner','admin','workshop'));

drop policy if exists "photos_internal_insert" on public.project_photos;
create policy "photos_internal_insert" on public.project_photos
for insert to authenticated
with check (public.current_app_role() in ('owner','admin','workshop'));

drop policy if exists "photos_admin_manage" on public.project_photos;
create policy "photos_admin_manage" on public.project_photos
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

-- Financial tables: owner/admin only
drop policy if exists "transaction_categories_admin_all" on public.transaction_categories;
create policy "transaction_categories_admin_all" on public.transaction_categories
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

drop policy if exists "transactions_admin_all" on public.transactions;
create policy "transactions_admin_all" on public.transactions
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

drop policy if exists "invoices_admin_all" on public.invoices;
create policy "invoices_admin_all" on public.invoices
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

drop policy if exists "invoice_items_admin_all" on public.invoice_items;
create policy "invoice_items_admin_all" on public.invoice_items
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

drop policy if exists "payments_admin_all" on public.payments;
create policy "payments_admin_all" on public.payments
for all to authenticated
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

drop policy if exists "audit_logs_owner_read" on public.audit_logs;
create policy "audit_logs_owner_read" on public.audit_logs
for select to authenticated using (public.is_owner());

drop policy if exists "audit_logs_internal_insert" on public.audit_logs;
create policy "audit_logs_internal_insert" on public.audit_logs
for insert to authenticated
with check (actor_id = auth.uid() and public.current_app_role() in ('owner','admin'));

-- No anonymous table policies are created intentionally.
-- Public invoice page should call a Supabase Edge Function:
-- 1. Receive raw token from URL.
-- 2. Hash token with SHA-256 (same method used when creating token).
-- 3. Find active invoice by public_token_hash and token_revoked_at IS NULL.
-- 4. Return only approved public fields; never return internal_note,
--    internal costs, audit logs, or private storage paths.
-- 5. Do not expose service-role key to browser.

-- -------------------------
-- Initial Owner setup
-- -------------------------
-- 1. Create the first user through Supabase Auth.
-- 2. Find that user's UUID in Authentication > Users.
-- 3. Run this statement once, replacing the UUID:
--
-- update public.profiles
-- set role = 'owner', is_active = true
-- where id = 'REPLACE-WITH-AUTH-USER-UUID';
--
-- New users default to role 'workshop'. Owner/Admin should manage
-- user invitations through a trusted server-side process.
--
-- Invoice QR token:
-- Generate a cryptographically random raw token in a trusted backend.
-- Store only encode(digest(raw_token, 'sha256'), 'hex') in
-- invoices.public_token_hash. Put the raw token only in the QR URL.
-- Revoke by setting token_revoked_at = now() and clearing/replacing hash.
-- ============================================================
