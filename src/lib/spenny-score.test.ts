import { describe, expect, it } from "vitest";
import {
  bandFor,
  cappedShares,
  cashflowPence,
  compareScores,
  computeScore,
  genuineSavingsPence,
  goalScore,
  impactRange,
  lerpScore,
  SCORE_CONFIG,
  type ScoreInputs,
  type TransferInput,
} from "./spenny-score";

const base = (over: Partial<ScoreInputs> = {}): ScoreInputs => ({
  periodFraction: 1,
  asOf: "2026-09-30",
  incomePence: 250_000,
  dayToDaySpendingPence: 100_000,
  billPaymentsPence: 70_000,
  recurringMonthlyPence: 70_000,
  activeBillCount: 3,
  overdueBills: [],
  budgets: [],
  goals: [],
  goalContributions: [],
  debts: [],
  transfers: [],
  accessibleSavingsPence: 300_000,
  avgDayToDaySpendingPence: 100_000,
  ...over,
});

const t = (from: TransferInput["fromType"], to: TransferInput["toType"], amt = 30_000, date = "2026-09-10"): TransferInput => ({
  amountPence: amt,
  date,
  fromType: from,
  toType: to,
});

const comp = (r: ReturnType<typeof computeScore>, id: string) => r.components.find((c) => c.id === id)!;

const noNaN = (r: ReturnType<typeof computeScore>) => {
  expect(Number.isFinite(r.score)).toBe(true);
  for (const c of r.components) {
    expect(Number.isFinite(c.score)).toBe(true);
    expect(Number.isFinite(c.effectiveWeight)).toBe(true);
  }
  for (const a of r.actions) {
    expect(Number.isFinite(a.impact.min)).toBe(true);
    expect(Number.isFinite(a.impact.max)).toBe(true);
  }
};

describe("config", () => {
  it("weights sum to 100", () => {
    expect(Object.values(SCORE_CONFIG.weights).reduce((s, x) => s + x, 0)).toBe(100);
  });
});

describe("band boundaries", () => {
  it.each([
    [100, "thriving"], [80, "thriving"], [79, "on_track"], [65, "on_track"], [64, "building"],
    [50, "building"], [49, "needs_attention"], [35, "needs_attention"], [34, "needs_focus"], [0, "needs_focus"],
  ])("%i → %s", (s, id) => expect(bandFor(s).id).toBe(id));
  it("uses supportive labels", () => {
    expect(bandFor(70).label).toBe("On track");
    expect(bandFor(10).label).toBe("Needs focus");
  });
});

describe("thresholds", () => {
  it("interpolates linearly in both directions", () => {
    expect(lerpScore(0.4, 0.4, 0.9)).toBe(100);
    expect(lerpScore(0.9, 0.4, 0.9)).toBe(0);
    expect(lerpScore(0.65, 0.4, 0.9)).toBeCloseTo(50);
    expect(lerpScore(1.5, 3, 0)).toBeCloseTo(50);
    expect(lerpScore(NaN, 3, 0)).toBe(0);
  });
});

describe("cash flow", () => {
  it("worked £2,500 example gives £600 / 24%", () => {
    const i = base({ debts: [{ name: "Amex", balancePence: 100_000, apr: 20, minPaymentPence: 20_000, paidPence: 20_000 }] });
    expect(cashflowPence(i)).toBe(60_000);
    expect(comp(computeScore(i), "cashflow").summary).toContain("24%");
  });
  it("1. savings transfer doesn't reduce cash flow", () => {
    expect(cashflowPence(base({ transfers: [t("current", "savings")] }))).toBe(cashflowPence(base()));
  });
  it("2. investment transfer doesn't reduce cash flow", () => {
    expect(cashflowPence(base({ transfers: [t("current", "investment")] }))).toBe(cashflowPence(base()));
  });
  it("3. current→savings transfer isn't spending", () => {
    const r = computeScore(base({ transfers: [t("current", "savings")] }));
    expect(comp(r, "spending").score).toBe(comp(computeScore(base()), "spending").score);
  });
  it("4. genuine spending reduces cash flow", () => {
    expect(cashflowPence(base({ dayToDaySpendingPence: 150_000 }))).toBe(cashflowPence(base()) - 50_000);
  });
  it("5. debt payments reduce cash flow but not spending", () => {
    const d = [{ name: "Loan", balancePence: 500_000, apr: 5, minPaymentPence: 20_000, paidPence: 20_000 }];
    const a = computeScore(base());
    const b = computeScore(base({ debts: d }));
    expect(b.cashflowPence).toBe(a.cashflowPence - 20_000);
    expect(comp(b, "spending").score).toBe(comp(a, "spending").score);
  });
  it("6. bills reduce cash flow but not spending", () => {
    const a = computeScore(base({ billPaymentsPence: 0 }));
    const b = computeScore(base({ billPaymentsPence: 70_000 }));
    expect(b.cashflowPence).toBe(a.cashflowPence - 70_000);
    expect(comp(b, "spending").score).toBe(comp(a, "spending").score);
  });
  it("7. savings contributions still counted by savings", () => {
    const r = computeScore(base({ transfers: [t("current", "savings")] }));
    expect(r.savingsPence).toBe(30_000);
    expect(comp(r, "savings").summary).toContain("12%");
  });
});

