-- ===================================================================
-- Validation trigger to prevent completing a project if:
-- 1. Progress is not yet 100%
-- 2. Invoices are unpaid or not yet settled
-- ===================================================================

create or replace function public.validate_project_completion()
returns trigger as $$
declare
  v_latest_progress numeric;
  v_unpaid_count int;
  v_invoice_count int;
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
    -- 1. Check project progress (must be 100%)
    select coalesce(
      (select progress_percent from public.project_progress where project_id = new.id order by progress_date desc limit 1),
      0
    ) into v_latest_progress;

    if v_latest_progress < 100 then
      raise exception 'Proyek belum dapat diselesaikan: Progres pengerjaan baru % persen, belum mencapai 100 persen.', v_latest_progress;
    end if;

    -- 2. Check invoices for this project
    select
      count(*),
      count(*) filter (where greatest(total_amount - coalesce((select sum(amount) from public.payments where invoice_id = invoices.id), 0), 0) > 0)
    into v_invoice_count, v_unpaid_count
    from public.invoices
    where project_id = new.id and status <> 'cancelled';

    if v_invoice_count = 0 and coalesce(new.contract_value, 0) > 0 then
      raise exception 'Proyek belum dapat diselesaikan: Belum ada invoice yang diterbitkan dan dilunasi untuk nilai kontrak proyek ini.';
    end if;

    if v_unpaid_count > 0 then
      raise exception 'Proyek belum dapat diselesaikan: Masih terdapat tagihan invoice yang belum lunas.';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_validate_project_completion on public.projects;
create trigger trg_validate_project_completion
  before update on public.projects
  for each row
  execute function public.validate_project_completion();
