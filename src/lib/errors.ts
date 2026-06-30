import type { ProblemDetails } from "../types";

/**
 * HttpError carries an RFC 7807 ProblemDetails body so routes can `throw`
 * and let Hono's onError produce a consistent error envelope (DESIGN §5.8).
 */
export class HttpError extends Error {
  readonly problem: ProblemDetails;
  readonly status: number;

  constructor(problem: ProblemDetails) {
    super(problem.title);
    this.name = "HttpError";
    this.problem = problem;
    this.status = problem.status;
  }
}

export const bad = (
  type: string,
  title: string,
  status: number,
  detail: string,
  extra: Partial<ProblemDetails> = {},
): HttpError => new HttpError({ type, title, status, detail, ...extra });

/** Common error factories used across handlers. */
export const Errors = {
  notFound: (id: string) =>
    bad(
      "https://smartpay/errors/invoice_not_found",
      "Invoice not found",
      404,
      `No invoice with id ${id}`,
      { instance: `/v1/invoices/${id}` },
    ),
  invalidState: (id: string, current: string, required: string[]) =>
    bad(
      "https://smartpay/errors/invalid_state",
      "Invoice is not in an actionable state",
      409,
      `Invoice ${id} is '${current}' — must be one of ${required.join(", ")}`,
      { instance: `/v1/invoices/${id}` },
    ),
  noSeed: () =>
    bad(
      "https://smartpay/errors/wallet_seed_missing",
      "Agent wallet not configured",
      500,
      "AGENT_WALLET_SEED secret is not set. Run `wrangler secret put AGENT_WALLET_SEED`.",
    ),
  walletNotFound: (addr: string) =>
    bad(
      "https://smartpay/errors/xrpl_wallet_not_found",
      "Extracted wallet does not exist on-ledger",
      404,
      `Wallet ${addr} does not exist on ${"testnet"}`,
    ),
  trustlineMissing: (addr: string, issuer: string) =>
    bad(
      "https://smartpay/errors/trustline_missing",
      "Payee wallet cannot receive RLUSD",
      422,
      `Wallet ${addr} has no trustline to RLUSD issuer ${issuer}`,
    ),
  extractionFailed: (detail: string) =>
    bad(
      "https://smartpay/errors/extraction_failed",
      "Could not parse invoice",
      422,
      detail,
    ),
  rateLimited: () =>
    bad(
      "https://smartpay/errors/rate_limited",
      "Too many requests",
      429,
      "Rate limit exceeded. Try again in a minute.",
    ),
  missingField: (field: string, detail: string) =>
    bad(
      `https://smartpay/errors/missing_${field}`,
      `Missing ${field}`,
      400,
      detail,
    ),
  xrplEngine: (code: string, detail: string) =>
    bad(
      `https://smartpay/errors/${code.toLowerCase()}`,
      `XRPL transaction ${code}`,
      409,
      detail,
      { xrpl_code: code },
    ),
};
