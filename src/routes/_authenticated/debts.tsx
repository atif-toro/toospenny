import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, StatCard } from "@/components/finance-ui";
import { RouteError, RouteNotFound } from "@/components/route-states";
import {
  deleteDebt,
  listDebts,
  recordDebtPayment,
  saveDebt,
  type DebtRow,
} from "@/lib/finance.functions";
import { formatPence, parsePoundsToPence, todayISO } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/debts")({
  head: () => ({
    meta: [
      { title: "Debts — Too Spenny" },
      { name: "description", content: "Track every debt and record your payments." },
      { property: "og:title", content: "Debts — Too Spenny" },
      { property: "og:description", content: "Track every debt and record your payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: DebtsPage,
});

const DEBT_TYPES = [
  { value: "credit_card", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "student", label: "Student loan" },
  { value: "mortgage", label: "Mortgage" },
  { value: "other", label: "Other" },
];

function typeLabel(t: string) {
  return DEBT_TYPES.find((d) => d.value === t)?.label ?? t;
}

function DebtsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DebtRow | null>(null);
  const [payFor, setPayFor] = useState<DebtRow | null>(null);

  const { data: debts = [], isLoading } = useQuery({ queryKey: ["debts"], queryFn: () => listDebts() });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["debts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["spenny-score"] });
  };

  const save = useMutation({
    mutationFn: saveDebt,
    onSuccess: () => {
      toast.success(editTarget ? "Debt updated" : "Debt added");
      invalidate();
      setAddOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteDebt,
    onSuccess: () => {
      toast.success("Debt deleted");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const pay = useMutation({
    mutationFn: recordDebtPayment,
    onSuccess: () => {
      toast.success("Payment recorded");
      invalidate();
      setPayFor(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const totalBalance = debts.reduce((s, d) => s + d.balance_pence, 0);
  const totalPaid = debts.reduce((s, d) => s + d.paid_pence, 0);
  const minPayments = debts.reduce((s, d) => s + d.min_payment_pence, 0);

  return (
    <div>
      <PageHeader
        title="Debts"
        description="Every debt, tracked and shrinking."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add debt
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total owed"
          value={formatPence(totalBalance)}
          valueClassName={totalBalance > 0 ? "text-destructive" : "text-chart-1"}
        />
        <StatCard label="Paid off so far" value={formatPence(totalPaid)} valueClassName="text-chart-1" />
        <StatCard label="Minimums per month" value={formatPence(minPayments)} />
      </div>

      {isLoading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : debts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center">
          <h3 className="font-display text-xl font-semibold">No debts tracked</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Add your credit cards, loans or mortgage and Too Spenny will build your debt-free plan.
          </p>
          <Button className="mt-5" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add your first debt
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {debts.map((d) => {
            const original = d.balance_pence + d.paid_pence;
            const pct = original > 0 ? (d.paid_pence / original) * 100 : 0;
            return (
              <div key={d.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display truncate text-lg font-semibold">{d.name}</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {typeLabel(d.type)} · {d.apr}% APR · min {formatPence(d.min_payment_pence)}/mo
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPayFor(d)}>
                      Record payment
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Options for ${d.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(d)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${d.name}"? Its payment history goes too.`)) {
                              remove.mutate({ data: { id: d.id } });
                            }
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <p className="font-display text-2xl font-semibold tabular-nums text-destructive">
                    {formatPence(d.balance_pence)}
                  </p>
                  <p className="text-xs text-muted-foreground">{Math.round(pct)}% paid off</p>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary/20">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex justify-end">
            <Button variant="outline" asChild>
              <Link to="/payoff">Open payoff planner</Link>
            </Button>
          </div>
        </div>
      )}

      <DebtDialog
        key={editTarget?.id ?? "new"}
        open={addOpen || !!editTarget}
        onOpenChange={(v) => {
          if (!v) {
            setAddOpen(false);
            setEditTarget(null);
          }
        }}
        debt={editTarget}
        busy={save.isPending}
        onSubmit={(values) => save.mutate({ data: values })}
      />

      <Dialog open={!!payFor} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Payment towards {payFor?.name}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              pay.mutate({
                data: {
                  debt_id: payFor!.id,
                  amount_pence: parsePoundsToPence(String(fd.get("amount") || "0")) ?? 0,
                  date: String(fd.get("date") || todayISO()),
                  note: (String(fd.get("note") || "").trim() || null) as string | null,
                },
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount">Amount (£)</Label>
                <Input id="pay-amount" name="amount" required inputMode="decimal" placeholder="100.00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">Date</Label>
                <Input id="pay-date" name="date" type="date" required defaultValue={todayISO()} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your balance drops by this amount straight away.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayFor(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pay.isPending}>
                {pay.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DebtDialog({
  open,
  onOpenChange,
  debt,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  debt: DebtRow | null;
  busy: boolean;
  onSubmit: (values: {
    id?: string;
    name: string;
    type: string;
    balance_pence: number;
    apr: number;
    min_payment_pence: number;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("credit_card");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("");
  const [minPayment, setMinPayment] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(debt?.name ?? "");
    setType(debt?.type ?? "credit_card");
    setBalance(debt ? (debt.balance_pence / 100).toFixed(2) : "");
    setApr(debt ? String(debt.apr) : "");
    setMinPayment(debt ? (debt.min_payment_pence / 100).toFixed(2) : "");
  }, [open, debt]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{debt ? "Edit debt" : "Add debt"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              ...(debt ? { id: debt.id } : {}),
              name: name.trim(),
              type,
              balance_pence: parsePoundsToPence(balance || "0") ?? 0,
              apr: parseFloat(apr || "0"),
              min_payment_pence: parsePoundsToPence(minPayment || "0") ?? 0,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="debt-name">Name</Label>
            <Input
              id="debt-name"
              required
              placeholder="e.g. Barclaycard"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debt-type">Type</Label>
            <select
              id="debt-type"
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {DEBT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="debt-balance">Balance (£)</Label>
              <Input
                id="debt-balance"
                required
                inputMode="decimal"
                placeholder="1200.00"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-apr">Interest rate (%)</Label>
              <Input
                id="debt-apr"
                required
                inputMode="decimal"
                placeholder="18.9"
                value={apr}
                onChange={(e) => setApr(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="debt-min">Minimum monthly payment (£)</Label>
            <Input
              id="debt-min"
              required
              inputMode="decimal"
              placeholder="50.00"
              value={minPayment}
              onChange={(e) => setMinPayment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {debt ? "Save changes" : "Add debt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
