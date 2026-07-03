create table if not exists public.cloud_snapshots (
  household_id uuid primary key references public.households(id) on delete cascade,
  schema_version integer not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cloud_snapshots enable row level security;

create policy "members manage cloud snapshots" on public.cloud_snapshots
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
