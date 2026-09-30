/**
 * Spenny Score — a transparent 0–100 financial progress indicator.
 * Pure and deterministic: no I/O, safe on client and server.
 */

export type AccountType = "current" | "savings" | "credit_card" | "loan" | "investment" | "other";

export type ComponentId =
  | "spending"
  | "cashflow"
  | "savings"
  | "budgets"
  | "goals"
  | "debt"
  | "bills"
  | "buffer";

export type BandId = "thriving" | "on_track" | "building" | "needs_attention" | "needs_focus";

export const SCORE_CONFIG = {
  weights: {
    spending: 15,
    cashflow: 15,
    savings: 15,
    budgets: 10,
    goals: 10,
    debt: 15,
    bills: 10,
    buffer: 10,
  } satisfies Record<ComponentId, number>,
  /** [valueFor100, valueFor0] — linear between. */
  thresholds: {
    spendingRatio: [0.4, 0.9],
    cashflowRatio: [0.2, -0.1],
    savingsRate: [0.2, 0],
    budgetOverRatio: [0, 0.5],
    billsRatio: [0.35, 0.7],
    bufferMonths: [3, 0],
    debtToYearlyIncome: [0.3, 1.5],
    debtPaymentRatio: [0.1, 0.4],
    debtApr: [5, 30],
  },
  debtSubWeights: { burden: 40, payments: 25, minimums: 25, interest: 10 },
  billsSubWeights: { ratio: 70, overdue: 30 },
  overduePenaltyPerBill: 40,
  goalShareCap: 0.4,
  /** Reaching this fraction of expected pace counts as fully on pace. */
  goalPaceTolerance: 0.9,
  goalMatchDays: 3,
  bands: [
    { id: "thriving", min: 80, label: "Thriving", description: "Your finances are in a strong position. Keep building on your progress." },
    { id: "on_track", min: 65, label: "On track", description: "You're on track. A few improvements could make a meaningful difference." },
    { id: "building", min: 50, label: "Building", description: "You're building a healthier financial position. Here's where you can improve." },
    { id: "needs_attention", min: 35, label: "Needs attention", description: "There are a few areas that need attention. Let's work through them." },
    { id: "needs_focus", min: 0, label: "Needs focus", description: "Your finances may need some focused attention. Start with the highest-impact areas below." },
  ] as { id: BandId; min: number; label: string; description: string }[],
  labels: {
    spending: "Spending",
    cashflow: "Cash flow",
    savings: "Savings",
    budgets: "Budgets",
    goals: "Goals",
    debt: "Debt",
    bills: "Bills",
    buffer: "Financial buffer",
  } satisfies Record<ComponentId, string>,
  tips: {
    spending: "Log your income so we can compare it with your spending.",
    cashflow: "Log your income so we can work out what's left each month.",
    savings: "Log your income so we can work out your savings rate.",
    budgets: "Set a monthly budget for a category or two to track how you stick to them.",
    goals: "Add a savings goal to see your progress counted here.",
    debt: "Log your income so we can see how manageable your debt is.",
    bills: "Add your regular bills and subscriptions in Outgoings.",
    buffer: "Add your bills or log some spending so we can work out your essential costs.",
  } satisfies Record<ComponentId, string>,
} as const;

export const COMPONENT_ORDER: ComponentId[] = [
  "spending",
  "cashflow",
  "savings",
  "budgets",
  "goals",
  "debt",
  "bills",
  "buffer",
];

const DEBT_ACCOUNT_TYPES: AccountType[] = ["credit_card", "loan"];
const SAVINGS_SOURCE_TYPES: AccountType[] = ["current", "other"];
const SAVINGS_DEST_TYPES: AccountType[] = ["savings", "investment"];

/* ---------------------------------- inputs --------------------------------- */

export type TransferInput = {
  amountPence: number;
  date: string;
  fromType: AccountType | null;
  toType: AccountType | null;
  /** True when the transfer paid off a debt rather than moving to an account. */
  toDebt?: boolean;
};

