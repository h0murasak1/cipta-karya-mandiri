-- ===================================================================
-- Validation trigger to ensure that newly added project progress
-- always increases strictly higher than the previous recorded progress.
-- ===================================================================

create or replace function public.validate_progress_progression()
returns trigger as $$
declare
  v_prev_percent numeric;
begin
  select progress_percent into v_prev_percent
  from public.project_progress
  where project_id = new.project_id
  order by progress_date desc, created_at desc
  limit 1;

  if v_prev_percent is not null and new.progress_percent <= v_prev_percent then
    raise exception 'Persentase progres baru (% persen) harus lebih besar dari progres sebelumnya (% persen).', new.progress_percent, v_prev_percent;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_validate_progress_progression on public.project_progress;
create trigger trg_validate_progress_progression
  before insert on public.project_progress
  for each row
  execute function public.validate_progress_progression();
