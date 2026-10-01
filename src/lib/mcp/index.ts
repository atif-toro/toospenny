import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAccounts from "./tools/list-accounts";
import listTransactions from "./tools/list-transactions";
import monthSummary from "./tools/month-summary";
import listDebts from "./tools/list-debts";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "spenny",
  title: "Spenny",
  version: "0.1.0",
  instructions:
    "Read-only access to the user's Too Spenny finances (GBP). Use list_accounts, list_transactions, month_summary and list_debts. Transfers between the user's own accounts are not income or spending.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listAccounts, listTransactions, monthSummary, listDebts],
});
