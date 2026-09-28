import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, StatCard } from "@/components/finance-ui";
import { RouteError, RouteNotFound } from "@/components/route-states";
import {
  deleteTransaction,
  listAccounts,
  listCategories,
  listTransactions,
  saveTransaction,
} from "@/lib/finance.functions";
import { formatPence, monthKey, monthLabel, monthStart, todayISO } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — Spenny" },
      { name: "description", content: "Every penny in and out, filterable and searchable." },
      { property: "og:title", content: "Transactions — Spenny" },
      { property: "og:description", content: "Every penny in and out, filterable and searchable." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: TransactionsPage,
});

function TransactionsPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(monthKey());
  const [type, setType] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ["accounts"], queryFn: () => listAccounts() });
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });

  const filter = useMemo(
    () => ({
      month: month === "all" ? undefined : monthStart(month),
      type: type === "all" ? undefined : (type as "income" | "expense"),
      categoryId: categoryId === "all" ? undefined : categoryId,
      search: search.trim() || undefined,
      limit: 500,
    }),
    [month, type, categoryId, search],
  );

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["transactions", filter],
    queryFn: () => listTransactions({ data: filter }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["budgets"] });
  };

  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      toast.success("Transaction deleted");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount_pence, 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount_pence, 0);

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Every penny in and out."
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add transaction
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Money in" value={formatPence(income)} valueClassName="text-chart-1" />
        <StatCard label="Money out" value={formatPence(expenses)} />
        <StatCard
          label="Net"
          value={formatPence(income - expenses)}
          valueClassName={income - expenses >= 0 ? "text-chart-1" : "text-destructive"}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            {pastMonths(18).map((m) => (
              <SelectItem key={m} value={m}>
                {monthLabel(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">In & out</SelectItem>
            <SelectItem value="income">Money in</SelectItem>
            <SelectItem value="expense">Money out</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search notes…"
          className="w-52"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : transactions.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nothing here yet — add a transaction to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Date</th>
                <th className="px-4 py-2.5 font-semibold">Description</th>
                <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Category</th>
                <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Account</th>
                <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-accent/40">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{t.date}</td>
                  <td className="max-w-[16rem] truncate px-4 py-2.5 font-medium">
                    {t.note || "—"}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                    {t.category_name ?? "—"}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                    {t.account_name ?? "—"}
                  </td>
                  <td
                    className={
                      "whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums " +
                      (t.type === "income" ? "text-chart-1" : "")
                    }
                  >
                    {t.type === "income" ? "+" : "−"}
                    {formatPence(t.amount_pence)}
                  </td>
                  <td className="px-2 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label="Delete transaction"
                      onClick={() => remove.mutate({ data: { id: t.id } })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddTransactionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories}
        onSaved={invalidate}
      />
    </div>
  );
}

function pastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function AddTransactionDialog({
  open,
  onOpenChange,
  accounts,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: "income" | "expense" }[];
  onSaved: () => void;
}) {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("none");

  const save = useMutation({
    mutationFn: saveTransaction,
    onSuccess: () => {
      toast.success("Transaction added");
      onSaved();
      onOpenChange(false);
      setAmount("");
      setNote("");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!open) return;
    setDate(todayISO());
    setAccountId(accounts[0]?.id ?? "");
    setCategoryId("none");
  }, [open, accounts]);

  const kind = type === "income" ? "income" : "expense";
  const options = categories.filter((c) => c.kind === kind);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              data: {
                type,
                amount_pence: Math.round(parseFloat(amount) * 100),
                date,
                note: note.trim() || null,
                account_id: accountId || null,
                category_id: categoryId === "none" ? null : categoryId,
              },
            });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === "expense" ? "default" : "outline"}
              onClick={() => {
                setType("expense");
                setCategoryId("none");
              }}
            >
              Money out
            </Button>
            <Button
              type="button"
              variant={type === "income" ? "default" : "outline"}
              onClick={() => {
                setType("income");
                setCategoryId("none");
              }}
            >
              Money in
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">Amount (£)</Label>
              <Input
                id="tx-amount"
                required
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorised</SelectItem>
                {options.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder={accounts.length ? undefined : "No accounts yet"} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tx-note">Note (optional)</Label>
            <Input
              id="tx-note"
              placeholder="e.g. Weekly shop"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add transaction
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
