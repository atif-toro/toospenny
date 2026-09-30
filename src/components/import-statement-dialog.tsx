import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  BANK_PRESETS,
  GENERIC_PRESET,
  dedupeKey,
  guessCategory,
  parseStatement,
  presetById,
  type BankId,
  type ParsedRow,
} from "@/lib/bank-parsers";
import {
  importTransactions,
  listExistingForImport,
  type AccountRow,
  type CategoryRow,
} from "@/lib/finance.functions";
import { scanStatement } from "@/lib/statement-scan.functions";
import { formatDate, formatPence } from "@/lib/money";

type ReviewRow = ParsedRow & {
  id: number;
  selected: boolean;
  duplicate: boolean;
  categoryName: string | null;
};

export function ImportStatementDialog({
  accounts,
  categories,
  onImported,
}: {
  accounts: AccountRow[];
  categories: CategoryRow[];
  onImported?: () => void;
}) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState<string>("");
  const [bank, setBank] = useState<BankId | "auto">("auto");
  const [fileName, setFileName] = useState<string>("");
  const [fileText, setFileText] = useState<string>("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [detected, setDetected] = useState<string>("");
  const [skipped, setSkipped] = useState(0);
  const [parsing, setParsing] = useState(false);

  const reset = () => {
    setFileName("");
    setFileText("");
    setRows([]);
    setDetected("");
    setSkipped(0);
    setBank("auto");
    if (fileRef.current) fileRef.current.value = "";
  };

  const applyRows = async (parsed: ParsedRow[], targetAccount: string) => {
    if (parsed.length === 0) {
      setRows([]);
      toast.error("No transactions found in that file");
      return;
    }
    const dates = parsed.map((r) => r.date).sort();
    let existingKeys = new Set<string>();
    if (targetAccount) {
      const existing = await listExistingForImport({
        data: { accountId: targetAccount, from: dates[0]!, to: dates[dates.length - 1]! },
      });
      existingKeys = new Set(
        existing.map((e) => dedupeKey(e.date, e.amount_pence, e.type, e.note ?? "")),
      );
    }
    setRows(
      parsed.map((r, i) => {
        const duplicate = existingKeys.has(dedupeKey(r.date, r.amountPence, r.type, r.description));
        return {
          ...r,
          id: i,
          duplicate,
          selected: !duplicate,
          categoryName: guessCategory(r.description, r.type),
        };
      }),
    );
  };

  const buildRows = async (text: string, targetAccount: string, bankChoice: BankId | "auto") => {
    setParsing(true);
    try {
      const result = parseStatement(text, bankChoice === "auto" ? undefined : presetById(bankChoice));
      setDetected(result.preset.label);
      setSkipped(result.skipped);
      await applyRows(result.rows, targetAccount);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    if (mime === "application/pdf" || mime.startsWith("image/")) {
      await scanFile(file, mime);
      return;
    }
    const text = await file.text();
    setFileText(text);
    await buildRows(text, accountId, bank);
  };

  const scanFile = async (file: File, mime: string) => {
    if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mime)) {
      toast.error("Please use a PDF, JPG, PNG or WEBP. iPhone HEIC photos need converting to JPG first.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("That file is over 10MB — try a smaller one.");
      return;
    }
    setParsing(true);
    setFileText("");
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const res = await scanStatement({
        data: { fileName: file.name, mimeType: mime as "application/pdf", base64: btoa(bin) },
      });
      setDetected(res.bank ? `Scanned · ${res.bank}` : "Scanned statement");
      setSkipped(0);
      await applyRows(res.rows, accountId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  };

  const onAccountChange = async (value: string) => {
    setAccountId(value);
    if (fileText) await buildRows(fileText, value, bank);
    else if (rows.length) await applyRows(rows.map(({ date, description, amountPence, type }) => ({ date, description, amountPence, type })), value);
  };

  const onBankChange = async (value: BankId | "auto") => {
    setBank(value);
    if (fileText) await buildRows(fileText, accountId, value);
  };

  const selected = rows.filter((r) => r.selected);
  const netPence = useMemo(
    () => selected.reduce((s, r) => s + (r.type === "income" ? r.amountPence : -r.amountPence), 0),
    [selected],
  );

  const categoryIdFor = (name: string | null, type: "income" | "expense") => {
    if (!name) return null;
    return (
      categories.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.kind === type)?.id ?? null
    );
  };

  const runImport = useMutation({
    mutationFn: async () =>
      importTransactions({
        data: {
          accountId,
          rows: selected.map((r) => ({
            date: r.date,
            type: r.type,
            amount_pence: r.amountPence,
            note: r.description.slice(0, 300),
            category_id: categoryIdFor(r.categoryName, r.type),
            category_name: r.categoryName,
          })),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Imported ${res.imported} transactions`);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      onImported?.();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: number) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)));

  const setCategory = (id: number, name: string) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, categoryName: name === "none" ? null : name } : r)),
    );

  const allSelected = rows.length > 0 && rows.every((r) => r.selected);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="mr-2 h-4 w-4" /> Import statement
      </Button>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import a bank statement</DialogTitle>
          <DialogDescription>
            Upload a CSV, PDF or photo of your statement, check the rows, then add them to Too Spenny.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={onAccountChange}>
              <SelectTrigger>
                <SelectValue placeholder="Choose account" />
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
          <div className="space-y-2">
            <Label>Bank format</Label>
            <Select value={bank} onValueChange={(v) => onBankChange(v as BankId | "auto")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Detect automatically</SelectItem>
                {BANK_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
                <SelectItem value={GENERIC_PRESET.id}>{GENERIC_PRESET.label}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Statement file (CSV, PDF or photo)</Label>
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 text-sm text-muted-foreground">
              {fileName || "Upload a CSV, PDF statement or a clear photo of it"}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
          </div>
        </div>

        {parsing ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading your statement… (photos and PDFs can take up to a minute)
          </div>
        ) : rows.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{detected}</Badge>
              <span className="text-muted-foreground">
                {selected.length} of {rows.length} selected
                {rows.some((r) => r.duplicate)
                  ? ` · ${rows.filter((r) => r.duplicate).length} possible duplicates`
                  : ""}
                {skipped > 0 ? ` · ${skipped} rows ignored` : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() =>
                  setRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })))
                }
              >
                {allSelected ? "Clear all" : "Select all"}
              </Button>
            </div>

            <div className="max-h-[320px] overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 p-2" />
                    <th className="p-2">Date</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Category</th>
                    <th className="p-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.duplicate ? "bg-amber-500/5" : undefined}>
                      <td className="p-2 align-middle">
                        <Checkbox checked={r.selected} onCheckedChange={() => toggle(r.id)} />
                      </td>
                      <td className="whitespace-nowrap p-2">{formatDate(r.date)}</td>
                      <td className="max-w-[220px] truncate p-2">
                        {r.description}
                        {r.duplicate ? (
                          <Badge variant="outline" className="ml-2 text-amber-600">
                            Already added?
                          </Badge>
                        ) : null}
                      </td>
                      <td className="p-2">
                        <Select
                          value={r.categoryName ?? "none"}
                          onValueChange={(v) => setCategory(r.id, v)}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No category</SelectItem>
                            {Array.from(
                              new Set([
                                ...categories.filter((c) => c.kind === r.type).map((c) => c.name),
                                ...(r.categoryName ? [r.categoryName] : []),
                              ]),
                            ).map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td
                        className={`whitespace-nowrap p-2 text-right font-medium ${
                          r.type === "income" ? "text-emerald-600" : ""
                        }`}
                      >
                        {r.type === "income" ? "+" : "−"}
                        {formatPence(r.amountPence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <DialogFooter className="items-center gap-2">
          {selected.length > 0 ? (
            <span className="mr-auto text-sm text-muted-foreground">
              Balance change {netPence >= 0 ? "+" : "−"}
              {formatPence(Math.abs(netPence))}
            </span>
          ) : null}
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!accountId || selected.length === 0 || runImport.isPending}
            onClick={() => runImport.mutate()}
          >
            {runImport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Import {selected.length || ""} transactions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
