/** Money helpers — all amounts are stored as integer pence. */

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

const gbpWhole = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function formatPence(pence: number, opts?: { whole?: boolean }): string {
  const fmt = opts?.whole ? gbpWhole : gbp;
  return fmt.format(pence / 100);
}

export function formatSignedPence(pence: number): string {
  const sign = pence < 0 ? "−" : "+";
  return `${sign}${gbp.format(Math.abs(pence) / 100)}`;
}

/** Parse a user-entered pounds amount ("12", "12.5", "£12.50") into pence. */
export function parsePoundsToPence(input: string): number | null {
  const cleaned = input.replace(/[£,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Math.round(parseFloat(cleaned) * 100);
  return Number.isFinite(value) ? value : null;
}

/** "2026-09" for a date-like input. */
export function monthKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/** First day of the month `offset` months before (or after) the current one. */
export function monthStart(offset = 0): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1).toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
