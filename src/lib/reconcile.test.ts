import { describe, expect, it } from "vitest";
import { reconcile, summarise, type RecTx } from "./reconcile";

let n = 0;
const tx = (p: Partial<RecTx> & Pick<RecTx, "direction" | "amountPence" | "note">): RecTx => ({
  id: `t${String(++n).padStart(3, "0")}`,
  accountId: "monzo",
  accountName: "Monzo",
  accountType: "current",
  date: "2026-08-28",
  ...p,
});
const byId = (res: ReturnType<typeof reconcile>) => new Map(res.map((r) => [r.id, r]));

describe("reconcile", () => {
  it("1. salary counts as income and is recognised as likely salary", () => {
    const a = tx({ accountId: "nw", accountName: "NatWest", direction: "in", amountPence: 231221, note: "Automated Credit ACME LTD", date: "2026-07-28" });
    const b = tx({ accountId: "nw", accountName: "NatWest", direction: "in", amountPence: 230000, note: "Automated Credit ACME LTD", date: "2026-08-28" });
    const r = byId(reconcile([a, b]));
    expect(r.get(a.id)!.classification).toBe("income");
    expect(r.get(b.id)!.likelySalary).toBe(true);
  });

  it("2. Monzo → Revolut is a transfer, not income/expense", () => {
    const out = tx({ direction: "out", amountPence: 60000, note: "Transfer to Revolut" });
    const inn = tx({ accountId: "rev", accountName: "Revolut", direction: "in", amountPence: 60000, note: "Top-up by *7561" });
    const r = byId(reconcile([out, inn]));
    expect(r.get(out.id)!.classification).toBe("transfer");
    expect(r.get(inn.id)!.classification).toBe("transfer");
    expect(r.get(out.id)!.linkId).toBe(r.get(inn.id)!.linkId);
    expect(r.get(out.id)!.confidence).toBe("high");
    expect(r.get(out.id)!.counterpartAccountId).toBe("rev");
  });

  it("3. Revolut → Monzo a day later is a transfer", () => {
    const out = tx({ accountId: "rev", accountName: "Revolut", direction: "out", amountPence: 5000, note: "Transfer to Monzo", date: "2026-08-28" });
    const inn = tx({ direction: "in", amountPence: 5000, note: "Faster payment from Revolut", date: "2026-08-29" });
    const r = byId(reconcile([out, inn]));
    expect(r.get(inn.id)!.classification).toBe("transfer");
  });

  it("4/5. pot movements are internal transfers both ways", () => {
    const fromPot = tx({ direction: "in", amountPence: 100000, note: "Transfer from Pot" });
    const potSide = tx({ direction: "out", amountPence: 100000, note: "Withdrawal" });
    const toPot = tx({ direction: "out", amountPence: 50000, note: "Transfer to Pot", date: "2026-08-02" });
    const r = byId(reconcile([fromPot, potSide, toPot]));
    expect(r.get(fromPot.id)!.classification).toBe("internal");
    expect(r.get(potSide.id)!.classification).toBe("internal");
    expect(r.get(fromPot.id)!.linkId).toBe(r.get(potSide.id)!.linkId);
    expect(r.get(toPot.id)!.classification).toBe("internal");
  });

  it("6. an external payment with no matching outgoing stays income", () => {
    const friend = tx({ direction: "in", amountPence: 50000, note: "J Smith (Faster Payments) Reference: dinner" });
    const r = byId(reconcile([friend]));
    expect(r.get(friend.id)!.classification).toBe("income");
  });

  it("7. genuine spending stays expense", () => {
    const shop = tx({ direction: "out", amountPence: 5054, note: "Sainsbury's" });
    expect(reconcile([shop])[0]!.classification).toBe("expense");
  });

  it("8. duplicate salary is flagged, not removed", () => {
    const a = tx({ accountId: "nw", direction: "in", amountPence: 231221, note: "Automated Credit ACME LLP" });
    const b = tx({ accountId: "nw", direction: "in", amountPence: 231221, note: "Acme" });
    const res = reconcile([a, b]);
    expect(res).toHaveLength(2);
    const r = byId(res);
    expect(r.get(b.id)!.duplicateOf).toBe(a.id);
    expect(r.get(b.id)!.needsReview).toBe(true);
    expect(r.get(b.id)!.classification).toBe("income");
  });

  it("9. several same-amount transfers are not blindly paired", () => {
    const o1 = tx({ direction: "out", amountPence: 10000, note: "Transaction" });
    const o2 = tx({ direction: "out", amountPence: 10000, note: "Transaction" });
    const i1 = tx({ accountId: "rev", accountName: "Revolut", direction: "in", amountPence: 10000, note: "Open banking top-up" });
    const r = byId(reconcile([o1, o2, i1]));
    expect(r.get(i1.id)!.classification).not.toBe("transfer");
    expect(r.get(i1.id)!.needsReview).toBe(true);
    expect(r.get(i1.id)!.confidence).toBe("low");
  });

  it("10. re-running produces identical results (idempotent)", () => {
    const list = [
      tx({ direction: "out", amountPence: 60000, note: "Transfer" }),
      tx({ accountId: "rev", accountName: "Revolut", direction: "in", amountPence: 60000, note: "Top-up" }),
      tx({ direction: "in", amountPence: 3700, note: "Transfer from Pot" }),
    ];
    expect(reconcile(list)).toEqual(reconcile([...list].reverse()));
  });

  it("different amounts are never auto-matched", () => {
    const out = tx({ direction: "out", amountPence: 100000, note: "Transfer" });
    const inn = tx({ accountId: "rev", accountName: "Revolut", direction: "in", amountPence: 99500, note: "Bank transfer" });
    const r = byId(reconcile([out, inn]));
    expect(r.get(out.id)!.classification).toBe("expense");
  });

  it("weakly described nearby match asks the user instead of converting", () => {
    const out = tx({ direction: "out", amountPence: 4200, note: "Coffee Co", date: "2026-08-25" });
    const inn = tx({ accountId: "rev", accountName: "Revolut", direction: "in", amountPence: 4200, note: "Refund Shoes", date: "2026-08-27" });
    const r = byId(reconcile([out, inn]));
    expect(r.get(out.id)!.classification).toBe("expense");
    expect(r.get(out.id)!.needsReview).toBe(true);
  });

  it("current account → credit card payment is a transfer", () => {
    const out = tx({ direction: "out", amountPence: 25000, note: "AMEX card payment" });
    const inn = tx({ accountId: "amex", accountName: "Amex", accountType: "credit_card", direction: "in", amountPence: 25000, note: "Payment received" });
    expect(byId(reconcile([out, inn])).get(inn.id)!.classification).toBe("transfer");
  });

  it("locked user choices are left alone", () => {
    const t = tx({ direction: "in", amountPence: 100000, note: "Transfer from Pot", locked: true });
    expect(reconcile([t])).toHaveLength(0);
  });

  it("statement balance lines are excluded", () => {
    const t = tx({ direction: "out", amountPence: 42117, note: "BROUGHT FORWARD" });
    expect(reconcile([t])[0]!.classification).toBe("excluded");
  });

  it("transfers add nothing to income or spending totals", () => {
    const list = [
      tx({ direction: "out", amountPence: 60000, note: "Transfer" }),
      tx({ accountId: "rev", accountName: "Revolut", direction: "in", amountPence: 60000, note: "Top-up" }),
      tx({ direction: "in", amountPence: 200000, note: "Payroll ACME" }),
      tx({ direction: "out", amountPence: 3000, note: "Tesco" }),
    ];
    const s = summarise(list, reconcile(list));
    expect(s.incomePence).toBe(200000);
    expect(s.expensePence).toBe(3000);
    expect(s.transferPence).toBe(60000);
  });
});