export type ScoreInputs = {
  /** Fraction of the period elapsed (1 for a completed month). */
  periodFraction: number;
  /** ISO date the score is calculated as of (period end or today). */
  asOf: string;
  incomePence: number;
  /** Expenses excluding bill payments. Debt payments are never expenses. */
  dayToDaySpendingPence: number;
  /** Expense transactions linked to bill payments this period. */
  billPaymentsPence: number;
  /** Monthly equivalent of all active bills/subscriptions. */
  recurringMonthlyPence: number;
  activeBillCount: number;
  overdueBills: { name: string; amountPence: number }[];
  budgets: { name: string; limitPence: number; spentPence: number }[];
  goals: { name: string; targetPence: number; savedPence: number; createdAt: string; targetDate: string | null }[];
  goalContributions: { amountPence: number; date: string }[];
  debts: { name: string; balancePence: number; apr: number; minPaymentPence: number; paidPence: number }[];
  transfers: TransferInput[];
  /** Current + Savings account balances (positive only). */
  accessibleSavingsPence: number;
  /** Typical monthly day-to-day spending, for the essential-costs baseline. */
  avgDayToDaySpendingPence: number;
};

/* --------------------------------- outputs --------------------------------- */

export type Metric = { label: string; value: string };

export type ComponentResult = {
  id: ComponentId;
  label: string;
  weight: number;
  counted: boolean;
  /** 0–100, integer. 0 when not counted. */
  score: number;
  /** Share of the overall score after reweighting, 0–1. */
  effectiveWeight: number;
  raw: number;
  summary: string;
  metrics: Metric[];
  tip: string | null;
  /** Only for the buffer: months of essential costs covered. */
  months?: number;
};

export type Factor = { id: ComponentId; label: string; score: number; reason: string; pull: number };

export type Action = {
  id: string;
  component: ComponentId;
  text: string;
  impact: { min: number; max: number };
  gain: number;
};

export type Band = { id: BandId; label: string; description: string; min: number };

export type ScoreResult = {
  score: number;
  raw: number;
  band: Band;
  components: ComponentResult[];
  countedCount: number;
  totalCount: number;
  limitedData: string | null;
  helping: Factor[];
  needsAttention: Factor[];
  actions: Action[];
  savingsPence: number;
  cashflowPence: number;
};

/* --------------------------------- helpers --------------------------------- */

export function safeNum(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, safeNum(n, lo)));
}

/** Linear score: `best` → 100, `worst` → 0. Works for either direction. */
export function lerpScore(value: number, best: number, worst: number): number {
  if (!Number.isFinite(value)) return 0;
  if (best === worst) return value <= best ? 100 : 0;
  const t = (value - worst) / (best - worst);
  return clamp(t * 100, 0, 100);
}

function ratio(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return a / b;
}

export function gbp(pence: number): string {
  const v = safeNum(pence) / 100;
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `−${s}` : s;
}

function pct(r: number): string {
  return `${Math.round(safeNum(r) * 100)}%`;
}

