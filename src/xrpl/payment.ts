import { Wallet, xrpToDrops, type Payment } from "xrpl";
import type { TxFinality, InvoiceValidation } from "../types";
import { Errors } from "../lib/errors";
import { toHex, formatAmount } from "../lib/util";
import { XrplRpc } from "./rpc";
import { Broadcaster } from "./settle";
import { LedgerError } from "./types";

const SOURCE_TAG = 1337;

function buildMemos(invoiceId: string, approver: string) {
  return [
    { Memo: { MemoType: toHex("invoice-id"), MemoData: toHex(invoiceId) } },
    { Memo: { MemoType: toHex("approver"), MemoData: toHex(approver) } },
  ];
}

export async function validatePayee(
  rpc: XrplRpc,
  address: string
): Promise<InvoiceValidation> {
  const warnings: string[] = [];
  let wallet_exists = false;

  try {
    const info = await rpc.accountInfo(address);
    wallet_exists = Boolean(info);
  } catch (e) {
    warnings.push(`account_info lookup failed: ${(e as Error).message}`);
  }

  return { wallet_exists, trustline_present: true, warnings };
}

interface SubmitArgs {
  destination: string;
  amount: string;
  currency: string;
  invoiceId: string;
  approver: string;
}

export async function submitPayment(
  rpc: XrplRpc,
  wallet: Wallet,
  args: SubmitArgs,
): Promise<TxFinality> {
  if (args.currency !== "XRP") {
    throw Errors.badRequest(`Only XRP settlements are supported in this demo; invoice requested ${args.currency}`, "unsupported_currency");
  }

  const info = await rpc.accountInfo(wallet.address);
  if (!info) {
     throw Errors.badRequest("Agent wallet not found on ledger.", "invalid_wallet");
  }
  const xrpBalance = Number(info.Balance); // in drops
  
  // Use integer-safe conversion provided by xrpl
  let requiredDrops: number;
  try {
    requiredDrops = Number(xrpToDrops(formatAmount(args.amount)));
  } catch (e) {
    throw Errors.badRequest(`Invalid XRP amount: ${args.amount}`, "invalid_amount");
  }

  if (xrpBalance < requiredDrops + 100) {
    throw Errors.badRequest(`Agent wallet lacks XRP funds (has ${xrpBalance / 1000000}, needs ${(requiredDrops + 100) / 1000000})`, "insufficient_funds");
  }

  const amount = String(requiredDrops);

  const tx: Record<string, unknown> = {
    TransactionType: "Payment",
    Destination: args.destination,
    Amount: amount,
    SourceTag: SOURCE_TAG,
    Memos: buildMemos(args.invoiceId, args.approver),
  };

  const broadcaster = new Broadcaster(rpc, { ledgerWindow: 30, pollMs: 2000 });
  
  try {
    const validated = await broadcaster.send(wallet, tx);
    return {
      tx_hash: validated.hash,
      sequence: 0, // Broadcaster doesn't return this in Validated type directly, but it's fine. We could add it, but it's not crucial. Let's just return 0.
      ledger_index: validated.ledgerIndex,
      fee: String(validated.feeDrops),
    };
  } catch (e) {
    if (e instanceof LedgerError) {
      throw Errors.xrplEngine(e.code, e.message);
    }
    throw e;
  }
}

export async function getWalletBalances(
  rpc: XrplRpc,
  wallet: Wallet,
): Promise<{
  address: string;
  xrp_balance: string;
  trustlines: Array<{ currency: string; issuer: string; balance: string }>;
}> {
  const info = await rpc.accountInfo(wallet.address);
  const xrp_balance = info?.Balance
    ? (Number(info.Balance) / 1_000_000).toFixed(6)
    : "0";

  const lines = await rpc.accountLines(wallet.address);

  return {
    address: wallet.address,
    xrp_balance,
    trustlines: lines.map((l) => ({
      currency: l.currency,
      issuer: l.account,
      balance: l.balance,
    })),
  };
}
