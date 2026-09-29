import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
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
import { EmptyState, PageHeader, StatCard } from "@/components/finance-ui";
import { RouteError, RouteNotFound } from "@/components/route-states";
import {
  deleteBill,
  listAccounts,
  listBills,
  listCategories,
  markBillPaid,
  saveBill,
  unmarkBillPaid,
  type BillRow,
} from "@/lib/finance.functions";
import { CADENCE_LABEL, type BillKind, type Cadence } from "@/lib/bills";
import { formatDate, formatPence, parsePoundsToPence, todayISO } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => ({
    meta: [
      { title: "Outgoings — Spenny" },
      {
        name: "description",
        content: "Track rent, utilities and subscriptions, and see what's due next.",
      },
      { property: "og:title", content: "Outgoings — Spenny" },
      {
        property: "og:description",
        content: "Track rent, utilities and subscriptions, and see what's due next.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: BillsPage,
});

type FormValues = {
  id?: string;
  name: string;
  kind: BillKind;
  amount_pence: number;
  cadence: Cadence;
  due_day: number;
  account_id: string | null;
  category_id: string | null;
  note: string | null;
};

const SUGGESTIONS: { name: string; kind: BillKind }[] = [
  { name: "Rent", kind: "fixed" },
  { name: "Mortgage", kind: "fixed" },
  { name: "Council tax", kind: "fixed" },
  { name: "Water", kind: "fixed" },
  { name: "Energy", kind: "fixed" },
  { name: "Broadband", kind: "fixed" },
  { name: "Mobile", kind: "fixed" },
  { name: "Insurance", kind: "fixed" },
  { name: "Netflix", kind: "subscription" },
  { name: "Spotify", kind: "subscription" },
  { name: "Gym", kind: "subscription" },
  { name: "iCloud", kind: "subscription" },
];

const STATUS_STYLE: Record<BillRow["status"], { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-primary/15 text-primary" },
  overdue: { label: "Overdue", className: "bg-destructive/15 text-destructive" },
  due_soon: { label: "Due soon", className: "bg-chart-2/20 text-chart-2" },
  upcoming: { label: "Upcoming", className: "bg-muted text-muted-foreground" },
};

function BillsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BillRow | null>(null);
  const [filter, setFilter] = useState<"all" | BillKind>("all");

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["bills"],
    queryFn: () => listBills(),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["bills"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const save = useMutation({
    mutationFn: saveBill,
    onSuccess: () => {
      toast.success(editing ? "Bill updated" : "Bill added");
      invalidate();
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteBill,
    onSuccess: () => {
      toast.success("Bill deleted");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const pay = useMutation({
    mutationFn: markBillPaid,
    onSuccess: () => {
      toast.success("Marked as paid");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const unpay = useMutation({
    mutationFn: unmarkBillPaid,
    onSuccess: () => {
      toast.success("Payment undone");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const shown = bills.filter((b) => filter === "all" || b.kind === filter);
  const active = bills.filter((b) => b.active);
  const fixedMonthly = active
    .filter((b) => b.kind === "fixed")
    .reduce((s, b) => s + b.monthly_cost_pence, 0);
  const subsMonthly = active
    .filter((b) => b.kind === "subscription")
    .reduce((s, b) => s + b.monthly_cost_pence, 0);
  const outstanding = active
    .filter((b) => b.status !== "paid" && b.due_date.slice(0, 7) === todayISO().slice(0, 7))
    .reduce((s, b) => s + b.amount_pence, 0);

  return (
    <div>
      <PageHeader
        title="Bills & subscriptions"
        description="Rent, utilities and the small monthly ones that add up."
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add bill
          </Button>
        }
      />

      {bills.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Fixed bills" value={formatPence(fixedMonthly)} sub="per month" />
          <StatCard label="Subscriptions" value={formatPence(subsMonthly)} sub="per month" />
          <StatCard
            label="Left to pay this month"
            value={formatPence(outstanding)}
            sub={`${formatPence(fixedMonthly + subsMonthly)} committed each month`}
          />
        </div>
      )}

      {bills.length > 0 && (
        <div className="mb-4 flex gap-2">
          {(["all", "fixed", "subscription"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "fixed" ? "Fixed bills" : "Subscriptions"}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground">Loading…</p>
      ) : bills.length === 0 ? (
        <EmptyState
          title="No bills tracked yet"
          body="Add your rent, water, energy and subscriptions to see exactly what leaves your account each month."
          action={
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add your first bill
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Bill</th>
                <th className="hidden px-4 py-3 text-left font-semibold sm:table-cell">Due</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3 text-right font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((b) => {
                const style = STATUS_STYLE[b.status];
                return (
                  <tr key={b.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {CADENCE_LABEL[b.cadence]}
                        {b.account_name ? ` · ${b.account_name}` : ""}
                        {b.category_name ? ` · ${b.category_name}` : ""}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {formatDate(b.due_date)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatPence(b.amount_pence)}
                      {b.cadence !== "monthly" && (
                        <span className="block text-xs text-muted-foreground">
                          {formatPence(b.monthly_cost_pence)}/mo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          "inline-block rounded-full px-2.5 py-1 text-xs font-semibold " +
                          style.className
                        }
                      >
                        {style.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {b.status === "paid" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Undo payment for ${b.name}`}
                            onClick={() =>
                              unpay.mutate({
                                data: { bill_id: b.id, period: b.paid_period ?? b.period },
                              })
                            }
                          >
                            <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            aria-label={`Mark ${b.name} as paid`}
                            onClick={() =>
                              pay.mutate({
                                data: {
                                  bill_id: b.id,
                                  period: b.period,
                                  amount_pence: b.amount_pence,
                                  paid_on: todayISO(),
                                  log_transaction: true,
                                },
                              })
                            }
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Mark paid
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          aria-label={`Edit ${b.name}`}
                          onClick={() => {
                            setEditing(b);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${b.name}`}
                          onClick={() => {
                            if (confirm(`Delete "${b.name}"?`)) remove.mutate({ data: { id: b.id } });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <BillDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditing(null);
        }}
        bill={editing}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        busy={save.isPending}
        onSubmit={(values) => save.mutate({ data: values })}
      />
    </div>
  );
}

function BillDialog({
  open,
  onOpenChange,
  bill,
  accounts,
  categories,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bill: BillRow | null;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: string }[];
  busy: boolean;
  onSubmit: (values: FormValues) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BillKind>("fixed");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [dueDay, setDueDay] = useState("1");
  const [accountId, setAccountId] = useState("none");
  const [categoryId, setCategoryId] = useState("none");

  useEffect(() => {
    if (!open) return;
    setName(bill?.name ?? "");
    setKind(bill?.kind ?? "fixed");
    setAmount(bill ? (bill.amount_pence / 100).toFixed(2) : "");
    setCadence(bill?.cadence ?? "monthly");
    setDueDay(String(bill?.due_day ?? 1));
    setAccountId(bill?.account_id ?? "none");
    setCategoryId(bill?.category_id ?? "none");
  }, [open, bill]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bill ? "Edit bill" : "Add a bill or subscription"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              ...(bill ? { id: bill.id } : {}),
              name: name.trim(),
              kind,
              amount_pence: parsePoundsToPence(amount || "0") ?? 0,
              cadence,
              due_day: Math.min(31, Math.max(1, Number(dueDay) || 1)),
              account_id: accountId === "none" ? null : accountId,
              category_id: categoryId === "none" ? null : categoryId,
              note: null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="bill-name">Name</Label>
            <Input
              id="bill-name"
              required
              placeholder="e.g. Rent"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {!bill && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                    onClick={() => {
                      setName(s.name);
                      setKind(s.kind);
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as BillKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed bill</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-amount">Amount (£)</Label>
              <Input
                id="bill-amount"
                required
                inputMode="decimal"
                placeholder="850.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>How often</Label>
              <Select value={cadence} onValueChange={(v) => setCadence(v as Cadence)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-day">Due day of month</Label>
              <Input
                id="bill-day"
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Paid from</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="No account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No account</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categories
                    .filter((c) => c.kind === "expense")
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bill ? "Save changes" : "Add bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