function daysBetween(a: string, b: string): number {
  const x = Date.parse(a.slice(0, 10) + "T00:00:00Z");
  const y = Date.parse(b.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
  return Math.round((y - x) / 86400000);
}

export function bandFor(score: number): Band {
  const s = clamp(Math.round(score), 0, 100);
  const b = SCORE_CONFIG.bands.find((x) => s >= x.min) ?? SCORE_CONFIG.bands[SCORE_CONFIG.bands.length - 1]!;
  return { ...b };
}

export function bandSentence(band: Band, delta: number | null): string {
  if (delta === null || delta === 0) return band.description;
  const up = delta > 0;
  switch (band.id) {
    case "thriving":
      return up ? "Your finances are in a strong position, and still improving." : "Your finances are still in a strong position. Keep building on your progress.";
    case "on_track":
      return up ? "You're on track and improving this month." : "You're still on track. A few improvements could make a meaningful difference.";
    case "building":
      return up ? "You're building a healthier position, and moving in the right direction." : "You're still building. Here's where you can get back on course.";
    case "needs_attention":
      return up ? "Things are moving the right way. A few areas still need attention." : "A few areas need attention. Let's work through them.";
    default:
      return up ? "You're making progress. Keep focusing on the highest-impact areas below." : band.description;
  }
}

/* ------------------------------- savings maths ------------------------------ */

export function isQualifyingSavingsTransfer(t: TransferInput): boolean {
  if (t.toDebt) return false;
  if (!t.fromType || !t.toType) return false;
  if (DEBT_ACCOUNT_TYPES.includes(t.fromType)) return false;
  return SAVINGS_SOURCE_TYPES.includes(t.fromType) && SAVINGS_DEST_TYPES.includes(t.toType);
}

/**
 * Genuine new savings for the period, each movement counted once.
 * Goal contributions that match a transfer into savings/investment (same
 * amount, within a few days) are treated as that transfer — counted if it
 * qualifies, ignored if it was internal or debt-funded.
 */
export function genuineSavingsPence(
  transfers: TransferInput[],
  contributions: { amountPence: number; date: string }[],
): number {
  let total = 0;
  const intoSavings = transfers
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.toDebt && t.toType !== null && SAVINGS_DEST_TYPES.includes(t.toType));
  for (const t of transfers) if (isQualifyingSavingsTransfer(t)) total += Math.max(0, safeNum(t.amountPence));

  const used = new Set<number>();
  for (const c of contributions) {
    const match = intoSavings.find(
      ({ t, i }) =>
        !used.has(i) &&
        t.amountPence === c.amountPence &&
        Math.abs(daysBetween(t.date, c.date)) <= SCORE_CONFIG.goalMatchDays,
    );
    if (match) {
      used.add(match.i);
      continue; // already represented (or deliberately excluded) by the transfer
    }
    total += Math.max(0, safeNum(c.amountPence));
  }
  return total;
}

/* ---------------------------- component scoring ---------------------------- */

type Partial = {
  raw: number | null;
  summary: string;
  metrics: Metric[];
  months?: number;
};

function scoreSpending(i: ScoreInputs): Partial {
  const r = ratio(i.dayToDaySpendingPence, i.incomePence);
  const metrics = [
    { label: "Day-to-day spending", value: gbp(i.dayToDaySpendingPence) },
    { label: "Income", value: gbp(i.incomePence) },
  ];
  if (r === null) return { raw: null, summary: "", metrics };
  const [b, w] = SCORE_CONFIG.thresholds.spendingRatio;
  return {
    raw: lerpScore(r, b, w),
    summary: `Day-to-day spending is ${pct(r)} of your income.`,
    metrics: [...metrics, { label: "Share of income", value: pct(r) }],
  };
}

export function cashflowPence(i: ScoreInputs): number {
  return safeNum(i.incomePence - i.dayToDaySpendingPence - i.billPaymentsPence - totalDebtPaid(i));
}

function totalDebtPaid(i: ScoreInputs): number {
  return i.debts.reduce((s, d) => s + Math.max(0, safeNum(d.paidPence)), 0);
}

function scoreCashflow(i: ScoreInputs): Partial {
  const surplus = cashflowPence(i);
  const r = ratio(surplus, i.incomePence);
  const metrics = [
    { label: "Income", value: gbp(i.incomePence) },
    { label: "Day-to-day spending", value: gbp(i.dayToDaySpendingPence) },
    { label: "Bills paid", value: gbp(i.billPaymentsPence) },
    { label: "Debt payments", value: gbp(totalDebtPaid(i)) },
  ];
  if (r === null) return { raw: null, summary: "", metrics };
  const [b, w] = SCORE_CONFIG.thresholds.cashflowRatio;
  return {
    raw: lerpScore(r, b, w),
    summary:
      surplus >= 0
        ? `You have ${gbp(surplus)} left after spending, bills and debt (${pct(r)} of income).`
        : `You're ${gbp(-surplus)} short after spending, bills and debt this month.`,
    metrics: [...metrics, { label: "Left over", value: `${gbp(surplus)} (${pct(r)})` }],
  };
}

