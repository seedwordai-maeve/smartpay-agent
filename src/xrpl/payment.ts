import {
  Client,
  Wallet,
  xrpToDrops,
  type Payment,
  type Memo,
  type TransactionMetadata,
  type AccountInfoRequest,
  type AccountLinesRequest,
  type TxRequest,
  type TxResponse,
} from "xrpl";
import type { TxFinality, InvoiceValidation } from "../types";
import { Errors } from "../lib/errors";
import { toHex, formatAmount } from "../lib/util";

/**
 * Build, autofill, and submit a Payment in the XRPL AI Starter Kit's mandated
 * ceremony:
 *
 *   1. buildPayment(...)    — unsigned transaction with Memos + SourceTag
 *   2. client.autofill(tx)  — fills fee, sequence, lastLedgerSequence
 *   3. wallet.sign(tx)      — local signing with seed
 *   4. client.submit(blob)  — broadcast
 *   5. verifyTransaction()  — poll `tx` until validated, capture hash + ledger
 *
 * Every payment carries:
 *   - SourceTag: identifies the SmartPay agent service on-ledger
 *   - Memos[0]: invoice_id (links settlement to originating invoice)
 *   - Memos[1]: approver email (human-in-the-loop audit)
 */

const SOURCE_TAG = 1337; // SmartPay agent identifier on Testnet

function buildMemos(invoiceId: string, approver: string): Memo[] {
  return [
    {
      Memo: {
        MemoType: toHex("invoice-id"),
        MemoData: toHex(invoiceId),
      },
    },
    {
      Memo: {
        MemoType: toHex("approver"),
        MemoData: toHex(approver),
      },
    },
  ];
}

/** Validate a payee wallet: exists on-ledger + has RLUSD trustline. */
export async function validatePayee(
  client: Client,
  address: string,
  rlusdIssuer: string,
): Promise<InvoiceValidation> {
  const warnings: string[] = [];
  let wallet_exists = false;
  let trustline_present = false;

  try {
    const info = await client.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    } as AccountInfoRequest);
    wallet_exists = Boolean(info.result.account_data);

    const lines = await client.request({
      command: "account_lines",
      account: address,
      ledger_index: "validated",
    } as AccountLinesRequest);
    trustline_present = (lines.result.lines ?? []).some(
      (l) => l.currency === "RLUSD" && l.account === rlusdIssuer,
    );
    if (!trustline_present) {
      warnings.push(`No RLUSD trustline to ${rlusdIssuer} — payment will fail with tecPATH_DRY`);
    }
  } catch (e) {
    warnings.push(`account_info lookup failed: ${(e as Error).message}`);
  }

  return { wallet_exists, trustline_present, warnings };
}

interface SubmitArgs {
  destination: string;
  amount: string;          // "1250.00"
  currency: "RLUSD" | "XRP";
  rlusdIssuer: string;
  invoiceId: string;
  approver: string;
}

/** Build, autofill, sign, and submit a Payment. Returns the tx hash + finality. */
export async function submitPayment(
  client: Client,
  wallet: Wallet,
  args: SubmitArgs,
): Promise<TxFinality> {
  const amount =
    args.currency === "XRP"
      ? xrpToDrops(formatAmount(args.amount))
      : {
          currency: "RLUSD",
          issuer: args.rlusdIssuer,
          value: formatAmount(args.amount),
        };

  const tx: Payment = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: args.destination,
    Amount: amount,
    SourceTag: SOURCE_TAG,
    Memos: buildMemos(args.invoiceId, args.approver),
  };

  // Autofill: fee, sequence, lastLedgerSequence
  const autofilled = await client.autofill(tx);
  const signed = wallet.sign(autofilled);

  const response = await client.submit(signed.tx_blob);

  const resultEngine = response.result.engine_result;
  const resultMessage = response.result.engine_result_message;

  // tesSUCCESS is the only success code; everything else is tec/tef/tem.
  if (resultEngine !== "tesSUCCESS") {
    throw Errors.xrplEngine(resultEngine, resultMessage ?? "transaction rejected");
  }

  // Verify: poll until validated, capture hash + ledger index.
  const finality = await verifyTransaction(client, signed.hash);
  return {
    tx_hash: signed.hash,
    sequence: autofilled.Sequence ?? 0,
    ledger_index: finality.ledger_index,
    fee: (autofilled.Fee ?? "0").toString(),
  };
}

/**
 * Poll the ledger until the tx hash is validated or we time out.
 * XRPL transactions are final in 3–5s (one ledger close).
 */
async function verifyTransaction(
  client: Client,
  txHash: string,
  timeoutMs = 30_000,
): Promise<{ ledger_index: number }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const res = (await client.request({
        command: "tx",
        transaction: txHash,
      } as TxRequest)) as TxResponse;

      if (res.result.validated) {
        const code = (res.result.meta as TransactionMetadata | undefined)?.TransactionResult;
        if (code && code !== "tesSUCCESS") {
          throw Errors.xrplEngine(code, `Transaction validated but failed: ${code}`);
        }
        return { ledger_index: res.result.ledger_index ?? 0 };
      }
    } catch (e) {
      // tx not yet in a closed ledger — keep polling unless it's our own error
      if (e instanceof Error && e.name === "HttpError") throw e;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  throw Errors.xrplEngine("tejMaxLedger", "transaction not validated before timeout");
}

/** Fetch agent wallet balances (XRP + all trustlines). */
export async function getWalletBalances(
  client: Client,
  wallet: Wallet,
): Promise<{
  address: string;
  xrp_balance: string;
  trustlines: Array<{ currency: string; issuer: string; balance: string }>;
}> {
  const info = await client.request({
    command: "account_info",
    account: wallet.address,
    ledger_index: "validated",
  } as AccountInfoRequest);
  const xrp_balance = info.result.account_data?.Balance
    ? (Number(info.result.account_data.Balance) / 1_000_000).toFixed(6)
    : "0";

  const lines = await client.request({
    command: "account_lines",
    account: wallet.address,
    ledger_index: "validated",
  } as AccountLinesRequest);

  return {
    address: wallet.address,
    xrp_balance,
    trustlines: (lines.result.lines ?? []).map((l) => ({
      currency: l.currency,
      issuer: l.account,
      balance: l.balance,
    })),
  };
}
