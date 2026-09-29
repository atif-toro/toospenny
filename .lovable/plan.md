# Transfers between accounts and credit cards

Log money moving between your own accounts. A transfer is not income or spending, so it won't touch your "money in / money out" totals or budgets — it just moves balances.

## What you'll see

**"Transfer" button on the Transactions page** (next to Add transaction), opening a small form:
- From: any account (e.g. Monzo)
- To: any account **or** any debt from the Debts page (e.g. Amex credit card, car loan)
- Amount, date, optional note

**What happens when you save**
- Bank to bank: "From" goes down, "To" goes up by the same amount.
- Bank to a credit card / loan on the Debts page: the bank goes down, the debt balance goes down, and it's logged as a payment on that debt — so the **payoff planner, total debt and dashboard update straight away**.
- Credit card account to bank (e.g. a balance transfer or cash advance): the card balance goes further negative, the bank goes up.

**In the transactions list** transfers show as one row, "Monzo → Amex", with a neutral arrow icon and no + / − colouring. Delete one and both balances (and any debt payment) are put back. A new "Transfers" option in the type filter shows only these.

Net worth stays the same after a transfer between accounts (money just moved); paying a debt lowers both cash and debt, so net worth is also unchanged — only the debt figures move.

## Technical details

- Migration: new `transfers` table (user_id, from_account_id, to_account_id nullable, to_debt_id nullable, amount_pence > 0, date, note, debt_payment_id nullable) with a check that exactly one destination is set and from != to; grants + RLS scoped to `auth.uid()`.
- Server functions in `finance.functions.ts`: `listTransfers`, `createTransfer`, `deleteTransfer`. Create uses existing `adjustAccountBalance` (−amount on from, +amount on to-account); for a debt destination it inserts a `debt_payments` row and reduces `debts.balance_pence` (same logic as `recordDebtPayment`), storing the payment id. Delete reverses everything.
- Transactions page merges transfers into the list (sorted by date), excluded from Money in/out/Net stats. Dashboard cash flow and budgets untouched.
- Invalidate `accounts`, `transactions`, `transfers`, `debts`, `dashboard` after mutations so the payoff planner refreshes.
- `transferInput` zod schema in `schemas.ts`.
