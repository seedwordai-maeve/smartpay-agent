/**
 * Route-level tests for the SmartPay Agent API.
 *
 * These exercise the full Hono request pipeline (parsing, routing, error
 * envelopes, D1/KV/R2/AI bindings) with in-memory fakes — no real XRPL or
 * Workers AI calls. They verify the acceptance-criteria flow:
 *
 *   POST /v1/invoices  → invoice created, extraction runs
 *   GET  /v1/invoices/:id → returns extracted fields
 *   POST /v1/invoices/:id/approve → agent submits payment → tx_hash returned
 *
 * The xrpl.js Client is mocked at module level so submitPayment resolves with
 * a fake tx hash; this is the contract the Worker exposes to the frontend.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock xrpl.js before importing the app ─────────────────────────────────
// Track which invoice is "in flight" so verify() can resolve for it.
let inflightInvoiceId: string | null = null;

const fakeClient = {
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  request: vi.fn(async (req: { command: string }) => {
    switch (req.command) {
      case "account_info":
        return { result: { account_data: { Balance: "85000000" } } };
      case "account_lines":
        return { result: { lines: [{ currency: "RLUSD", account: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", balance: "12500.00" }] } };
      case "tx":
        // Resolve validated on first poll when we have an inflight id.
        if (inflightInvoiceId) {
          return { result: { validated: true, ledger_index: 12345678, meta: { TransactionResult: "tesSUCCESS" } } };
        }
        return { result: { validated: false } };
      default:
        return { result: {} };
    }
  }),
  autofill: vi.fn(async (tx: unknown) => ({ ...(tx as object), Fee: "12", Sequence: 42, LastLedgerSequence: 12345700 })),
  submit: vi.fn(async () => ({ result: { engine_result: "tesSUCCESS" } })),
};
vi.mock("xrpl", () => ({
  Client: vi.fn(() => fakeClient),
  Wallet: {
    fromSeed: vi.fn(() => ({ address: "rAGENT...", seed: "s...", sign: (tx: unknown) => ({ tx_blob: "DEADBEEF", hash: "E6D2FAKE_HASH_0123456789ABCDEF" }) })),
  },
  xrpToDrops: (x: string) => String(Math.round(Number(x) * 1_000_000)),
}));

const { default: app } = await import("../src/worker");
const { db } = await import("../src/lib/db");

// ── In-memory D1 fake ──────────────────────────────────────────────────────
function makeFakeD1() {
  const invoices = new Map<string, Record<string, unknown>>();
  const audit: Record<string, unknown>[] = [];
  let auditId = 0;
  return {
    invoices,
    instance: {
      prepare(sql: string) {
        let bindings: unknown[] = [];
        return {
          bind(...b: unknown[]) { bindings = b; return this; },
          async first<T>() {
            if (/FROM invoices WHERE id/.test(sql)) return (invoices.get(bindings[0] as string) ?? null) as T | null;
            return null;
          },
          async all<T>() {
            let rows = [...invoices.values()] as T[];
            if (/WHERE created_at </.test(sql)) rows = rows.filter((r) => String((r as Record<string, unknown>).created_at) < String(bindings[0]));
            return { results: (rows as T[]).slice(0, Number(bindings.at(-1))) } as { results: T[] };
          },
          async run() {
            if (/^INSERT INTO invoices/.test(sql)) {
              // SQL: INSERT INTO invoices (id, status, submitter, raw_r2_key, raw_text, created_at, updated_at)
              //     VALUES (?1, 'pending_extract', ?2, ?3, ?4, ?5, ?6)
              // status is a literal; bindings = [id, submitter, raw_r2_key, raw_text, now1, now2]
              const [id, submitter, raw_r2_key, raw_text, now1, now2] = bindings as [string, string, string?, string?, string, string];
              invoices.set(id, { id, status: "pending_extract", submitter, raw_r2_key, raw_text, created_at: now1, updated_at: now2 });
            } else if (/^UPDATE invoices/.test(sql)) {
              const id = bindings[0] as string;
              const status = bindings[1] as string;
              const updated_at = bindings[2] as string;
              const extra = bindings.slice(3) as unknown[];
              const row = invoices.get(id) ?? {};
              // extra values correspond to cols in SET clause; this is a fake
              const updated = { ...row, status, updated_at };
              // best-effort apply of column updates (the SQL has extra cols)
              const setCols = (sql.match(/(\w+) = \?\d+/g) ?? []).slice(2);
              setCols.forEach((c, i) => {
                const col = c.split(" =")[0];
                (updated as Record<string, unknown>)[col] = extra[i];
              });
              invoices.set(id, updated);
            } else if (/^INSERT INTO audit_log/.test(sql)) {
              audit.push({ id: ++auditId, invoice_id: bindings[0], event: bindings[1], payload_json: bindings[2], actor: bindings[3], created_at: bindings[4] });
            }
            return { success: true, meta: { changes: 1 } };
          },
        };
      },
    },
  };
}

// ── Shared fake env ─────────────────────────────────────────────────────────
let fakeD1: ReturnType<typeof makeFakeD1>;

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: fakeD1.instance,
    KV: {
      get: async () => null,
      put: async () => {},
    },
    R2: { put: async () => ({}), get: async () => null },
    AI: {
      run: async () => ({
        response: JSON.stringify({
          payee_name: "Acme Suppliers Ltd",
          payee_wallet: "rjBKmWHnWCfpdoztKoh9xFqZbvzP2eZXWz",
          amount: "1250.00",
          currency: "RLUSD",
          due_date: "2026-07-15",
          invoice_number: "INV-2026-0417",
          line_items: [],
          confidence: 0.94,
        }),
      }),
    },
    AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    XRPL_NETWORK: "testnet",
    XRPL_WSS: "wss://s.altnet.rippletest.net:51233",
    XRPL_FAUCET: "https://faucet.altnet.rippletest.net",
    RLUSD_ISSUER: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
    RATE_LIMIT_PER_MIN: "5",
    SETTLE_POLL_INTERVAL_MS: "100",
    SETTLE_POLL_TIMEOUT_MS: "500",
    AGENT_WALLET_SEED: "sTESTSEEDFAKEFAKEFAKEFAKEFAKEFAKEFAKE",
    ...overrides,
  } as unknown as Env;
}

beforeEach(() => {
  fakeD1 = makeFakeD1();
  inflightInvoiceId = null;
});

// ── Tests ───────────────────────────────────────────────────────────────────
describe("SmartPay Agent API", () => {
  it("rejects invoice POST without submitter (RFC 7807 error)", async () => {
    const res = await app.request(
      "/v1/invoices",
      { method: "POST", body: JSON.stringify({ text: "invoice text" }), headers: { "content-type": "application/json" } },
      makeEnv(),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.type).toContain("missing_submitter");
    expect(body.title).toBe("Missing submitter");
  });

  it("creates an invoice from text and runs extraction (agent flow)", async () => {
    const env = makeEnv();
    const res = await app.request(
      "/v1/invoices",
      {
        method: "POST",
        body: JSON.stringify({ submitter: "alice@example.com", text: "Invoice INV-2026-0417 from Acme, pay rD8s... 1250 RLUSD, due 2026-07-15" }),
        headers: { "content-type": "application/json" },
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^inv_/);
    expect(body.poll_url).toContain(`/v1/invoices/${body.id}/events`);

    // Extraction should have run synchronously and stored pending_approval
    const row = await db.getInvoice(env.DB, body.id);
    expect(row?.status).toBe("pending_approval");
    const extracted = JSON.parse(row?.extracted_json ?? "{}");
    expect(extracted.payee_wallet).toMatch(/^r[1-9A-HJ-NP-Za-km-z]{24,}$/);
    expect(extracted.amount).toBe("1250.00");
    expect(extracted.currency).toBe("RLUSD");
  });

  it("returns 404 problem+json for unknown invoice", async () => {
    const res = await app.request("/v1/invoices/inv_DOESNOTEXIST", {}, makeEnv());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.type).toContain("invoice_not_found");
    expect(body.status).toBe(404);
  });

  it("errors on approve when AGENT_WALLET_SEED is missing (500 problem+json)", async () => {
    const env = makeEnv({ AGENT_WALLET_SEED: undefined });
    // Seed an invoice in pending_approval directly
    await db.createInvoice(env.DB, { id: "inv_SEED1", submitter: "alice@example.com", raw_r2_key: null, raw_text: "..." });
    const extracted = { payee_wallet: "rjBKmWHnWCfpdoztKoh9xFqZbvzP2eZXWz", amount: "10.00", currency: "RLUSD" as const, confidence: 0.9, line_items: [] };
    await db.setStatus(env.DB, "inv_SEED1", "pending_approval", { extracted_json: JSON.stringify(extracted) });

    const res = await app.request(
      "/v1/invoices/inv_SEED1/approve",
      { method: "POST", body: JSON.stringify({ approver: "alice@example.com" }), headers: { "content-type": "application/json" } },
      env,
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.type).toContain("wallet_seed_missing");
  });

  it("full agent settlement flow: approve → submit → settled with tx_hash", async () => {
    const env = makeEnv();
    // Seed an invoice with extracted fields already populated
    await db.createInvoice(env.DB, { id: "inv_SEED2", submitter: "alice@example.com", raw_r2_key: null, raw_text: "invoice text" });
    const extracted = {
      payee_name: "Acme",
      payee_wallet: "rjBKmWHnWCfpdoztKoh9xFqZbvzP2eZXWz",
      amount: "1250.00",
      currency: "RLUSD" as const,
      due_date: "2026-07-15",
      confidence: 0.94,
      line_items: [],
    };
    await db.setStatus(env.DB, "inv_SEED2", "pending_approval", { extracted_json: JSON.stringify(extracted) });
    // Tell the fake xrpl client to resolve tx verification for this invoice
    inflightInvoiceId = "inv_SEED2";

    const res = await app.request(
      "/v1/invoices/inv_SEED2/approve",
      { method: "POST", body: JSON.stringify({ approver: "alice@example.com" }), headers: { "content-type": "application/json" } },
      env,
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("settled");
    expect(body.tx_hash).toBe("E6D2FAKE_HASH_0123456789ABCDEF");
    expect(body.explorer_url).toContain("testnet.xrpl.org/transactions/");
  });

  it("GET /health returns ok", async () => {
    const res = await app.request("/health", {}, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.network).toBe("testnet");
  });
});
