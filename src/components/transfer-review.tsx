import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Check, Copy, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  listReviewItems,
  reconcileTransactions,
  resolveReview,
  setClassification,
  type ReviewItem,
  type TransactionRow,
} from "@/lib/finance.functions";
import { CLASSIFICATION_LABELS, type Classification, type RecSummary } from "@/lib/reconcile";
import { formatDate, formatPence } from "@/lib/money";

export type ReconcileSummary = RecSummary & { changed: number; total: number };

export function invalidateFinance(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ["transactions", "transfers", "dashboard", "spenny-score", "budgets", "accounts", "review-items"]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function ClassificationBadge({ c }: { c: Classification }) {
  if (c === "income" || c === "expense") return null;
  return (
    <Badge variant="secondary" className="ml-2 gap-1 font-normal">
      {c === "transfer" || c === "internal" ? <ArrowLeftRight className="h-3 w-3" /> : null}
      {CLASSIFICATION_LABELS[c]}
    </Badge>
  );
}

/** Hook: run reconciliation across all accounts. */
export function useReconcile(onDone?: (s: ReconcileSummary) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reconcileTransactions(),
    onSuccess: (s) => {
      invalidateFinance(queryClient);
      onDone?.(s);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function SummaryBlock({ s }: { s: ReconcileSummary }) {
  const items: [string, string][] = [
    ["Income", formatPence(s.incomePence)],
    ["Expenses", formatPence(s.expensePence)],
    ["Transfers", formatPence(s.transferPence)],
    ["Internal transfers", formatPence(s.internalPence)],
  ];
  return (
    <div className="rounded-xl border bg-muted/40 p-4">
      <p className="text-sm font-semibold">Checked {s.total} transactions</p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {items.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Transfers and internal movements don't count as money in or money out.
        {s.needsReview > 0 ? ` ${s.needsReview} need your review.` : " Nothing needs review."}
      </p>
    </div>
  );
}

function reviewTitle(i: ReviewItem): { title: string; confirm: string; reject: string } {
  const k = i.suggestion?.kind;
  if (k === "duplicate") return { title: "Possible duplicate", confirm: "Mark duplicate", reject: "Keep both" };
  if (k === "internal") return { title: "Internal account movement?", confirm: "Confirm", reject: i.type === "income" ? "Mark as income" : "Mark as expense" };
  if (i.classification === "transfer" && !i.suggestion?.counterpartTxId)
    return { title: "Transfer detected", confirm: "Confirm transfer", reject: i.type === "income" ? "Mark as income" : "Mark as expense" };
  if (i.suggestion?.kind === "transfer" && i.suggestion.counterpartTxId)
    return { title: "Possible transfer", confirm: "Confirm transfer", reject: "Keep separate" };
  if (i.suggestion?.kind === "transfer")
    return { title: "Possible transfer", confirm: "Mark as transfer", reject: "Keep as is" };
  return { title: "Please check", confirm: "Confirm", reject: "Keep as is" };
}

function ReviewCard({ item, onChanged }: { item: ReviewItem; onChanged: () => void }) {
  const t = reviewTitle(item);
  const resolve = useMutation({
    mutationFn: (action: "confirm" | "reject") => resolveReview({ data: { id: item.id, action } }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });
  const Icon = item.suggestion?.kind === "duplicate" ? Copy : ArrowLeftRight;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{t.title}</p>
            {item.confidence ? (
              <Badge variant="outline" className="font-normal capitalize">
                {item.confidence} confidence
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm">
            <span className="font-semibold tabular-nums">
              {item.type === "income" ? "+" : "−"}
              {formatPence(item.amount_pence)}
            </span>{" "}
            · {item.account_name ?? "No account"} · {formatDate(item.date)}
          </p>
          <p className="truncate text-sm text-muted-foreground">{item.note || "No description"}</p>
          {item.counterpart ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {item.suggestion?.kind === "duplicate" ? "Same as" : "Matches"}{" "}
              <span className="text-foreground">{item.counterpart.note || "a transaction"}</span> in{" "}
              {item.counterpart.account_name ?? "another account"} on {formatDate(item.counterpart.date)}
            </p>
          ) : null}
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {item.reasons.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate("confirm")}>
              <Check className="mr-1.5 h-3.5 w-3.5" /> {t.confirm}
            </Button>
            <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate("reject")}>
              <X className="mr-1.5 h-3.5 w-3.5" /> {t.reject}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Side panel (bottom sheet on phones) listing everything that needs a decision. */
export function ReviewSheet({
  open,
  onOpenChange,
  summary,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  summary: ReconcileSummary | null;
}) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [latest, setLatest] = useState<ReconcileSummary | null>(summary);
  useEffect(() => setLatest(summary), [summary]);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["review-items"],
    queryFn: () => listReviewItems(),
    enabled: open,
  });
  const rerun = useReconcile((s) => {
    setLatest(s);
    toast.success(s.changed ? `Updated ${s.changed} transactions` : "Everything is already up to date");
  });
  // Hide the partner card of a pair so each pair shows once.
  const seen = new Set<string>();
  const visible = items.filter((i) => {
    if (seen.has(i.id)) return false;
    if (i.suggestion?.counterpartTxId) seen.add(i.suggestion.counterpartTxId);
    return true;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? "max-h-[88vh] overflow-y-auto rounded-t-2xl" : "w-full overflow-y-auto sm:max-w-lg"}
      >
        <SheetHeader>
          <SheetTitle>Transfers & review</SheetTitle>
          <SheetDescription>
            Money moving between your own accounts isn't income or spending. Check anything Too Spenny wasn't sure about.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          {latest ? <SummaryBlock s={latest} /> : null}
          <Button variant="outline" size="sm" disabled={rerun.isPending} onClick={() => rerun.mutate()}>
            {rerun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Check all accounts for transfers
          </Button>
          <div>
            <p className="text-sm font-semibold">
              {visible.length ? `${visible.length} to review` : "Nothing to review"}
            </p>
            {isLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="mt-3 space-y-3">
                {visible.map((i) => (
                  <ReviewCard key={i.id} item={i} onChanged={() => invalidateFinance(queryClient)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Banner shown on the transactions page. */
export function ReviewBanner({ onOpen }: { onOpen: () => void }) {
  const { data: items = [] } = useQuery({ queryKey: ["review-items"], queryFn: () => listReviewItems() });
  const count = new Set(items.map((i) => i.link_id ?? i.id)).size;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm">
      <Sparkles className="h-4 w-4 text-primary" />
      <span className="flex-1">
        {count > 0
          ? `${items.length} transaction${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} a quick check — possible transfers or duplicates.`
          : "Transfers between your accounts are kept out of money in and money out."}
      </span>
      <Button size="sm" variant={count > 0 ? "default" : "outline"} onClick={onOpen}>
        {count > 0 ? "Review" : "Transfers & review"}
      </Button>
    </div>
  );
}

/** Change what a single transaction really is, and see why it was classified. */
export function ClassifyDialog({
  tx,
  accounts,
  onOpenChange,
}: {
  tx: TransactionRow | null;
  accounts: { id: string; name: string }[];
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState<Classification>("expense");
  const [counterpart, setCounterpart] = useState<string>("none");
  useEffect(() => {
    if (!tx) return;
    setValue(tx.classification);
    setCounterpart(tx.counterpart_account_id ?? "none");
  }, [tx]);
  const save = useMutation({
    mutationFn: () =>
      setClassification({
        data: {
          id: tx!.id,
          classification: value,
          counterpart_account_id: counterpart === "none" ? null : counterpart,
        },
      }),
    onSuccess: () => {
      toast.success("Updated — your totals have been recalculated");
      invalidateFinance(queryClient);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const isMove = value === "transfer" || value === "internal";
  const options: Classification[] = ["income", "expense", "transfer", "internal", "excluded"];
  return (
    <Dialog open={!!tx} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What is this transaction?</DialogTitle>
          <DialogDescription>
            {tx ? `${tx.type === "income" ? "+" : "−"}${formatPence(tx.amount_pence)} · ${tx.note || "No description"} · ${formatDate(tx.date)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {tx && tx.reasons.length > 0 ? (
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">
              Classified as {CLASSIFICATION_LABELS[tx.classification]} because:
            </p>
            <ul className="space-y-0.5">
              {tx.reasons.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={value} onValueChange={(v) => setValue(v as Classification)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  {CLASSIFICATION_LABELS[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isMove ? (
          <div className="space-y-2">
            <Label>{tx?.type === "income" ? "From account" : "To account"}</Label>
            <Select value={counterpart} onValueChange={setCounterpart}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not in Too Spenny / not sure</SelectItem>
                {accounts
                  .filter((a) => value === "internal" || a.id !== tx?.account_id)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
