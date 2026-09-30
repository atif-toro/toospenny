import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  daysUntil,
  monthlyCostPence,
  periodKey,
  upcomingDueDates,
  type BillKind,
  type Cadence,
} from "@/lib/bills";
import {
  compareScores,
  computeScore,
  type AccountType,
  type ScoreChange,
  type ScoreInputs,
  type ScoreResult,
} from "@/lib/spenny-score";
import { economicType, reconcile, summarise, type Classification, type RecTx, type RecSummary } from "@/lib/reconcile";

/* ---------------------------------- types --------------------------------- */

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  balance_pence: number;
  notes: string | null;
  archived: boolean;
  created_at: string;
};

export type TransactionRow = {
  id: string;
  account_id: string | null;
  category_id: string | null;
  type: "income" | "expense";
  amount_pence: number;
  date: string;
  note: string | null;
  category_name: string | null;
  account_name: string | null;
  classification: Classification;
  classification_source: "auto" | "user";
  review_status: string;
  confidence: string | null;
  reasons: string[];
  link_id: string | null;
  counterpart_account_id: string | null;
  duplicate_of: string | null;
};

const TX_SELECT =
  "id, account_id, category_id, type, amount_pence, date, note, classification, classification_source, review_status, confidence, reasons, link_id, counterpart_account_id, duplicate_of, categories(name), accounts(name)";

function mapTx(r: unknown): TransactionRow {
  const row = r as Record<string, unknown>;
  const cat = row["categories"] as { name: string } | null;
  const acc = row["accounts"] as { name: string } | null;
  const type = row["type"] as "income" | "expense";
  return {
    id: row["id"] as string,
    account_id: row["account_id"] as string | null,
    category_id: row["category_id"] as string | null,
    type,
    amount_pence: Number(row["amount_pence"]),
    date: row["date"] as string,
    note: row["note"] as string | null,
    category_name: cat?.name ?? null,
    account_name: acc?.name ?? null,
    classification: economicType({ type, classification: row["classification"] as string | null }),
    classification_source: (row["classification_source"] as "auto" | "user") ?? "auto",
    review_status: (row["review_status"] as string) ?? "none",
    confidence: (row["confidence"] as string | null) ?? null,
    reasons: Array.isArray(row["reasons"]) ? (row["reasons"] as string[]) : [],
    link_id: (row["link_id"] as string | null) ?? null,
    counterpart_account_id: (row["counterpart_account_id"] as string | null) ?? null,
    duplicate_of: (row["duplicate_of"] as string | null) ?? null,
  };
}

export type DebtRow = {
  id: string;
  name: string;
  type: string;
  balance_pence: number;
  apr: number;
  min_payment_pence: number;
  paid_pence: number;
};

export type DashboardData = {
  netWorthPence: number;
  assetsPence: number;
  liabilitiesPence: number;
  totalDebtPence: number;
  debtPaidPence: number;
  thisMonth: { incomePence: number; expensesPence: number };
  spendingByCategory: { name: string; amountPence: number }[];
  monthly: { month: string; income: number; expenses: number; netWorth: number }[];
  recentTransactions: TransactionRow[];
  accountCount: number;
  transactionCount: number;
};

const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense"; color: string }[] = [
  { name: "Groceries", kind: "expense", color: "#3e7a5e" },
  { name: "Rent & bills", kind: "expense", color: "#4a6b8a" },
  { name: "Transport", kind: "expense", color: "#c98f3d" },
  { name: "Dining out", kind: "expense", color: "#c26d4f" },
  { name: "Entertainment", kind: "expense", color: "#8a6bb0" },
  { name: "Shopping", kind: "expense", color: "#b0567c" },
  { name: "Health", kind: "expense", color: "#5a9a8f" },
  { name: "Other", kind: "expense", color: "#8a8a72" },
  { name: "Salary", kind: "income", color: "#3e7a5e" },
  { name: "Other income", kind: "income", color: "#c9a13d" },
];

/* --------------------------------- profile -------------------------------- */

/** Create the profile row + starter categories for a brand-new user. Idempotent. */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    await supabase
      .from("profiles")
      .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

    const { data: existing, error } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if (error) throw new Error(error.message);

    if (!existing || existing.length === 0) {
      await supabase
        .from("categories")
        .insert(DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: userId })));
    }

    return { ok: true };
  });

/* -------------------------------- accounts -------------------------------- */

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data as AccountRow[];
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        type: z.enum(["current", "savings", "credit_card", "loan", "investment", "other"]),
        balance_pence: z.number().int(),
        notes: z.string().max(500).nullish(),
        archived: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      name: data.name,
      type: data.type,
      balance_pence: data.balance_pence,
      notes: data.notes ?? null,
      ...(data.archived !== undefined ? { archived: data.archived } : {}),
    };

    const { error } = data.id
      ? await supabase.from("accounts").update(payload).eq("id", data.id).eq("user_id", userId)
      : await supabase.from("accounts").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("accounts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------- categories ------------------------------- */

export type CategoryRow = {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string | null;
};

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, kind, color")
      .eq("user_id", userId)
      .order("name");
    if (error) throw new Error(error.message);
    return data as CategoryRow[];
  });

/* ------------------------------ transactions ------------------------------ */

const transactionFilter = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/)
    .transform((v) => v.slice(0, 7))
    .optional(),
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  type: z.enum(["income", "expense"]).optional(),
  search: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type TransactionFilter = z.infer<typeof transactionFilter>;

export const listTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => transactionFilter.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let query = supabase
      .from("transactions")
      .select(TX_SELECT)
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (data.month) {
      const ym = data.month.split("-");
      const y = Number(ym[0]);
      const m = Number(ym[1] ?? "1");
      const start = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      const end = new Date(y, m, 0).toISOString().slice(0, 10);
      query = query.gte("date", start).lte("date", end);
    }
    if (data.categoryId) query = query.eq("category_id", data.categoryId);
    if (data.accountId) query = query.eq("account_id", data.accountId);
    if (data.type) query = query.eq("type", data.type);
    if (data.search) query = query.ilike("note", `%${data.search}%`);

    const { data: rows, error } = await query.limit(data.limit ?? 200);
    if (error) throw new Error(error.message);

    return (rows ?? []).map(mapTx);
  });

/** Signed effect a transaction has on its account balance. */
function txDelta(type: "income" | "expense", amountPence: number): number {
  return type === "income" ? amountPence : -amountPence;
}