function scoreSavings(i: ScoreInputs): Partial {
  const saved = genuineSavingsPence(i.transfers, i.goalContributions);
  const r = ratio(saved, i.incomePence);
  const metrics = [{ label: "New savings", value: gbp(saved) }];
  if (r === null) return { raw: null, summary: "", metrics };
  const [b, w] = SCORE_CONFIG.thresholds.savingsRate;
  return {
    raw: lerpScore(r, b, w),
    summary: saved > 0 ? `You saved ${gbp(saved)} — ${pct(r)} of your income.` : "No new savings recorded this month yet.",
    metrics: [...metrics, { label: "Savings rate", value: pct(r) }],
  };
}

function scoreBudgets(i: ScoreInputs): Partial {
  const active = i.budgets.filter((b) => b.limitPence > 0);
  if (active.length === 0) return { raw: null, summary: "", metrics: [] };
  const [b, w] = SCORE_CONFIG.thresholds.budgetOverRatio;
  let totalW = 0;
  let acc = 0;
  let over = 0;
  for (const bud of active) {
    const overRatio = Math.max(0, bud.spentPence - bud.limitPence) / bud.limitPence;
    if (overRatio > 0) over += 1;
    acc += lerpScore(overRatio, b, w) * bud.limitPence;
    totalW += bud.limitPence;
  }
  const within = active.length - over;
  return {
    raw: totalW > 0 ? acc / totalW : null,
    summary:
      over === 0
        ? `All ${active.length} budget${active.length === 1 ? "" : "s"} within limit.`
        : `${within} of ${active.length} budgets within limit.`,
    metrics: [
      { label: "Budgets within limit", value: `${within} of ${active.length}` },
      { label: "Total budgeted", value: gbp(totalW) },
    ],
  };
}

/** Caps any single share at `cap` (or 1/n if larger) and redistributes. */
export function cappedShares(weights: number[], cap: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const total = weights.reduce((s, x) => s + Math.max(0, x), 0);
  let shares = weights.map((x) => (total > 0 ? Math.max(0, x) / total : 1 / n));
  // A cap is only meaningful when it can be satisfied (n × cap ≥ 1).
  if (n * cap < 1) return shares;
  const effCap = cap;
  for (let iter = 0; iter < n; iter++) {
    const capped = shares.map((s) => s >= effCap - 1e-12);
    const excess = shares.reduce((s, x) => s + Math.max(0, x - effCap), 0);
    if (excess <= 1e-12) break;
    const freeTotal = shares.reduce((s, x, k) => s + (capped[k] ? 0 : x), 0);
    shares = shares.map((x, k) => {
      if (capped[k]) return effCap;
      return freeTotal > 0 ? x + (x / freeTotal) * excess : x;
    });
  }
  return shares;
}

export function goalScore(
  g: ScoreInputs["goals"][number],
  asOf: string,
): number {
  if (g.targetPence <= 0) return 100;
  const progress = clamp(g.savedPence / g.targetPence, 0, 1);
  if (progress >= 1) return 100;
  if (!g.targetDate) return 60 + 40 * progress;
  const total = daysBetween(g.createdAt, g.targetDate);
  const elapsed = daysBetween(g.createdAt, asOf);
  const expected = total > 0 ? clamp(elapsed / total, 0, 1) : 1;
  if (expected <= 0) return 100;
  const pace = progress / (expected * SCORE_CONFIG.goalPaceTolerance);
  return clamp(pace * 100, 0, 100);
}

