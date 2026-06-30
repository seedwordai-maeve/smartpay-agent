import { Hono } from "hono";
import { db } from "../lib/db";
import { ulid } from "../lib/util";
import { Errors, HttpError } from "../lib/errors";
import { extractInvoice } from "../ai/extract";
import { withClient } from "../xrpl/client";
import { validatePayee, submitPayment } from "../xrpl/payment";
import { getAgentWallet } from "../xrpl/wallet";
import type { ExtractedInvoice, InvoiceValidation } from "../types";

export const invoices = new Hono<{ Bindings: Env }>();

/**
 * POST /v1/invoices — submit an invoice
 * Accepts multipart/form-data (file= + submitter=) or JSON ({text, submitter}).
 */
invoices.post("/", async (c) => {
  const env = c.env;
  const contentType = c.req.header("content-type") ?? "";

  let submitter: string | null = null;
  let text: string | null = null;
  let r2Key: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    submitter = (form.get("submitter") as string | null)?.trim() || null;
    text = (form.get("text") as string | null)?.trim() || null;
    const file = form.get("file") as File | null;
    if (file && env.R2) {
      r2Key = `invoices/${ulid("")}${file.name ? `-${file.name}` : ""}`;
      await env.R2.put(r2Key, await file.arrayBuffer(), {
        httpMetadata: { "content-type": file.type || "application/octet-stream" },
      });
      // For text-based files (txt, pdf→text later), stash content for extraction
      if (file.type.startsWith("text/")) {
        text = await file.text();
      }
    }
  } else {
    const body = await c.req.json().catch(() => ({}));
    submitter = (body.submitter as string)?.trim() || null;
    text = (body.text as string)?.trim() || null;
  }

  if (!submitter) throw Errors.missingField("submitter", "submitter field is required");
  if (!text && !r2Key) throw Errors.missingField("input", "Provide either a file= or text= field");

  // Rate limit (5/min per IP) using KV counter
  await enforceRateLimit(env, c.req.header("cf-connecting-ip") ?? "anon");

  const id = ulid("inv_");
  const invoice = await db.createInvoice(env.DB, {
    id,
    submitter,
    raw_r2_key: r2Key,
    raw_text: text,
  });

  // Eagerly run extraction if we already have text. PDF/image OCR fallback
  // would be a phase-2 Queue job; for the POC we extract synchronously.
  if (text) {
    try {
      const extracted = await extractInvoice(env.AI, env.AI_MODEL, text);
      await db.setStatus(env.DB, id, "pending_approval", {
        extracted_json: JSON.stringify(extracted),
      });

      // Validate payee wallet on-ledger
      let validation: InvoiceValidation = { wallet_exists: false, trustline_present: false, warnings: [] };
      try {
        validation = await withClient(env, (client) =>
          validatePayee(client, extracted.payee_wallet, env.RLUSD_ISSUER),
        );
      } catch (e) {
        validation.warnings.push(`XRPL validation lookup failed: ${(e as Error).message}`);
      }
      await db.setStatus(env.DB, id, "pending_approval", {
        validation_json: JSON.stringify(validation),
      });

      if (!validation.wallet_exists || !validation.trustline_present) {
        await db.setStatus(env.DB, id, "needs_review");
      }
      await db.appendAudit(env.DB, { invoice_id: id, event: "extracted", payload: { extracted, validation } });
    } catch (e) {
      const detail = e instanceof HttpError ? (e.problem.detail ?? e.message) : (e instanceof Error ? e.message : String(e));
      await db.setStatus(env.DB, id, "failed", { xrpl_code: "extraction_failed" });
      await db.appendAudit(env.DB, { invoice_id: id, event: "extraction_failed", payload: { detail } });
      // Non-fatal to the POST — invoice is created, client can poll status
    }
  }

  const updated = await db.getInvoice(env.DB, id);
  return c.json(
    {
      id: invoice.id,
      status: updated?.status ?? invoice.status,
      submitted_at: invoice.created_at,
      raw_url: r2Key ? `https://r2/smartpay-uploads/${r2Key}` : null,
      poll_url: `https://${c.req.header("host")}/v1/invoices/${id}/events`,
    },
    201,
  );
});

/** GET /v1/invoices/:id — fetch invoice + extracted fields */
invoices.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await db.getInvoice(c.env.DB, id);
  if (!row) throw Errors.notFound(id);

  const extracted = row.extracted_json ? (JSON.parse(row.extracted_json) as ExtractedInvoice) : null;
  const validation = row.validation_json ? (JSON.parse(row.validation_json) as InvoiceValidation) : null;

  return c.json({
    id: row.id,
    status: row.status,
    submitted_at: row.created_at,
    submitter: row.submitter,
    extracted,
    validation,
    tx_hash: row.tx_hash ?? null,
    ledger_index: row.ledger_index ?? null,
    sequence: row.tx_sequence ?? null,
    xrpl_code: row.xrpl_code ?? null,
    approver: row.approver ?? null,
    reject_reason: row.reject_reason ?? null,
  });
});