/** Apply a signed change to an account's balance. */
async function adjustAccountBalance(
  supabase: { from: (t: string) => any },
  userId: string,
  accountId: string | null,
  deltaPence: number,
): Promise<void> {
  if (!accountId || deltaPence === 0) return;
  const { data, error } = await supabase
    .from("accounts")
    .select("balance_pence")
    .eq("id", accountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  const next = Number(data.balance_pence) + deltaPence;
  const { error: upError } = await supabase
    .from("accounts")
    .update({ balance_pence: next })
    .eq("id", accountId)
    .eq("user_id", userId);
  if (upError) throw new Error(upError.message);
}

export const saveTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        account_id: z.string().uuid().nullish(),
        category_id: z.string().uuid().nullish(),
        type: z.enum(["income", "expense"]),
        amount_pence: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().max(300).nullish(),
        classification: z.enum(["income", "expense", "transfer", "internal", "excluded"]).nullish(),
        counterpart_account_id: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const classification = data.classification ?? data.type;
    const isMove = classification === "transfer" || classification === "internal";
    const userSet = !!data.classification && data.classification !== data.type;
    const payload = {
      user_id: userId,
      account_id: data.account_id ?? null,
      category_id: data.category_id ?? null,
      type: data.type,
      amount_pence: data.amount_pence,
      date: data.date,
      note: data.note ?? null,
      classification,
      counterpart_account_id: isMove ? (data.counterpart_account_id ?? null) : null,
      ...(userSet
        ? { classification_source: "user" as const, review_status: "confirmed" as const, reasons: ["You set this classification"] }
        : {}),
    };
    if (data.id) {
      // Undo the old row's effect on its account before applying the new one.
      const { data: prev, error: prevError } = await supabase
        .from("transactions")
        .select("account_id, type, amount_pence")
        .eq("id", data.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (prevError) throw new Error(prevError.message);

      const { error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);

      if (prev) {
        await adjustAccountBalance(
          supabase,
          userId,
          prev.account_id as string | null,
          -txDelta(prev.type as "income" | "expense", Number(prev.amount_pence)),
        );
      }
      await adjustAccountBalance(
        supabase,
        userId,
        payload.account_id,
        txDelta(data.type, data.amount_pence),
      );
    } else {
      const { error } = await supabase.from("transactions").insert(payload);
      if (error) throw new Error(error.message);
      await adjustAccountBalance(
        supabase,
        userId,
        payload.account_id,
        txDelta(data.type, data.amount_pence),
      );
    }
    return { ok: true };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: prev, error: prevError } = await supabase
      .from("transactions")
      .select("account_id, type, amount_pence")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (prevError) throw new Error(prevError.message);

    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    if (prev) {
      await adjustAccountBalance(
        supabase,
        userId,
        prev.account_id as string | null,
        -txDelta(prev.type as "income" | "expense", Number(prev.amount_pence)),
      );
    }
    return { ok: true };
  });

/* ----------------------------- statement import --------------------------- */

/** Existing transactions in a date window, used to flag duplicate imports. */
export const listExistingForImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("transactions")
      .select("date, type, amount_pence, note")
      .eq("user_id", userId)
      .eq("account_id", data.accountId)
      .gte("date", data.from)
      .lte("date", data.to);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      date: r["date"] as string,
      type: r["type"] as "income" | "expense",
      amount_pence: Number(r["amount_pence"]),
      note: (r["note"] as string | null) ?? "",
    }));
  });

/** Bulk-insert reviewed statement rows and sync the account balance. */
export const importTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        rows: z
          .array(
            z.object({
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              type: z.enum(["income", "expense"]),
              amount_pence: z.number().int().positive(),
              note: z.string().max(300),
              category_id: z.string().uuid().nullish(),
              category_name: z.string().max(60).nullish(),
            }),
          )
          .min(1)
          .max(2000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // Resolve (and create where needed) categories referenced by name.
    const { data: cats, error: catError } = await supabase
      .from("categories")
      .select("id, name, kind")
      .eq("user_id", userId);
    if (catError) throw new Error(catError.message);
    const byName = new Map<string, string>();
    for (const c of cats ?? []) {
      byName.set(`${(c.name as string).toLowerCase()}|${c.kind}`, c.id as string);
    }

    for (const row of data.rows) {
      if (row.category_id || !row.category_name) continue;
      const key = `${row.category_name.toLowerCase()}|${row.type}`;
      if (byName.has(key)) continue;
      const { data: created, error: createError } = await supabase
        .from("categories")
        .insert({ user_id: userId, name: row.category_name, kind: row.type })
        .select("id")
        .single();
      if (createError) throw new Error(createError.message);
      byName.set(key, created.id as string);
    }

    const payload = data.rows.map((row) => ({
      user_id: userId,
      account_id: data.accountId,
      category_id:
        row.category_id ??
        (row.category_name ? (byName.get(`${row.category_name.toLowerCase()}|${row.type}`) ?? null) : null),
      type: row.type,
      amount_pence: row.amount_pence,
      date: row.date,
      note: row.note,
    }));

    const { error } = await supabase.from("transactions").insert(payload);
    if (error) throw new Error(error.message);

    const delta = data.rows.reduce((sum, r) => sum + txDelta(r.type, r.amount_pence), 0);
    await adjustAccountBalance(supabase, userId, data.accountId, delta);

    return { imported: data.rows.length, deltaPence: delta };
  });


/* --------------------------------- budgets -------------------------------- */

export type BudgetRow = {
  id: string;
  category_id: string;
  category_name: string;
  category_color: string | null;
  month: string;
  limit_pence: number;
  spent_pence: number;
};

