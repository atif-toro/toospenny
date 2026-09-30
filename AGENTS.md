<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Spenny Score maths lives in the pure module src/lib/spenny-score.ts (SCORE_CONFIG + computeScore/compareScores, vitest-covered); the server fn only gathers inputs — keeps scoring deterministic and testable.
- Transaction meaning lives in transactions.classification (income/expense/transfer/internal/excluded), set by the pure src/lib/reconcile.ts; `type` is only statement direction for balances. All income/spending totals read classification — one source of truth, user choices (classification_source=user) never overwritten.