function scoreGoals(i: ScoreInputs): Partial {
  const goals = i.goals.filter((g) => g.targetPence > 0);
  if (goals.length === 0) return { raw: null, summary: "", metrics: [] };
  const shares = cappedShares(goals.map((g) => g.targetPence), SCORE_CONFIG.goalShareCap);
  const scores = goals.map((g) => goalScore(g, i.asOf));
  const raw = scores.reduce((s, x, k) => s + x * (shares[k] ?? 0), 0);
  const onPace = scores.filter((s) => s >= 99.5).length;
  const saved = goals.reduce((s, g) => s + Math.min(g.savedPence, g.targetPence), 0);
  const target = goals.reduce((s, g) => s + g.targetPence, 0);
  return {
    raw,
    summary: `${onPace} of ${goals.length} goal${goals.length === 1 ? "" : "s"} on pace.`,
    metrics: [
      { label: "Goals on pace", value: `${onPace} of ${goals.length}` },
      { label: "Saved towards goals", value: `${gbp(saved)} of ${gbp(target)}` },
    ],
  };
}

export function debtSubScores(i: ScoreInputs): {
  burden: number | null;
  payments: number | null;
  minimums: number | null;
  interest: number | null;
} {
  const debts = i.debts.filter((d) => d.balancePence > 0);
  const balance = debts.reduce((s, d) => s + d.balancePence, 0);
  const mins = debts.reduce((s, d) => s + Math.max(0, d.minPaymentPence), 0);
  const t = SCORE_CONFIG.thresholds;
  const dti = ratio(balance, i.incomePence * 12);
  const pr = ratio(mins, i.incomePence);
  let minimums: number | null = null;
  if (mins > 0) {
    const frac = clamp(i.periodFraction, 0, 1);
    let acc = 0;
    for (const d of debts) {
      if (d.minPaymentPence <= 0) continue;
      const expected = d.minPaymentPence * frac;
      const met = expected <= 0 ? 1 : clamp(d.paidPence / expected, 0, 1);
      acc += met * d.minPaymentPence;
    }
    minimums = (acc / mins) * 100;
  }
  const withApr = debts.filter((d) => d.apr > 0);
  const interest =
    withApr.length > 0 && balance > 0
      ? lerpScore(debts.reduce((s, d) => s + d.apr * d.balancePence, 0) / balance, t.debtApr[0], t.debtApr[1])
      : null;
  return {
    burden: dti === null ? null : lerpScore(dti, t.debtToYearlyIncome[0], t.debtToYearlyIncome[1]),
    payments: pr === null ? null : lerpScore(pr, t.debtPaymentRatio[0], t.debtPaymentRatio[1]),
    minimums,
    interest,
  };
}

function scoreDebt(i: ScoreInputs): Partial {
  const debts = i.debts.filter((d) => d.balancePence > 0);
  if (debts.length === 0) {
    return { raw: 100, summary: "No outstanding debt recorded.", metrics: [{ label: "Total debt", value: gbp(0) }] };
  }
  const subs = debtSubScores(i);
  const w = SCORE_CONFIG.debtSubWeights;
  const parts: [number | null, number][] = [
    [subs.burden, w.burden],
    [subs.payments, w.payments],
    [subs.minimums, w.minimums],
    [subs.interest, w.interest],
  ];
  const used = parts.filter((p): p is [number, number] => p[0] !== null);
  const balance = debts.reduce((s, d) => s + d.balancePence, 0);
  const mins = debts.reduce((s, d) => s + d.minPaymentPence, 0);
  const paid = totalDebtPaid(i);
  const metrics: Metric[] = [
    { label: "Total debt", value: gbp(balance) },
    { label: "Minimum payments", value: `${gbp(mins)}/month` },
    { label: "Paid this month", value: gbp(paid) },
  ];
  const dti = ratio(balance, i.incomePence * 12);
  if (dti !== null) metrics.push({ label: "Debt vs yearly income", value: pct(dti) });
  if (used.length === 0) return { raw: null, summary: "", metrics };
  const totalW = used.reduce((s, p) => s + p[1], 0);
  const raw = used.reduce((s, p) => s + p[0] * p[1], 0) / totalW;
  const missed = subs.minimums !== null && subs.minimums < 99.5;
  return {
    raw,
    summary: missed
      ? `${gbp(balance)} owed — some minimum payments still to make this month.`
      : dti !== null
        ? `${gbp(balance)} owed, ${pct(dti)} of yearly income, with minimums covered.`
        : `${gbp(balance)} owed with minimums covered.`,
    metrics,
  };
}

