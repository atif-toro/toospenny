import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, StatCard } from "@/components/finance-ui";
import { RouteError, RouteNotFound } from "@/components/route-states";
import { listDebts } from "@/lib/finance.functions";
import { addMonthsISO, formatPence, monthLabel, todayISO } from "@/lib/money";
import {
  debtFreeDate,
  orderDebts,
  simulatePayoff,
  type PayoffDebt,
  type PayoffResult,
} from "@/lib/payoff";

export const Route = createFileRoute("/_authenticated/payoff")({
  head: () => ({
    meta: [
      { title: "Payoff planner — Too Spenny" },
      {
        name: "description",
        content: "Compare Snowball and Avalanche plans and see your debt-free date.",
      },
      { property: "og:title", content: "Payoff planner — Too Spenny" },
      {
        property: "og:description",
        content: "Compare Snowball and Avalanche plans and see your debt-free date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: PayoffPage,
});

function PayoffPage() {
  const { data: debts = [], isLoading } = useQuery({
    queryKey: ["debts"],
    queryFn: () => listDebts(),
  });
  const [extra, setExtra] = useState("100");
  const [method, setMethod] = useState<"snowball" | "avalanche">("snowball");

  const extraPence = useMemo(() => {
    const v = parseFloat(extra || "0");
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
  }, [extra]);

  // Convert to the payoff engine's shape.
  const payoffDebts: PayoffDebt[] = useMemo(
    () =>
      debts
        .filter((d) => d.balance_pence > 0)
        .map((d) => ({
          id: d.id,
          name: d.name,
          balancePence: d.balance_pence,
          apr: d.apr,
          minPaymentPence: d.min_payment_pence,
        })),
    [debts],
  );

  const plans = useMemo(() => {
    if (payoffDebts.length === 0) return null;
    const snowball = simulatePayoff(payoffDebts, extraPence, "snowball");
    const avalanche = simulatePayoff(payoffDebts, extraPence, "avalanche");
    const minimums = simulatePayoff(payoffDebts, 0, "avalanche");
    return { snowball, avalanche, minimums };
  }, [payoffDebts, extraPence]);

  const plan: PayoffResult | null = plans
    ? method === "snowball"
      ? plans.snowball
      : plans.avalanche
    : null;

  const bestMethod = plans
    ? plans.snowball.totalInterestPence <= plans.avalanche.totalInterestPence
      ? "snowball"
      : "avalanche"
    : null;

  const chartData = useMemo(() => {
    if (!plans) return [];
    const len = Math.min(
      plans.snowball.series.length,
      plans.avalanche.series.length,
      plans.minimums.series.length,
    );
    return Array.from({ length: len }, (_, i) => ({
      month: i,
      snowball: plans.snowball.series[i]?.balance ?? 0,
      avalanche: plans.avalanche.series[i]?.balance ?? 0,
      minimums: plans.minimums.series[i]?.balance ?? 0,
    }));
  }, [plans]);

  const ordered = useMemo(() => {
    if (!plan) return [];
    const monthById = new Map(plan.payoffOrder.map((o) => [o.id, o.month]));
    return orderDebts(payoffDebts, method).map((d) => ({
      ...d,
      payoffMonth: monthById.get(d.id) ?? null,
    }));
  }, [plan, payoffDebts, method]);

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Payoff planner" description="Find the fastest route to debt-free." />
        <p className="text-center text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (payoffDebts.length === 0) {
    return (
      <div>
        <PageHeader title="Payoff planner" description="Find the fastest route to debt-free." />
        <div className="rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
          <h3 className="font-display text-xl font-semibold">Nothing to pay off</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Add a debt — a credit card, loan or mortgage — and Too Spenny will plan your route out of it.
          </p>
          <Button className="mt-5" asChild>
            <a href="/debts">Go to debts</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Payoff planner"
        description="Snowball or Avalanche — pick your route out of debt."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="extra">Extra payment each month (£)</Label>
          <Input
            id="extra"
            inputMode="decimal"
            placeholder="100.00"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            className="max-w-48"
          />
          <p className="text-xs text-muted-foreground">
            On top of your minimums — every extra pound shortens the plan.
          </p>
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label>Strategy</Label>
          <div className="flex gap-2">
            <Button
              variant={method === "snowball" ? "default" : "outline"}
              onClick={() => setMethod("snowball")}
            >
              Snowball
            </Button>
            <Button
              variant={method === "avalanche" ? "default" : "outline"}
              onClick={() => setMethod("avalanche")}
            >
              Avalanche
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Snowball</strong> clears the smallest balance first — quick wins keep you going.{" "}
            <strong>Avalanche</strong> attacks the highest interest rate first — cheapest overall.
          </p>
        </div>
      </div>

      {!plan || !plan.feasible || plan.months === null ? (
        <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
          <h3 className="font-display text-lg font-semibold text-destructive">
            This plan doesn't work
          </h3>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Your minimum payments don't cover the monthly interest, so the balance would keep
            growing. Try to raise the minimums on your highest-rate debts, or add a larger extra
            payment.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Debt-free in"
              value={`${plan.months} ${plan.months === 1 ? "month" : "months"}`}
              sub={debtFreeDate(plan.months)}
            />
            <StatCard label="Interest you'll pay" value={formatPence(plan.totalInterestPence)} />
            <StatCard
              label="Saved vs minimums only"
              value={formatPence(
                Math.max(0, plans!.minimums.totalInterestPence - plan.totalInterestPence),
              )}
              sub="compared to paying minimums"
              valueClassName="text-chart-1"
            />
            <StatCard label="Total paid" value={formatPence(plan.totalPaidPence)} />
          </div>

          {bestMethod && bestMethod !== method && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-accent bg-accent/30 px-4 py-3 text-sm">
              <Sparkles className="h-4 w-4 shrink-0 text-foreground" />
              <span>
                The <strong>{bestMethod === "snowball" ? "Snowball" : "Avalanche"}</strong> plan would
                save you{" "}
                <strong>
                  {formatPence(
                    Math.abs(
                      plans!.snowball.totalInterestPence - plans!.avalanche.totalInterestPence,
                    ),
                  )}
                </strong>{" "}
                in interest — switch to compare.
              </span>
            </div>
          )}

          <section className="mt-6 rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="font-display mb-4 text-lg font-semibold">Balance over time</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(m: number) =>
                      monthLabel(addMonthsISO(todayISO(), m).slice(0, 7))
                    }
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    width={60}
                    tickFormatter={(v: number) =>
                      `£${(v / 100).toLocaleString("en-GB", { notation: "compact" })}`
                    }
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    labelFormatter={(m) => monthLabel(addMonthsISO(todayISO(), Number(m)).slice(0, 7))}
                    formatter={(v) => formatPence(Number(v))}
                  />
                  <Line
                    type="monotone"
                    dataKey="snowball"
                    name="Snowball"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="avalanche"
                    name="Avalanche"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="minimums"
                    name="Minimums only"
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="mt-4 rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="font-display mb-3 text-lg font-semibold">Payoff order</h2>
            <ol className="divide-y">
              {ordered.map((d, i) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.apr}% APR · {formatPence(d.balancePence)} left
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {d.payoffMonth
                      ? `cleared ${monthLabel(addMonthsISO(todayISO(), d.payoffMonth).slice(0, 7))}`
                      : "not cleared in plan"}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
            <h2 className="font-display px-5 pt-5 text-lg font-semibold">Side by side</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-y text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">Plan</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Debt-free in</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Interest</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Total paid</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(
                  [
                    ["snowball", plans!.snowball],
                    ["avalanche", plans!.avalanche],
                    ["minimums", plans!.minimums],
                  ] as const
                ).map(([name, p]) => (
                  <tr key={name} className={name === method ? "bg-accent/40" : ""}>
                    <td className="px-5 py-3 font-medium">
                      {name === "snowball"
                        ? "Snowball"
                        : name === "avalanche"
                          ? "Avalanche"
                          : "Minimums only"}
                      {name === method && (
                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                          yours
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {p.feasible && p.months !== null ? `${p.months} mo` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {p.feasible ? formatPence(p.totalInterestPence) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {p.feasible ? formatPence(p.totalPaidPence) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
