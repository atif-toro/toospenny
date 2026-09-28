# Spenny — personal finance app

A clean, modern web app to see all your money in one place: accounts, income, expenses, savings, investments and debts — with a debt payoff planner to get you debt-free. Amounts in GBP (£). You sign in with your own account and your data is saved securely in the cloud. The app starts empty with friendly "add your first…" prompts.

## Pages

**Sign in / sign up** — email and password, plus Google sign-in. Everything else sits behind it.

**Dashboard** — the home screen after signing in:
- Net worth (assets minus debts) with change over time
- Cash flow this month: money in, money out, what's left
- Total debt with a payoff progress bar
- Spending by category (donut)
- Trends: net worth and income vs expenses over the last 12 months
- Recent transactions

**Accounts** — add current accounts, savings, credit cards, loans and investments manually, each with a balance. Edit, archive or delete.

**Transactions** — add income and expenses with date, amount, category, account and note. Filter by month, category and account; search; running totals.

**Budgets** — set a monthly limit per spending category, see spent vs remaining with progress bars and an over-budget warning.

**Goals** — savings goals with a target amount, target date and current progress; add contributions and see whether you're on track.

**Debts** — list each debt with balance, interest rate (APR) and minimum payment; record payments and watch balances fall.

**Debt payoff planner** — choose Snowball (smallest balance first) or Avalanche (highest rate first), set any extra monthly payment, and see:
- Debt-free date for each method
- Total interest paid and interest saved vs minimum payments only
- A side-by-side comparison of the two methods
- Month-by-month payoff order and a balance-over-time chart

## Design

Before building, I'll show you three design directions for the dashboard so you can pick the look and feel. Then the whole app is built in that style, working on phone and desktop, with light and dark mode.

## Technical notes

- Lovable Cloud (auth + Postgres) for accounts, data storage and security.
- Tables: `profiles`, `accounts`, `transactions`, `categories`, `budgets`, `goals`, `goal_contributions`, `debts`, `debt_payments`. Every table has row-level security scoped to `auth.uid()` plus explicit grants, so users only ever see their own data.
- Amounts stored as integer pence to avoid rounding errors; formatted as £ in the UI.
- TanStack Start routes: public `/` sign-in landing and `/auth`; `_authenticated/` for `/dashboard`, `/accounts`, `/transactions`, `/budgets`, `/goals`, `/debts`, `/payoff`.
- Reads/writes go through `createServerFn` with `requireSupabaseAuth`, loaded via TanStack Query.
- Payoff maths (snowball/avalanche amortisation) is a pure, unit-tested module in `src/lib/payoff.ts`.
- Charts with Recharts; UI with shadcn components and semantic design tokens.

## Build order

1. Enable Cloud, database schema + security, email and Google sign-in
2. Design directions, then app shell, navigation and theme
3. Accounts and transactions (with categories)
4. Dashboard metrics and charts
5. Budgets and savings goals
6. Debts and the Snowball/Avalanche payoff planner
