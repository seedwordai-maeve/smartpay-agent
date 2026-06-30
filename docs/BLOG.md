# Agentic Commerce on XRPL: When AI Agents Settle Invoices on a Public Blockchain

The way businesses pay each other hasn't changed much in decades. You receive an invoice, someone reviews it, an approval is routed, and eventually a bank transfer goes out — often days later. What if an AI agent could handle the entire workflow end to end, settling payment on a public blockchain in seconds, while still keeping a human in control?

## The concept

The idea is straightforward: an AI agent that receives an invoice in plain language — an email, a Slack message, a PDF — extracts the payment details automatically, presents a summary for human approval, and then settles the transaction on the XRPL (XRP Ledger). No manual data entry, no bank routing delays, no opaque intermediary fees. Just a transparent, on-chain payment recorded for anyone to audit.

## How it works

The pipeline has four stages:

1. **Natural-language input** — You send an invoice any way you'd like. The system doesn't need structured formats; it reads the text you provide.
2. **AI extraction** — A language model parses the invoice, pulling out payee, amount, currency, due date, and memo. We use Llama 3.1 via Cloudflare Workers AI, running at the edge with no cold-start penalty.
3. **Human approval** — The extracted details are presented to a human approver. No autonomous agent should move money without a person saying yes. This is a hard rule, not a suggestion.
4. **XRPL settlement** — Once approved, the transaction executes on-chain. Finality in three to five seconds, fees under a fraction of a cent.

## Why XRPL?

Speed and cost matter when you're building real-time agent-mediated payments. XRPL delivers transaction finality in 3–5 seconds with negligible fees. The arrival of RLUSD — Ripple's regulated USD stablecoin native to the ledger — makes it practical for invoicing without worrying about crypto volatility.

## The stack

Everything runs on Cloudflare's edge: Workers for the serverless API, D1 (SQLite at the edge) for persistence, and Workers AI for inference. The frontend and API are both live and running on the XRPL Testnet right now:

- **Frontend:** [smartpay-demo.pages.dev](https://smartpay-demo.pages.dev)
- **API:** [smartpay-api.smartpay-demo.workers.dev](https://smartpay-api.smartpay-demo.workers.dev)

## What's different?

Traditional payment rails are slow, opaque, and expensive. Wire transfers take days. Credit card networks clip a percentage. Reconciliation is manual. An agent-mediated, blockchain-based approach flips all of that: every payment is transparent, every transaction is auditable on a public ledger, and the cost to move money approaches zero.

## What's next

This demo scratches the surface. The real power of agentic commerce emerges when agents don't just execute payments — they negotiate terms, handle multi-party approvals, and integrate directly into ERP systems. Imagine a procurement agent that received a purchase order, cross-referenced it against a contract, verified available budget, requested sign-off from the right stakeholder, and settled payment — all before you finished your morning coffee.

We're building toward that future. The pieces are already live. Try the demo and let us know what you think.