function scoreBills(i: ScoreInputs): Partial {
  if (i.activeBillCount === 0) return { raw: null, summary: "", metrics: [] };
  const r = ratio(i.recurringMonthlyPence, i.incomePence);
  const [b, w] = SCORE_CONFIG.thresholds.billsRatio;
  const sw = SCORE_CONFIG.billsSubWeights;
  const overdue = i.overdueBills.length;
  const overdueScore = clamp(100 - overdue * SCORE_CONFIG.overduePenaltyPerBill, 0, 100);
  const raw =
    r === null ? overdueScore : (lerpScore(r, b, w) * sw.ratio + overdueScore * sw.overdue) / (sw.ratio + sw.overdue);
  const metrics: Metric[] = [
    { label: "Recurring costs", value: `${gbp(i.recurringMonthlyPence)}/month` },
    { label: "Overdue", value: String(overdue) },
  ];
  if (r !== null) metrics.push({ label: "Share of income", value: pct(r) });
  return {
    raw,
    summary:
      overdue > 0
        ? `${overdue} outgoing${overdue === 1 ? " is" : "s are"} overdue.`
        : r !== null
          ? `Recurring costs are ${pct(r)} of your income, nothing overdue.`
          : "Nothing overdue.",
    metrics,
  };
}

export function essentialMonthlyPence(i: ScoreInputs): number {
  const mins = i.debts.filter((d) => d.balancePence > 0).reduce((s, d) => s + Math.max(0, d.minPaymentPence), 0);
  return Math.max(0, safeNum(i.recurringMonthlyPence)) + mins + Math.max(0, safeNum(i.avgDayToDaySpendingPence));
}

function scoreBuffer(i: ScoreInputs): Partial {
  const essential = essentialMonthlyPence(i);
  const accessible = Math.max(0, safeNum(i.accessibleSavingsPence));
  const months = ratio(accessible, essential);
  const metrics: Metric[] = [
    { label: "Accessible savings", value: gbp(accessible) },
    { label: "Essential costs", value: `${gbp(essential)}/month` },
  ];
  if (months === null) return { raw: null, summary: "", metrics };
  const m = Math.round(months * 10) / 10;
  const [b, w] = SCORE_CONFIG.thresholds.bufferMonths;
  return {
    raw: lerpScore(months, b, w),
    summary: `You could currently cover about ${m} month${m === 1 ? "" : "s"} of essential expenses.`,
    metrics,
    months: m,
  };
}

const SCORERS: Record<ComponentId, (i: ScoreInputs) => Partial> = {
  spending: scoreSpending,
  cashflow: scoreCashflow,
  savings: scoreSavings,
  budgets: scoreBudgets,
  goals: scoreGoals,
  debt: scoreDebt,
  bills: scoreBills,
  buffer: scoreBuffer,
};

/* --------------------------------- compute --------------------------------- */

function computeCore(i: ScoreInputs): { raw: number; components: ComponentResult[] } {
  const partials = COMPONENT_ORDER.map((id) => ({ id, p: SCORERS[id](i) }));
  const countedWeight = partials.reduce(
    (s, { id, p }) => s + (p.raw !== null && Number.isFinite(p.raw) ? SCORE_CONFIG.weights[id] : 0),
    0,
  );
  let raw = 0;
  const components: ComponentResult[] = partials.map(({ id, p }) => {
    const counted = p.raw !== null && Number.isFinite(p.raw) && countedWeight > 0;
    const score = counted ? clamp(p.raw as number, 0, 100) : 0;
    const ew = counted ? SCORE_CONFIG.weights[id] / countedWeight : 0;
    raw += score * ew;
    const r: ComponentResult = {
      id,
      label: SCORE_CONFIG.labels[id],
      weight: SCORE_CONFIG.weights[id],
      counted,
      score: Math.round(score),
      effectiveWeight: ew,
      raw: score,
      summary: counted ? p.summary : "Not counted yet",
      metrics: p.metrics,
      tip: counted ? null : SCORE_CONFIG.tips[id],
    };
    if (p.months !== undefined) r.months = p.months;
    return r;
  });
  return { raw: clamp(raw, 0, 100), components };
}

