import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Lightbulb, Minus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useIsMobile } from "@/hooks/use-mobile";
import { getSpennyScore, type SpennyScoreData } from "@/lib/finance.functions";
import { monthLabel } from "@/lib/money";
import { bandSentence, SCORE_CONFIG, type ComponentResult, type Factor } from "@/lib/spenny-score";
import { cn } from "@/lib/utils";

export const spennyScoreQueryKey = ["spenny-score"] as const;

function ScoreRing({ score, size = 64, stroke = 7 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        className="transition-[stroke-dasharray] duration-700"
      />
    </svg>
  );
}

function Delta({ delta, className }: { delta: number | null; className?: string }) {
  if (delta === null) return null;
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold tabular-nums",
        delta > 0 ? "text-success" : "text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(delta)}
    </span>
  );
}

export function SpennyScoreCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: spennyScoreQueryKey,
    queryFn: () => getSpennyScore(),
    staleTime: 60_000,
  });
  const [open, setOpen] = useState(false);

  if (isError) return null;
  if (isLoading || !data) {
    return <div className="mb-4 h-[88px] animate-pulse rounded-xl border bg-card sm:h-[104px]" />;
  }

  const { current, change } = data;
  if (current.countedCount === 0) return null;
  const delta = change?.delta ?? null;
  const help = current.helping[0];
  const attn = current.needsAttention[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group mb-4 flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 sm:p-5"
        aria-label={`Spenny Score ${current.score}, ${current.band.label}. View details`}
      >
        <div className="relative shrink-0">
          <ScoreRing score={current.score} size={60} stroke={6} />
          <span className="font-display absolute inset-0 grid place-items-center text-lg font-semibold tabular-nums">
            {current.score}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spenny Score</p>
            <Delta delta={delta} className="text-sm" />
            {delta !== null && <span className="hidden text-xs text-muted-foreground sm:inline">since last month</span>}
          </div>
          <p className="font-display mt-0.5 truncate text-base font-semibold sm:text-lg">{current.band.label}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {help && (
              <>
                <span className="sm:hidden">{help.label} ↑</span>
                <span className="hidden sm:inline">Helping: <span className="text-foreground">{help.label}</span></span>
              </>
            )}
            {help && attn && <span className="px-1.5">·</span>}
            {attn && (
              <>
                <span className="sm:hidden">{attn.label} ↓</span>
                <span className="hidden sm:inline">Needs attention: <span className="text-foreground">{attn.label}</span></span>
              </>
            )}
            {!help && !attn && bandSentence(current.band, delta)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
          <span className="hidden sm:inline">View details</span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
      <ScoreSheet open={open} onOpenChange={setOpen} data={data} />
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-display mb-3 text-base font-semibold">{children}</h3>;
}

function ScoreSheet({ open, onOpenChange, data }: { open: boolean; onOpenChange: (o: boolean) => void; data: SpennyScoreData }) {
  const isMobile = useIsMobile();
  const { current, change } = data;
  const delta = change?.delta ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn("overflow-y-auto p-0", isMobile ? "max-h-[88vh] rounded-t-2xl" : "w-full sm:max-w-lg")}
      >
        <div className="space-y-7 p-5 sm:p-6">
          {/* 1. Overall */}
          <SheetHeader className="text-left">
            <SheetTitle className="sr-only">Spenny Score</SheetTitle>
            <SheetDescription className="sr-only">How your score is made up and what you can do next.</SheetDescription>
            <div className="flex items-center gap-4">
              <div className="relative">
                <ScoreRing score={current.score} size={96} stroke={9} />
                <span className="font-display absolute inset-0 grid place-items-center text-3xl font-semibold tabular-nums">
                  {current.score}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Spenny Score</p>
                <p className="font-display text-2xl font-semibold">{current.band.label}</p>
                {delta !== null ? (
                  <p className="mt-0.5 flex items-center gap-1 text-sm">
                    <Delta delta={delta} />
                    <span className="text-muted-foreground">since {monthLabel(data.previousMonth.slice(0, 7))}</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-muted-foreground">Your first month — we'll track changes from here.</p>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{bandSentence(current.band, delta)}</p>
            {current.limitedData && (
              <p className="mt-2 inline-block rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{current.limitedData}</p>
            )}
          </SheetHeader>

          {/* 2. Why it changed */}
          {change && (
            <section>
              <SectionTitle>Why your score changed</SectionTitle>
              <p className="mb-3 text-sm text-muted-foreground">
                {change.delta === 0
                  ? "Your score held steady since last month."
                  : `Your score ${change.delta > 0 ? "increased" : "decreased"} by ${Math.abs(change.delta)} point${Math.abs(change.delta) === 1 ? "" : "s"}.`}
              </p>
              {change.contributions.length > 0 ? (
                <ul className="grid grid-cols-2 gap-2">
                  {change.contributions.map((c) => (
                    <li key={c.id} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm">
                      <span className="truncate">{c.label}</span>
                      <span className={cn("flex items-center gap-0.5 font-semibold tabular-nums", c.change > 0 ? "text-success" : "text-destructive")}>
                        {c.change > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                        {c.change > 0 ? "+" : "−"}
                        {Math.abs(Math.round(c.change))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No area moved by more than half a point.</p>
              )}
            </section>
          )}

          {/* 3. Breakdown */}
          <section>
            <SectionTitle>Breakdown</SectionTitle>
            <ul className="space-y-2">
              {current.components.map((c) => (
                <ComponentRow key={c.id} c={c} />
              ))}
            </ul>
          </section>

          {/* 4 & 5 */}
          <div className="grid gap-5 sm:grid-cols-2">
            <FactorList title="Helping your score" items={current.helping} tone="good" empty="Keep going — strengths will show here." />
            <FactorList title="Needs attention" items={current.needsAttention} tone="attn" empty="Nothing needs attention right now." />
          </div>

          {/* 6. Actions */}
          <section>
            <SectionTitle>What you can do</SectionTitle>
            {current.actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quick wins right now — you're doing the important things.</p>
            ) : (
              <ul className="space-y-2">
                {current.actions.map((a) => (
                  <li key={a.id} className="flex gap-3 rounded-lg border bg-background p-3">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Potential impact: +{a.impact.min === a.impact.max ? a.impact.max : `${a.impact.min}–${a.impact.max}`} pts (estimate)
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 7. Method */}
          <HowItWorks />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ComponentRow({ c }: { c: ComponentResult }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border bg-background">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full p-3 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {c.label} <span className="text-xs font-normal text-muted-foreground">· {c.weight}%</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {c.counted ? (
                <span className="font-display text-sm font-semibold tabular-nums">{c.score}</span>
              ) : (
                <span className="text-xs text-muted-foreground">Not counted yet</span>
              )}
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
            </div>
          </div>
          {c.counted && (
            <>
              <Progress value={c.score} className="mt-2 h-1.5" />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {c.id === "buffer" && c.months !== undefined ? (
                  <><span className="font-semibold text-foreground">{c.months} months</span> — {c.summary}</>
                ) : (
                  c.summary
                )}
              </p>
            </>
          )}
          {!c.counted && c.tip && <p className="mt-1 text-xs text-muted-foreground">{c.tip}</p>}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t px-3 py-2 text-xs">
            {c.metrics.map((m) => (
              <div key={m.label} className="contents">
                <dt className="text-muted-foreground">{m.label}</dt>
                <dd className="text-right tabular-nums">{m.value}</dd>
              </div>
            ))}
            {c.id === "buffer" && (
              <p className="col-span-2 mt-1 text-muted-foreground">Counts your Current and Savings account balances. Investments aren't included.</p>
            )}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function FactorList({ title, items, tone, empty }: { title: string; items: Factor[]; tone: "good" | "attn"; empty: string }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f) => (
            <li key={f.id} className="text-sm">
              <p className="flex items-center justify-between font-medium">
                <span>{f.label}</span>
                <span className={cn("tabular-nums", tone === "good" ? "text-success" : f.score < 35 ? "text-destructive" : "text-chart-2")}>
                  {f.score}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{f.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);
  const w = SCORE_CONFIG.weights;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-muted/40">
      <CollapsibleTrigger className="flex w-full items-center justify-between p-3 text-left text-sm font-medium">
        How it's calculated
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-muted-foreground">
        <p>Your score is the weighted average of eight areas, each scored 0–100 from your own data for this month.</p>
        <ul className="list-disc space-y-1 pl-4">
          <li><b>Spending ({w.spending}%)</b>: day-to-day spending as a share of income (bills and debt payments aren't included). 40% or less scores full marks.</li>
          <li><b>Cash flow ({w.cashflow}%)</b>: income minus spending, bills and debt payments. Keeping 20% or more scores full marks. Moving money to savings doesn't count against you.</li>
          <li><b>Savings ({w.savings}%)</b>: new money moved from a Current account into Savings or Investments, plus goal contributions, each counted once. Money moved between savings accounts or borrowed on a card or loan doesn't count. 20% of income scores full marks.</li>
          <li><b>Budgets ({w.budgets}%)</b>: how closely you stick to your limits, weighted by budget size.</li>
          <li><b>Goals ({w.goals}%)</b>: progress against expected pace, weighted by goal size. No single goal can count for more than 40%.</li>
          <li><b>Debt ({w.debt}%)</b>: debt compared with yearly income (40%), required payments vs income (25%), minimum payments made (25%) and interest rates (10%). Manageable debt paid on time can still score highly.</li>
          <li><b>Bills ({w.bills}%)</b>: recurring bills and subscriptions as a share of income, plus anything overdue.</li>
          <li><b>Financial buffer ({w.buffer}%)</b>: months of essential costs your Current and Savings balances could cover. 3 months or more scores full marks.</li>
        </ul>
        <p>Areas you haven't set up yet are left out, and the others are scaled up to fill the gap. You're never marked down for a feature you don't use.</p>
        <p>Potential impacts on actions are estimates, not guarantees.</p>
      </CollapsibleContent>
    </Collapsible>
  );
}
