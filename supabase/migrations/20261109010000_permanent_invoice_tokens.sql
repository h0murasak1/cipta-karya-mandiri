-- Add public_token column to invoices table to keep invoice links permanent
alter table public.invoices
  add column if not exists public_token text;

-- Create index for quick lookup
create index if not exists idx_invoices_public_token on public.invoices(public_token);
