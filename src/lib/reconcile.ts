/**
 * Statement reconciliation — the single place that decides the economic
 * meaning of a bank line. Pure and deterministic (vitest-covered).
 *
 * A credit is not automatically income and a debit is not automatically
 * spending. Each transaction is classified as one of:
 *   income · expense · transfer (between the user's own accounts)
 *   internal (pots/vaults inside one bank) · excluded
 *
 * Output is idempotent: link ids are derived from the transaction ids, so
 * running reconciliation twice produces identical results.
 */

export type Classification = "income" | "expense" | "transfer" | "internal" | "excluded";
export type Confidence = "high" | "medium" | "low";

export type RecTx = {
  id: string;
  accountId: string | null;
  accountName: string | null;
  accountType: string | null;
  date: string; // YYYY-MM-DD
  /** Direction on the bank statement. */
  direction: "in" | "out";
  amountPence: number;
  note: string;
  /** User-set classifications are never changed by reconciliation. */
  locked?: boolean;
  classification?: Classification | null;
};

export type Suggestion = {
  classification: Classification;
  counterpartTxId?: string | null;
  counterpartAccountId?: string | null;
  confidence: Confidence;
  kind: "transfer" | "internal" | "duplicate" | "salary";
  duplicateOfId?: string | null;
};

export type RecResult = {
  id: string;
  classification: Classification;
  confidence: Confidence | null;
  needsReview: boolean;
  reasons: string[];
  linkId: string | null;
  counterpartAccountId: string | null;
  duplicateOf: string | null;
  likelySalary: boolean;
  suggestion: Suggestion | null;
};

export const REC_CONFIG = {
  /** Max days between the two sides of a cross-account transfer. */
  transferWindowDays: 3,
  /** Max days between the two sides of a pot/vault movement. */
  internalWindowDays: 1,
  /** Points needed for each confidence level. */
  highScore: 80,
  mediumScore: 60,
  /** Salary: amounts within this share of each other count as "similar". */
  salaryAmountTolerance: 0.15,
} as const;

const BALANCE_LINE = /\b(brought forward|carried forward|opening balance|closing balance|balance b\/?f|balance c\/?f)\b/i;
const STRONG_INTERNAL = /\bpots?\b|salary sorter|round ?ups?\b|\bvaults?\b|savings pocket|\bpockets?\b|savings space/i;
const WEAK_INTERNAL = /^(deposit|withdrawal)\b/i;
const TOPUP = /\btop-?up\b|\btopped up\b/i;
const TRANSFER_WORDS =
  /\btransfer|\bfaster payments?\b|\bopen banking\b|\bstanding order\b|\bbank transfer\b|\bmoved\b|^transaction$|\bfps\b|^[\d\s]{8,}[a-z]?$|\bown account\b|\bsaving|\bcard payment\b(?=.*\b(amex|american express|capital one|barclaycard)\b)/i;
const PERSONAL = /\bp2p\b|^to [a-z]+ [a-z]+/i;
const VAGUE = /^(transaction|unknown description)$/i;
const PAYROLL = /\b(salary|payroll|wages|pay run|bacs|automated credit|net pay|employer)\b/i;
const BANK_NAMES = /\b(monzo|revolut|natwest|lloyds|halifax|barclays|hsbc|santander|nationwide|starling|chase|tsb|amex|american express|capital one)\b/gi;

const STOP = new Set([
  "automated", "credit", "debit", "direct", "payment", "payments", "faster", "reference", "transfer",
  "from", "the", "and", "ltd", "llp", "limited", "plc", "card", "p2p", "london", "gbr", "bank",
  "open", "banking", "deposit", "transaction", "uk", "co",
]);

function dayDiff(a: string, b: string): number {
  return Math.round(Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
}

export function payerTokens(note: string): string[] {
  return (note.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w));
}

function sharesToken(a: string, b: string): boolean {
  const ta = new Set(payerTokens(a).filter((w) => w.length >= 4));
  return payerTokens(b).some((w) => w.length >= 4 && ta.has(w));
}

