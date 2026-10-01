/** Pure helpers for recurring bills & subscriptions. Client-safe. */

export type Cadence = "weekly" | "monthly" | "quarterly" | "annual";
export type BillKind = "fixed" | "subscription";

export const CADENCE_LABEL: Record<Cadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Yearly",
};

/** What the bill costs per month, on average (integer pence). */
export function monthlyCostPence(amountPence: number, cadence: Cadence): number {
  switch (cadence) {
    case "weekly":
      return Math.round((amountPence * 52) / 12);
    case "quarterly":
      return Math.round(amountPence / 3);
    case "annual":
      return Math.round(amountPence / 12);
    default:
      return amountPence;
  }
}

function clampDay(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthMatches(cadence: Cadence, monthIndex: number, anchorMonth: number): boolean {
  if (cadence === "quarterly") return (((monthIndex - anchorMonth) % 3) + 3) % 3 === 0;
  if (cadence === "annual") return monthIndex === anchorMonth;
  return true;
}

/** Period identifier a payment is recorded against. */
export function periodKey(cadence: Cadence, dueISO: string): string {
  const [y, m] = dueISO.split("-");
  const year = Number(y);
  const month = Number(m ?? "1");
  if (cadence === "annual") return String(year);
  if (cadence === "quarterly") return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Due dates for a bill, starting with the current cycle, in ascending order.
 * `anchorISO` fixes which months a quarterly/annual bill lands in.
 */
export function upcomingDueDates(
  cadence: Cadence,
  dueDay: number,
  anchorISO: string,
  fromISO: string,
  count = 4,
): string[] {
  const anchorMonth = Number(anchorISO.slice(5, 7)) - 1;
  const startYear = Number(fromISO.slice(0, 4));
  const startMonth = Number(fromISO.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = 0; i < 48 && out.length < count; i++) {
    const d = new Date(Date.UTC(startYear, startMonth + i, 1));
    const y = d.getUTCFullYear();
    const mi = d.getUTCMonth();
    if (!monthMatches(cadence, mi, anchorMonth)) continue;
    out.push(clampDay(y, mi, dueDay));
  }
  return out;
}

export function daysUntil(iso: string, fromISO: string): number {
  const a = Date.parse(iso + "T00:00:00Z");
  const b = Date.parse(fromISO + "T00:00:00Z");
  return Math.round((a - b) / 86400000);
}

/* --------------------- Statement → Outgoings matching --------------------- */

export const BILL_MATCH = {
  /** Allowed amount difference: the larger of 10% or £2. */
  amountTolerance: 0.1,
  amountFloorPence: 200,
  /** Days either side of the expected due date. */
  dateWindowDays: 10,
} as const;

const PAYMENT_PREFIX =
  /\b(direct debit|dd|d\/d|card (transaction|payment|purchase)|pos|contactless|standing order|so|bill payment|bp|payment to|recurring|subscription|visa|debit)\b/g;
const NAME_NOISE = new Set(["plan", "family", "mobile", "subscription", "the", "ltd", "limited", "uk", "gb", "plc", "co", "com", "london", "membership", "monthly", "bill", "payment"]);

function tokens(s: string, drop: Set<string>): string[] {
  return s
    .toLowerCase()
    .replace(PAYMENT_PREFIX, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !drop.has(t) && !/^\d{3,}$/.test(t));
}

/** True when the statement description names the bill (O2 ↔ "DIRECT DEBIT O2", "GOOGLE*ONE"). */
export function payeeMatches(description: string, billName: string): boolean {
  const desc = tokens(description, new Set());
  const descJoined = desc.join("");
  const name = tokens(billName, NAME_NOISE);
  if (!name.length) return false;
  // Every meaningful bill word appears as a token, or the joined name appears ("googleone").
  if (name.every((w) => desc.includes(w))) return true;
  const joined = name.join("");
  return joined.length >= 4 && descJoined.includes(joined);
}

export function amountClose(actual: number, expected: number): boolean {
  const tol = Math.max(BILL_MATCH.amountFloorPence, Math.round(expected * BILL_MATCH.amountTolerance));
  return Math.abs(actual - expected) <= tol;
}

export type BillMatchBill = { id: string; name: string; amountPence: number; cadence: Cadence; dueDay: number; accountId: string | null; createdAt: string };
export type BillMatchTx = { id: string; date: string; amountPence: number; description: string; accountId: string | null };
export type BillMatch = { billId: string; txId: string; period: string; amountPence: number; date: string; reason: string };

/**
 * Pair expense transactions with Outgoings. One payment per bill per period,
 * one bill per transaction; closest date wins. Already-paid periods and
 * already-linked transactions are skipped, so re-running is a no-op.
 */
export function matchBills(
  bills: BillMatchBill[],
  txs: BillMatchTx[],
  paidPeriods: Set<string>,
  linkedTxIds: Set<string>,
): BillMatch[] {
  const cands: (BillMatch & { gap: number })[] = [];
  for (const b of bills) {
    for (const t of txs) {
      if (linkedTxIds.has(t.id)) continue;
      if (b.accountId && t.accountId && b.accountId !== t.accountId) continue;
      if (!payeeMatches(t.description, b.name) || !amountClose(t.amountPence, b.amountPence)) continue;
      const start = new Date(Date.parse(t.date + "T00:00:00Z") - 40 * 86400000).toISOString().slice(0, 10);
      const dues = upcomingDueDates(b.cadence, b.dueDay, start, start, 4);
      let best: string | null = null;
      let gap = Infinity;
      for (const d of dues) {
        const g = Math.abs(Date.parse(d) - Date.parse(t.date)) / 86400000;
        if (g < gap) { gap = g; best = d; }
      }
      if (!best || gap > BILL_MATCH.dateWindowDays) continue;
      const period = periodKey(b.cadence, best);
      if (paidPeriods.has(`${b.id}|${period}`)) continue;
      cands.push({
        billId: b.id, txId: t.id, period, amountPence: t.amountPence, date: t.date, gap,
        reason: `Matched "${t.description}" to ${b.name} — similar name, ${(t.amountPence / 100).toFixed(2)} vs expected ${(b.amountPence / 100).toFixed(2)}, ${Math.round(gap)} day(s) from the due date`,
      });
    }
  }
  cands.sort((a, b) => a.gap - b.gap);
  const usedTx = new Set<string>();
  const usedPeriod = new Set<string>();
  const out: BillMatch[] = [];
  for (const c of cands) {
    const k = `${c.billId}|${c.period}`;
    if (usedTx.has(c.txId) || usedPeriod.has(k)) continue;
    usedTx.add(c.txId);
    usedPeriod.add(k);
    const { gap: _g, ...m } = c;
    out.push(m);
  }
  return out;
}
