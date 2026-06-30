# XRPL AI Starter Kit — Technical Brief

**Author:** Research (task t_119b1504)
**Date:** June 30, 2026
**Source launch:** June 9–10, 2026 (Ripple + XRPL Foundation)

---

## 1. What the "Starter Kit" actually is

It is **not a single GitHub repo**. The XRPL AI Starter Kit is a bundle of four cooperating components, all shipping under the XRPLF umbrella:

| # | Component | Location | What it does |
|---|-----------|----------|--------------|
| 1 | **XRPL Docs MCP Server** | Hosted via Context7 — `https://context7.com/websites/xrpl` | Exposes the entire XRPL developer docs as a tool-callable MCP source. Plugs into Claude Code, Claude Desktop, Cursor, VS Code, any MCP client. |
| 2 | **xrpl-agent-wallet** (Claude Skill) | `XRPLF/xrpl-dev-portal/.claude/skills/xrpl-skills/xrpl-agent-wallet/` | Owns the wallet lifecycle: generates wallets, writes seed directly to `.env` (never to chat), runs the signing ceremony (autofill → preview → confirm → sign → submit). |
| 3 | **xrpl-payments** (Claude Skill) | `XRPLF/xrpl-dev-portal/.claude/skills/xrpl-skills/xrpl-payments/` | Domain skill — constructs payment transaction objects (XRP, RLUSD, IOU, cross-currency, escrow) and hands them to the wallet skill. |
| 4 | **XRPL × x402 facilitator** (by t54) | `https://xrpl-x402.t54.ai/` — mainnet endpoint `https://xrpl-facilitator-mainnet.t54.ai` | Makes XRPL a supported chain in the x402 "HTTP 402 Payment Required" protocol. Agents pay per API call in XRP or RLUSD. |

Supporting material lives on `xrpl.org/docs/agents/` (getting-started tutorial, agentic-payments-x402 guide, agent-behavior tracking page).

Install path for the skills (Claude Code):
```
npx skills add https://github.com/XRPLF/xrpl-dev-portal/tree/master/.claude/skills/xrpl-skills/xrpl-agent-wallet --agent claude-code
npx skills add https://github.com/XRPLF/xrpl-dev-portal/tree/master/.claude/skills/xrpl-skills/xrpl-payments   --agent claude-code
```

---

## 2. Technology stack

- **Agent frameworks supported:** Anything MCP-compatible. Concretely tested: Claude Code, Claude Desktop, Cursor, VS Code. Not tied to LangChain/OpenAI — the integration surface is Claude Skills + MCP.
- **SDKs (first-class, both):** `xrpl.js` (TypeScript/JavaScript) and `xrpl-py` (Python ≥3.9). Node.js ≥18 required for JS path.
- **Languages for code samples:** TypeScript and Python, side-by-side in every doc.
- **XRPL operations covered by the payments skill:**
  - XRP payments (direct, destination tags, partial payments)
  - RLUSD stablecoin payments (trust-line aware)
  - Generic IOU / issued-token transfers
  - **Cross-currency payments** via the protocol-native DEX (single tx, no bridges)
  - Escrow (time-lock + crypto-condition; create / finish / cancel)
  - Agentic telemetry: `SourceTag` for agent attribution, `Memos` for audit trail
  - Not yet in a dedicated skill: NFT minting, trading-specific skill, AMM. The skill architecture is modular and "trading" is name-checked as a future domain skill.
- **Wallet security model (non-negotiable, enforced by the skill):**
  1. Seed never read, echoed, or persisted outside `.env`.
  2. Human confirmation on every signature by default.
  3. Every tx autofilled (`Fee`, `Sequence`, `LastLedgerSequence`) before preview.
  4. Auto-sign override only via explicit in-session instruction with scope (max amount, destination, duration).
- **Network defaults:** Testnet (`wss://s.altnet.rippletest.net:51233`). Mainnet is a one-line URL change. Settlement: 3–5 s deterministic finality (`tesSUCCESS` or clean expiry).

### License (acceptance criterion)