export const listBudgets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const ym = data.month.slice(0, 7).split("-");
    const y = Number(ym[0]);
    const m = Number(ym[1] ?? "1");
    const start = new Date(y, m - 1, 1).toISOString().slice(0, 10);
    const end = new Date(y, m, 0).toISOString().slice(0, 10);

    const [{ data: budgets, error }, { data: txs, error: txError }] = await Promise.all([
      supabase
        .from("budgets")
        .select("id, category_id, month, limit_pence, categories(name, color)")
        .eq("user_id", userId)
        .eq("month", data.month),
      supabase
        .from("transactions")
        .select("category_id, amount_pence")
        .eq("user_id", userId)
        .eq("classification", "expense")
        .gte("date", start)
        .lte("date", end),
    ]);
    if (error) throw new Error(error.message);
    if (txError) throw new Error(txError.message);

    const spentByCategory = new Map<string, number>();
    for (const t of txs ?? []) {
      if (!t.category_id) continue;
      spentByCategory.set(
        t.category_id,
        (spentByCategory.get(t.category_id) ?? 0) + Number(t.amount_pence),
      );
    }

    return (budgets ?? []).map((b) => {
      const row = b as Record<string, unknown>;
      const cat = row["categories"] as { name: string; color: string | null } | null;
      return {
        id: row["id"] as string,
        category_id: row["category_id"] as string,
        category_name: cat?.name ?? "Unknown",
        category_color: cat?.color ?? null,
        month: row["month"] as string,
        limit_pence: Number(row["limit_pence"]),
        spent_pence: spentByCategory.get(row["category_id"] as string) ?? 0,
      } satisfies BudgetRow;
    });
  });

export const saveBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        category_id: z.string().uuid(),
        month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        limit_pence: z.number().int().min(0),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("budgets").upsert(
      { user_id: userId, category_id: data.category_id, month: data.month, limit_pence: data.limit_pence },
      { onConflict: "user_id,category_id,month" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("budgets")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------- goals --------------------------------- */

export type GoalRow = {
  id: string;
  name: string;
  target_pence: number;
  target_date: string | null;
  note: string | null;
  saved_pence: number;
};

export const listGoals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: goals, error }, { data: contribs, error: cError }] = await Promise.all([
      supabase
        .from("goals")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("goal_contributions")
        .select("goal_id, amount_pence")
        .eq("user_id", userId),
    ]);
    if (error) throw new Error(error.message);
    if (cError) throw new Error(cError.message);

    const savedByGoal = new Map<string, number>();
    for (const c of contribs ?? []) {
      savedByGoal.set(c.goal_id, (savedByGoal.get(c.goal_id) ?? 0) + Number(c.amount_pence));
    }

    return (goals ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      target_pence: Number(g.target_pence),
      target_date: g.target_date,
      note: g.note,
      saved_pence: savedByGoal.get(g.id) ?? 0,
    })) satisfies GoalRow[];
  });

export const saveGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        target_pence: z.number().int().positive(),
        target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        note: z.string().max(300).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      name: data.name,
      target_pence: data.target_pence,
      target_date: data.target_date ?? null,
      note: data.note ?? null,
    };
    const { error } = data.id
      ? await supabase.from("goals").update(payload).eq("id", data.id).eq("user_id", userId)
      : await supabase.from("goals").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addGoalContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        goal_id: z.string().uuid(),
        amount_pence: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().max(300).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("goal_contributions")
      .insert({ user_id: context.userId, ...data, note: data.note ?? null });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("goals")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------------------------- debts --------------------------------- */

export const listDebts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: debts, error }, { data: payments, error: pError }] = await Promise.all([
      supabase.from("debts").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabase.from("debt_payments").select("debt_id, amount_pence").eq("user_id", userId),
    ]);
    if (error) throw new Error(error.message);
    if (pError) throw new Error(pError.message);

    const paidByDebt = new Map<string, number>();
    for (const p of payments ?? []) {
      paidByDebt.set(p.debt_id, (paidByDebt.get(p.debt_id) ?? 0) + Number(p.amount_pence));
    }

    return (debts ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      balance_pence: Number(d.balance_pence),
      apr: Number(d.apr),
      min_payment_pence: Number(d.min_payment_pence),
      paid_pence: paidByDebt.get(d.id) ?? 0,
    })) satisfies DebtRow[];
  });

export const saveDebt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        type: z.enum(["credit_card", "loan", "student", "mortgage", "other"]),
        balance_pence: z.number().int().min(0),
        apr: z.number().min(0).max(100),
        min_payment_pence: z.number().int().min(0),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      name: data.name,
      type: data.type,
      balance_pence: data.balance_pence,
      apr: data.apr,
      min_payment_pence: data.min_payment_pence,
    };
    const { error } = data.id
      ? await supabase.from("debts").update(payload).eq("id", data.id).eq("user_id", userId)
      : await supabase.from("debts").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordDebtPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        debt_id: z.string().uuid(),
        amount_pence: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().max(300).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: debt, error: fetchError } = await supabase
      .from("debts")
      .select("balance_pence")
      .eq("id", data.debt_id)
      .eq("user_id", userId)
      .single();
    if (fetchError) throw new Error(fetchError.message);

    const { error: payError } = await supabase
      .from("debt_payments")
      .insert({ user_id: userId, ...data, note: data.note ?? null });
    if (payError) throw new Error(payError.message);

    const newBalance = Math.max(0, Number(debt.balance_pence) - data.amount_pence);
    const { error: updateError } = await supabase
      .from("debts")
      .update({ balance_pence: newBalance })
      .eq("id", data.debt_id)
      .eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });

export const deleteDebt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("debts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- transfers ------------------------------- */

export type TransferRow = {
  id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  to_debt_id: string | null;
  amount_pence: number;
  date: string;
  note: string | null;
  from_name: string | null;
  to_name: string | null;
  to_kind: "account" | "debt";
};

export const listTransfers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }): Promise<TransferRow[]> => {
    const { supabase, userId } = context;
    let q = supabase
      .from("transfers")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.month) {
      const [ys, ms] = data.month.split("-");
      const y = Number(ys);
      const m = Number(ms);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const mm = String(m).padStart(2, "0");
      q = q.gte("date", `${y}-${mm}-01`).lte("date", `${y}-${mm}-${last}`);
    }
    const [{ data: rows, error }, { data: accs }, { data: debts }] = await Promise.all([
      q.limit(500),
      supabase.from("accounts").select("id, name").eq("user_id", userId),
      supabase.from("debts").select("id, name").eq("user_id", userId),
    ]);
    if (error) throw new Error(error.message);
    const accName = new Map((accs ?? []).map((a) => [a.id, a.name]));
    const debtName = new Map((debts ?? []).map((d) => [d.id, d.name]));
    return (rows ?? []).map((r) => ({
      id: r.id,
      from_account_id: r.from_account_id,
      to_account_id: r.to_account_id,
      to_debt_id: r.to_debt_id,
      amount_pence: Number(r.amount_pence),
      date: r.date,
      note: r.note,
      from_name: r.from_account_id ? (accName.get(r.from_account_id) ?? null) : null,
      to_name: r.to_debt_id
        ? (debtName.get(r.to_debt_id) ?? null)
        : r.to_account_id
          ? (accName.get(r.to_account_id) ?? null)
          : null,
      to_kind: r.to_debt_id ? "debt" : "account",
    }));
  });

