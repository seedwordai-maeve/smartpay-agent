/**
 * Shared domain types for SmartPay Agent.
 * These mirror the shapes in DESIGN.md §5 (API contract).
 */

export type InvoiceStatus =
  | "pending_extract"
  | "pending_approval"
  | "needs_review"
  | "approved"
  | "signing"
  | "settled"
  | "rejected"
  | "failed";

/** Structured extraction result from Workers AI. */
export interface ExtractedInvoice {
  payee_name?: string;
  payee_wallet: string;        // r-...
  amount: string;              // decimal string, e.g. "1250.00"
  currency: "RLUSD" | "XRP";
  due_date?: string;           // ISO date
  invoice_number?: string;
  line_items?: Array<{ description: string; quantity: number; unit_price: string }>;
  confidence: number;          // 0..1
}

/** XRPL pre-flight validation against the extracted payee wallet. */
export interface InvoiceValidation {
  wallet_exists: boolean;
  trustline_present: boolean;
  warnings: string[];
}

/** Transaction preflight (autofill + preview) returned on approve(). */
export interface TxFinality {
  tx_hash: string;
  sequence: number;
  ledger_index: number;
  fee: string;
}

export interface TxFailure {
  xrpl_code: string;   // tecPATH_DRY, tecNO_DST_INSUFF_XRP, tefPAST_SEQ, ...
  detail: string;
}

/** RFC 7807 problem-details envelope. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  xrpl_code?: string;
}
