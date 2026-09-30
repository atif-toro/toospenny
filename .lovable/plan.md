# Spenny Score: a dashboard progress indicator

A score from 0 to 100 that you can fully see into. It answers three questions: how am I doing, why did my score change, and what can I do next. It only appears on the dashboard: there's no new page, no menu item, and the rest of the dashboard isn't redesigned.

## Dashboard card (compact)

It sits near the top, above the existing stat cards, and stays small.

```text
Desktop                         Mobile
Spenny Score                    76 ↑6
76  ↑6                          Spenny Score · On track
On track                        Spending ↑ · Debt ↓
Helping: Spending               View details →
Needs attention: Debt
View details →
```

It has a small score ring in the Too Spenny green/cream style. The change since last month stands out: green when up, muted when down.

## Details panel (Sheet)

This is a side panel on desktop and a bottom sheet on mobile. Closing it takes you straight back to the dashboard. It's organised in this order:

1. **Overall score:** 76, ↑6 since last month, On track, and a supportive sentence. It adds "Score based on 6 of 8 areas" when some data is missing.
2. **Why your score changed:** "Your score increased by 4 points", then each area's contribution (Spending +3, Savings +2, Debt -1 …) with green/red up and down markers, sorted by size.
3. **Component breakdown:** all 8 areas, each with its score, weight, a progress bar and the real numbers behind it. Areas that can't be counted yet say "Not counted yet" with a setup tip.
4. **Helping your score:** the top 3, e.g. "Spending — 91", each with a reason drawn from your data.
5. **Needs attention:** the top 3, e.g. "Debt — 48", explained constructively. Stronger wording is only used when the score is genuinely low (under 35).
6. **What you can do:** up to 3 realistic actions, each labelled "Potential impact: +1–3 pts (estimate)". No points are ever guaranteed.
7. **How it's calculated:** a plain-English explanation you can expand.

## Bands and wording

| Score | Band | Description |
|---|---|---|
| 80–100 | Thriving | Your finances are in a strong position. Keep building on your progress. |
| 65–79 | On track | You're on track. A few improvements could make a meaningful difference. |
| 50–64 | Building | You're building a healthier financial position. Here's where you can improve. |
| 35–49 | Needs attention | There are a few areas that need attention. Let's work through them. |
| 0–34 | Needs focus | Your finances may need some focused attention. Start with the highest-impact areas below. |

The wording changes a little depending on whether your score went up or down (for example, "and you're moving in the right direction").

## The eight areas

| Area | Weight | Measures |
|---|---|---|
| Spending vs income | 15% | Day-to-day spending (excluding bills and debt payments) as a share of income |
| Cash flow | 15% | Underlying surplus: income − day-to-day spending − bills − debt payments, as a share of income |
| Savings | 15% | Share of income moved into savings, investments and goals |
| Budget adherence | 10% | Spent vs limit, weighted by budget size, so a small overspend barely matters |
| Goal progress | 10% | Progress vs expected pace, weighted by target size, with each goal's influence capped |
| Debt | 15% | Debt burden and repayment health (see below) |
| Bills and recurring costs | 10% | Recurring bills/subscriptions as a share of income, plus any overdue ones. Excludes debt payments |
| Financial buffer | 10% | Months of essential costs your accessible savings could cover |

**No double-counting:** Spending leaves out bills and debt payments. Bills leaves out debt payments. Debt handles repayment health.

**Cash flow vs savings:** Cash flow is income − day-to-day spending − bills − debt payments. Money moved between your own accounts (including into Savings or Investment accounts) and goal contributions never lowers Cash flow and is never counted as spending. That money only counts toward Savings. Example: £2,500 income − £1,000 spending − £700 bills − £200 debt = £600 (24%). Moving £300 into savings leaves Cash flow at £600, and Savings shows the £300. Internal moves are identified using the existing transfers records, which are kept separate from income and expense transactions.