export const createTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from_account_id: z.string().uuid(),
        to_account_id: z.string().uuid().nullish(),
        to_debt_id: z.string().uuid().nullish(),
        amount_pence: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().max(300).nullish(),
      })
      .refine((d) => !!d.to_account_id !== !!d.to_debt_id, "Pick one destination")
      .refine((d) => d.to_account_id !== d.from_account_id, "From and To must differ")
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let debtPaymentId: string | null = null;
    if (data.to_debt_id) {
      const { data: debt, error } = await supabase
        .from("debts")
        .select("balance_pence")
        .eq("id", data.to_debt_id)
        .eq("user_id", userId)
        .single();
      if (error) throw new Error(error.message);
      const { data: pay, error: pErr } = await supabase
        .from("debt_payments")
        .insert({
          user_id: userId,
          debt_id: data.to_debt_id,
          amount_pence: data.amount_pence,
          date: data.date,
          note: data.note ?? "Transfer",
        })
        .select("id")
        .single();
      if (pErr) throw new Error(pErr.message);
      debtPaymentId = pay.id;
      const { error: uErr } = await supabase
        .from("debts")
        .update({ balance_pence: Math.max(0, Number(debt.balance_pence) - data.amount_pence) })
        .eq("id", data.to_debt_id)
        .eq("user_id", userId);
      if (uErr) throw new Error(uErr.message);
    }
    const { error } = await supabase.from("transfers").insert({
      user_id: userId,
      from_account_id: data.from_account_id,
      to_account_id: data.to_account_id ?? null,
      to_debt_id: data.to_debt_id ?? null,
      debt_payment_id: debtPaymentId,
      amount_pence: data.amount_pence,
      date: data.date,
      note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    await adjustAccountBalance(supabase, userId, data.from_account_id, -data.amount_pence);
    await adjustAccountBalance(supabase, userId, data.to_account_id ?? null, data.amount_pence);
    return { ok: true };
  });

export const deleteTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: t, error } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error) throw new Error(error.message);
    const amt = Number(t.amount_pence);
    await adjustAccountBalance(supabase, userId, t.from_account_id, amt);
    await adjustAccountBalance(supabase, userId, t.to_account_id, -amt);
    if (t.to_debt_id) {
      const { data: debt } = await supabase
        .from("debts")
        .select("balance_pence")
        .eq("id", t.to_debt_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (debt) {
        await supabase
          .from("debts")
          .update({ balance_pence: Number(debt.balance_pence) + amt })
          .eq("id", t.to_debt_id)
          .eq("user_id", userId);
      }
    }
    const { error: dErr } = await supabase.from("transfers").delete().eq("id", data.id).eq("user_id", userId);
    if (dErr) throw new Error(dErr.message);
    if (t.debt_payment_id) {
      await supabase.from("debt_payments").delete().eq("id", t.debt_payment_id).eq("user_id", userId);
    }
    return { ok: true };
  });

/* -------------------------------- dashboard ------------------------------- */

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const { supabase, userId } = context;

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      .toISOString()
      .slice(0, 10);
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const [accountsRes, debtsRes, paymentsRes, txRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", userId).eq("archived", false),
      supabase.from("debts").select("balance_pence").eq("user_id", userId),
      supabase.from("debt_payments").select("amount_pence").eq("user_id", userId),
      supabase
        .from("transactions")
        .select(TX_SELECT)
        .eq("user_id", userId)
        .gte("date", twelveMonthsAgo)
        .order("date", { ascending: false })
        .limit(5000),
    ]);
    if (accountsRes.error) throw new Error(accountsRes.error.message);
    if (debtsRes.error) throw new Error(debtsRes.error.message);
    if (paymentsRes.error) throw new Error(paymentsRes.error.message);
    if (txRes.error) throw new Error(txRes.error.message);

    const accounts = (accountsRes.data ?? []) as {
      type: string;
      balance_pence: number | string;
    }[];
    const allTxs = (txRes.data ?? []).map(mapTx);

    // Net worth: positive account balances are assets, negative ones (credit
    // cards, loans) and recorded debts are liabilities.
    let assets = 0;
    let negativeBalances = 0;
    for (const a of accounts) {
      const bal = Number(a.balance_pence);
      if (bal >= 0) assets += bal;
      else negativeBalances += -bal;
    }
    const totalDebt = (debtsRes.data ?? []).reduce((s, d) => s + Number(d.balance_pence), 0);
    const debtPaid = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount_pence), 0);
    const liabilities = negativeBalances + totalDebt;
    const netWorth = assets - liabilities;

    // This month's cash flow.
    let income = 0;
    let expenses = 0;
    const spendingByCategory = new Map<string, number>();
    for (const t of allTxs) {
      if (t.date < monthStartDate) continue;
      if (t.classification === "income") income += t.amount_pence;
      else if (t.classification === "expense") {
        expenses += t.amount_pence;
        const key = t.category_name ?? "Uncategorised";
        spendingByCategory.set(key, (spendingByCategory.get(key) ?? 0) + t.amount_pence);
      }
    }

    // 12-month trend: per-month income/expenses, with net worth back-projected
    // from today using each month's net transaction effect.
    const monthly: DashboardData["monthly"] = [];

    let runningNetWorth = netWorth;
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inMonth = allTxs
        .filter((t) => t.date.slice(0, 7) === key)
        .reduce(
          (s, t) => s + (t.type === "income" ? t.amount_pence : -t.amount_pence),
          0,
        );
      monthly.push({
        month: key,
        income: allTxs
          .filter((t) => t.date.slice(0, 7) === key && t.classification === "income")
          .reduce((s, t) => s + t.amount_pence, 0),
        expenses: allTxs
          .filter((t) => t.date.slice(0, 7) === key && t.classification === "expense")
          .reduce((s, t) => s + t.amount_pence, 0),
        netWorth: runningNetWorth,
      });
      runningNetWorth -= inMonth;
    }
    monthly.reverse();

    return {
      netWorthPence: netWorth,
      assetsPence: assets,
      liabilitiesPence: liabilities,
      totalDebtPence: totalDebt,
      debtPaidPence: debtPaid,
      thisMonth: { incomePence: income, expensesPence: expenses },
      spendingByCategory: [...spendingByCategory.entries()]
        .map(([name, amountPence]) => ({ name, amountPence }))
        .sort((a, b) => b.amountPence - a.amountPence),
      monthly,
      recentTransactions: allTxs.slice(0, 8),
      accountCount: accounts.length,
      transactionCount: allTxs.length,
    };
  });


