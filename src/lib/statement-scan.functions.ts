import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const inputSchema = z.object({
  fileName: z.string().min(1).max(200),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
  base64: z.string().min(10).max(14_000_000),
});

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["bank", "transactions"],
  properties: {
    bank: { type: ["string", "null"] },
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "description", "amount", "direction"],
        properties: {
          date: { type: "string", description: "ISO date YYYY-MM-DD" },
          description: { type: "string" },
          amount: { type: "number", description: "Positive amount in pounds" },
          direction: { type: "string", enum: ["in", "out"] },
        },
      },
    },
  },
} as const;

export type ScannedRow = {
  date: string;
  description: string;
  amountPence: number;
  type: "income" | "expense";
};

export const scanStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<{ bank: string | null; rows: ScannedRow[] }> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Statement scanning is not configured");

    const filePart =
      data.mimeType === "application/pdf"
        ? { type: "input_file", filename: data.fileName, file_data: `data:application/pdf;base64,${data.base64}` }
        : { type: "input_image", image_url: `data:${data.mimeType};base64,${data.base64}` };

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: "statement", strict: true, schema: outputSchema } },
        input: [
          {
            role: "system",
            content:
              "You extract transactions from UK bank or credit card statements. Return every transaction line (skip opening/closing balances, totals and headers). Dates as YYYY-MM-DD (infer the year from the statement). Amount is positive in pounds. direction 'in' = money received/credit/refund, 'out' = payment/debit/purchase. Keep the merchant description short and clean. If the image is not a statement, return an empty list.",
          },
          { role: "user", content: [{ type: "input_text", text: "Extract the transactions." }, filePart] },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      if (res.status === 402) throw new Error("AI credits have run out. Please top up to scan statements.");
      if (res.status === 429) throw new Error("Too many scans right now — please try again in a minute.");
      console.error("scanStatement gateway error", res.status, body.slice(0, 500));
      throw new Error("Couldn't read that statement. Please try again.");
    }

    // Read SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let failure: string | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.refusal.delta") failure = "refused";
          else if (ev.type === "error" || ev.type === "response.failed") failure = "failed";
        } catch {
          /* ignore partial */
        }
      }
    }

    if (!text.trim()) {
      throw new Error(failure === "refused" ? "That file couldn't be scanned." : "No transactions found in that file");
    }

    let parsed: { bank: string | null; transactions: { date: string; description: string; amount: number; direction: "in" | "out" }[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Couldn't read that statement. Please try again.");
    }

    const rows: ScannedRow[] = parsed.transactions
      .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount) && Math.abs(t.amount) > 0)
      .map((t) => ({
        date: t.date,
        description: t.description.trim().slice(0, 300) || "Transaction",
        amountPence: Math.round(Math.abs(t.amount) * 100),
        type: t.direction === "in" ? "income" : "expense",
      }));

    return { bank: parsed.bank, rows };
  });