/** GET /v1/invoices/:id/events — SSE status stream */
invoices.get("/:id/events", async (c) => {
  const id = c.req.param("id");
  const exists = await db.getInvoice(c.env.DB, id);
  if (!exists) throw Errors.notFound(id);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let lastStatus = "";
      const pollIntervalMs = Number(c.env.SETTLE_POLL_INTERVAL_MS) || 2000;
      const timeoutMs = Number(c.env.SETTLE_POLL_TIMEOUT_MS) || 30000;
      const deadline = Date.now() + timeoutMs + 60_000; // grace period

      while (Date.now() < deadline) {
        const row = await db.getInvoice(c.env.DB, id);
        if (!row) {
          send("error", { error: "invoice deleted" });
          break;
        }
        if (row.status !== lastStatus) {
          lastStatus = row.status;
          send("status", {
            status: row.status,
            at: row.updated_at,
            tx_hash: row.tx_hash,
            ledger_index: row.ledger_index,
            sequence: row.tx_sequence,
            xrpl_code: row.xrpl_code,
          });
        }
        // Terminal states
        if (["settled", "rejected", "failed"].includes(row.status)) break;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
});

/** POST /v1/invoices/:id/approve — human approval gate → settlement */
invoices.post("/:id/approve", async (c) => {
  const env = c.env;
  const id = c.req.param("id");
  const row = await db.getInvoice(env.DB, id);
  if (!row) throw Errors.notFound(id);

  if (!["pending_approval", "needs_review"].includes(row.status)) {
    throw Errors.invalidState(id, row.status, ["pending_approval", "needs_review"]);
  }

  const extracted = row.extracted_json ? (JSON.parse(row.extracted_json) as ExtractedInvoice) : null;
  if (!extracted) throw Errors.invalidState(id, row.status, []);

  const body = await c.req.json().catch(() => ({}));
  const approver = (body.approver as string)?.trim();
  if (!approver) throw Errors.missingField("approver", "approver field is required");

  // Apply human edits if provided
  const amount = (body.edited_amount as string)?.trim() || extracted.amount;
  const destination = (body.edited_wallet as string)?.trim() || extracted.payee_wallet;

  await db.setStatus(env.DB, id, "approved", { approver });
  await db.appendAudit(env.DB, { invoice_id: id, event: "approved", payload: { approver, amount, destination }, actor: approver });

  // Transition to signing — submit the payment
  await db.setStatus(env.DB, id, "signing");

  const wallet = getAgentWallet(env);
  let finality;
  try {
    finality = await withClient(env, (client) =>
      submitPayment(client, wallet, {
        destination,
        amount,
        currency: extracted.currency,
        rlusdIssuer: env.RLUSD_ISSUER,
        invoiceId: id,
        approver,
      }),
    );
  } catch (e) {
    const err = e as HttpError;
    const xrplCode = err.problem.xrpl_code ?? "submit_failed";
    await db.setStatus(env.DB, id, "failed", {
      xrpl_code: xrplCode,
    });
    await db.appendAudit(env.DB, {
      invoice_id: id,
      event: "submit_failed",
      payload: { detail: err.message, xrpl_code: xrplCode },
      actor: approver,
    });
    throw e;
  }

  await db.setStatus(env.DB, id, "settled", {
    tx_hash: finality.tx_hash,
    tx_sequence: finality.sequence,
    ledger_index: finality.ledger_index,
  });
  await db.appendAudit(env.DB, {
    invoice_id: id,
    event: "settled",
    payload: finality,
    actor: approver,
  });

  return c.json(
    {
      id,
      status: "settled",
      tx_hash: finality.tx_hash,
      sequence: finality.sequence,
      ledger_index: finality.ledger_index,
      explorer_url: `https://${env.XRPL_NETWORK}.xrpl.org/transactions/${finality.tx_hash}`,
    },
    202,
  );
});

/** POST /v1/invoices/:id/reject — reject with reason */
invoices.post("/:id/reject", async (c) => {
  const env = c.env;
  const id = c.req.param("id");
  const row = await db.getInvoice(env.DB, id);
  if (!row) throw Errors.notFound(id);
  if (!["pending_approval", "needs_review"].includes(row.status)) {
    throw Errors.invalidState(id, row.status, ["pending_approval", "needs_review"]);
  }

  const body = await c.req.json().catch(() => ({}));
  const approver = (body.approver as string)?.trim();
  const reason = (body.reason as string)?.trim() ?? "no reason given";
  if (!approver) throw Errors.missingField("approver", "approver field is required");

  await db.setStatus(env.DB, id, "rejected", {
    approver,
    reject_reason: reason,
  });
  await db.appendAudit(env.DB, {
    invoice_id: id,
    event: "rejected",
    payload: { reason },
    actor: approver,
  });

  return c.json({ id, status: "rejected", reason });
});

/** GET /v1/audit — mounted in worker.ts at /v1/audit. See auditList above. */
/** Shared audit list handler (mounted in worker.ts at /v1/audit). */
export async function auditList(c: { env: Env; req: { query: (k: string) => string | undefined } }) {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const cursor = c.req.query("cursor") ?? undefined;
  const { items, next_cursor } = await db.listInvoices(c.env.DB, limit, cursor);
  return Response.json({
    items: items.map((r) => ({
      id: r.id,
      status: r.status,
      submitter: r.submitter,
      approver: r.approver,
      tx_hash: r.tx_hash,
      ledger_index: r.ledger_index,
      xrpl_code: r.xrpl_code,
      created_at: r.created_at,
      updated_at: r.updated_at,
      explorer_url: r.tx_hash ? `https://${c.env.XRPL_NETWORK}.xrpl.org/transactions/${r.tx_hash}` : null,
    })),
    next_cursor,
  });
}

// ── Rate limiter (KV counter, sliding 60s window) ──────────────────────────
async function enforceRateLimit(env: Env, ip: string): Promise<void> {
  const limit = Number(env.RATE_LIMIT_PER_MIN) || 5;
  const key = `rl:${ip}:${Math.floor(Date.now() / 60_000)}`;
  const current = Number((await env.KV.get(key)) ?? 0);
  if (current >= limit) throw Errors.rateLimited();
  await env.KV.put(key, String(current + 1), { expirationTtl: 120 });
}
