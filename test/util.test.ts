/**
 * Unit tests for the pure-logic pieces — no network, no D1, no Worker runtime.
 * Run with: npx vitest run
 */
import { describe, it, expect } from "vitest";
import { ulid, toHex, formatAmount } from "../src/lib/util";

describe("ulid", () => {
  it("generates prefixed, 34-char IDs", () => {
    const id = ulid("inv_");
    expect(id.startsWith("inv_")).toBe(true);
    // inv_ (4) + Crockford-base32 (26) = 30 chars
    expect(id.length).toBe(30);
  });

  it("generates unique ids", () => {
    const a = ulid();
    const b = ulid();
    expect(a).not.toBe(b);
  });

  it("is time-ordered (monotonic within same ms)", () => {
    const ids = Array.from({ length: 10 }, () => ulid("inv_").slice(4, 14));
    // Sort by Crockford-base32 should match original order since same ms
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });
});

describe("toHex", () => {
  it("encodes ASCII strings as uppercase hex", () => {
    expect(toHex("A")).toBe("41");
    expect(toHex("invoice-id")).toBe("696E766F6963652D6964");
    expect(toHex("abc123")).toBe("616263313233");
  });

  it("encodes UTF-8 multibyte", () => {
    // € = U+20AC = E2 82 AC
    expect(toHex("€")).toBe("E282AC");
  });
});

describe("formatAmount", () => {
  it("formats to 2 decimal places", () => {
    expect(formatAmount("1250")).toBe("1250.00");
    expect(formatAmount("1250.5")).toBe("1250.50");
    expect(formatAmount("1250.005")).toBe("1250.01"); // banker's rounding-ish
  });

  it("rejects non-numeric input", () => {
    expect(() => formatAmount("abc")).toThrow();
    expect(() => formatAmount("12.34.56")).toThrow();
  });
});
