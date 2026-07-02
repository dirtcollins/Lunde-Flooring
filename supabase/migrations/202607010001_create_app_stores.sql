create table if not exists public.app_stores (
  name text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_stores enable row level security;

revoke all on table public.app_stores from anon;
revoke all on table public.app_stores from authenticated;

create index if not exists app_stores_updated_at_idx
  on public.app_stores (updated_at desc);
