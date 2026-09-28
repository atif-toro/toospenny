-- Spenny personal finance schema
create table public.profiles (
  id uuid primary key,
  display_name text,
  currency text not null default 'GBP',
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  kind text not null default 'expense' check (kind in ('expense','income')),
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  type text not null default 'current' check (type in ('current','savings','credit_card','loan','investment','other')),
  balance_pence bigint not null default 0,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount_pence bigint not null check (amount_pence > 0),
  date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null,
  limit_pence bigint not null check (limit_pence >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  target_pence bigint not null check (target_pence > 0),
  target_date date,
  note text,
  created_at timestamptz not null default now()
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  goal_id uuid not null references public.goals(id) on delete cascade,
  amount_pence bigint not null check (amount_pence > 0),
  date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  type text not null default 'loan' check (type in ('credit_card','loan','student','mortgage','other')),
  balance_pence bigint not null check (balance_pence >= 0),
  apr numeric(6,3) not null default 0,
  min_payment_pence bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount_pence bigint not null check (amount_pence > 0),
  date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index idx_transactions_user_date on public.transactions (user_id, date desc);
create index idx_transactions_account on public.transactions (account_id);
create index idx_budgets_user_month on public.budgets (user_id, month);
create index idx_debts_user on public.debts (user_id);

-- Grants (Data API access)
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.goal_contributions to authenticated;
grant select, insert, update, delete on public.debts to authenticated;
grant select, insert, update, delete on public.debt_payments to authenticated;
grant all on public.profiles to service_role;
grant all on public.categories to service_role;
grant all on public.accounts to service_role;
grant all on public.transactions to service_role;
grant all on public.budgets to service_role;
grant all on public.goals to service_role;
grant all on public.goal_contributions to service_role;
grant all on public.debts to service_role;
grant all on public.debt_payments to service_role;

-- Row level security
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

create policy "Users can view own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "Users manage own categories" on public.categories for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own accounts" on public.accounts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own transactions" on public.transactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own budgets" on public.budgets for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own goals" on public.goals for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own goal contributions" on public.goal_contributions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own debts" on public.debts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own debt payments" on public.debt_payments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