describe("savings", () => {
  const s = (tr: TransferInput[], c: { amountPence: number; date: string }[] = []) => genuineSavingsPence(tr, c);
  it("1. current→savings counts once", () => expect(s([t("current", "savings")])).toBe(30_000));
  it("2. current→investment counts once", () => expect(s([t("current", "investment")])).toBe(30_000));
  it("3. eligible non-debt spending account counts", () => expect(s([t("other", "savings")])).toBe(30_000));
  it("4. credit card→savings doesn't count", () => expect(s([t("credit_card", "savings")])).toBe(0));
  it("5. credit card→investment doesn't count", () => expect(s([t("credit_card", "investment")])).toBe(0));
  it("6. loan→savings doesn't count", () => expect(s([t("loan", "savings")])).toBe(0));
  it("7. savings→investment doesn't count", () => expect(s([t("savings", "investment")])).toBe(0));
  it("8. investment→savings doesn't count", () => expect(s([t("investment", "savings")])).toBe(0));
  it("9. savings→current doesn't count", () => expect(s([t("savings", "current")])).toBe(0));
  it("10. goal contribution funded by current transfer counts once", () => {
    expect(s([t("current", "savings", 30_000, "2026-09-10")], [{ amountPence: 30_000, date: "2026-09-11" }])).toBe(30_000);
  });
  it("11. goal contribution matched to a qualifying transfer isn't doubled; unmatched counts", () => {
    expect(
      s([t("current", "savings", 30_000, "2026-09-10")], [
        { amountPence: 30_000, date: "2026-09-12" },
        { amountPence: 30_000, date: "2026-09-25" },
      ]),
    ).toBe(60_000);
  });
  it("goal contribution matched to a debt-funded transfer is excluded", () => {
    expect(s([t("credit_card", "savings")], [{ amountPence: 30_000, date: "2026-09-10" }])).toBe(0);
  });
  it("12. internal transfers don't inflate the rate", () => {
    const r = computeScore(base({ transfers: [t("current", "savings"), t("savings", "investment"), t("investment", "savings"), t("savings", "current")] }));
    expect(r.savingsPence).toBe(30_000);
  });
  it("13. debt-funded savings can't raise savings or overall score", () => {
    const a = computeScore(base());
    const b = computeScore(base({ transfers: [t("credit_card", "savings"), t("loan", "investment")] }));
    expect(comp(b, "savings").score).toBe(comp(a, "savings").score);
    expect(b.score).toBe(a.score);
    expect(comp(b, "savings").summary).not.toContain("12%");
  });
  it("£2,500: 12% from current→savings, 0% from credit card→savings", () => {
    expect(comp(computeScore(base({ transfers: [t("current", "savings")] })), "savings").metrics.at(-1)?.value).toBe("12%");
    expect(comp(computeScore(base({ transfers: [t("credit_card", "savings")] })), "savings").metrics.at(-1)?.value).toBe("0%");
  });
});

describe("missing components and reweighting", () => {
  it("excludes unused areas and reweights to 1", () => {
    const r = computeScore(base());
    expect(comp(r, "budgets").counted).toBe(false);
    expect(comp(r, "goals").counted).toBe(false);
    expect(comp(r, "budgets").tip).toBeTruthy();
    const total = r.components.reduce((s, c) => s + c.effectiveWeight, 0);
    expect(total).toBeCloseTo(1);
    // debt (no debts = 100) counts: 8 − budgets − goals
    expect(r.countedCount).toBe(6);
    expect(r.limitedData).toBe("Score based on 6 of 8 areas.");
  });
  it("adding an unused feature at a perfect level never lowers the score", () => {
    const a = computeScore(base());
    const b = computeScore(base({ budgets: [{ name: "Food", limitPence: 30_000, spentPence: 10_000 }] }));
    expect(b.score).toBeGreaterThanOrEqual(a.score);
  });
  it("zero income: income-based areas not counted, no NaN", () => {
    const r = computeScore(base({ incomePence: 0 }));
    expect(comp(r, "spending").counted).toBe(false);
    expect(comp(r, "cashflow").counted).toBe(false);
    expect(comp(r, "savings").counted).toBe(false);
    noNaN(r);
  });
  it("nothing at all: score 0, no NaN", () => {
    const r = computeScore(base({ incomePence: 0, dayToDaySpendingPence: 0, recurringMonthlyPence: 0, activeBillCount: 0, avgDayToDaySpendingPence: 0, accessibleSavingsPence: 0, billPaymentsPence: 0 }));
    noNaN(r);
    expect(r.limitedData).toContain("of 8");
  });
  it("no bills: bills not counted", () => {
    expect(comp(computeScore(base({ activeBillCount: 0 })), "bills").counted).toBe(false);
  });
});

