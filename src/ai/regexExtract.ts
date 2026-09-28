import type { ExtractedInvoice } from "../types";

export function fallbackRegexExtract(text: string): ExtractedInvoice | null {
  const addrMatch = text.match(/\b(r[1-9A-HJ-NP-Za-km-z]{24,34})\b/);
  
  if (!addrMatch) {
    return null; // Hard requirement: must find a wallet address
  }

  const amountPatterns = [
    // explicit currency
    /(?:pay|send|transfer)\s+([\d,]+\.?\d*)\s*(XRP|RLUSD|USD|USDT|USDC|EUR)/i,
    /(?:amount|total)[\s:]*([\d,]+\.?\d*)\s*(XRP|RLUSD|USD|USDT|USDC|EUR)/i,
    /([\d,]+\.?\d*)\s*(XRP|RLUSD|USD|USDT|USDC|EUR)/i,
    // explicit dollar sign -> USD
    /\$\s?([\d,]+\.?\d*)/i,
    // bare numbers
    /(?:total\s*(?:due|amount)?[:\s]*)\$?\s?([\d,]+\.?\d*)/i,
    /(?:amount\s*(?:due|owing)?[:\s]*)\$?\s?([\d,]+\.?\d*)/i,
    /(?:pay|send|transfer)\s+([\d,]+\.?\d*)/i,
  ];

  let amount = "0";
  let currency = "UNKNOWN";
  
  for (const p of amountPatterns) {
    const m = text.match(p);
    if (m) {
      amount = m[1].replace(/,/g, "");
      if (m[2]) {
        currency = m[2].toUpperCase();
      } else if (m[0].includes("$")) {
        currency = "USD";
      }
      break;
    }
  }

  let extraction_warnings: string[] = [];
  let confidence = 0.5;
  if (currency === "UNKNOWN") {
    currency = "XRP";
    confidence = 0.3; // penalty
    extraction_warnings.push("currency not stated — assumed XRP");
  }

  // If no amount was found, we still return what we have (needs_review state)
  // because we found an address at least. But it's lower confidence.

  const nameMatch = text.match(/(?:from|vendor|payee|company)[:\s]*([A-Za-z\s.]+?)(?:\n|$)/i);
  const invMatch = text.match(/(?:invoice|inv)[\s#:.-]*(\S+)/i);
  const dueMatch = text.match(/(?:due[:\s]*)(\d{4}-\d{2}-\d{2})/i);

  return {
    extraction_warnings,
    payee_name: nameMatch?.[1]?.trim(),
    payee_wallet: addrMatch[1],
    amount,
    currency,
    due_date: dueMatch?.[1],
    invoice_number: invMatch?.[1],
    line_items: [],
    confidence,
  };
}
