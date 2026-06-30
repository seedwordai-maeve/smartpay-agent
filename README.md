# SmartPay Agent — Autonomous Invoice Settlement on XRPL

Paste a natural-language invoice → AI extracts structured payment details → review → approve → settles on XRPL Testnet. Built with a human-in-the-loop approval gate and a full on-ledger audit trail.

> **Demo running on the Cloudflare free tier** — no servers, no keys to manage.

---

## 🌐 Live URLs

| Service | URL |
|---|---|
| **Frontend** | [https://smartpay-demo-5sc.pages.dev](https://smartpay-demo-5sc.pages.dev) |
| **Backend API** | [https://smartpay-api.smartpay-demo.workers.dev](https://smartpay-api.smartpay-demo.workers.dev) |
| **Health Check** | [https://smartpay-api.smartpay-demo.workers.dev/health](https://smartpay-api.smartpay-demo.workers.dev/health) |

---

## How It Works

1. **Submit** — Paste or upload an invoice in natural language (or JSON).
2. **Extract** — Cloudflare Workers AI (Llama 3.1 8B) parses the invoice and outputs structured payment fields (payee address, amount, currency, memo).
3. **Review** — The extracted data is presented for human verification.
4. **Approve / Reject** — An explicit approval gate prevents autonomous settlement. Rejections are recorded with reasons.
5. **Settle** — On approval, the agent submits a signed XRP/RLUSD payment transaction to the XRPL Testnet and polls for confirmation.
6. **Audit** — Every lifecycle event is logged to a durable audit trail queryable via the `/v1/audit` endpoint.

---

## Architecture

```
┌──────────────────┐     REST + SSE      ┌──────────────────────────┐
│   React Frontend │ ◄────────────────► │   Hono API (Workers)     │
│   Vite + TW 3    │                     │   nodejs_compat           │
└──────────────────┘                     └─────┬───┬──────┬─────────┘
                                                │   │      │
                                     ┌──────────┘   │      └──────────┐
                                     ▼              ▼                  ▼
                              ┌────────────┐ ┌──────────┐    ┌────────────────┐
                              │ Workers AI │ │    D1     │    │   XRPL Testnet  │
                              │ Llama 3.1  │ │  (SQLite)│    │   xrpl.js v4    │
                              └────────────┘ └──────────┘    └────────────────┘
                                     │              │
                                     ▼              ▼
                              ┌────────────┐ ┌──────────┐
                              │   (AI GW)  │ │    KV    │
                              └────────────┘ │ rate-limit│
                                             └──────────┘
```

| Layer | Technology |
|---|---|
| **Frontend** | React 18 · TypeScript · Vite 6 · Tailwind CSS 3 → Cloudflare Pages |
| **Backend** | Hono → Cloudflare Workers (`nodejs_compat`) |
| **AI** | Cloudflare Workers AI — `@cf/meta/llama-3.1-8b-instruct` (JSON mode) |
| **Database** | Cloudflare D1 (SQLite) |
| **Cache / Rate-limit** | Cloudflare KV |
| **Blockchain** | XRPL Testnet via `xrpl.js` v4 |
| **Protocol** | REST + Server-Sent Events (SSE) for live status updates |

---

## API Endpoints

All endpoints are prefixed with the worker origin (see Live URLs above).

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe — returns `status: "ok"` |
| `POST` | `/v1/invoices` | Submit a new invoice (JSON body or `multipart/form-data` with file) |
| `GET` | `/v1/invoices/:id` | Fetch invoice with AI extraction result and current status |
| `GET` | `/v1/invoices/:id/events` | SSE stream of status changes (subscribe for live updates) |
| `POST` | `/v1/invoices/:id/approve` | Approve invoice → triggers XRPL payment settlement |
| `POST` | `/v1/invoices/:id/reject` | Reject invoice with `{ "reason": "..." }` |
| `GET` | `/v1/audit` | Paginated audit log (`?page=1&limit=20`) |
| `GET` | `/v1/wallet/balance` | Agent wallet XRP + RLUSD balance on XRPL Testnet |

---

## Developer Setup (from scratch)

### Prerequisites

- **Node.js** 22+ (`node --version`)
- **Cloudflare account** with Workers free plan
- `wrangler` CLI — install globally or use the local version via `npx`

### 1. Clone & install (backend)

```bash
git clone <repo-url> smartpay
cd smartpay
npm install
```

### 2. Create Cloudflare resources

Create the D1 database, KV namespace, and note their IDs for `wrangler.toml`:

```bash
npx wrangler d1 create smartpay          # copy database_id
npx wrangler kv namespace create KV       # copy id
```

Update `wrangler.toml` with the returned IDs.

### 3. Run database migrations

```bash
npx wrangler d1 migrations apply smartpay --remote
```

### 4. Generate & fund the agent wallet

```bash
npm run setup:wallet          # generates seed, auto-funds via testnet faucet
npm run setup:trustline       # establishes RLUSD trustline (optional)
```

### 5. Set secrets

```bash
echo "$AGENT_WALLET_SEED" | npx wrangler secret put AGENT_WALLET_SEED
# Optional:
# echo "$AI_GATEWAY_URL"  | npx wrangler secret put AI_GATEWAY_URL
```

### 6. Deploy backend

```bash
npm run deploy
```

### 7. Build & deploy frontend

```bash
cd frontend
npm install
VITE_API_URL=https://smartpay-api.smartpay-demo.workers.dev npm run build
npx wrangler pages deploy dist --project-name=smartpay-demo
```

### 8. Verify

```bash
curl https://smartpay-api.smartpay-demo.workers.dev/health
```

---

## Project Structure

```
smartpay/
├── README.md
├── package.json                  # Backend (smartpay-api)
├── wrangler.toml                 # Cloudflare Workers + bindings config
├── tsconfig.json                 # TypeScript config (backend)
├── vitest.config.ts             # Vitest config
├── migrations/
│   └── 0001_init.sql             # D1 schema: invoices + audit_log
├── scripts/
│   ├── generate-wallet.ts        # Wallet generation + faucet funding
│   └── setup-trustline.ts        # RLUSD trustline setup
├── src/
│   ├── worker.ts                 # Entry point — Hono app bootstrap
│   ├── types.ts                  # Shared TypeScript types
│   ├── routes/
│   │   ├── invoices.ts           # Invoice CRUD, approve, reject, SSE events
│   │   └── wallet.ts             # Wallet balance endpoint
│   ├── ai/
│   │   └── extract.ts            # LLM invoice extraction (Workers AI)
│   ├── db/
│   │   ├── schema.ts             # Drizzle ORM schema definitions
│   │   └── db.ts                 # D1 connection helper
│   ├── xrpl/
│   │   ├── client.ts             # XRPL WebSocket connection
│   │   ├── wallet.ts             # Agent wallet management
│   │   └── payment.ts            # Payment preparation + submission
│   └── lib/
│       ├── util.ts               # Utility functions
│       └── errors.ts             # Custom error types
├── test/
│   ├── api.test.ts               # API integration tests
│   └── util.test.ts              # Unit tests
├── frontend/
│   ├── index.html                # SPA entry point
│   ├── package.json              # Frontend (smartpay-ui)
│   ├── vite.config.ts            # Vite build config
│   ├── tsconfig.json             # TypeScript config (frontend)
│   ├── public/
│   │   └── favicon.svg           # App icon
│   └── src/
│       ├── main.tsx              # React entry
│       ├── App.tsx               # Root component + routing
│       ├── api.ts                # API client (fetch wrapper)
│       ├── types.ts              # Frontend TypeScript types
│       ├── index.css             # Tailwind directives + global styles
│       └── components/
│           ├── Header.tsx         # App header / nav
│           ├── Hero.tsx            # Landing hero section
│           ├── InvoiceInput.tsx   # Invoice submission form
│           ├── InvoiceReview.tsx  # AI extraction review panel
│           ├── SettlementProgress.tsx  # Live settlement status (SSE)
│           ├── AuditLog.tsx       # Audit log viewer
│           ├── StatusPill.tsx     # Status badge component
│           └── icons.tsx         # SVG icon components
└── docs/
    ├── BLOG.md                   # Blog post draft
    └── screenshots/              # 📸 Screenshot placeholder — add UI screenshots here
```

---

## Open-Source Dependencies

| Package | License | Role |
|---|---|---|
| [Hono](https://hono.dev) | MIT | HTTP framework for Cloudflare Workers |
| [xrpl.js](https://github.com/XRPLF/xrpl.js) | ISC | XRPL client library v4 |
| [drizzle-orm](https://orm.drizzle.team) | Apache-2.0 | Type-safe SQL query builder for D1 |
| [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) | Cloudflare TOS | Serverless LLM inference (Llama 3.1 8B) |
| [React](https://react.dev) | MIT | UI component library v18 |
| [Vite](https://vite.dev) | MIT | Build tool & dev server v6 |
| [Tailwind CSS](https://tailwindcss.com) | MIT | Utility-first CSS framework v3 |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 | Static type checking v5 |
| [Vitest](https://vitest.dev) | MIT | Unit & integration test framework |

---

## Ideas for Commercial Next Steps

- **Multi-currency support** — settle in stablecoins beyond RLUSD (EURC, USDC, etc.)
- **Invoice OCR** — use AI vision models to extract payment details from scanned PDFs and images
- **Multi-party approval workflows** — require N-of-M approvals before settlement
- **ERP / accounting integrations** — push settled invoices into QuickBooks, Xero, or SAP
- **Escrow & conditional payments** — time-locked or condition-based XRPL payments
- **Analytics dashboard** — settlement volume, latency metrics, compliance reporting
- **Mobile app / Telegram bot** — submit and approve invoices from any device

---

## Screenshots

Screenshots and demo recordings live in [`docs/screenshots/`](docs/screenshots/). Contributions welcome — add your own and update this section.

---

## License

MIT
