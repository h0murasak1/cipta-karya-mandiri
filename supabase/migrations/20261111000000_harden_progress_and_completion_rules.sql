-- ===================================================================
-- Hardening for the progress / completion rules and multi-bank data.
--
-- 1. "Current progress" is now the HIGHEST recorded percentage instead of
--    the row with the latest progress_date. Progress is strictly increasing,
--    so both are equivalent for clean data, but the max is deterministic
--    when two entries share a timestamp or a date was back-filled.
-- 2. Both trigger functions pin search_path (they are SECURITY DEFINER).
-- 3. Progress inserts for one project are serialised so two concurrent
--    submissions cannot both pass the "must be higher" check.
-- 4. company_settings.bank_accounts must always be a JSON array.
--
-- Safe to run whether or not 20261110* were already applied: everything
-- here is create-or-replace / idempotent.
-- ===================================================================

create or replace function public.validate_progress_progression()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev_percent numeric;
begin
  -- One writer per project at a time (released at transaction end).
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 0));

  select max(progress_percent) into v_prev_percent
  from public.project_progress
  where project_id = new.project_id;

  if v_prev_percent is not null and new.progress_percent <= v_prev_percent then
    raise exception 'Persentase progres baru (% persen) harus lebih besar dari progres sebelumnya (% persen).',
      new.progress_percent, v_prev_percent;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_progress_progression on public.project_progress;
create trigger trg_validate_progress_progression
  before insert on public.project_progress
  for each row
  execute function public.validate_progress_progression();

create or replace function public.validate_project_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress numeric;
  v_unpaid_count int;
  v_invoice_count int;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    -- 1. Progress must have reached 100%.
    select coalesce(max(progress_percent), 0) into v_progress
    from public.project_progress
    where project_id = new.id;

    if v_progress < 100 then
      raise exception 'Proyek belum dapat diselesaikan: Progres pengerjaan baru % persen, belum mencapai 100 persen.', v_progress;
    end if;

    -- 2. Every non-cancelled invoice of the project must be fully paid.
    select
      count(*),
      count(*) filter (
        where i.total_amount - coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0) > 0
      )
    into v_invoice_count, v_unpaid_count
    from public.invoices i
    where i.project_id = new.id and i.status <> 'cancelled';

    if v_invoice_count = 0 and coalesce(new.contract_value, 0) > 0 then
      raise exception 'Proyek belum dapat diselesaikan: Belum ada invoice yang diterbitkan dan dilunasi untuk nilai kontrak proyek ini.';
    end if;

    if v_unpaid_count > 0 then
      raise exception 'Proyek belum dapat diselesaikan: Masih terdapat tagihan invoice yang belum lunas.';
    end if;
  end if;

  return new;
end;
$$;

-- Only re-check when the status column is actually written.
drop trigger if exists trg_validate_project_completion on public.projects;
create trigger trg_validate_project_completion
  before update of status on public.projects
  for each row
  execute function public.validate_project_completion();

-- bank_accounts is edited as free-form JSON from the client; keep its shape sane.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_settings_bank_accounts_is_array'
      and conrelid = 'public.company_settings'::regclass
  ) then
    alter table public.company_settings
      add constraint company_settings_bank_accounts_is_array
      check (jsonb_typeof(bank_accounts) = 'array');
  end if;
end;
$$;