The entire `xrpl-dev-portal` repo — including both Claude skills and the docs — is released under the **MIT License** (Copyright © 2023 XRP Ledger Foundation and contributors). **MIT permits commercial use, modification, distribution, sublicensing, and sale.** The bundled `ripple-lib` is ISC; fonts are Apache-2.0 / OFL. None of these restrict commercial deployment.

---

## 3. Agentic-commerce landscape (the competition)

| Player | Chain / rail | Traction / status |
|--------|--------------|-------------------|
| **Coinbase x402** (May 2025) | Base (L2), also Solana/Polygon | The dominant incumbent. Crossed **100M txs in ~3 quarters** (Chainalysis, June 2026). 95% of value now in $1+ txns. Originally USDC; spec is chain-agnostic. |
| **Mastercard Agent Pay + Verifiable Intent** (March 2026) | Fiat rails, protocol-agnostic | Trust layer for agentic commerce — cryptographic proof of user authorization, consumer protection. Designed to ride *alongside* protocols like x402/AP2, not replace them. |
| **Visa Trusted Agent Protocol** (early 2026) | Fiat rails | Mastercard's analogue. Same "trust/identity" layer rather than settlement layer. |
| **AP2 — Agent Payments Protocol** (FIDO Alliance, May 2026) | Open standard | Defines roles (agent, merchant, payment provider) for agentic flows. Backed by FIDO; complements x402. |
| **Nevermined** | Multi-chain | Commercial platform for "pay-per-API-call" AI agent billing; closest direct product competitor to an x402 facilitator. |
| **Morphware xrpl-agents** | XRPL | Older (Feb 2025), small (5★), read-only ledger analytics — not payments. Pre-starter-kit XRPL experimentation. |

**What "commercially viable" looks like, per Chainalysis's x402 data:**
- 100M+ tx volume on a single chain in <1 year is the benchmark.
- Early growth was meme-driven (PING pay-to-mint, 150k txns month 1) then matured into $1+ value transfers.
- Tester→payer conversion 4×'d in 6 months; the friction curve is dropping fast.
- Implication for XRPL: it is late (~13 months behind x402 on Base) but differentiates on **deterministic finality, no gas auctions, native DEX, and RLUSD** — all of which x402/Base lacks.

---

## 4. Demo ideas (ranked)

Ranked by commercial appeal × feasibility on the current kit.

### A. Agent-paid API marketplace (x402 on XRPL) — ★★★★★
Wrap any HTTP API behind the t54 x402 facilitator; buyer agents pay per call in RLUSD. Monetize inference, weather, sanctions screening, premium data feeds.
- **Pros:** Directly mirrors the proven x402 playbook. RLUSD gives price stability x402-on-Base lacks natively (USDC only). Deterministic 3–5 s settlement removes the retry/pending state that plagues L2s. MIT license, ship today.
- **Cons:** Dependent on a third-party facilitator (t54) for the reference impl — you may want to self-host. Competes with Coinbase's scale.
- **Feasibility:** Highest. All parts exist; mostly integration glue.

### B. Autonomous invoice-settlement agent (B2B) — ★★★★☆
Agent reads invoices from email/ERP, verifies, settles in RLUSD via the payments skill, logs `SourceTag` + `Memos` for the audit trail.
- **Pros:** Institutional controls fit XRPL perfectly (multi-sig, DepositAuth, escrow). RLUSD = USD denomination. Strong enterprise narrative, matches Ripple's GTM.
- **Cons:** Needs KYC/AML story, ERP integration work, and a human-in-the-loop approval policy. Mainnet RLUSD issuer address must be re-verified before production.
- **Feasibility:** Medium-high. Demo-able in a week; productionizable in a quarter.

