import { describe, it, expect } from "vitest";
import { fallbackRegexExtract } from "../src/ai/regexExtract";

describe("Regex Extractor", () => {
  it("assumes XRP with penalty and warning for bare numbers", () => {
    const text = "Payee: rD8sEimQjrmzqXryQYsbqzLGw3Y9X3yF1Y\nAmount: 50.00";
    const extracted = fallbackRegexExtract(text);
    expect(extracted!.amount).toBe("50.00");
    expect(extracted!.currency).toBe("XRP");
    expect(extracted!.confidence).toBeLessThan(0.4);
    expect(extracted!.extraction_warnings).toContain("currency not stated — assumed XRP");
  });
  it("extracts clean text invoice", () => {
    const text = `Invoice INV-2026-0417
From: Acme Suppliers Ltd
Bill to: SmartPay Demo Co.

Date: 2026-06-28
Due: 2026-07-15

Description                          Qty   Unit      Total
API infrastructure (enterprise)        1   $1,000.00 $1,000.00
Priority support add-on                1   $250.00    $250.00

Total due: $1,250.00 USD
Payment address: rD8sEimQjrmzqXryQYsbqzLGw3Y9X3yF1Y
Settle in RLUSD on XRPL.`;

    const extracted = fallbackRegexExtract(text);
    expect(extracted).not.toBeNull();
    expect(extracted!.payee_wallet).toBe("rD8sEimQjrmzqXryQYsbqzLGw3Y9X3yF1Y");
    expect(extracted!.amount).toBe("1250.00");
    expect(extracted!.currency).toBe("USD");
    expect(extracted!.due_date).toBe("2026-07-15");
    expect(extracted!.invoice_number).toBe("INV-2026-0417");
  });

  it("extracts short payment instruction with XRP", () => {
    const text = `Pay 85 XRP to rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De for Globex Hosting monthly invoice #GH-7723. Due 2026-07-10.`;
    const extracted = fallbackRegexExtract(text);
    expect(extracted).not.toBeNull();
    expect(extracted!.payee_wallet).toBe("rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De");
    expect(extracted!.amount).toBe("85");
    expect(extracted!.currency).toBe("XRP");
    expect(extracted!.due_date).toBe("2026-07-10");
  });

  it("returns null when no address is found", () => {
    const text = `Pay $100 for invoice #1234. No address provided.`;
    const extracted = fallbackRegexExtract(text);
    expect(extracted).toBeNull();
  });
});