describe("financial buffer", () => {
  it("0 months → 0, 3+ months → 100, 1.5 → 50", () => {
    // essential = 70k bills + 100k day-to-day = 170k
    expect(comp(computeScore(base({ accessibleSavingsPence: 0 })), "buffer").score).toBe(0);
    expect(comp(computeScore(base({ accessibleSavingsPence: 170_000 * 4 })), "buffer").score).toBe(100);
    expect(comp(computeScore(base({ accessibleSavingsPence: 255_000 })), "buffer").score).toBe(50);
  });
  it("shows months in plain language", () => {
    const c = comp(computeScore(base({ accessibleSavingsPence: 408_000 })), "buffer");
    expect(c.months).toBe(2.4);
    expect(c.summary).toContain("2.4 months");
  });
  it("zero essential costs → not counted", () => {
    const c = comp(computeScore(base({ recurringMonthlyPence: 0, avgDayToDaySpendingPence: 0 })), "buffer");
    expect(c.counted).toBe(false);
  });
});

describe("debt", () => {
  it("no debt scores 100", () => expect(comp(computeScore(base()), "debt").score).toBe(100));
  it("manageable debt paid on time can still score strongly", () => {
    const r = computeScore(base({ debts: [{ name: "Car", balancePence: 600_000, apr: 6, minPaymentPence: 20_000, paidPence: 20_000 }] }));
    expect(comp(r, "debt").score).toBeGreaterThanOrEqual(90);
  });
  it("missing interest rates are excluded and reweighted", () => {
    const d = { name: "Car", balancePence: 600_000, apr: 0, minPaymentPence: 20_000, paidPence: 20_000 };
    expect(comp(computeScore(base({ debts: [d] })), "debt").score).toBe(100);
  });
  it("missed minimum payments lower the score", () => {
    const d = { name: "Card", balancePence: 300_000, apr: 22, minPaymentPence: 10_000, paidPence: 10_000 };
    const ok = comp(computeScore(base({ debts: [d] })), "debt").score;
    const missed = comp(computeScore(base({ debts: [{ ...d, paidPence: 0 }] })), "debt").score;
    expect(missed).toBeLessThan(ok);
    expect(ok - missed).toBe(25);
  });
  it("partial month pro-rates minimum payments", () => {
    const d = { name: "Card", balancePence: 300_000, apr: 22, minPaymentPence: 10_000, paidPence: 5_000 };
    const r = computeScore(base({ periodFraction: 0.5, debts: [d] }));
    expect(comp(computeScore(base({ debts: [{ ...d, paidPence: 10_000 }] })), "debt").score).toBe(comp(r, "debt").score);
  });
  it("very high debt scores low but not NaN", () => {
    const r = computeScore(base({ debts: [{ name: "Big", balancePence: 10_000_000, apr: 29, minPaymentPence: 120_000, paidPence: 0 }] }));
    expect(comp(r, "debt").score).toBeLessThan(15);
    noNaN(r);
  });
});