### C. Cross-currency DEX agent — ★★★★☆
Agent treasury manager that auto-rebalances between XRP and RLUSD (or other issued tokens) using a single XRPL transaction with protocol-native conversion. Budget-aware: exploits the predictable fee to plan swaps.
- **Pros:** Genuinely novel vs. EVM chains — XRPL's atomic cross-currency payment is something neither x402/Base nor Solana offers. Shows off the "no smart contract risk" angle.
- **Cons:** Trading skill not yet shipped (only wallet + payments are live) — you'll build the tx objects yourself using the payments skill patterns. Callable from `references/payments.md`.
- **Feasibility:** Medium. Requires understanding cross-currency tx structure; well-documented.

### D. Pay-as-you-go compute / AI inference marketplace — ★★★☆☆
Agent-to-agent: one agent sells GPU/inference, another buys, settled per request in XRP.
- **Pros:** Big TAM (the canonical x402 use case). Morphware is already in this lane on XRPL — validates demand.
- **Cons:** Crowded. Morphware, Nevermined, Coinbase's own examples. Differentiation has to come from somewhere else (price? latency? RLUSD?).
- **Feasibility:** Medium. Compute provider integration is the hard part, not payments.

### E. Escrow-gated SaaS subscription agent — ★★★☆☆
Monthly subscription encoded as time-locked escrows that release to the merchant; agent funds the next escrow on renewal signal.
- **Pros:** Plays to XRPL's native escrow; unique structuring not trivially done on EVM. Recurring-revenue model.
- **Cons:** Niche; UX for non-crypto merchants is hard. Escrow only locks XRP/tokens by time/crypto-condition, not true "subscription primitives."
- **Feasibility:** Medium. Escrow skill is documented; orchestration is custom.

**Recommended starter demo:** **A**, then **B**. They reuse the same stack, and A proves the payment rail while B proves the enterprise workflow.

---

## 5. Gotchas

- **API keys needed:** Anthropic API key for Claude Code (free tier ok). An XRPL seed (testnet or mainnet). No x402 facilitator API key required for the hosted t54 endpoint; self-hosting means running their facilitator code.
- **Testnet vs mainnet:** Default is Testnet (`s.altnet.rippletest.net`). Mainnet is a URL swap. The **mainnet RLUSD issuer address** (`rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De` in the skill) must be re-verified against `docs.ripple.com` before any production RLUSD send — the skill itself warns this can change.
- **Rate limits:** XRPL public endpoints have soft rate limits; for production, run your own `rippled` or use a paid node provider (xls20, XRPL Labs, etc.). No gas-auction-style congestion.
- **Account reserve:** 1 XRP base reserve + 2 XRP per trust line / object on mainnet. Budget for it when designing trust-line-heavy RLUSD flows.
- **Security defaults are opinionated:** the wallet skill refuses to echo seeds, refuses multisig, refuses to skip preview without an explicit auto-sign override. Plan your CI/automated-run flows around the auto-sign scope mechanism — don't try to bypass it.
- **Skill ecosystem is Phase 1:** only wallet + payments skills exist today. NFT minting, AMM, trading, and lending are not yet covered as skills (though XRPL supports them). You will hand-roll those transaction objects using the underlying SDKs and `references/payments.md` patterns.
- **x402 facilitator is third-party:** t54 runs the reference mainnet facilitator. For a commercial product, evaluate self-hosting or a SLA — the protocol is open but the hosted infra is one operator.
- **Late-mover risk:** Coinbase x402 has 13 months and 100M+ tx head start. Any demo entering this space needs a clear "why XRPL not Base" answer — the honest answers are deterministic finality, predictable fees, native DEX, RLUSD, and the institutional control surface (DepositAuth, multi-sig, escrow).

---

## 6. Bottom line

The XRPL AI Starter Kit is a thin but well-engineered layer: two Claude skills, one MCP doc server, one x402 facilitator. Everything is **MIT-licensed and commercial-use OK**. The interesting commercial demos are **x402 API monetization (RLUSD)** and **autonomous B2B invoice settlement**, both of which play to XRPL's unique strengths (finality, RLUSD, escrow, no smart-contract risk) rather than competing head-on with Coinbase x402 on Base. The kit is Phase 1 — expect gaps in NFT/trading/AMM skills and plan to hand-roll those transaction objects.