function gbp(p: number): string {
  return `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function linkIdFor(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function mentionsAccount(note: string, name: string | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase().split(/\s+/)[0];
  return !!n && n.length >= 3 && note.toLowerCase().includes(n);
}

function confidenceFor(score: number): Confidence {
  if (score >= REC_CONFIG.highScore) return "high";
  if (score >= REC_CONFIG.mediumScore) return "medium";
  return "low";
}

/** Score how likely an out/in pair across two accounts is one transfer. */
export function scoreTransferPair(out: RecTx, inn: RecTx): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (out.amountPence !== inn.amountPence) return { score: 0, reasons };
  score += 45;
  reasons.push(`Matching ${gbp(out.amountPence)} left ${out.accountName ?? "one account"} and arrived in ${inn.accountName ?? "another account"}`);
  const days = dayDiff(out.date, inn.date);
  if (days === 0) {
    score += 25;
    reasons.push("Both sides happened on the same day");
  } else if (days === 1) {
    score += 15;
    reasons.push("Both sides happened within a day of each other");
  } else {
    score += 5;
    reasons.push(`Both sides happened ${days} days apart`);
  }
  const outWords = TOPUP.test(out.note) || TRANSFER_WORDS.test(out.note);
  const inWords = TOPUP.test(inn.note) || TRANSFER_WORDS.test(inn.note);
  if (outWords || inWords) {
    score += (outWords ? 10 : 0) + (inWords ? 10 : 0);
    reasons.push("Description indicates a bank transfer or top-up");
  }
  if (PERSONAL.test(out.note) || PERSONAL.test(inn.note)) score -= 10;
  if (mentionsAccount(out.note, inn.accountName) || mentionsAccount(inn.note, out.accountName)) {
    score += 15;
    reasons.push("Description mentions your other account");
  } else if ((out.note.match(BANK_NAMES) ?? []).length || (inn.note.match(BANK_NAMES) ?? []).length) {
    score += 5;
  }
  if (inn.accountType === "credit_card" || inn.accountType === "loan") {
    score += 10;
    reasons.push("Money went from a bank account to a card or loan you track");
  }
  reasons.push("Both accounts belong to you in Too Spenny");
  return { score, reasons };
}

function baseResult(t: RecTx): RecResult {
  return {
    id: t.id,
    classification: t.direction === "in" ? "income" : "expense",
    confidence: null,
    needsReview: false,
    reasons: [t.direction === "in" ? "Money received with no matching transfer found" : "Money spent with no matching transfer found"],
    linkId: null,
    counterpartAccountId: null,
    duplicateOf: null,
    likelySalary: false,
    suggestion: null,
  };
}

/**
 * Classify a set of transactions across all of a user's accounts.
 * Locked (user-set) rows are returned untouched and never used as a match.
 */
export function reconcile(all: RecTx[]): RecResult[] {
  const results = new Map<string, RecResult>();
  const open = all.filter((t) => !t.locked);
  for (const t of open) results.set(t.id, baseResult(t));
  const taken = new Set<string>();
  const get = (id: string) => results.get(id)!;

  // Deterministic order.
  open.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // 1. Statement balance lines are not transactions.
  for (const t of open) {
    if (BALANCE_LINE.test(t.note)) {
      Object.assign(get(t.id), {
        classification: "excluded",
        confidence: "high",
        reasons: ["This line is a statement balance, not money moving"],
      });
      taken.add(t.id);
    }
  }

  // 2. Pot/vault movements inside one account: pair opposite sides.
  const internalish = (t: RecTx) => STRONG_INTERNAL.test(t.note) || WEAK_INTERNAL.test(t.note);
  for (const a of open) {
    if (taken.has(a.id) || !internalish(a)) continue;
    const candidates = open.filter(
      (b) =>
        !taken.has(b.id) &&
        b.id !== a.id &&
        b.accountId === a.accountId &&
        b.direction !== a.direction &&
        b.amountPence === a.amountPence &&
        internalish(b) &&
        (STRONG_INTERNAL.test(a.note) || STRONG_INTERNAL.test(b.note)) &&
        dayDiff(a.date, b.date) <= REC_CONFIG.internalWindowDays,
    );
    if (!candidates.length) continue;
    candidates.sort((x, y) => dayDiff(a.date, x.date) - dayDiff(a.date, y.date) || x.id.localeCompare(y.id));
    const b = candidates[0]!;
    const link = linkIdFor(a.id, b.id);
    for (const [t, other] of [[a, b], [b, a]] as const) {
      Object.assign(get(t.id), {
        classification: "internal",
        confidence: "high",
        linkId: link,
        counterpartAccountId: t.accountId,
        reasons: [
          "Internal account movement (pot, vault or savings space)",
          `Matched with "${other.note}" for the same ${gbp(t.amountPence)}`,
          "Both sides are in the same account, so no money entered or left",
        ],
      });
      taken.add(t.id);
    }
  }
  // Single-sided pot movements with clear wording.
  for (const t of open) {
    if (taken.has(t.id) || !STRONG_INTERNAL.test(t.note)) continue;
    Object.assign(get(t.id), {
      classification: "internal",
      confidence: "high",
      counterpartAccountId: t.accountId,
      reasons: [`"${t.note}" is an internal movement between your pot/vault and account`],
    });
    taken.add(t.id);
  }

  // 3. Cross-account transfers, confidence-scored, best pairs first.
  type Pair = { out: RecTx; inn: RecTx; score: number; reasons: string[] };
  const pairs: Pair[] = [];
  const outs = open.filter((t) => t.direction === "out" && !taken.has(t.id) && t.accountId);
  const ins = open.filter((t) => t.direction === "in" && !taken.has(t.id) && t.accountId);
  for (const out of outs) {
    for (const inn of ins) {
      if (inn.accountId === out.accountId) continue;
      if (inn.amountPence !== out.amountPence) continue;
      if (dayDiff(out.date, inn.date) > REC_CONFIG.transferWindowDays) continue;
      const { score, reasons } = scoreTransferPair(out, inn);
      pairs.push({ out, inn, score, reasons });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.out.id.localeCompare(b.out.id) || a.inn.id.localeCompare(b.inn.id));
  const bestFor = new Map<string, number[]>();
  for (const p of pairs) {
    for (const id of [p.out.id, p.inn.id]) {
      const arr = bestFor.get(id) ?? [];
      arr.push(p.score);
      bestFor.set(id, arr);
    }
  }
  for (const p of pairs) {
    if (taken.has(p.out.id) || taken.has(p.inn.id)) continue;
    // Ambiguity: another equally good candidate for either side still open.
    const rivals = pairs.filter(
      (q) =>
        q !== p &&
        q.score === p.score &&
        ((q.out.id === p.out.id && !taken.has(q.inn.id)) || (q.inn.id === p.inn.id && !taken.has(q.out.id))),
    );
    let conf = confidenceFor(p.score);
    const reasons = [...p.reasons];
    if (rivals.length) {
      conf = "low";
      reasons.push(`Several ${gbp(p.out.amountPence)} transactions could match — please confirm which one`);
    }
    const link = linkIdFor(p.out.id, p.inn.id);
    for (const [t, other] of [[p.out, p.inn], [p.inn, p.out]] as const) {
      const r = get(t.id);
      const suggestion: Suggestion = {
        classification: "transfer",
        counterpartTxId: other.id,
        counterpartAccountId: other.accountId,
        confidence: conf,
        kind: "transfer",
      };
      if (conf === "high") {
        Object.assign(r, {
          classification: "transfer",
          confidence: conf,
          linkId: link,
          counterpartAccountId: other.accountId,
          reasons,
          suggestion,
        });
      } else {
        // Medium/low: never silently convert — ask the user.
        Object.assign(r, { confidence: conf, needsReview: true, suggestion, reasons: [...reasons, "Not changed until you confirm"] });
      }
    }
    if (conf === "high") {
      taken.add(p.out.id);
      taken.add(p.inn.id);
    } else if (!rivals.length) {
      // Reserve so a weaker pair doesn't claim the same lines.
      taken.add(p.out.id);
      taken.add(p.inn.id);
    }
  }

  // 4. Unmatched top-ups come from one of your own accounts by definition.
  for (const t of open) {
    if (taken.has(t.id) || !TOPUP.test(t.note)) continue;
    const r = get(t.id);
    if (r.suggestion) continue;
    Object.assign(r, {
      classification: "transfer",
      confidence: "medium",
      needsReview: true,
      reasons: [
        `"${t.note}" is a top-up from another account you own`,
        "No matching transaction found in your other imported accounts",
      ],
      suggestion: { classification: "transfer", confidence: "medium", kind: "transfer" },
    });
    taken.add(t.id);
  }
  // Weak pot words ("Deposit") with no partner — ask, don't assume income.
  for (const t of open) {
    if (taken.has(t.id) || !WEAK_INTERNAL.test(t.note)) continue;
    const r = get(t.id);
    if (r.suggestion) continue;
    Object.assign(r, {
      confidence: "low",
      needsReview: true,
      reasons: [`"${t.note}" may be a pot or savings movement rather than ${t.direction === "in" ? "income" : "spending"}`],
      suggestion: { classification: "internal", confidence: "low", kind: "internal" },
    });
  }

  // Blank bank descriptions with no match — ask rather than guess.
  for (const t of open) {
    if (taken.has(t.id) || !VAGUE.test(t.note.trim())) continue;
    const r = get(t.id);
    if (r.suggestion) continue;
    Object.assign(r, {
      confidence: "low",
      needsReview: true,
      reasons: ["The bank gave no description, so this could be a transfer between your accounts"],
      suggestion: { classification: "transfer", confidence: "low", kind: "transfer" },
    });
  }

  // 5. Possible duplicates (same account, direction, amount, close date, similar payer).
  const counted = open.filter((t) => {
    const c = get(t.id).classification;
    return c === "income" || c === "expense";
  });
  for (let i = 0; i < counted.length; i++) {
    const a = counted[i]!;
    for (let j = i + 1; j < counted.length; j++) {
      const b = counted[j]!;
      if (b.accountId !== a.accountId || b.direction !== a.direction || b.amountPence !== a.amountPence) continue;
      if (dayDiff(a.date, b.date) > 1) continue;
      const rb = get(b.id);
      if (rb.duplicateOf || get(a.id).duplicateOf === b.id) continue;
      if (!sharesToken(a.note, b.note) && a.note.trim().toLowerCase() !== b.note.trim().toLowerCase()) continue;
      Object.assign(rb, {
        duplicateOf: a.id,
        needsReview: true,
        reasons: [
          ...rb.reasons,
          `Possible duplicate of "${a.note}" — same ${gbp(a.amountPence)} and similar payer`,
        ],
        suggestion: rb.suggestion ?? {
          classification: "excluded",
          confidence: "medium",
          kind: "duplicate",
          duplicateOfId: a.id,
        },
      });
    }
  }

  // 6. Likely salary: recurring payer, similar amounts, monthly, or payroll wording.
  const incomes = open.filter((t) => get(t.id).classification === "income" && !get(t.id).duplicateOf);
  const byPayer = new Map<string, RecTx[]>();
  for (const t of incomes) {
    const key = payerTokens(t.note)[0];
    if (!key) continue;
    const arr = byPayer.get(key) ?? [];
    arr.push(t);
    byPayer.set(key, arr);
  }
  for (const t of incomes) {
    const key = payerTokens(t.note)[0];
    const group = key ? byPayer.get(key) ?? [] : [];
    const months = new Set(
      group
        .filter((g) => Math.abs(g.amountPence - t.amountPence) <= t.amountPence * REC_CONFIG.salaryAmountTolerance)
        .map((g) => g.date.slice(0, 7)),
    );
    const similar = group.filter((g) => Math.abs(g.amountPence - t.amountPence) <= t.amountPence * REC_CONFIG.salaryAmountTolerance);
    const onePerMonth = similar.length === months.size;
    const recurring = months.size >= 2 && onePerMonth && t.amountPence >= 50000 && !PERSONAL.test(t.note) && !/faster payments/i.test(t.note);
    const payroll = PAYROLL.test(t.note) && t.amountPence >= 50000;
    if (!recurring && !payroll) continue;
    const r = get(t.id);
    r.likelySalary = true;
    r.reasons = [
      ...r.reasons.filter((x) => !x.startsWith("Money received")),
      recurring ? `Likely salary — similar amount from the same payer in ${months.size} months` : "Likely salary — payroll wording in the description",
    ];
    if (!r.confidence) r.confidence = recurring && payroll ? "high" : recurring ? "high" : "medium";
  }

  return all.filter((t) => !t.locked).map((t) => get(t.id));
}

export type RecSummary = {
  incomePence: number;
  expensePence: number;
  transferPence: number;
  internalPence: number;
  excludedPence: number;
  needsReview: number;
};

export function summarise(txs: RecTx[], res: RecResult[]): RecSummary {
  const byId = new Map(res.map((r) => [r.id, r]));
  const s: RecSummary = { incomePence: 0, expensePence: 0, transferPence: 0, internalPence: 0, excludedPence: 0, needsReview: 0 };
  txs.forEach((t) => {
    const r = byId.get(t.id);
    if (!r) return;
    if (r.needsReview) s.needsReview++;
    if (r.classification === "income") s.incomePence += t.amountPence;
    else if (r.classification === "expense") s.expensePence += t.amountPence;
    else if (r.classification === "transfer") s.transferPence += t.direction === "out" || !r.linkId ? t.amountPence : 0;
    else if (r.classification === "internal") s.internalPence += t.direction === "out" || !r.linkId ? t.amountPence : 0;
    else s.excludedPence += t.amountPence;
  });
  return s;
}

/** Whether a stored transaction counts as genuine money in / out. */
export function economicType(t: { type: string; classification?: string | null }): Classification {
  return ((t.classification ?? t.type) as Classification) || "expense";
}

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  internal: "Internal transfer",
  excluded: "Excluded",
};
