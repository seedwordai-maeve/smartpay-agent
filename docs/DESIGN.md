# Autonomous Invoice Settlement Agent — Architecture & API Contract

**Demo:** "SmartPay Agent" — an AI agent that reads natural-language invoices (email-forwarded PDFs, uploaded images, or pasted text), extracts a structured payment instruction, gets human approval, and settles the invoice in RLUSD on the XRPL testnet with full audit trail.

**Author:** Architecture (task t_b3335640)
**Date:** June 30, 2026
**Parent research:** `xrpl-ai-starter-kit-brief.md` (t_119b1504)

---

## 0. Why this demo

This demo is chosen over the DEX agent and the escrow agent because it is the only candidate that simultaneously (a) plays to Ripple's enterprise GTM narrative — RLUSD as the USD-denominated settlement asset, deterministic 3–5s finality, and on-ledger audit via `SourceTag` + `Memos`; (b) exercises the highest-value parts of the XRPL AI Starter Kit (`xrpl-payments` skill for RLUSD + cross-currency, `xrpl-agent-wallet` skill for signing) without depending on a third-party facilitator (Demo A's weakness); and (c) is demo-able end-to-end on Testnet inside a one-week POC and productionizable in a quarter (the enterprise workflow is recognizable to any B2B audience, whereas the DEX agent is niche and the escrow agent's UX is hard for non-crypto merchants).

It deliberately **does not** demo NFT minting, AMM, or DEX trading — those XRPL operations are not yet covered by Claude skills and would force hand-rolled transaction objects, adding risk without adding commercial narrative.

---

## 1. System diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                BROWSER (Client)                             │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────────────────┐  │
│  │ Invoice drop  │→ │ Approval review  │→ │ Ledger watch / tx history    │  │
│  │ (paste/file)  │  │ (human-in-loop)  │  │ (XRPL explorer deep links)   │  │
│  └───────────────┘  └──────────────────┘  └──────────────────────────────┘  │
│         │ POST /invoices      │ POST /invoices/{id}/approve                 │
│         ▼                     ▼                                            │
└─────────┼─────────────────────┼────────────────────────────────────────────┘
          │                     │ HTTPS (REST + SSE)
          ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLOUDFLARE EDGE (1 wrangler.toml)                     │
│                                                                             │
│   ┌─────────────────── PAGES (frontend) ───────────────────┐               │
│   │  Astro + React · static SPA · deployed to Pages CDN   │               │
│   └───────────────────────────────────────────────────────┘               │
│         │                                                                   │
│   ┌─────┴──────── WORKER "smartpay-api" ────────────────────┐             │
│   │  Hono router · nodejs_compat · compat_date 2025-09-15   │             │
│   │                                                         │             │
│   │  /invoices*        ── ingestion + OCR fallback          │             │
│   │  /invoices/:id/approve ── approval gate                 │             │
│   │  /invoices/:id/tx ── poll tx status                     │             │
│   │  /ws               ── (phase 2) live ledger sub         │             │
│   └─────┬───────────────────┬───────────────────┬───────────┘             │
│         │                   │                   │                         │
│         ▼                   ▼                   ▼                         │
│   ┌──────────┐        ┌──────────┐        ┌──────────┐                    │
│   │ D1       │        │ KV       │        │ R2       │                    │
│   │ invoices │        │ sessions │        │ raw      │                    │
│   │ + audit  │        │ + rate   │        │ uploads  │                    │
│   │ log      │        │ limit    │        │ (PDFs)   │                    │
│   └──────────┘        └──────────┘        └──────────┘                    │
│         │                   │                   │                         │
│         ▼                   ▼                   ▼                         │
│   ┌──────────────────────────────────────────────────────┐                 │
│   │  Cloudflare AI Gateway → Workers AI (Llama 3.1 8B)   │                 │
│   │  function calling + JSON mode · invoice extraction   │                 │
│   └──────────────────────────────────────────────────────┘                 │
└─────────┼──────────────────────────────────────────────────┼──────────────┘
          │                                                  │
          ▼ (signing)                                        ▼ (submit)
┌─────────────────────────────────────────────────────────────────────────────┐
│                       XRPL TESTNET (wss://s.altnet.rippletest.net)         │
│   xrpl.js client · RLUSD trustline · SubmitPayment(...) · Memos=invoice_id │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data flow (single invoice, happy path)

1. User drops invoice → Worker stores raw in **R2**, row in **D1** (`status=pending_extract`).
2. Worker calls **Workers AI (Llama 3.1 8B)** via AI Gateway with a function-calling schema → returns `{payee_wallet, amount, currency, due_date, memo}` → row updates (`status=pending_approval`).
3. Frontend renders extracted fields for human review (human-in-the-loop, per the kit's non-negotiable signing rule).
4. User clicks **Approve** → Worker calls `xrpl.js` `submitPayment()` with the agent wallet seed (from **Workers Secrets**, never in D1) → transaction submitted to Testnet with `Memos=[{invoice_id}]` and `SourceTag=<agent_id>`.
5. Worker polls `tx` every ~2s for 3–5s, captures `hash` + `Sequence` + `LedgerIndex`, writes to D1 audit log, marks `status=settled`.
6. Frontend SSE-streams status updates; final view links to the Testnet explorer.

---

## 2. Cloudflare service breakdown

| Service | Role | Why this service |
|---|---|---|
| **Pages** | Static SPA (Astro + React) | Free tier (unlimited requests), zero-config CDN, same deploy as Worker via `wrangler pages deploy` |
| **Worker `smartpay-api`** | All business logic, AI calls, XRPL signing | Edge-close to user, `nodejs_compat` flag enables `xrpl.js` WebSocket client; integrates D1/KV/R2/AI natively via bindings |
| **D1 (SQLite)** | `invoices`, `audit_log` tables | Free tier 5M reads / 100k writes /day; relational integrity between invoice and its tx history; SQL queries for the audit dashboard |
| **KV** | Rate-limit counters, idempotency keys, short-lived SSE cursors | Eventually-consistent, sub-ms reads, perfect for ephemeral state |
| **R2** | Raw invoice uploads (PDFs, images) | S3-compatible, **zero egress fees** — critical because the same file may be re-fetched by the LLM OCR fallback |
| **AI Gateway** | Proxy in front of Workers AI | Caching (free re-runs of identical invoice text), rate limiting, observability; swappable to OpenAI/Anthropic later by changing one URL |
| **Workers AI** | Llama 3.1 8B Instruct with function calling + JSON mode | No external API key, pay-per-token Neuron pricing (free tier 10k Neurons/day), runs in-region with the Worker |
| **Queues** (phase 2) | Decouple OCR-fallback path | If Workers AI can't parse, re-queue with a vision model; prevents blocking the request |

**Not used:** Durable Objects (overkill — no multi-player state), Hyperdrive (no external Postgres), Workers for Platforms (single-tenant POC).

### `wrangler.toml` sketch

```toml
name = "smartpay-api"
main = "src/worker.ts"
compatibility_date = "2025-09-15"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "smartpay"
database_id = "<from wrangler d1 create>"

[[kv_namespaces]]
binding = "KV"
id = "<from wrangler kv create>"

[[r2_buckets]]
binding = "R2"
bucket_name = "smartpay-uploads"

[ai]
binding = "AI"

[ai_gateway]
binding = "AI_GATEWAY"

[vars]
XRPL_NETWORK = "testnet"
RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"  # verify before mainnet

# secrets (set via `wrangler secret put`):
# AGENT_WALLET_SEED, AI_GATEWAY_URL
```

---

## 3. AI agent layer → XRPL connection

### SDK choice: **`xrpl.js`** (TypeScript)
The Worker is TypeScript; `xrpl.js` is the first-class SDK in the Starter Kit and the only one that runs on Workers (it's pure JS/TS with no Python C-extension deps). Requires `nodejs_compat` because it uses `node:events` for the WebSocket reconnection loop.

### Network: **Testnet** for POC
- WebSocket: `wss://s.altnet.rippletest.net:51233`
- Faucet: `https://faucet.altnet.rippletest.net` (free XRP + pre-funded RLUSD via a known issuer)
- **Mainnet swap is a one-line URL change** in `xrpl.js` (`new Client("wss://...")`).

### Signing model
- The agent wallet seed lives in **Cloudflare Workers Secrets** (`AGENT_WALLET_SEED`) — injected as an env binding, never persisted to D1 or logged.
- Every payment goes through the Starter Kit's mandated ceremony: `autofill` → `preview` (persisted to D1 `audit_log`) → `submit`. The "approve" button in the UI is the **explicit human confirmation** the wallet skill requires.
- **Auto-sign override** is NOT used in the POC — every tx is human-approved. (Production could enable scoped auto-sign for invoices under a threshold, per the skill's `auto-sign` scope mechanism.)

### RLUSD setup (Testnet)
1. Create agent wallet on Testnet faucet.
2. Establish a **trustline** to the Testnet RLUSD issuer (costs 2 XRP reserve).
3. Fund the wallet with RLUSD from the issuer's distribution faucet (Ripple operates one for Testnet).
4. Every settlement tx sends RLUSD (`currency: "RLUSD"`, `issuer: <testnet issuer>`) to the payee wallet — which must also have the trustline.

### Telemetry on every tx
- `SourceTag: <agent_id>` — attributes the payment to the SmartPay agent service (XRPL's agent-behavior tracking convention).
- `Memos: [{MemoType: "invoice-id", MemoData: <hex of invoice UUID>}, {MemoType: "approver", MemoData: <hex of user email>}]` — on-ledger audit trail linking settlement to the originating invoice.

---

## 4. Frontend ↔ backend communication

**REST for all CRUD + actions** (simpler than WebSocket for a single-actor workflow), **SSE for async status** (settlement polling).

- **Why not WebSocket for everything?** Workers do support WebSocket via Durable Objects, but that's overkill for a request-response workflow. SSE reuses plain HTTP, survives proxy/load-balancer hops, and is one-directional (which is all we need — status pushes).
- **Why SSE over polling?** Settlement is 3–5s; polling every 1s = 3–5 round trips. SSE keeps the connection open and pushes exactly one `settled` event. Free on Cloudflare (no connection limit on Workers).

---

## 5. API contract

Base URL: `https://smartpay-api.<account>.workers.dev`
All endpoints accept/return JSON. Errors follow RFC 7807 `application/problem+json`.

### 5.1 `POST /v1/invoices` — submit an invoice
**Request** (`multipart/form-data`):
```
file:        <pdf|png|jpg>     # one of file= or text= required
text:        string            # raw invoice text (if already extracted)
submitter:   string            # user email (for audit)
```
**Response** `201 Created`:
```json
{
  "id": "inv_01J...",
  "status": "pending_extract",
  "submitted_at": "2026-06-30T12:01:23Z",
  "raw_url": "https://r2.../inv_01J...",
  "poll_url": "https://smartpay-api.../v1/invoices/inv_01J.../events"
}
```

### 5.2 `GET /v1/invoices/:id` — fetch invoice + extracted fields
**Response** `200 OK`:
```json
{
  "id": "inv_01J...",
  "status": "pending_approval",        // pending_extract | pending_approval | approved | signing | settled | rejected | failed
  "submitted_at": "...",
  "submitter": "alice@example.com",
  "extracted": {
    "payee_name": "Acme Suppliers Ltd",
    "payee_wallet": "rD8s...",          // XRPL address, LLM-extracted then validated via xr.AccountInfo
    "amount": "1250.00",
    "currency": "RLUSD",
    "due_date": "2026-07-15",
    "invoice_number": "INV-2026-0417",
    "line_items": [...],                // optional, LLM-dependent
    "confidence": 0.94
  },
  "validation": {
    "wallet_exists": true,              // validated against XRPL before showing to user
    "trustline_present": true,          // can receive RLUSD?
    "warnings": []
  }
}
```

### 5.3 `GET /v1/invoices/:id/events` — SSE status stream
`Content-Type: text/event-stream`. Emits one event per state transition:
```
event: status
data: {"status":"pending_approval","at":"..."}

event: status
data: {"status":"signing","at":"...","tx_preflight":{...}}

event: status
data: {"status":"settled","at":"...","tx_hash":"E6D2...","ledger_index":12345678,"sequence":42}

event: status
data: {"status":"failed","at":"...","error":"tecPATH_DRY","xrpl_code":"tecPATH_DRY"}
```

### 5.4 `POST /v1/invoices/:id/approve` — human approval gate
**Request**:
```json
{
  "approver": "alice@example.com",
  "edited_amount": "1250.00",          // optional override if user corrected the LLM
  "edited_wallet": "rD8s..."           // optional override
}
```
**Response** `202 Accepted`:
```json
{
  "id": "inv_01J...",
  "status": "signing",
  "tx_preflight": {                    // from xrpl.js autofill+preview
    "fee": "0.000012",
    "sequence": 42,
    "last_ledger_sequence": 12345700,
    "signed_preview_hash": "..."        // hash of unsigned tx, for audit
  }
}
```

### 5.5 `POST /v1/invoices/:id/reject` — reject with reason
**Request**: `{"approver": "...", "reason": "wrong amount"}`
**Response**: `200 OK` with `{"status": "rejected"}`.

### 5.6 `GET /v1/audit` — audit log (for the dashboard)
`GET /v1/audit?limit=50&cursor=<opaque>`
Returns a paginated list of all invoices with their tx hashes, approver, timestamps, and XRPL explorer links.

### 5.7 `GET /v1/wallet/balance` — agent wallet status
```json
{
  "address": "rABC...",
  "network": "testnet",
  "xrp_balance": "85.00",
  "rlusd_balance": "12500.00",
  "trustlines": [{"currency":"RLUSD","issuer":"rMx...","balance":"12500.00"}]
}
```

### 5.8 Error envelope (all endpoints)
```json
{
  "type": "https://smartpay/errors/trustline_missing",
  "title": "Payee wallet cannot receive RLUSD",
  "status": 422,
  "detail": "Wallet rD8s... has no trustline to RLUSD issuer rMx...",
  "instance": "/v1/invoices/inv_01J..."
}
```

**Error codes specific to XRPL:**
- `xrpl_wallet_not_found` (404) — extracted wallet doesn't exist on-ledger
- `trustline_missing` (422) — payee can't receive the chosen currency
- `xrpl_tec_*` (409) — transaction engine code (e.g., `tecPATH_DRY`, `tecNO_DST_INSUFF_XRP`)
- `xrpl_tef_*` (409) — transaction evaluation failure (e.g., `tefPAST_SEQ`)
- `wallet_seed_missing` (500) — server misconfig, AGENT_WALLET_SEED not set

---

## 6. Open-source stack

Every component below is free and/or open-source. Nothing in the POC requires a paid plan.

| Layer | Technology | License | Notes |
|---|---|---|---|
| **XRPL SDK** | [`xrpl.js`](https://github.com/XRPLF/xrpl.js) v4+ | ISC | First-class JS SDK, the one used by the Starter Kit |
| **AI framework** | Cloudflare Workers AI + AI Gateway (Llama 3.1 8B Instruct) | Apache-2.0 (model); service is CF-hosted | Function calling + JSON mode for structured extraction. Free tier 10k Neurons/day covers POC. |
| **Starter Kit skills** | `xrpl-agent-wallet`, `xrpl-payments` (Claude Skills) | MIT | Used **as reference** for the signing-ceremony code (not runtime — Worker is standalone TS); copy their patterns into `src/xrpl/` |
| **XRPL Docs MCP** | Context7-hosted | MIT | Used in dev only (Claude Code) — not a runtime dependency |
| **Web framework (Worker)** | [Hono](https://hono.dev) | MIT | Minimal router, native Workers support, typed routes |
| **Frontend** | [Astro](https://astro.build) + React | MIT | Static SPA on Pages; React only for interactive islands |
| **Styling** | Tailwind CSS | MIT | Utility-first |
| **DB driver (D1)** | `drizzle-orm` | Apache-2.0 | Type-safe SQL, generates the `invoices`/`audit_log` schema |
| **Object storage (R2)** | Cloudflare R2 (via Worker binding) | Apache-2.0 | S3-compatible, zero egress |
| **Build/test** | `wrangler`, `vitest`, `tsx` | Apache-2.0/MIT | Standard CF toolchain |
| **Lint/format** | Biome | MIT | Fast, zero-config |

**Cloudflare Services** all have free tiers that cover the POC: Workers (100k req/day), D1 (5GB), R2 (10GB), Workers AI (10k Neurons/day), Pages (unlimited).

---

## 7. Required API keys & accounts

| Item | Where to get it | Cost | Purpose |
|---|---|---|---|
| **Cloudflare account** | cloudflare.com | Free | Hosts Workers/Pages/D1/KV/R2/AI |
| **`wrangler` login** | `npx wrangler login` | Free | Deploys the stack |
| **XRPL Testnet wallet seed** | `xrpl.js` `Wallet.generate()` or `faucet.altnet.rippletest.net` | Free | Agent wallet; stored as CF Secret |
| **XRPL Testnet XRP** | faucet.altnet.rippletest.net | Free | Fund the agent wallet (1000 XRP/test) |
| **RLUSD (Testnet)** | Ripple's Testnet RLUSD issuer faucet | Free | Settlement currency |
| **Anthropic API key** (optional) | console.anthropic.org | Free tier | **Only** if you want to use Claude instead of Workers AI for extraction. POC defaults to Workers AI — no key needed. |
| **No x402 facilitator key** | n/a | — | This demo does **not** use the t54 x402 facilitator (deliberate — keeps the demo dependency-free). |

---

## 8. Build checklist (numbered, in dependency order)

### Phase 0 — Scaffolding (0.5 day)
1. [ ] `npm create cloudflare@latest smartpay-agent -- --type hello-world --ts`
2. [ ] Add Hono, drizzle-orm, xrpl.js, biome, vitest
3. [ ] `wrangler d1 create smartpay` → put `database_id` in `wrangler.toml`
4. [ ] `wrangler kv create sessions` → put `id` in `wrangler.toml`
5. [ ] `wrangler r2 create smartpay-uploads`
6. [ ] Set `compatibility_date = "2025-09-15"`, `compatibility_flags = ["nodejs_compat"]`
7. [ ] Create the Pages app (separate dir, `smartpay-ui`, Astro + React + Tailwind)

### Phase 1 — XRPL plumbing (1 day)
8. [ ] Generate agent wallet locally: `node -e "console.log(require('xrpl').Wallet.generate())"`
9. [ ] Fund on Testnet faucet (1000 XRP)
10. [ ] Write `src/xrpl/client.ts` — singleton `Client`, reconnect-on-failure, env-driven network switch
11. [ ] Write `src/xrpl/wallet.ts` — load seed from `AGENT_WALLET_SEED` secret
12. [ ] Establish RLUSD trustline (one-time setup script `scripts/setup-trustline.ts`)
13. [ ] Fund RLUSD from Testnet issuer faucet
14. [ ] Write `src/xrpl/payment.ts` — `buildPayment()`, `autofill()`, `submit()`, `verify()` functions mirroring the Starter Kit's ceremony
15. [ ] Unit test: round-trip 1 RLUSD from agent wallet to a second test wallet; assert `tesSUCCESS` + `Memos` present

### Phase 2 — Invoice ingestion + extraction (1 day)
16. [ ] D1 schema migration: `invoices` (`id`, `status`, `submitter`, `extracted_json`, `raw_r2_key`, `tx_hash`, `created_at`) + `audit_log`
17. [ ] `POST /v1/invoices` handler — R2 upload, D1 insert, enqueue extraction
18. [ ] `src/ai/extract.ts` — call Workers AI with Llama 3.1 8B, function-calling schema `{payee_wallet, amount, currency, due_date, invoice_number, line_items[]}`
19. [ ] JSON mode strict schema; temperature 0
20. [ ] Post-extraction validation: `xrpl.request({command:"account_info", account: extracted.payee_wallet})` → set `wallet_exists`, `trustline_present`
21. [ ] Fallback: if Llama confidence < 0.7 or wallet invalid, set `status=needs_review` with warnings
22. [ ] Integration test: feed 3 sample invoices (1 clean text, 1 PDF, 1 with ambiguous amount); assert extraction correctness

### Phase 3 — Approval + settlement (1 day)
23. [ ] `POST /v1/invoices/:id/approve` — apply edits, call `xrpl.payment.buildPayment` → `autofill` → persist preview to `audit_log` → `submit`
24. [ ] `src/xrpl/verify.ts` — poll `tx` every 2s up to 30s; on `tesSUCCESS` capture `hash`/`LedgerIndex`/`Sequence`; on `tec*` capture error code
25. [ ] SSE endpoint `GET /v1/invoices/:id/events` — emit status transitions
26. [ ] `POST /v1/invoices/:id/reject`
27. [ ] End-to-end test: invoice → approve → settled; assert D1 audit row has `tx_hash` and on-ledger tx has matching `Memos[0].MemoData`

### Phase 4 — Frontend (1.5 days)
28. [ ] Astro SPA: three routes — `/` (drop zone), `/invoices/:id` (review + approve/reject), `/audit` (table)
29. [ ] Invoice review card: show extracted fields + confidence + validation warnings; editable amount/wallet
30. [ ] Approve button → POST → switch to SSE listener → show live status pills (signing → settled)
31. [ ] Settled view: link to `https://testnet.xrpl.org/transactions/<tx_hash>`
32. [ ] `/audit` table: paginated, filterable by status; click-through to invoice detail
33. [ ] Wallet dashboard widget: XRP + RLUSD balances

### Phase 5 — Hardening + demo prep (0.5 day)
34. [ ] Rate limit `/v1/invoices` (5/min via KV counter)
35. [ ] Idempotency keys on POST (KV, 24h TTL)
36. [ ] Structured logs via `wrangler tail` + Logpush to a log bucket (optional)
37. [ ] README with one-command `npm run deploy` (deps on `wrangler` secret setup)
38. [ ] **Demo script doc** — 3-minute walkthrough: paste invoice → approve → show explorer link → show audit log
39. [ ] Record a 60s loom of the demo for the pitch deck

### Phase 6 — Productionization (out of POC scope; documented only)
40. [ ] Swap to mainnet URL; re-verify RLUSD issuer address against `docs.ripple.com`
41. [ ] KYC/AML story (partner or workflow gate)
42. [ ] Enterprise SSO (WorkOS / Clerk) on approval step
43. [ ] Auto-sign scope policy (per Starter Kit) for invoices under a threshold — opt-in, scoped by amount/destination/duration
44. [ ] Durable Objects for multi-approver workflows
45. [ ] XRPL mainnet node or paid provider (xls20 / XRPL Labs) for production rate limits

---

## 9. Acceptance-criteria mapping

| Requirement (from task body) | Where in this doc |
|---|---|
| Single markdown design doc | This file (`DESIGN.md`) |
| System diagram (text) | §1 |
| Endpoint list with request/response shapes | §5.1–5.8 |
| Numbered build checklist | §8 |
| Chosen demo justified in 2–3 sentences | §0 |
| Architecture on Cloudflare | §2 |
| AI agent → XRPL connection (SDK, testnet/mainnet) | §3 |
| Frontend ↔ backend communication | §1 diagram + §4 |
| Open-source stack | §6 |
| Required API keys / accounts | §7 |
