import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, gbp } from "../supabase";

export default defineTool({
  name: "month_summary",
  title: "Monthly money summary",
  description: "Genuine income, spending and net for a month; transfers between own accounts are excluded.",
  inputSchema: { month: z.string().regex(/^\d{4}-\d{2}$/).describe("Month as YYYY-MM.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ month }, ctx) => {
    const y = Number(month.slice(0, 4));
    const m = Number(month.slice(5, 7));
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const { data, error } = await supabaseForUser(ctx)
      .from("transactions")
      .select("amount_pence,type,classification")
      .gte("date", `${month}-01`)
      .lte("date", end);
    if (error) throw new ToolError(error.message);
    let income = 0, spending = 0, transfers = 0;
    for (const t of data ?? []) {
      const c = (t.classification as string | null) ?? (t.type as string);
      const a = t.amount_pence as number;
      if (c === "income") income += a;
      else if (c === "expense") spending += a;
      else if (c === "transfer" || c === "internal") transfers++;
    }
    const summary = { month, income: gbp(income), spending: gbp(spending), net: gbp(income - spending), transfersExcluded: transfers };
    return { content: [{ type: "text", text: JSON.stringify(summary) }], structuredContent: summary };
  },
});