**Financial buffer:** this is your accessible savings divided by essential monthly costs. Essential costs are your monthly bills, minimum debt payments and your average day-to-day spending. Accessible savings means the balances of your **Current** and **Savings** accounts only. Investments, loans, credit cards and "other" accounts don't count. 0 months scores 0 and 3+ months scores 100, with a straight line in between. It's shown like this: "2.4 months ██████░░░░ — You could currently cover about 2.4 months of essential expenses." If essential costs are zero, it's marked "Not counted yet".

**Debt:** four parts are combined.
- Debt compared with yearly income (40%)
- Required payments as a share of income (25%)
- Minimum payments made (25%)
- Interest burden (10%, left out and reweighted if no rates are entered)

The thresholds are gentle. Debt under about 30% of yearly income, with payments under about 10% of income, scores near the top. So manageable debt that's paid on time can still reach Thriving. No debt scores 100.

**Goals:** the score is weighted by target size, and each goal's share is capped at 40%. A goal counts as fully on pace once it reaches 90% of the expected progress, so a small goal that's slightly behind barely moves the score. The data is structured so a Primary Goal weighting can be added later (not built now).

**Missing data:** an area that can't be worked out (no income, budgets, goals, debts, bills or essential costs) is left out, and the other weights are scaled up to fill the gap. It's shown as "Not counted yet" with a setup tip, and the "Score based on X of 8 areas" note appears.

**Helping / needs attention:** each area is ranked by its reweighted weight times its distance from 50. In the panel it's shown as the area name, its score and a reason based on your data.

**Actions:** these come from the areas that need attention, with realistic amounts. Examples: trim an overspent budget by up to 25% of the overspend, add £10–£50 toward the highest-rate debt, or put savings into your buffer (capped at 10% of income). For each action, the score is re-run with and without the change. The range shown runs from half the gain to the full gain, rounded to at least +1. Actions are sorted by potential gain, with a maximum of 3.

## Technical details

- `src/lib/spenny-score.ts`: a pure module. `SCORE_CONFIG` holds all weights, thresholds, debt sub-weights, goal cap, buffer months, bands and copy. `computeScore(inputs)` returns components (score, weight, effective weight, metrics, status: counted or not counted, with a tip), the score, band, areas counted, helping, needsAttention and actions with a `{min,max}` impact. `compareScores(current, previous)` returns the change and each area's contribution to it. All divisions are guarded, and the output is clamped and rounded so no NaN or Infinity can reach the UI.
- `src/lib/spenny-score.test.ts` (vitest) covers band boundaries, interpolation thresholds, score movement, missing areas and reweighting, debt with no rate, manageable debt, missed minimums, goal weighting and capping, buffer maths, current/savings vs investment accounts, helping/needs-attention order, action impact ranges and limited-data messaging. Edge cases: zero income, zero essential costs, no savings, no debt, no goals, no budgets, no bills, negative cash flow, very high income and very high debt.
- Cash flow and transfer tests: (1) a savings transfer doesn't lower Cash flow; (2) an investment transfer doesn't lower Cash flow; (3) a current-to-savings transfer isn't counted as spending; (4) genuine spending lowers Cash flow; (5) debt payments lower Cash flow but aren't counted as spending; (6) bills lower Cash flow but aren't counted as spending; (7) savings contributions are counted correctly by Savings. The worked £2,500 example is included as a test case.
- A `getSpennyScore` server function in `finance.functions.ts` (`requireSupabaseAuth`) builds inputs for this month and last month from the existing accounts, transactions, transfers, budgets, goals, goal contributions, debts, debt payments and bills. There are no new tables.
- `src/components/spenny-score-card.tsx` holds the compact card and the shadcn `Sheet` (`side` switches between right and bottom via `useIsMobile`), styled with semantic tokens only.
- The card is added to `dashboard.tsx` with its own isolated `useQuery`. There are no route or nav changes. A Spenny Score task is added to roadmap.md.