function factorsFrom(components: ComponentResult[]): { helping: Factor[]; needsAttention: Factor[] } {
  const counted = components
    .filter((c) => c.counted)
    .map((c) => ({ id: c.id, label: c.label, score: c.score, reason: c.summary, pull: c.effectiveWeight * (c.raw - 50) }));
  const helping = counted
    .filter((f) => f.pull > 0 && f.score >= 60)
    .sort((a, b) => b.pull - a.pull)
    .slice(0, 3);
  const needsAttention = counted
    .filter((f) => f.score < 70)
    .sort((a, b) => a.pull - b.pull)
    .slice(0, 3);
  return { helping, needsAttention };
}

function roundTo(pence: number, step: number): number {
  return Math.max(step, Math.round(pence / step) * step);
}

function candidateActions(i: ScoreInputs, components: ComponentResult[]): { id: string; component: ComponentId; text: string; apply: (x: ScoreInputs) => ScoreInputs }[] {
  const byId = new Map(components.map((c) => [c.id, c]));
  const weak = (id: ComponentId) => {
    const c = byId.get(id);
    return !!c && c.counted && c.score < 80;
  };
  const out: ReturnType<typeof candidateActions> = [];

  // Overspent budget.
  const overspent = i.budgets
    .filter((b) => b.limitPence > 0 && b.spentPence > b.limitPence)
    .sort((a, b) => b.spentPence - b.limitPence - (a.spentPence - a.limitPence))[0];
  if (overspent && weak("budgets")) {
    const over = overspent.spentPence - overspent.limitPence;
    const cut = Math.min(over, roundTo(Math.min(over, overspent.spentPence * 0.25), 500));
    if (cut > 0) {
      out.push({
        id: "budget",
        component: "budgets",
        text: `Reduce ${overspent.name} spending by ${gbp(cut)} for the rest of this month.`,
        apply: (x) => ({
          ...x,
          dayToDaySpendingPence: Math.max(0, x.dayToDaySpendingPence - cut),
          budgets: x.budgets.map((b) => (b === overspent || (b.name === overspent.name && b.limitPence === overspent.limitPence) ? { ...b, spentPence: b.spentPence - cut } : b)),
        }),
      });
    }
  }

  // Overdue bill.
  const overdue = i.overdueBills[0];
  if (overdue && weak("bills")) {
    out.push({
      id: "bill",
      component: "bills",
      text: `Pay your overdue ${overdue.name} (${gbp(overdue.amountPence)}).`,
      apply: (x) => ({ ...x, overdueBills: x.overdueBills.slice(1) }),
    });
  }

  // Missed minimums or heavy debt: extra payment on highest-APR debt.
  const debts = i.debts.filter((d) => d.balancePence > 0);
  if (debts.length > 0 && weak("debt")) {
    const behind = debts.find((d) => d.minPaymentPence > 0 && d.paidPence < d.minPaymentPence * clamp(i.periodFraction, 0, 1));
    if (behind) {
      const amt = Math.max(100, behind.minPaymentPence - behind.paidPence);
      out.push({
        id: "debt-min",
        component: "debt",
        text: `Make your ${gbp(amt)} minimum payment on ${behind.name}.`,
        apply: (x) => ({ ...x, debts: x.debts.map((d) => (d.name === behind.name ? { ...d, paidPence: d.paidPence + amt, balancePence: Math.max(0, d.balancePence - amt) } : d)) }),
      });
    } else {
      const target = [...debts].sort((a, b) => b.apr - a.apr || b.balancePence - a.balancePence)[0]!;
      const surplus = Math.max(0, cashflowPence(i));
      const amt = clamp(roundTo(surplus * 0.25, 1000), 1000, Math.min(5000, target.balancePence));
      out.push({
        id: "debt-extra",
        component: "debt",
        text: `Pay an extra ${gbp(amt)} towards ${target.name}.`,
        apply: (x) => ({ ...x, debts: x.debts.map((d) => (d.name === target.name ? { ...d, paidPence: d.paidPence + amt, balancePence: Math.max(0, d.balancePence - amt) } : d)) }),
      });
    }
  }

  // Savings / buffer.
  const surplus = cashflowPence(i);
  if (i.incomePence > 0 && surplus > 1000 && (weak("savings") || weak("buffer"))) {
    const amt = roundTo(Math.min(i.incomePence * 0.1, surplus * 0.5), 1000);
    const buffer = weak("buffer") && !weak("savings");
    out.push({
      id: "save",
      component: buffer ? "buffer" : "savings",
      text: buffer ? `Add ${gbp(amt)} to your emergency fund this month.` : `Move ${gbp(amt)} into savings this month.`,
      apply: (x) => ({
        ...x,
        transfers: [...x.transfers, { amountPence: amt, date: x.asOf, fromType: "current", toType: "savings" }],
        // Moving current → savings keeps accessible money the same; new income
        // saved rather than spent is what grows the buffer.
        accessibleSavingsPence: buffer ? x.accessibleSavingsPence + amt : x.accessibleSavingsPence,
      }),
    });
  }

  // Day-to-day spending.
  if (weak("spending") && i.dayToDaySpendingPence > 0) {
    const amt = roundTo(i.dayToDaySpendingPence * 0.05, 1000);
    out.push({
      id: "spend",
      component: "spending",
      text: `Trim ${gbp(amt)} from day-to-day spending this month.`,
      apply: (x) => ({ ...x, dayToDaySpendingPence: Math.max(0, x.dayToDaySpendingPence - amt) }),
    });
  }

  return out;
}

