import { describe, expect, it } from "vitest";
import { rowsFromLines } from "./pdf-statement";
import { matchBills, payeeMatches } from "./bills";
import { reconcile, type RecTx } from "./reconcile";

describe("multi-line PDF statements", () => {
  it("stitches the payee line onto the date/amount/reference line", () => {
    const rows = rowsFromLines([
      "01 Sep 2026 Opening balance 1,000.00",
      "08 Sep 2026 35123213787726000N 7.99 992.01",
      "Card Transaction GOOGLE ONE LONDON GB",
      "10 Sep 2026 Direct Debit 61.89 930.12",
      "O2",
      "200.00 730.12",
      "Transfer to Monzo",
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ description: "Card Transaction GOOGLE ONE LONDON GB", amountPence: 799, type: "expense", reference: "35123213787726000N" });
    expect(rows[1]).toMatchObject({ description: "Direct Debit O2", amountPence: 6189 });
    expect(rows[2]).toMatchObject({ date: "2026-09-10", description: "Transfer to Monzo", amountPence: 20000, type: "expense" });
  });
});

describe("Outgoings matching", () => {
  const bills = [
    { id: "o2", name: "O2 Family Mobile Plan", amountPence: 6200, cadence: "monthly" as const, dueDay: 10, accountId: null, createdAt: "2026-01-01" },
    { id: "g1", name: "Google One", amountPence: 800, cadence: "monthly" as const, dueDay: 8, accountId: null, createdAt: "2026-01-01" },
  ];
  const txs = [
    { id: "a", date: "2026-09-10", amountPence: 6189, description: "Direct Debit O2", accountId: "nw" },
    { id: "b", date: "2026-09-08", amountPence: 799, description: "Card Transaction GOOGLE ONE LONDON GB", accountId: "nw" },
    { id: "c", date: "2026-09-09", amountPence: 6189, description: "Tesco Stores", accountId: "nw" },
  ];
  it("links real payments to bills despite small price differences", () => {
    const m = matchBills(bills, txs, new Set(), new Set());
    expect(m.map((x) => [x.billId, x.txId, x.period, x.amountPence])).toEqual(
      expect.arrayContaining([["o2", "a", "2026-09", 6189], ["g1", "b", "2026-09", 799]]),
    );
    expect(m).toHaveLength(2);
  });
  it("is idempotent once a period is paid", () => {
    expect(matchBills(bills, txs, new Set(["o2|2026-09", "g1|2026-09"]), new Set())).toHaveLength(0);
  });
  it("does not match unrelated names or wildly different amounts", () => {
    expect(payeeMatches("TESCO STORES", "O2 Family Mobile Plan")).toBe(false);
    expect(matchBills(bills, [{ ...txs[0]!, amountPence: 15000 }], new Set(), new Set())).toHaveLength(0);
  });
});

describe("one-sided transfer to another own account", () => {
  it("classifies 'Transfer to Monzo' as a transfer before the Monzo statement exists", () => {
    const tx: RecTx = { id: "t1", accountId: "nw", accountName: "NatWest", accountType: "current", date: "2026-09-10", direction: "out", amountPence: 20000, note: "Transfer to Monzo", locked: false };
    const [r] = reconcile([tx], [{ id: "nw", name: "NatWest" }, { id: "mz", name: "Monzo" }]);
    expect(r).toMatchObject({ classification: "transfer", counterpartAccountId: "mz" });
  });
});
