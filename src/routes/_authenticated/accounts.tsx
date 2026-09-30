import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, MoreHorizontal, Plus } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, StatCard } from "@/components/finance-ui";
import { RouteError, RouteNotFound } from "@/components/route-states";
import {
  deleteAccount,
  listAccounts,
  saveAccount,
  type AccountRow,
} from "@/lib/finance.functions";
import { formatPence, parsePoundsToPence } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Too Spenny" },
      { name: "description", content: "Your bank accounts, savings, credit cards and investments." },
      { property: "og:title", content: "Accounts — Too Spenny" },
      { property: "og:description", content: "Your bank accounts, savings, credit cards and investments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteError,
  notFoundComponent: RouteNotFound,
  component: AccountsPage,
});

const ACCOUNT_TYPES = [
  { value: "current", label: "Current account" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other" },
];

function typeLabel(t: string) {
  return ACCOUNT_TYPES.find((a) => a.value === t)?.label ?? t;
}

function AccountsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountRow | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["spenny-score"] });
  };

  const save = useMutation({
    mutationFn: saveAccount,
    onSuccess: () => {
      toast.success(editing ? "Account updated" : "Account added");
      invalidate();
      setDialogOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      toast.success("Account deleted");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const active = accounts.filter((a) => !a.archived);
  const assets = active
    .filter((a) => ["current", "savings", "investment", "other"].includes(a.type))
    .reduce((s, a) => s + a.balance_pence, 0);
  const owed = active
    .filter((a) => ["credit_card", "loan"].includes(a.type))
    .reduce((s, a) => s + a.balance_pence, 0);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Bank accounts, savings, credit cards and investments."
        action={
          <Button onClick={openAdd}>
            <Plus className="mr-2 h-4 w-4" /> Add account
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Money you have" value={formatPence(assets)} />
        <StatCard
          label="On cards & loans"
          value={formatPence(owed)}
          valueClassName={owed > 0 ? "text-destructive" : undefined}
        />
        <StatCard
          label="Across these accounts"
          value={formatPence(assets - owed)}
        />
      </div>

      {active.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No accounts yet"
            body="Add your first account to start seeing your money in one place."
            action={
              <Button onClick={openAdd}>
                <Plus className="mr-2 h-4 w-4" /> Add account
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((a) => (
            <div key={a.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-lg font-semibold">{a.name}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {typeLabel(a.type)}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Options for ${a.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(a);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${a.name}"? Its transactions will be removed too.`)) {
                          remove.mutate({ data: { id: a.id } });
                        }
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p
                className={
                  "font-display mt-3 text-3xl font-semibold tabular-nums " +
                  (a.balance_pence < 0 ? "text-destructive" : "")
                }
              >
                {formatPence(a.balance_pence)}
              </p>
              {a.notes && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{a.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {accounts.some((a) => a.archived) && (
        <p className="mt-4 text-xs text-muted-foreground">
          {accounts.filter((a) => a.archived).length} archived account(s) are hidden.
        </p>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editing}
        busy={save.isPending}
        onSubmit={(values) => save.mutate({ data: values })}
      />
    </div>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  account,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: AccountRow | null;
  busy: boolean;
  onSubmit: (values: {
    id?: string;
    name: string;
    type: string;
    balance_pence: number;
    notes?: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("current");
  const [balance, setBalance] = useState("");
  const [notes, setNotes] = useState("");

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setType(account?.type ?? "current");
    setBalance(account ? (account.balance_pence / 100).toFixed(2) : "");
    setNotes(account?.notes ?? "");
  }, [open, account]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "Add account"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              ...(account ? { id: account.id } : {}),
              name: name.trim(),
              type,
              balance_pence: parsePoundsToPence(balance || "0") ?? 0,
              notes: notes.trim() || null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Name</Label>
            <Input
              id="acc-name"
              required
              placeholder="e.g. Halifax current"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <RadioGroup value={type} onValueChange={setType} className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((t) => (
                <Label
                  key={t.value}
                  htmlFor={`type-${t.value}`}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm font-normal has-[button[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem value={t.value} id={`type-${t.value}`} />
                  {t.label}
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-balance">Current balance (£)</Label>
            <Input
              id="acc-balance"
              inputMode="decimal"
              placeholder="0.00"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              For credit cards or loans, enter what you owe as a negative number (e.g. -1200.00).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-notes">Notes (optional)</Label>
            <Textarea id="acc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {account ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
