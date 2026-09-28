import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, MoneyBar, PageHeader, StatCard } from "@/components/finance-ui";
import { RouteError, RouteNotFound } from "@/components/route-states";
import { deleteBudget, listBudgets, listCategories, saveBudget } from "@/lib/finance.functions";
import { formatPence, monthKey, monthLabel, monthStart, parsePoundsToPence } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/budgets")({
  head: () => ({
    meta: [
      { title: "Budgets — Spenny" },
      { name: "description", content: "Set monthly limits by category and track how you're doing." },
      { property: "og:title", content: "Budgets — Spenny" },
      { property: "og:description", content: "Set monthly limits by category and track how you're doing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: BudgetsPage,
});

function BudgetsPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(monthStart(monthKey()));
  const [addOpen, setAddOpen] = useState(false);

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets", month],
    queryFn: () => listBudgets({ data: { month } }),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["budgets"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: saveBudget,
    onSuccess: () => {
      toast.success("Budget saved");
      invalidate();
      setAddOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteBudget,
    onSuccess: () => {
      toast.success("Budget removed");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalLimit = budgets.reduce((s, b) => s + b.limit_pence, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent_pence, 0);
  const expenseCats = categories.filter((c) => c.kind === "expense");

  function shiftMonth(delta: number) {
    const [y, m] = month.slice(0, 7).split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthStart(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`));
  }

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="Monthly limits by category."
        action={
          <Button onClick={() => setAddOpen(true)} disabled={expenseCats.length === 0}>
            <Plus className="mr-2 h-4 w-4" /> Set budget
          </Button>
        }
      />

      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-display min-w-40 text-center text-lg font-semibold">{monthLabel(month.slice(0, 7))}</p>
        <Button variant="outline" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {budgets.length > 0 && (
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <StatCard label="Budgeted" value={formatPence(totalLimit)} />
          <StatCard label="Spent" value={formatPence(totalSpent)} />
          <StatCard
            label="Left to spend"
            value={formatPence(totalLimit - totalSpent)}
            valueClassName={totalSpent > totalLimit ? "text-destructive" : "text-chart-1"}
          />
        </div>
      )}

      {isLoading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : budgets.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={`No budgets for ${monthLabel(month.slice(0, 7))}`}
            body={
              expenseCats.length === 0
                ? "Add some expense categories first, then set monthly limits."
                : "Set a limit for a category — like £300 for Groceries — and watch it fill up as you spend."
            }
            action={
              expenseCats.length > 0 ? (
                <Button onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Set your first budget
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {budgets.map((b) => {
            const pct = b.limit_pence > 0 ? (b.spent_pence / b.limit_pence) * 100 : 0;
            const over = b.spent_pence > b.limit_pence;
            return (
              <div key={b.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: b.category_color ?? "var(--primary)" }}
                    />
                    <p className="truncate font-medium">{b.category_name}</p>
                    {over && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        <TriangleAlert className="h-3 w-3" /> Over
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="text-sm tabular-nums text-muted-foreground">
                      <span className={"font-semibold " + (over ? "text-destructive" : "text-foreground")}>
                        {formatPence(b.spent_pence)}
                      </span>{" "}
                      of {formatPence(b.limit_pence)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${b.category_name} budget`}
                      onClick={() => remove.mutate({ data: { id: b.id } })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <MoneyBar
                  value={b.spent_pence}
                  max={b.limit_pence}
                  className="mt-3"
                  barClassName={over ? "bg-destructive" : undefined}
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {over
                    ? `${formatPence(b.spent_pence - b.limit_pence)} over budget`
                    : `${formatPence(b.limit_pence - b.spent_pence)} left · ${Math.round(pct)}% used`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <AddBudgetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        month={month}
        categories={expenseCats}
        existing={budgets.map((b) => b.category_id)}
        busy={save.isPending}
        onSubmit={(category_id, limit_pence) => save.mutate({ data: { category_id, month, limit_pence } })}
      />
    </div>
  );
}

function AddBudgetDialog({
  open,
  onOpenChange,
  month,
  categories,
  existing,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  month: string;
  categories: { id: string; name: string }[];
  existing: string[];
  busy: boolean;
  onSubmit: (categoryId: string, limitPence: number) => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState("");
  const available = categories.filter((c) => !existing.includes(c.id));

  useEffect(() => {
    if (open) setCategoryId(available[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set a budget</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(categoryId, parsePoundsToPence(limit || "0"));
          }}
        >
          <div className="space-y-1.5">
            <Label>Category</Label>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every expense category already has a budget this month.
              </p>
            ) : (
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-limit">Monthly limit (£)</Label>
            <Input
              id="budget-limit"
              required
              inputMode="decimal"
              placeholder="300.00"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || available.length === 0}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save budget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