describe("goals", () => {
  it("weights by target size", () => {
    const big = { name: "House", targetPence: 1_000_000, savedPence: 1_000_000, createdAt: "2026-01-01", targetDate: "2026-12-31" };
    const small = { name: "Gift", targetPence: 10_000, savedPence: 0, createdAt: "2026-01-01", targetDate: "2026-12-31" };
    const mid = { name: "Car", targetPence: 800_000, savedPence: 800_000, createdAt: "2026-01-01", targetDate: "2026-12-31" };
    const r = computeScore(base({ goals: [big, small, mid] }));
    expect(comp(r, "goals").score).toBeGreaterThanOrEqual(95);
  });
  it("caps any single goal's share at 40% when there are enough goals", () => {
    const s = cappedShares([100, 1, 1, 1], 0.4);
    expect(Math.max(...s)).toBeCloseTo(0.4);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it("a slightly behind goal counts as on pace (90% tolerance)", () => {
    // ~50% of time elapsed, 46% saved → 0.46 / (0.5*0.9) > 1
    expect(goalScore({ name: "g", targetPence: 100, savedPence: 46, createdAt: "2026-01-01", targetDate: "2026-12-31" }, "2026-07-02")).toBe(100);
  });
  it("goal with no date isn't harshly penalised", () => {
    expect(goalScore({ name: "g", targetPence: 100, savedPence: 0, createdAt: "2026-01-01", targetDate: null }, "2026-07-01")).toBe(60);
  });
});

describe("helping / needs attention", () => {
  it("orders by reweighted pull", () => {
    const r = computeScore(base({
      accessibleSavingsPence: 0,
      budgets: [{ name: "Eating out", limitPence: 10_000, spentPence: 14_000 }],
      transfers: [t("current", "savings", 50_000)],
    }));
    expect(r.helping.length).toBeGreaterThan(0);
    for (let k = 1; k < r.helping.length; k++) expect(r.helping[k - 1]!.pull).toBeGreaterThanOrEqual(r.helping[k]!.pull);
    for (let k = 1; k < r.needsAttention.length; k++) expect(r.needsAttention[k - 1]!.pull).toBeLessThanOrEqual(r.needsAttention[k]!.pull);
    expect(r.needsAttention[0]!.id).toBe("buffer");
    expect(r.helping.length).toBeLessThanOrEqual(3);
  });
  it("areas scoring 70+ aren't flagged as needing attention", () => {
    const r = computeScore(base());
    for (const f of r.needsAttention) expect(f.score).toBeLessThan(70);
  });
});

describe("actions", () => {
  it("at most 3, sorted by gain, with honest ranges", () => {
    const r = computeScore(base({
      accessibleSavingsPence: 0,
      dayToDaySpendingPence: 180_000,
      budgets: [{ name: "Eating out", limitPence: 10_000, spentPence: 20_000 }],
      overdueBills: [{ name: "Water", amountPence: 3_000 }],
      debts: [{ name: "Amex", balancePence: 300_000, apr: 25, minPaymentPence: 10_000, paidPence: 0 }],
    }));
    expect(r.actions.length).toBeGreaterThan(0);
    expect(r.actions.length).toBeLessThanOrEqual(3);
    for (let k = 1; k < r.actions.length; k++) expect(r.actions[k - 1]!.gain).toBeGreaterThanOrEqual(r.actions[k]!.gain);
    for (const a of r.actions) expect(a.impact.min).toBeLessThanOrEqual(a.impact.max);
    noNaN(r);
  });
  it("impact range is half to full gain, at least +1", () => {
    expect(impactRange(3)).toEqual({ min: 2, max: 3 });
    expect(impactRange(0.4)).toEqual({ min: 1, max: 1 });
    expect(impactRange(NaN)).toEqual({ min: 1, max: 1 });
  });
});

describe("score movement", () => {
  it("contributions explain the change", () => {
    const prev = computeScore(base({ dayToDaySpendingPence: 160_000 }));
    const cur = computeScore(base({ transfers: [t("current", "savings")] }));
    const ch = compareScores(cur, prev)!;
    expect(ch.delta).toBe(cur.score - prev.score);
    expect(ch.delta).toBeGreaterThan(0);
    const sum = ch.contributions.reduce((s, c) => s + c.change, 0);
    expect(Math.abs(sum - (cur.raw - prev.raw))).toBeLessThan(1.5);
    expect(ch.contributions.map((c) => c.id)).toContain("spending");
  });
  it("no previous data → null", () => {
    const empty = computeScore(base({ incomePence: 0, dayToDaySpendingPence: 0, recurringMonthlyPence: 0, activeBillCount: 0, avgDayToDaySpendingPence: 0 }));
    expect(compareScores(computeScore(base()), empty)).toBeNull();
  });
});

describe("edge cases", () => {
  it.each([
    ["negative cash flow", { dayToDaySpendingPence: 400_000 }],
    ["very high income", { incomePence: 100_000_000 }],
    ["no savings", { accessibleSavingsPence: 0 }],
    ["zero essential expenses", { recurringMonthlyPence: 0, avgDayToDaySpendingPence: 0, activeBillCount: 0 }],
  ] as [string, Partial<ScoreInputs>][])("%s produces finite output", (_n, over) => {
    const r = computeScore(base(over));
    noNaN(r);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
  it("negative cash flow reads as a shortfall", () => {
    expect(comp(computeScore(base({ dayToDaySpendingPence: 400_000 })), "cashflow").summary).toContain("short");
  });
});
