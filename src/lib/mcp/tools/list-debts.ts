import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser, gbp } from "../supabase";

export default defineTool({
  name: "list_debts",
  title: "List debts",
  description: "List the user's debts with balance, APR and minimum monthly payment.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from("debts")
      .select("id,name,type,balance_pence,apr,min_payment_pence")
      .order("name");
    if (error) throw new ToolError(error.message);
    const debts = (data ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      type: d.type as string,
      balance: gbp(d.balance_pence as number),
      apr: Number(d.apr),
      minPayment: gbp(d.min_payment_pence as number),
    }));
    return { content: [{ type: "text", text: JSON.stringify(debts) }], structuredContent: { debts } };
  },
});
