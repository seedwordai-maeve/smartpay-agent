# SmartPay Agent — Frontend UI

A polished web UI demo for an autonomous invoice-settlement agent on the XRPL. Users paste natural-language invoices, the agent extracts payment instructions via AI, asks for human approval, and simulates settlement in RLUSD on XRPL Testnet with a full on-ledger audit trail.

Implements the frontend half of the contract in [`DESIGN.md`](../t_b3335640/DESIGN.md) §5.

## Stack

- **React 18 + TypeScript** (Vite 6)
- **Tailwind CSS 3** with custom design tokens (dark theme, glassmorphism)
- **Zero runtime deps** beyond React — all icons are hand-rolled SVG, no UI kit
- ~1800 LoC, builds to 179 KB JS / 26 KB CSS gzipped to 56 KB / 5 KB

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve dist/ on :4173
```

## What it does

1. **Hero** — product landing section explaining the demo.
2. **Invoice input** — paste free-text or load one of 3 sample invoices.
3. **Review & approve** — shows AI-extracted fields (payee, wallet, amount, currency, due date, line items, confidence %), wallet/trustline validation, editable amount/wallet, warnings.
4. **Settlement progress** — live status timeline (signing → settled), preflight details (fee/sequence/last ledger/preview hash), final tx hash with copy button, explorer deep-link, collapsible event log.
5. **Audit log** — recent settlements table with status pills, timestamps, truncated tx hashes, explorer links.

## Mock backend

`src/api.ts` simulates the Worker backend. The public functions mirror the real REST + SSE contract exactly (`submitInvoice`, `approveInvoice`, `streamSettlement`, `getWalletBalance`, `getAuditLog`) — swapping to real `fetch()` calls is a drop-in replacement.

The mock extractor (`extractFromText`) parses free-text invoices using ordered regex patterns. It handles:
- "Total due: $1,250.00" / "Amount: $X"
- "Pay 85 RLUSD to ..." command-style instructions
- "$X.XX" / "X.XX USD" formats
- Vendor names, XRPL wallet addresses (`r...`), due dates, invoice numbers, line items
- Confidence scoring based on field completeness

## Deploy to Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy dist --project-name smartpay-ui
```

Or connect this repo to Cloudflare Pages via Git — build command `npm run build`, output directory `dist`.

## Verification

```bash
npm run build                    # type-check passes, build succeeds
npx vite preview --port 4173 &   # start preview server
node _verify-flow.cjs            # end-to-end: input → review → approve → settled
node _verify-extraction.cjs      # all 3 sample invoices extract correct amount/currency
```

Expected: 15/15 flow checks pass, 3/3 extraction checks pass, 0 JS errors.

## Files

```
src/
  App.tsx                    # phase router: input → review → settling
  api.ts                     # mock backend (mirrors DESIGN.md §5 contract)
  types.ts                   # API types matching the contract
  index.css                  # Tailwind + custom component classes
  components/
    Header.tsx               # logo, testnet badge, wallet balance widget
    Hero.tsx                 # landing section
    InvoiceInput.tsx         # paste zone + sample buttons
    InvoiceReview.tsx        # extracted fields, validation, approve/reject
    SettlementProgress.tsx   # timeline, tx hash, explorer link
    StatusPill.tsx           # status badge + settlement timeline
    AuditLog.tsx             # recent settlements table
    icons.tsx                # SVG icon set
```