/* ---------------------------- bills & subs -------------------------------- */

export type BillRow = {
  id: string;
  name: string;
  kind: BillKind;
  amount_pence: number;
  cadence: Cadence;
  due_day: number;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
  /** Due date of the cycle that still needs paying (or the next one if paid). */
  due_date: string;
  /** Period key the next payment is recorded against. */
  period: string;
  status: "paid" | "overdue" | "due_soon" | "upcoming";
  last_paid_on: string | null;
  /** Period already settled for the current cycle, when status is "paid". */
  paid_period: string | null;
  monthly_cost_pence: number;
};

function utcTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const listBills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: bills, error }, { data: payments, error: payError }] = await Promise.all([
      supabase
        .from("bills")
        .select(
          "id, name, kind, amount_pence, cadence, due_day, account_id, category_id, note, active, created_at, accounts(name), categories(name)",
        )
        .eq("user_id", userId)
        .order("due_day", { ascending: true }),
      supabase.from("bill_payments").select("bill_id, period, paid_on").eq("user_id", userId),
    ]);
    if (error) throw new Error(error.message);
    if (payError) throw new Error(payError.message);
    return buildBillRows(bills ?? [], payments ?? []);
  });

function buildBillRows(
  bills: unknown[],
  payments: { bill_id: string; period: string; paid_on: string }[],
): BillRow[] {
    const paidByBill = new Map<string, Set<string>>();
    const lastPaid = new Map<string, string>();
    for (const p of payments) {
      const set = paidByBill.get(p.bill_id) ?? new Set<string>();
      set.add(p.period);
      paidByBill.set(p.bill_id, set);
      const prev = lastPaid.get(p.bill_id);
      if (!prev || p.paid_on > prev) lastPaid.set(p.bill_id, p.paid_on);
    }

    const today = utcTodayISO();
    const monthStartISO = today.slice(0, 7) + "-01";

    return bills.map((r) => {
      const row = r as Record<string, unknown>;
      const id = row["id"] as string;
      const cadence = row["cadence"] as Cadence;
      const dueDay = Number(row["due_day"]);
      const created = row["created_at"] as string;
      const paid = paidByBill.get(id) ?? new Set<string>();

      const candidates = upcomingDueDates(cadence, dueDay, created.slice(0, 10), monthStartISO, 6);
      const currentDue = candidates[0] ?? today;
      const currentPeriod = periodKey(cadence, currentDue);
      const isPaid = paid.has(currentPeriod);

      let dueDate = currentDue;
      let period = currentPeriod;
      if (isPaid) {
        const next = candidates.find((c) => !paid.has(periodKey(cadence, c)));
        if (next) {
          dueDate = next;
          period = periodKey(cadence, next);
        }
      }

      const diff = daysUntil(isPaid ? currentDue : dueDate, today);
      const status: BillRow["status"] = isPaid
        ? "paid"
        : diff < 0
          ? "overdue"
          : diff <= 7
            ? "due_soon"
            : "upcoming";

      const acc = row["accounts"] as { name: string } | null;
      const cat = row["categories"] as { name: string } | null;
      const amount = Number(row["amount_pence"]);

      return {
        id,
        name: row["name"] as string,
        kind: row["kind"] as BillKind,
        amount_pence: amount,
        cadence,
        due_day: dueDay,
        account_id: row["account_id"] as string | null,
        account_name: acc?.name ?? null,
        category_id: row["category_id"] as string | null,
        category_name: cat?.name ?? null,
        note: row["note"] as string | null,
        active: row["active"] as boolean,
        created_at: created,
        due_date: dueDate,
        period,
        status,
        last_paid_on: lastPaid.get(id) ?? null,
        paid_period: isPaid ? currentPeriod : null,
        monthly_cost_pence: monthlyCostPence(amount, cadence),
      } satisfies BillRow;
    });
}

export const saveBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(80),
        kind: z.enum(["fixed", "subscription"]),
        amount_pence: z.number().int().min(0),
        cadence: z.enum(["weekly", "monthly", "quarterly", "annual"]),
        due_day: z.number().int().min(1).max(31),
        account_id: z.string().uuid().nullish(),
        category_id: z.string().uuid().nullish(),
        note: z.string().max(300).nullish(),
        active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      name: data.name,
      kind: data.kind,
      amount_pence: data.amount_pence,
      cadence: data.cadence,
      due_day: data.due_day,
      account_id: data.account_id ?? null,
      category_id: data.category_id ?? null,
      note: data.note ?? null,
      ...(data.active !== undefined ? { active: data.active } : {}),
    };
    const { error } = data.id
      ? await supabase.from("bills").update(payload).eq("id", data.id).eq("user_id", userId)
      : await supabase.from("bills").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("bills")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Record a bill as paid for a period, optionally logging the expense. */
