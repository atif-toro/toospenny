import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser, gbp } from "../supabase";

export default defineTool({
  name: "list_accounts",
  title: "List accounts",
  description: "List the signed-in user's accounts with type and current balance in GBP.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from("accounts")
      .select("id,name,type,balance_pence,archived")
      .order("name");
    if (error) throw new ToolError(error.message);
    const accounts = (data ?? []).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      type: a.type as string,
      balance: gbp(a.balance_pence as number),
      archived: Boolean(a.archived),
    }));
    return { content: [{ type: "text", text: JSON.stringify(accounts) }], structuredContent: { accounts } };
  },
});
