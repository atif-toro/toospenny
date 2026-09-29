import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { PageHeader } from "@/components/finance-ui";
import { RouteError, RouteNotFound } from "@/components/route-states";
import {
  addGoalContribution,
  deleteGoal,
  listGoals,
  saveGoal,
  type GoalRow,
} from "@/lib/finance.functions";
import { formatDate, formatPence, parsePoundsToPence, todayISO } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({
    meta: [
      { title: "Goals — Too Spenny" },
      { name: "description", content: "Savings goals with progress you can see." },
      { property: "og:title", content: "Goals — Too Spenny" },
      { property: "og:description", content: "Savings goals with progress you can see." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: GoalsPage,
});

function GoalsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [contribFor, setContribFor] = useState<GoalRow | null>(null);

  const { data: goals = [], isLoading } = useQuery({ queryKey: ["goals"], queryFn: () => listGoals() });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["goals"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: saveGoal,
    onSuccess: () => {
      toast.success("Goal created");
      invalidate();
      setAddOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const contribute = useMutation({
    mutationFn: addGoalContribution,
    onSuccess: () => {
      toast.success("Contribution added");
      invalidate();
      setContribFor(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => {
      toast.success("Goal deleted");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Goals"
        description="Save for the things that matter."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New goal
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground">Loading…</p>
      ) : goals.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
          <h3 className="font-display text-xl font-semibold">No goals yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Whether it's an emergency fund or a holiday, set a target and watch it fill up.
          </p>
          <Button className="mt-5" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create your first goal
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const pct = g.target_pence > 0 ? Math.min(100, (g.saved_pence / g.target_pence) * 100) : 0;
            const done = g.saved_pence >= g.target_pence;
            return (
              <div key={g.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display truncate text-lg font-semibold">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.target_date ? `Target: ${formatDate(g.target_date)}` : "No target date"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete goal ${g.name}`}
                    onClick={() => {
                      if (confirm(`Delete "${g.name}"?`)) remove.mutate({ data: { id: g.id } });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="my-4">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-display text-2xl font-semibold tabular-nums">
                      {formatPence(g.saved_pence)}
                    </span>
                    <span className="text-muted-foreground">of {formatPence(g.target_pence)}</span>
                  </div>
                  <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-primary/20">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className={"mt-1.5 text-xs " + (done ? "font-semibold text-chart-1" : "text-muted-foreground")}>
                    {done ? "Goal reached — lovely stuff." : `${Math.round(pct)}% there · ${formatPence(g.target_pence - g.saved_pence)} to go`}
                  </p>
                </div>

                <Button
                  variant={done ? "outline" : "default"}
                  className="mt-auto w-full"
                  onClick={() => setContribFor(g)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add money
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <GoalDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        busy={save.isPending}
        onSubmit={(values) => save.mutate({ data: values })}
      />

      <Dialog open={!!contribFor} onOpenChange={(v) => !v && setContribFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add money to {contribFor?.name}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              contribute.mutate({
                data: {
                  goal_id: contribFor!.id,
                  amount_pence: parsePoundsToPence(String(fd.get("amount") || "0")) ?? 0,
                  date: String(fd.get("date") || todayISO()),
                  note: (String(fd.get("note") || "").trim() || null) as string | null,
                },
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gc-amount">Amount (£)</Label>
                <Input id="gc-amount" name="amount" required inputMode="decimal" placeholder="50.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc-date">Date</Label>
                <Input id="gc-date" name="date" type="date" required defaultValue={todayISO()} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContribFor(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={contribute.isPending}>
                {contribute.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add contribution
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoalDialog({
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  busy: boolean;
  onSubmit: (values: {
    name: string;
    target_pence: number;
    target_date: string | null;
    note: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setTarget("");
    setDate("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New savings goal</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              name: name.trim(),
              target_pence: parsePoundsToPence(target || "0") ?? 0,
              target_date: date || null,
              note: null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Name</Label>
            <Input
              id="goal-name"
              required
              placeholder="e.g. Emergency fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target (£)</Label>
              <Input
                id="goal-target"
                required
                inputMode="decimal"
                placeholder="1000.00"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">Target date (optional)</Label>
              <Input id="goal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create goal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