export const markBillPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        bill_id: z.string().uuid(),
        period: z.string().min(4).max(10),
        amount_pence: z.number().int().min(0),
        paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        log_transaction: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: bill, error: billError } = await supabase
      .from("bills")
      .select("id, name, account_id, category_id")
      .eq("id", data.bill_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (billError) throw new Error(billError.message);
    if (!bill) throw new Error("Bill not found");

    let transactionId: string | null = null;
    if (data.log_transaction !== false && data.amount_pence > 0) {
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          account_id: bill.account_id,
          category_id: bill.category_id,
          type: "expense",
          amount_pence: data.amount_pence,
          date: data.paid_on,
          note: bill.name,
        })
        .select("id")
        .single();
      if (txError) throw new Error(txError.message);
      transactionId = tx.id;
      await adjustAccountBalance(supabase, userId, bill.account_id, -data.amount_pence);
    }

    const { error } = await supabase.from("bill_payments").insert({
      user_id: userId,
      bill_id: data.bill_id,
      period: data.period,
      amount_pence: data.amount_pence,
      paid_on: data.paid_on,
      transaction_id: transactionId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Undo a recorded payment for a period, reversing any logged expense. */
export const unmarkBillPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bill_id: z.string().uuid(), period: z.string().min(4).max(10) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: payment, error: payError } = await supabase
      .from("bill_payments")
      .select("id, transaction_id")
      .eq("bill_id", data.bill_id)
      .eq("period", data.period)
      .eq("user_id", userId)
      .maybeSingle();
    if (payError) throw new Error(payError.message);
    if (!payment) return { ok: true };

    if (payment.transaction_id) {
      const { data: tx } = await supabase
        .from("transactions")
        .select("account_id, type, amount_pence")
        .eq("id", payment.transaction_id)
        .eq("user_id", userId)
        .maybeSingle();
      await supabase
        .from("transactions")
        .delete()
        .eq("id", payment.transaction_id)
        .eq("user_id", userId);
      if (tx) {
        await adjustAccountBalance(
          supabase,
          userId,
          tx.account_id as string | null,
          -txDelta(tx.type as "income" | "expense", Number(tx.amount_pence)),
        );
      }
    }

    const { error } = await supabase
      .from("bill_payments")
      .delete()
      .eq("id", payment.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------- Spenny Score ------------------------------ */

export type SpennyScoreData = {
  current: ScoreResult;
  previousScore: number | null;
  change: ScoreChange | null;
  previousMonth: string;
};

const SCORE_ACCOUNT_TYPES: AccountType[] = ["current", "savings", "credit_card", "loan", "investment", "other"];
function asAccountType(t: string | undefined): AccountType | null {
  return t && (SCORE_ACCOUNT_TYPES as string[]).includes(t) ? (t as AccountType) : null;
}

function utcMonthStart(offset: number): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + offset, 1)).toISOString().slice(0, 10);
}

