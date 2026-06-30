import type { ExtractedInvoice } from "../types";
import { Errors } from "../lib/errors";

/**
 * LLM-based invoice extraction using Cloudflare Workers AI
 * (Llama 3.1 8B Instruct with JSON mode).
 *
 * The "agent" is a single function-calling-style prompt that asks the model to
 * return a strictly-typed JSON object with the payment instruction. This is the
 * agentic decision layer: the model decides WHO to pay, HOW MUCH, and in WHAT
 * currency from unstructured natural-language invoice text.
 *
 * Why JSON mode over tool-calling: Workers AI's tool-calling surface is still
 * in beta and varies by model; JSON mode is stable on Llama 3.1 8B and gives
 * us a deterministic schema to validate against.
 */

const SYSTEM_PROMPT = `You are SmartPay, an invoice-extraction agent.
Given the raw text of an invoice, extract a structured payment instruction.

Return ONLY a JSON object with exactly these fields:
{
  "payee_name": string | null,
  "payee_wallet": string (XRPL address starting with "r", 25-35 chars),
  "amount": string (decimal number as string, e.g. "1250.00"),
  "currency": "RLUSD" | "XRP",
  "due_date": string (ISO date YYYY-MM-DD) | null,
  "invoice_number": string | null,
  "line_items": [{"description": string, "quantity": number, "unit_price": string}] | [],
  "confidence": number (0.0 to 1.0 — your confidence in the extraction)
}

Rules:
- If any field is unknown, use null (or [] for line_items). Do NOT invent values.
- The payee_wallet MUST be an XRPL address. If the invoice contains a wallet
  labeled "XRPL", "wallet", "address", or "r..." that is the payee_wallet.
- The amount is the TOTAL amount due, not a line-item price.
- Confidence below 0.7 means the extraction is uncertain — set it honestly.
- Output ONLY the JSON object. No prose, no markdown fences.`;

interface WorkersAIResponse {
  response?: string;
  tool_calls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}

export async function extractInvoice(
  ai: Ai,
  model: string,
  rawText: string,
): Promise<ExtractedInvoice> {
  const trimmed = rawText.trim().slice(0, 12_000); // cap input tokens

  let result: WorkersAIResponse;
  try {
    result = await ai.run<WorkersAIResponse>(model, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: trimmed },
      ],
      response_format: { type: "json_schema" },
      temperature: 0,
      max_tokens: 1024,
    });
  } catch (e) {
    throw Errors.extractionFailed(
      `Workers AI request failed: ${(e as Error).message ?? String(e)}`,
    );
  }

  const text = result?.response ?? "";
  if (!text) {
    // Dump the raw result so the operator can debug AI Gateway / auth issues
    throw Errors.extractionFailed(
      `Workers AI returned no response text. Raw result: ${JSON.stringify(result).slice(0, 400)}`,
    );
  }

  let parsed: Partial<ExtractedInvoice>;
  try {
    // Strip markdown code fences if present (some models wrap JSON in ```json)
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw Errors.extractionFailed(`Workers AI returned non-JSON output: ${text.slice(0, 200)}`);
  }

  // Required fields — hard fail if missing
  if (!parsed.payee_wallet || !parsed.amount || !parsed.currency) {
    throw Errors.extractionFailed(
      "Extraction missing required field (payee_wallet, amount, or currency)",
    );
  }

  // Basic XRPL address shape check (r + 24-34 base58 chars)
  if (!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(parsed.payee_wallet)) {
    throw Errors.extractionFailed(`Extracted wallet "${parsed.payee_wallet}" is not a valid XRPL address shape`);
  }

  if (parsed.currency !== "RLUSD" && parsed.currency !== "XRP") {
    throw Errors.extractionFailed(`Unsupported currency "${parsed.currency}" — only RLUSD and XRP supported`);
  }

  return {
    payee_name: parsed.payee_name ?? undefined,
    payee_wallet: parsed.payee_wallet,
    amount: parsed.amount,
    currency: parsed.currency,
    due_date: parsed.due_date ?? undefined,
    invoice_number: parsed.invoice_number ?? undefined,
    line_items: parsed.line_items ?? [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };
}
