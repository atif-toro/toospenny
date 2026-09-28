import { z } from "zod";

export const accountTypeSchema = z.enum([
  "current",
  "savings",
  "credit_card",
  "loan",
  "investment",
  "other",
]);

export const debtTypeSchema = z.enum(["credit_card", "loan", "student", "mortgage", "other"]);

export const accountInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  type: accountTypeSchema,
  balance_pence: z.number().int(),
  notes: z.string().max(500).nullish(),
  archived: z.boolean().optional(),
});

export const transactionInput = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid().nullish(),
  category_id: z.string().uuid().nullish(),
  type: z.enum(["income", "expense"]),
  amount_pence: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(300).nullish(),
});

export const budgetInput = z.object({
  category_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit_pence: z.number().int().min(0),
});

export const goalInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  target_pence: z.number().int().positive(),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().max(300).nullish(),
});

export const goalContributionInput = z.object({
  goal_id: z.string().uuid(),
  amount_pence: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(300).nullish(),
});

export const debtInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  type: debtTypeSchema,
  balance_pence: z.number().int().min(0),
  apr: z.number().min(0).max(100),
  min_payment_pence: z.number().int().min(0),
});

export const debtPaymentInput = z.object({
  debt_id: z.string().uuid(),
  amount_pence: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(300).nullish(),
});
