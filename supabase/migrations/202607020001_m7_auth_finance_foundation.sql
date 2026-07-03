create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Phoenix',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.paychecks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  pay_date date not null,
  amount_cents integer not null check (amount_cents >= 0),
  source_label text,
  period_start date not null,
  period_end date not null,
  recurrence_rule_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  frequency text not null check (frequency in ('monthly', 'weekly', 'biweekly', 'custom_days')),
  day_of_month integer check (day_of_month between 1 and 31),
  anchor_date date,
  interval_days integer check (interval_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paychecks
  drop constraint if exists paychecks_recurrence_rule_id_fkey,
  add constraint paychecks_recurrence_rule_id_fkey
    foreign key (recurrence_rule_id) references public.recurrence_rules(id) on delete set null;

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  expected_amount_cents integer check (expected_amount_cents >= 0),
  due_day integer check (due_day between 1 and 31),
  due_date date,
  recurrence_rule_id uuid references public.recurrence_rules(id) on delete set null,
  is_fixed boolean not null default true,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bill_instances (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid references public.bills(id) on delete set null,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  due_date date,
  amount_cents integer check (amount_cents >= 0),
  status text not null default 'expected' check (status in ('expected', 'scheduled', 'paid', 'skipped', 'late')),
  paid_date date,
  paycheck_id uuid references public.paychecks(id) on delete set null,
  source_import_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  target_amount_cents integer not null check (target_amount_cents >= 0),
  target_date date,
  current_amount_cents integer not null default 0 check (current_amount_cents >= 0),
  monthly_contribution_cents integer check (monthly_contribution_cents >= 0),
  status text not null default 'active' check (status in ('active', 'reached', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source_type text not null check (source_type in ('paste', 'file', 'email', 'manual')),
  raw_text text not null,
  status text not null check (status in ('reviewing', 'applied', 'ignored')),
  created_at timestamptz not null default now()
);

create table if not exists public.import_suggestions (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  suggested_type text not null check (suggested_type in ('paycheck', 'bill', 'billInstance', 'appointment', 'task')),
  title text not null,
  amount_cents integer check (amount_cents >= 0),
  date date,
  paid boolean not null default false,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  raw_text text not null,
  accepted boolean not null default false,
  edited_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists paychecks_household_date_idx on public.paychecks(household_id, pay_date);
create index if not exists bills_household_active_idx on public.bills(household_id, active);
create index if not exists bill_instances_household_due_idx on public.bill_instances(household_id, due_date);
create index if not exists audit_events_household_created_idx on public.audit_events(household_id, created_at desc);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.paychecks enable row level security;
alter table public.recurrence_rules enable row level security;
alter table public.bills enable row level security;
alter table public.bill_instances enable row level security;
alter table public.goals enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_suggestions enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

create policy "members can read household" on public.households
  for select using (public.is_household_member(id));

create policy "owners can update household" on public.households
  for update using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = id and hm.user_id = auth.uid() and hm.role = 'owner'
    )
  );

create policy "members can read memberships" on public.household_members
  for select using (public.is_household_member(household_id));

create policy "owners can manage memberships" on public.household_members
  for all using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_members.household_id
        and hm.user_id = auth.uid()
        and hm.role = 'owner'
    )
  );

create policy "members manage paychecks" on public.paychecks
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage recurrence rules" on public.recurrence_rules
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage bills" on public.bills
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage bill instances" on public.bill_instances
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage goals" on public.goals
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage import batches" on public.import_batches
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "members manage import suggestions" on public.import_suggestions
  for all using (
    exists (
      select 1
      from public.import_batches b
      where b.id = import_suggestions.import_batch_id
        and public.is_household_member(b.household_id)
    )
  )
  with check (
    exists (
      select 1
      from public.import_batches b
      where b.id = import_suggestions.import_batch_id
        and public.is_household_member(b.household_id)
    )
  );

create policy "members read audit events" on public.audit_events
  for select using (public.is_household_member(household_id));

create policy "members create audit events" on public.audit_events
  for insert with check (public.is_household_member(household_id));
