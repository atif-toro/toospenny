import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  Plus,
  Scale,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard } from "@/components/finance-ui";
import { RouteError, RouteNotFound } from "@/components/route-states";
import { SpennyScoreCard } from "@/components/spenny-score-card";
import { getDashboard, listBills } from "@/lib/finance.functions";
import { formatDate, formatPence, monthLabel } from "@/lib/money";

const dashboardQuery = queryOptions({
  queryKey: ["dashboard"],
  queryFn: () => getDashboard(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Too Spenny" },
      { name: "description", content: "Your net worth, cash flow and spending at a glance." },
      { property: "og:title", content: "Dashboard — Too Spenny" },
      { property: "og:description", content: "Your net worth, cash flow and spending at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: DashboardPage,
});

export function DashboardPage() {
  const { data: d } = useSuspenseQuery(dashboardQuery);
  const navigate = useNavigate();

  const empty = d.accountCount === 0;
  const net = d.thisMonth.incomePence - d.thisMonth.expensesPence;
  const donutColors = ["#3e7a5e", "#c98f3d", "#4a6b8a", "#c26d4f", "#8a6bb0", "#b0567c", "#5a9a8f", "#c9a13d", "#8a8a72"];

  if (empty) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Your money, mapped out."
        />
        <EmptyState
          title="Let's map your money"
          body="Add your first account — a current account, savings, credit card, anything — and your dashboard will come to life."
          action={
            <Button onClick={() => navigate({ to: "/accounts" })}>
              <Plus className="mr-2 h-4 w-4" /> Add your first account
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Everything at a glance."
        action={
          <Button variant="outline" onClick={() => navigate({ to: "/transactions" })}>
            <Plus className="mr-2 h-4 w-4" /> Add transaction
          </Button>
        }
      />

      <SpennyScoreCard />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net worth"
          value={formatPence(d.netWorthPence)}
          sub={`${formatPence(d.assetsPence)} assets · ${formatPence(d.liabilitiesPence)} owed`}
          valueClassName={d.netWorthPence >= 0 ? "" : "text-destructive"}
        />
        <StatCard
          label="This month's income"
          value={formatPence(d.thisMonth.incomePence)}
        />
        <StatCard
          label="This month's spending"
          value={formatPence(d.thisMonth.expensesPence)}
        />
        <StatCard
          label="Cash flow this month"
          value={formatPence(net)}
          sub={net >= 0 ? "You're in the green" : "You're spending more than you earn"}
          valueClassName={net >= 0 ? "text-chart-1" : "text-destructive"}
        />
      </div>

      <UpcomingBills />

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Net worth trend</h2>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.monthly} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tickFormatter={(m: string) => monthLabel(m)}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={60}
                  tickFormatter={(v: number) => `£${(v / 100).toLocaleString("en-GB", { notation: "compact" })}`}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => [formatPence(Number(v)), "Net worth"]}
                  labelFormatter={(m) => monthLabel(String(m))}
                />
                <Area type="monotone" dataKey="netWorth" stroke="var(--chart-1)" strokeWidth={2} fill="url(#nw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Spending by category</h2>
            <span className="text-xs text-muted-foreground">This month</span>
          </div>
          {d.spendingByCategory.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Landmark className="mb-3 h-8 w-8" />
              No spending recorded this month yet.
              <Link to="/transactions" className="mt-2 text-primary hover:underline">
                Add a transaction
              </Link>
            </div>
          ) : (
            <div className="flex h-64 flex-col">
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={d.spendingByCategory}
                      dataKey="amountPence"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                    >
                      {d.spendingByCategory.map((_, i) => (
                        <Cell key={i} fill={donutColors[i % donutColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatPence(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {d.spendingByCategory.slice(0, 6).map((c, i) => (
                  <li key={c.name} className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: donutColors[i % donutColors.length] }}
                    />
                    {c.name} · {formatPence(c.amountPence)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-3">
          <h2 className="font-display mb-4 text-lg font-semibold">Income vs spending</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.monthly} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <XAxis
                  dataKey="month"
                  tickFormatter={(m: string) => monthLabel(m)}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={60}
                  tickFormatter={(v: number) => `£${(v / 100).toLocaleString("en-GB", { notation: "compact" })}`}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => formatPence(Number(v))}
                  labelFormatter={(m) => monthLabel(String(m))}
                />
                <Bar dataKey="income" name="Income" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="Spending" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Debt</h2>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="font-display text-3xl font-semibold tabular-nums">
            {formatPence(d.totalDebtPence)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">total debt remaining</p>
          <div className="mt-4 flex items-center gap-2 text-sm">
            <ArrowDownRight className="h-4 w-4 text-chart-1" />
            <span className="font-medium text-chart-1">{formatPence(d.debtPaidPence)}</span>
            <span className="text-muted-foreground">paid off so far</span>
          </div>
          {d.totalDebtPence > 0 && (
            <Button variant="outline" className="mt-5 w-full" asChild>
              <Link to="/payoff">Open payoff planner</Link>
            </Button>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Recent transactions</h2>
          <Link to="/transactions" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {d.recentTransactions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <ul className="divide-y">
            {d.recentTransactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.note || t.category_name || "Transaction"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.date} · {t.account_name ?? "No account"}
                    {t.category_name ? ` · ${t.category_name}` : ""}
                  </p>
                </div>
                <span
                  className={
                    "ml-4 flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums " +
                    (t.type === "income" ? "text-chart-1" : "text-foreground")
                  }
                >
                  {t.type === "income" ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  )}
                  {t.type === "income" ? "+" : "−"}
                  {formatPence(t.amount_pence).replace("£", "£")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UpcomingBills() {
  const { data: bills = [] } = useQuery({ queryKey: ["bills"], queryFn: () => listBills() });
  const due = bills
    .filter((b) => b.active && b.status !== "paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 5);

  if (bills.length === 0) return null;

  const total = due.reduce((s, b) => s + b.amount_pence, 0);

  return (
    <section className="mt-4 rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Upcoming outgoings</h2>
        <Link to="/bills" className="text-xs text-primary hover:underline">
          Manage outgoings
        </Link>
      </div>
      {due.length === 0 ? (
        <p className="text-sm text-muted-foreground">Everything is paid up. Nice.</p>
      ) : (
        <>
          <ul className="divide-y">
            {due.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Due {formatDate(b.due_date)}
                    {b.status === "overdue" ? " · overdue" : ""}
                  </p>
                </div>
                <span
                  className={
                    "tabular-nums " + (b.status === "overdue" ? "text-destructive" : "")
                  }
                >
                  {formatPence(b.amount_pence)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {formatPence(total)} still to leave your accounts.
          </p>
        </>
      )}
    </section>
  );
}
