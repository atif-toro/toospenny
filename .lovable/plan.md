# Spenny Score — 0-100 financial health score

A clear, explainable score built from your own data. Every point can be traced to one of eight parts, so you can always see why the score is what it is.

## How the score works

The score is made of eight parts. Each part scores 0-100, then gets a fixed weight. The overall score is the weighted total, rounded.

| Part | Weight | What gets 100 | What gets 0 |
|---|---|---|---|
| Spending vs income | 15 | Spending is 70% of income or less | Spending is 110% of income or more |
| Cash flow | 15 | This month's leftover is 20%+ of income | Leftover is -10% of income or worse |
| Savings rate | 15 | 20%+ of income goes to savings/goals | Nothing saved |
| Budget adherence | 10 | Every budget at or under its limit | Every budget 50%+ over |
| Goal progress | 10 | Every goal on track for its date | No progress on any goal |
| Debt load | 15 | No debt, or debt under 10% of yearly income | Debt of 100%+ of yearly income |
| Debt payments | 10 | Paid at least the minimum on every debt this month | No payments made |
| Bills and recurring costs | 10 | No overdue outgoings, recurring costs 50% of income or less | Overdue outgoings and recurring costs 80%+ of income |

Between the two ends, points go up in a straight line. If a part doesn't apply to you (for example no budgets or no goals yet), it is left out and the other weights are scaled to fill the gap, so you aren't penalised for features you haven't used. It is marked "Not counted yet" along with a tip to set it up.

Bands: 80-100 Excellent, 65-79 Good, 50-64 Fair, 35-49 Needs work, 0-34 Struggling.

**Change since last month:** we work out the same score using last month's figures and show the difference, e.g. "+6 since August".

**What's helping / what's hurting:** each part's pull on the score is its weight times how far it sits above or below the middle (50). The 3 biggest positive pulls are shown as "Helping" and the 3 biggest negative pulls as "Hurting", each with a plain sentence such as "You spent 64% of your income — well under target".

**Actions:** each part that is hurting you comes with a specific next step and roughly how many points it could add, e.g. "Pay £40 more toward Amex this month (+4 pts)" or "Your Eating out budget is £55 over — pause it for the rest of the month".

## What you'll see

**On the dashboard** (one small card, placed above the existing stats):
- A score ring with the number, its band, and the change since last month
- One "top helper" and one "top drag"
- A "See breakdown" link

On phones it's a single compact row, so the rest of the dashboard doesn't move far down.

**New "Spenny Score" page** (added to the side menu):
1. A large score ring with its band and the change since last month
2. Eight part cards, each with its score, its weight, a progress bar and the actual numbers behind it
3. "Helping your score": top 3
4. "Hurting your score": top 3
5. "How to improve": a list of actions ranked by points gained
6. A short "How the score is calculated" section that opens to show the table above

It uses the same Too Spenny green/cream style, Outfit/Figtree fonts and card layout, and stacks into one column on mobile.

## Technical details

- `src/lib/spenny-score.ts`: a pure, unit-tested scoring module. It takes a `ScoreInputs` snapshot (income, expenses, savings/goal contributions, budgets with spent amounts, goals with target/date/progress, debts with balance/min/payments, bills with status/amount/frequency) and returns `{ score, band, components[], helping[3], hurting[3], actions[] }`. Weights and thresholds sit in one config object. Unused parts are re-weighted.
- `getSpennyScore` server function in `finance.functions.ts` (using `requireSupabaseAuth`) builds inputs for the current and previous month from existing tables and returns both results plus the change. No new tables or migrations.
- Monthly recurring cost = the monthly equivalent of each active bill (based on its frequency) plus the minimum payments on debts.
- Savings = transfers into savings/investment accounts plus goal contributions for the month.
- `src/components/spenny-score.tsx`: score ring (SVG, colours from tokens), compact dashboard card, and full breakdown pieces.
- New route `src/routes/_authenticated/score.tsx` with head metadata and a loader/suspense query. Nav item added in `app-layout.tsx`. Dashboard card loads via its own `useQuery`, so the dashboard isn't slowed down.
- Vitest tests cover the thresholds, re-weighting and top-3 ordering.
