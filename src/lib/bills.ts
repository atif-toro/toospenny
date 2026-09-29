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
