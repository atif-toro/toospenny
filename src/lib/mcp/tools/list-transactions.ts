import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, gbp } from "../supabase";

export default defineTool({
  name: "list_transactions",
  title: "List transactions",
  description: "List the user's transactions between two dates, newest first, with their classification.",
  inputSchema: {
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date YYYY-MM-DD."),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date YYYY-MM-DD."),
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, limit }, ctx) => {
    let q = supabaseForUser(ctx)
      .from("transactions")
      .select("id,date,amount_pence,type,classification,note")
      .order("date", { ascending: false })
      .limit(limit);
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    const { data, error } = await q;
    if (error) throw new ToolError(error.message);
    const transactions = (data ?? []).map((t) => ({
      id: t.id as string,
      date: t.date as string,
      amount: gbp(t.amount_pence as number),
      direction: t.type as string,
      classification: (t.classification as string | null) ?? (t.type as string),
      note: (t.note as string | null) ?? "",
    }));
    return { content: [{ type: "text", text: JSON.stringify(transactions) }], structuredContent: { transactions } };
  },
});
