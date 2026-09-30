# Spenny Score: a dashboard health score

A compact score from 0 to 100 on the dashboard that shows your financial progress and what to work on next. It has no separate page and no menu item.

## Dashboard card

It sits near the top of the dashboard, above the existing stat cards:

```text
Spenny Score
76   ↑ 6 since last month
Good. You're improving this month.
Helping: Spending    Hurting: Debt
                         View details →
```

- A small score ring in the Too Spenny green/cream style
- The change since last month is prominent (green for up, muted for down)
- On mobile it's one short card with the ring on the left and the text on the right, so the rest of the dashboard stays close by
- Nothing else on the dashboard is redesigned

## View details panel

Tapping "View details" opens a panel on top of the dashboard. On desktop it's a side panel, and on mobile it slides up from the bottom. Closing it takes you straight back.

1. Overall score and band
2. Change since last month, plus which parts moved it most (e.g. "Spending +4, Debt -1")
3. Component breakdown: 8 rows showing score, weight, a bar and the real numbers behind each. Parts that can't be worked out yet say "Not counted yet" with a setup tip
4. Helping: the top 3 factors
5. Hurting: the top 3 factors
6. Recommended actions: up to 3, each with an "estimated +X pts" label
7. How it's calculated: an expandable section that explains the weights and rules in plain language

The wording stays supportive throughout. This isn't a credit score or a judgement.

## Scoring model

Each part scores 0-100. The overall score is the weighted average of the parts that can be counted.

| Part | Weight | What it measures |
|---|---|---|
| Spending vs income | 15% | Day-to-day spending (excluding debt payments and bills) as a share of income |
| Cash flow | 15% | Money left after everything, as a share of income. Checks whether you finish the month ahead |
| Savings | 15% | Share of income moved into savings, investments and goals this month |
| Budget adherence | 10% | Spent vs limit across budgets, weighted by budget size, so one small overspend has little effect |
| Goal progress | 10% | Average progress vs expected pace across active goals, weighted by target size, with each goal capped. One lagging small goal can't drag the score down. It's ready for a "primary goal" flag later |
| Debt | 15% | Debt burden and repayment health (see below) |
| Bills and recurring costs | 10% | Recurring bills and subscriptions as a share of income, plus whether any are overdue. **Excludes debt payments** |
| Financial buffer | 10% | Easy-to-reach savings (current and savings accounts) divided by essential monthly costs. 3+ months scores 100 and 0 months scores 0 |

**Avoiding double-counting:** debt repayments only count toward Debt. Bills leaves them out and Spending leaves out both. Spending measures habits and Cash flow measures the overall result.

**Debt score** (a blend of four measures):
- Debt compared with yearly income (40%)
- Required monthly payments as a share of income (25%)
- Whether minimum payments were made this month (25%)
- Interest burden, based on the balance-weighted rate (10%, only counted if rates are entered)

Manageable, low-interest debt that's being paid on time can still score highly. Having no debt counts as good, but it isn't the only way to reach the top score.

**Missing data:** if a part can't be worked out (no income logged, no budgets, no goals, no debts entered, no bills), it's left out and the other weights are scaled up to fill the gap. Its row says "Not counted yet" and offers a helpful tip. You're never marked down for a feature you haven't used.

**Bands:** 80-100 Excellent · 65-79 Good · 50-64 Fair · 35-49 Needs attention · 0-34 Needs significant attention. Each band comes with one supportive sentence, adjusted for whether your score went up or down.

**Change since last month:** the same calculation runs on last month's data. The difference is shown along with each part's contribution to it.

**Helping / hurting:** each part's pull is its (reweighted) weight times its distance from 50. The biggest positive pulls count as helping and the biggest negative pulls as hurting.

**Actions:** these are generated from the parts that are hurting you, using realistic amounts (e.g. cut a category by up to 25% of its overspend, suggest £10-£50 more toward a debt, or add a savings amount under 10% of income). They're sorted by estimated gain and capped at 3, with a label like "Estimated +3 pts".

## Technical details

- `src/lib/spenny-score.ts`: a pure module. The `SCORE_CONFIG` object holds all weights, thresholds and debt sub-weights. `computeScore(inputs)` returns components, the score, the band, helping/hurting and actions. `compareScores(current, previous)` returns the change and each part's contribution to it.
- `src/lib/spenny-score.test.ts` (vitest) tests thresholds and interpolation, missing-part exclusion and reweighting, score movement, debt scoring (no debt, manageable debt, missed minimums, missing rates), goal weighting and capping, and helping/hurting order.
- A `getSpennyScore` server function in `finance.functions.ts` (`requireSupabaseAuth`) builds inputs for this month and last month from the existing accounts, transactions, transfers, budgets, goals, goal contributions, debts, debt payments and bills. There are no new tables.
- `src/components/spenny-score-card.tsx` holds the compact card plus a details panel that uses shadcn `Sheet` (side on desktop, bottom on mobile via `useIsMobile`) and semantic tokens only.
- The card is added to `dashboard.tsx` with its own `useQuery`, so the dashboard's loading isn't slowed. There are no route or nav changes.
- roadmap.md gets a Spenny Score task.