export function impactRange(gain: number): { min: number; max: number } {
  const g = Math.max(0, safeNum(gain));
  const max = Math.max(1, Math.round(g));
  const min = Math.max(1, Math.min(max, Math.round(g * 0.5)));
  return { min, max };
}

export function computeScore(i: ScoreInputs): ScoreResult {
  const { raw, components } = computeCore(i);
  const { helping, needsAttention } = factorsFrom(components);
  const countedCount = components.filter((c) => c.counted).length;
  const actions: Action[] = candidateActions(i, components)
    .map((a) => {
      const gain = computeCore(a.apply(i)).raw - raw;
      return { id: a.id, component: a.component, text: a.text, gain, impact: impactRange(gain) };
    })
    .filter((a) => a.gain >= 0.25)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
  const score = countedCount === 0 ? 0 : Math.round(raw);
  return {
    score,
    raw: countedCount === 0 ? 0 : raw,
    band: bandFor(score),
    components,
    countedCount,
    totalCount: COMPONENT_ORDER.length,
    limitedData: countedCount < COMPONENT_ORDER.length ? `Score based on ${countedCount} of ${COMPONENT_ORDER.length} areas.` : null,
    helping,
    needsAttention,
    actions,
    savingsPence: genuineSavingsPence(i.transfers, i.goalContributions),
    cashflowPence: cashflowPence(i),
  };
}

export type ScoreChange = {
  delta: number;
  contributions: { id: ComponentId; label: string; change: number }[];
};

/** Change in score and how much each area contributed to it. */
export function compareScores(current: ScoreResult, previous: ScoreResult | null): ScoreChange | null {
  if (!previous || previous.countedCount === 0 || current.countedCount === 0) return null;
  const prevById = new Map(previous.components.map((c) => [c.id, c]));
  const contributions = current.components
    .map((c) => {
      const p = prevById.get(c.id);
      const before = p ? p.raw * p.effectiveWeight : 0;
      const after = c.raw * c.effectiveWeight;
      return { id: c.id, label: c.label, change: Math.round((after - before) * 10) / 10 };
    })
    .filter((c) => Math.abs(c.change) >= 0.5)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  return { delta: current.score - previous.score, contributions };
}
