-- Add bank_accounts JSONB array column to company_settings.
-- Each element: { "bank_name": "", "account_name": "", "account_number": "" }
-- Migrates existing single bank account data into the new array.

alter table public.company_settings
  add column if not exists bank_accounts jsonb not null default '[]'::jsonb;

-- Migrate existing single bank fields into the new array (if any data exists).
update public.company_settings
set bank_accounts = jsonb_build_array(
  jsonb_build_object(
    'bank_name', coalesce(bank_name, ''),
    'account_name', coalesce(bank_account_name, ''),
    'account_number', coalesce(bank_account_number, '')
  )
)
where bank_account_number is not null
  and bank_account_number <> ''
  and (bank_accounts = '[]'::jsonb or bank_accounts is null);
