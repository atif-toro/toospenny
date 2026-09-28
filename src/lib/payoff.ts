/**
 * Debt payoff maths — Snowball vs Avalanche.
 * Pure functions; amounts in integer pence, APR in percent (e.g. 18.9).
 */

export type PayoffDebt = {
  id: string;
  name: string;
  balancePence: number;
  apr: number;
  minPaymentPence: number;
};

export type PayoffMethod = "snowball" | "avalanche";

export type PayoffResult = {
  feasible: boolean;
  months: number | null;
  totalInterestPence: number;
  totalPaidPence: number;
  /** Month (1-indexed) each debt is cleared, in payoff order. */
  payoffOrder: { id: string; name: string; month: number }[];
  /** Total remaining balance at the end of each month. */
  series: { month: number; balance: number }[];
};

const MAX_MONTHS = 600;

/** Order debts by method: snowball = smallest balance first, avalanche = highest APR first. */
export function orderDebts(debts: PayoffDebt[], method: PayoffMethod): PayoffDebt[] {
  return [...debts].sort((a, b) => {
    if (method === "snowball") {
      return a.balancePence - b.balancePence || b.apr - a.apr;
    }
    return b.apr - a.apr || a.balancePence - b.balancePence;
  });
}

/**
 * Simulate a monthly payoff plan. The monthly budget is the sum of every
 * debt's minimum payment plus any extra; when a debt is cleared its minimum
 * rolls into the remaining debts (classic snowball/avalanche behaviour).
 */
export function simulatePayoff(
  debts: PayoffDebt[],
  extraPence: number,
  method: PayoffMethod,
): PayoffResult {
  const empty: PayoffResult = {
    feasible: true,
    months: 0,
    totalInterestPence: 0,
    totalPaidPence: 0,
    payoffOrder: [],
    series: [],
  };

  const list = debts
    .filter((d) => d.balancePence > 0)
    .map((d) => ({ ...d, balance: d.balancePence }));

  if (list.length === 0) return empty;

  const budget = list.reduce((s, d) => s + d.minPaymentPence, 0) + Math.max(0, extraPence);
  if (budget <= 0) return { ...empty, feasible: false };

  const ordered = orderDebts(list, method);
  const rank = new Map(ordered.map((d, i) => [d.id, i]));

  let month = 0;
  let interest = 0;
  let paid = 0;
  const payoffOrder: PayoffResult["payoffOrder"] = [];
  const series: PayoffResult["series"] = [];

  while (list.some((d) => d.balance > 0) && month < MAX_MONTHS) {
    month += 1;

    // 1. Accrue interest.
    for (const d of list) {
      if (d.balance > 0) {
        const charge = Math.round((d.balance * d.apr) / 1200);
        d.balance += charge;
        interest += charge;
      }
    }

    // 2. Pay minimums (in payoff order), capped by balance and budget.
    let remaining = budget;
    for (const d of ordered) {
      if (d.balance <= 0 || remaining <= 0) continue;
      const pay = Math.min(d.minPaymentPence, d.balance, remaining);
      d.balance -= pay;
      remaining -= pay;
      paid += pay;
      if (d.balance === 0) payoffOrder.push({ id: d.id, name: d.name, month });
    }

    // 3. Roll everything left over into debts in payoff order.
    for (const d of ordered) {
      if (remaining <= 0) break;
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, remaining);
      d.balance -= pay;
      remaining -= pay;
      paid += pay;
      if (d.balance === 0) payoffOrder.push({ id: d.id, name: d.name, month });
    }

    series.push({
      month,
      balance: list.reduce((s, d) => s + Math.max(d.balance, 0), 0),
    });
  }

  const feasible = !list.some((d) => d.balance > 0);

  return {
    feasible,
    months: feasible ? month : null,
    totalInterestPence: interest,
    totalPaidPence: paid,
    payoffOrder,
    series,
  };
}

/** Interest/date you'd get paying minimums only (used as the savings baseline). */
export function minimumOnlyPayoff(debts: PayoffDebt[]): PayoffResult {
  return simulatePayoff(debts, 0, "avalanche");
}

/** Debt-free date from a start month offset. */
export function debtFreeDate(months: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