export const getSpennyScore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SpennyScoreData> => {
    const { supabase, userId } = context;
    const today = utcTodayISO();
    const curStart = utcMonthStart(0);
    const prevStart = utcMonthStart(-1);
    const histStart = utcMonthStart(-4);
    const prevEnd = new Date(Date.parse(curStart + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
    const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();

    const [acc, tx, bp, bl, bud, gl, gc, dt, dp, tr] = await Promise.all([
      supabase.from("accounts").select("id, type, balance_pence, archived").eq("user_id", userId),
      supabase.from("transactions").select("id, account_id, category_id, type, classification, counterpart_account_id, link_id, amount_pence, date").eq("user_id", userId).gte("date", histStart).limit(5000),
      supabase.from("bill_payments").select("bill_id, period, paid_on, transaction_id").eq("user_id", userId),
      supabase.from("bills").select("id, name, kind, amount_pence, cadence, due_day, account_id, category_id, note, active, created_at, accounts(name), categories(name)").eq("user_id", userId),
      supabase.from("budgets").select("category_id, month, limit_pence, categories(name)").eq("user_id", userId).in("month", [curStart, prevStart]),
      supabase.from("goals").select("id, name, target_pence, target_date, created_at").eq("user_id", userId),
      supabase.from("goal_contributions").select("goal_id, amount_pence, date").eq("user_id", userId),
      supabase.from("debts").select("id, name, balance_pence, apr, min_payment_pence, created_at").eq("user_id", userId),
      supabase.from("debt_payments").select("debt_id, amount_pence, date").eq("user_id", userId).gte("date", prevStart),
      supabase.from("transfers").select("amount_pence, date, from_account_id, to_account_id, to_debt_id").eq("user_id", userId).gte("date", prevStart),
    ]);
    for (const r of [acc, tx, bp, bl, bud, gl, gc, dt, dp, tr]) if (r.error) throw new Error(r.error.message);

    const accounts = (acc.data ?? []).map((a) => ({ id: a.id, type: asAccountType(a.type), balance: Number(a.balance_pence), archived: a.archived }));
    const accType = new Map(accounts.map((a) => [a.id, a.type]));
    const accessibleIds = new Set(accounts.filter((a) => a.type === "current" || a.type === "savings").map((a) => a.id));
    const txs = (tx.data ?? []).map((t) => ({ ...t, amount_pence: Number(t.amount_pence), econ: economicType(t) }));
    const billTxIds = new Set((bp.data ?? []).map((p) => p.transaction_id).filter((x): x is string => !!x));
    const billRows = buildBillRows(bl.data ?? [], bp.data ?? []);
    const paidPeriods = new Set((bp.data ?? []).map((p) => `${p.bill_id}|${p.period}`));
    const transfers = (tr.data ?? []).map((t) => ({ ...t, amount_pence: Number(t.amount_pence) }));
    const debtPays = (dp.data ?? []).map((p) => ({ ...p, amount_pence: Number(p.amount_pence) }));
    const contribs = (gc.data ?? []).map((c) => ({ ...c, amount_pence: Number(c.amount_pence) }));

    const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
    const dayToDayIn = (a: string, b: string) =>
      txs.filter((t) => t.econ === "expense" && !billTxIds.has(t.id) && inRange(t.date, a, b)).reduce((s, t) => s + t.amount_pence, 0);

    // Typical day-to-day spend: mean of the last 3 full months that had spending.
    const hist: number[] = [];
    for (let k = -3; k <= -1; k++) {
      const a = utcMonthStart(k);
      const b = new Date(Date.parse(utcMonthStart(k + 1) + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
      const v = dayToDayIn(a, b);
      if (v > 0) hist.push(v);
    }
    const curDayToDay = dayToDayIn(curStart, today);
    const avgDayToDay = hist.length ? Math.round(hist.reduce((s, x) => s + x, 0) / hist.length) : curDayToDay;

    const accessibleNow = accounts.filter((a) => !a.archived && accessibleIds.has(a.id)).reduce((s, a) => s + Math.max(0, a.balance), 0);
    // Back out this month's movements on accessible accounts to estimate last month's close.
    let accessibleDelta = 0;
    for (const t of txs) {
      if (t.date < curStart || !t.account_id || !accessibleIds.has(t.account_id)) continue;
      accessibleDelta += t.type === "income" ? t.amount_pence : -t.amount_pence;
    }
    for (const t of transfers) {
      if (t.date < curStart) continue;
      if (t.from_account_id && accessibleIds.has(t.from_account_id)) accessibleDelta -= t.amount_pence;
      if (t.to_account_id && accessibleIds.has(t.to_account_id)) accessibleDelta += t.amount_pence;
    }

    const activeBills = billRows.filter((b) => b.active);

    const build = (a: string, b: string, isCurrent: boolean): ScoreInputs => {
      const budgets = (bud.data ?? [])
        .filter((x) => x.month === a)
        .map((x) => {
          const cat = (x as Record<string, unknown>)["categories"] as { name: string } | null;
          return {
            name: cat?.name ?? "Budget",
            limitPence: Number(x.limit_pence),
            spentPence: txs.filter((t) => t.econ === "expense" && t.category_id === x.category_id && inRange(t.date, a, b)).reduce((s, t) => s + t.amount_pence, 0),
          };
        });
      const billsThen = activeBills.filter((x) => x.created_at.slice(0, 10) <= b);
      let overdueBills: { name: string; amountPence: number }[];
      if (isCurrent) {
        overdueBills = billsThen.filter((x) => x.status === "overdue").map((x) => ({ name: x.name, amountPence: x.amount_pence }));
      } else {
        overdueBills = billsThen
          .filter((x) => {
            const due = upcomingDueDates(x.cadence, x.due_day, x.created_at.slice(0, 10), a, 1)[0];
            return !!due && inRange(due, a, b) && due >= x.created_at.slice(0, 10) && !paidPeriods.has(`${x.id}|${periodKey(x.cadence, due)}`);
          })
          .map((x) => ({ name: x.name, amountPence: x.amount_pence }));
      }
      return {
        periodFraction: isCurrent ? Number(today.slice(8, 10)) / daysInMonth : 1,
        asOf: b,
        incomePence: txs.filter((t) => t.econ === "income" && inRange(t.date, a, b)).reduce((s, t) => s + t.amount_pence, 0),
        dayToDaySpendingPence: dayToDayIn(a, b),
        billPaymentsPence: txs.filter((t) => t.econ === "expense" && billTxIds.has(t.id) && inRange(t.date, a, b)).reduce((s, t) => s + t.amount_pence, 0),
        recurringMonthlyPence: billsThen.reduce((s, x) => s + x.monthly_cost_pence, 0),
        activeBillCount: billsThen.length,
        overdueBills,
        budgets,
        goals: (gl.data ?? [])
          .filter((g) => g.created_at.slice(0, 10) <= b)
          .map((g) => ({
            name: g.name,
            targetPence: Number(g.target_pence),
            savedPence: contribs.filter((c) => c.goal_id === g.id && c.date <= b).reduce((s, c) => s + c.amount_pence, 0),
            createdAt: g.created_at.slice(0, 10),
            targetDate: g.target_date,
          })),
        goalContributions: contribs.filter((c) => inRange(c.date, a, b)).map((c) => ({ amountPence: c.amount_pence, date: c.date })),
        debts: (dt.data ?? [])
          .filter((d) => d.created_at.slice(0, 10) <= b)
          .map((d) => {
            const paidLater = isCurrent ? 0 : debtPays.filter((p) => p.debt_id === d.id && p.date > b).reduce((s, p) => s + p.amount_pence, 0);
            return {
              name: d.name,
              balancePence: Number(d.balance_pence) + paidLater,
              apr: Number(d.apr),
              minPaymentPence: Number(d.min_payment_pence),
              paidPence: debtPays.filter((p) => p.debt_id === d.id && inRange(p.date, a, b)).reduce((s, p) => s + p.amount_pence, 0),
            };
          }),
        transfers: [
          ...transfers
            .filter((t) => inRange(t.date, a, b))
            .map((t) => ({
              amountPence: t.amount_pence,
              date: t.date,
              fromType: t.from_account_id ? (accType.get(t.from_account_id) ?? null) : null,
              toType: t.to_account_id ? (accType.get(t.to_account_id) ?? null) : null,
              toDebt: !!t.to_debt_id,
            })),
          // Imported transfers between own accounts (outgoing side only, so each counts once).
          ...txs
            .filter((t) => t.econ === "transfer" && t.type === "expense" && t.counterpart_account_id && t.account_id && inRange(t.date, a, b))
            .map((t) => ({
              amountPence: t.amount_pence,
              date: t.date,
              fromType: accType.get(t.account_id!) ?? null,
              toType: accType.get(t.counterpart_account_id!) ?? null,
              toDebt: false,
            })),
        ],
        accessibleSavingsPence: isCurrent ? accessibleNow : Math.max(0, accessibleNow - accessibleDelta),
        avgDayToDaySpendingPence: avgDayToDay,
      };
    };

    const current = computeScore(build(curStart, today, true));
    const prevHasData =
      txs.some((t) => inRange(t.date, prevStart, prevEnd)) || transfers.some((t) => inRange(t.date, prevStart, prevEnd));
    const previous = prevHasData ? computeScore(build(prevStart, prevEnd, false)) : null;
    return {
      current,
      previousScore: previous ? previous.score : null,
      change: compareScores(current, previous),
      previousMonth: prevStart,
    };
  });

/* ------------------------ reconciliation & review ------------------------ */

export type ReviewItem = TransactionRow & {
  suggestion: {
    classification: Classification;
    counterpartTxId?: string | null;
    counterpartAccountId?: string | null;
    confidence: string;
    kind: "transfer" | "internal" | "duplicate" | "salary";
    duplicateOfId?: string | null;
  } | null;
  counterpart: { id: string; note: string | null; date: string; account_name: string | null } | null;
};

async function loadAllTransactions(supabase: { from: (t: string) => any }, userId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select(`${TX_SELECT}, suggestion, accounts(name, type)`.replace(", accounts(name)", ""))
      .eq("user_id", userId)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * Classify every transaction across all accounts: transfers, pot movements,
 * duplicates and salary. Idempotent — user decisions are never touched and
 * re-running writes identical values (no new records are created).
 */
export const reconcileTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecSummary & { changed: number; total: number }> => {
    const { supabase, userId } = context;
    const rows = await loadAllTransactions(supabase, userId);
    const recTxs: RecTx[] = rows.map((r) => {
      const acc = r["accounts"] as { name: string; type: string } | null;
      return {
        id: r["id"] as string,
        accountId: r["account_id"] as string | null,
        accountName: acc?.name ?? null,
        accountType: acc?.type ?? null,
        date: r["date"] as string,
        direction: r["type"] === "income" ? "in" : "out",
        amountPence: Number(r["amount_pence"]),
        note: (r["note"] as string | null) ?? "",
        locked: r["classification_source"] === "user",
      };
    });
    const results = reconcile(recTxs);
    const byId = new Map(rows.map((r) => [r["id"] as string, r]));
    const now = new Date().toISOString();
    const updates = results
      .map((res) => {
        const prev = byId.get(res.id)!;
        const next = {
          classification: res.classification,
          confidence: res.confidence,
          link_id: res.linkId,
          counterpart_account_id: res.counterpartAccountId,
          duplicate_of: res.duplicateOf,
          review_status: res.needsReview ? "needs_review" : "none",
          reasons: res.reasons,
          suggestion: res.suggestion,
        };
        const same = (Object.keys(next) as (keyof typeof next)[]).every(
          (k) => JSON.stringify(prev[k] ?? null) === JSON.stringify(next[k] ?? null),
        );
        return same ? null : { id: res.id, ...next, reconciled_at: now };
      })
      .filter((u): u is NonNullable<typeof u> => !!u);

    for (let i = 0; i < updates.length; i += 25) {
      await Promise.all(
        updates.slice(i, i + 25).map(async ({ id, ...u }) => {
          const { error } = await supabase.from("transactions").update(u).eq("id", id).eq("user_id", userId);
          if (error) throw new Error(error.message);
        }),
      );
    }
    return { ...summarise(recTxs, results), changed: updates.length, total: rows.length };
  });

export const listReviewItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReviewItem[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("transactions")
      .select(`${TX_SELECT}, suggestion`)
      .eq("user_id", userId)
      .eq("review_status", "needs_review")
      .order("date", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const items = (data ?? []).map((r) => ({
      ...mapTx(r),
      suggestion: ((r as Record<string, unknown>)["suggestion"] ?? null) as ReviewItem["suggestion"],
      counterpart: null as ReviewItem["counterpart"],
    }));
    const ids = [
      ...new Set(
        items.flatMap((i) => [i.suggestion?.counterpartTxId, i.suggestion?.duplicateOfId]).filter((x): x is string => !!x),
      ),
    ];
    if (ids.length) {
      const { data: others, error: oErr } = await supabase
        .from("transactions")
        .select("id, note, date, accounts(name)")
        .eq("user_id", userId)
        .in("id", ids);
      if (oErr) throw new Error(oErr.message);
      const m = new Map(
        (others ?? []).map((o) => [
          o.id as string,
          { id: o.id as string, note: o.note as string | null, date: o.date as string, account_name: ((o as Record<string, unknown>)["accounts"] as { name: string } | null)?.name ?? null },
        ]),
      );
      for (const i of items) {
        const cid = i.suggestion?.counterpartTxId ?? i.suggestion?.duplicateOfId;
        i.counterpart = cid ? (m.get(cid) ?? null) : null;
      }
    }
    return items;
  });

const classificationEnum = z.enum(["income", "expense", "transfer", "internal", "excluded"]);

/** Accept or reject the suggestion on a flagged transaction. */
export const resolveReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), action: z.enum(["confirm", "reject"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("transactions")
      .select("id, type, account_id, reasons, suggestion, classification")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Transaction not found");
    const sug = row.suggestion as ReviewItem["suggestion"];
    const reasons = Array.isArray(row.reasons) ? (row.reasons as string[]) : [];

    if (data.action === "reject" || !sug) {
      const { error: e } = await supabase
        .from("transactions")
        .update({
          classification_source: "user",
          review_status: "dismissed",
          duplicate_of: null,
          classification: sug?.kind === "duplicate" ? row.classification : row.type,
          link_id: null,
          counterpart_account_id: null,
          reasons: [...reasons.filter((r) => !r.startsWith("Not changed")), "You chose to keep this separate"],
        })
        .eq("id", data.id)
        .eq("user_id", userId);
      if (e) throw new Error(e.message);
      // Release a reserved partner so it can be reviewed on its own.
      if (sug?.counterpartTxId) {
        await supabase
          .from("transactions")
          .update({ review_status: "none", suggestion: null, confidence: null })
          .eq("id", sug.counterpartTxId)
          .eq("user_id", userId)
          .eq("classification_source", "auto");
      }
      return { ok: true };
    }

    const confirmed = [...reasons.filter((r) => !r.startsWith("Not changed")), "You confirmed this"];
    const linkId = sug.counterpartTxId
      ? [data.id, sug.counterpartTxId].sort().join(":")
      : null;
    const { error: e } = await supabase
      .from("transactions")
      .update({
        classification: sug.classification,
        classification_source: "user",
        review_status: "confirmed",
        link_id: linkId,
        counterpart_account_id: sug.counterpartAccountId ?? (sug.classification === "internal" ? row.account_id : null),
        reasons: confirmed,
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (e) throw new Error(e.message);
    if (sug.counterpartTxId) {
      const { error: e2 } = await supabase
        .from("transactions")
        .update({
          classification: sug.classification,
          classification_source: "user",
          review_status: "confirmed",
          link_id: linkId,
          counterpart_account_id: row.account_id,
          reasons: confirmed,
        })
        .eq("id", sug.counterpartTxId)
        .eq("user_id", userId);
      if (e2) throw new Error(e2.message);
    }
    return { ok: true };
  });

/** Manually set what a transaction really is. */
export const setClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        classification: classificationEnum,
        counterpart_account_id: z.string().uuid().nullish(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("transactions")
      .select("id, link_id, account_id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Transaction not found");
    const isMove = data.classification === "transfer" || data.classification === "internal";
    const { error: e } = await supabase
      .from("transactions")
      .update({
        classification: data.classification,
        classification_source: "user",
        review_status: "confirmed",
        duplicate_of: null,
        counterpart_account_id: isMove
          ? (data.counterpart_account_id ?? (data.classification === "internal" ? row.account_id : null))
          : null,
        link_id: isMove ? row.link_id : null,
        reasons: ["You set this classification"],
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (e) throw new Error(e.message);
    // Unlinking one side: ask about the partner rather than guessing.
    if (row.link_id && !isMove) {
      await supabase
        .from("transactions")
        .update({
          link_id: null,
          review_status: "needs_review",
          reasons: ["Its matching transaction was changed — please check this one too"],
        })
        .eq("user_id", userId)
        .eq("link_id", row.link_id)
        .neq("id", data.id);
    }
    return { ok: true };
  });
