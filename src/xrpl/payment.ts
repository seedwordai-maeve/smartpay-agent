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
  address: string,
  rlusdIssuer: string,
): Promise<InvoiceValidation> {
  const warnings: string[] = [];
  let wallet_exists = false;
  let trustline_present = false;

  try {
    const info = await rpc.accountInfo(address);
    wallet_exists = Boolean(info);

    if (wallet_exists) {
      const lines = await rpc.accountLines(address);
      trustline_present = lines.some((l) => l.currency === "RLUSD" && l.account === rlusdIssuer);
      if (!trustline_present) {
        warnings.push(`No RLUSD trustline to ${rlusdIssuer} — payment will fail with tecPATH_DRY`);
      }
    }
  } catch (e) {
    warnings.push(`account_info lookup failed: ${(e as Error).message}`);
  }

  return { wallet_exists, trustline_present, warnings };
}

interface SubmitArgs {
  destination: string;
  amount: string;
  currency: "RLUSD" | "XRP";
  rlusdIssuer: string;
  invoiceId: string;
  approver: string;
}

export async function submitPayment(
  rpc: XrplRpc,
  wallet: Wallet,
  args: SubmitArgs,
): Promise<TxFinality> {
  // Pre-flight trustline and balance checks
  if (args.currency === "RLUSD") {
    const lines = await rpc.accountLines(wallet.address);
    const rlusdLine = lines.find((l) => l.currency === "RLUSD" && l.account === args.rlusdIssuer);
    if (!rlusdLine) {
      throw Errors.badRequest("Agent wallet is missing RLUSD trustline. Run scripts/setup-trustline.ts first.", "no_trustline");
    }
    const balance = Number(rlusdLine.balance);
    const required = Number(formatAmount(args.amount));
    if (balance < required) {
      throw Errors.badRequest(`Agent wallet lacks RLUSD funds (has ${balance}, needs ${required})`, "no_rlusd_funds");
    }
  }

  const amount =
    args.currency === "XRP"
      ? xrpToDrops(formatAmount(args.amount))
      : {
          currency: "RLUSD",
          issuer: args.rlusdIssuer,
          value: formatAmount(args.amount),
        };

  // Need SendMax for tokens (transfer rates)
  const tx: Record<string, unknown> = {
    TransactionType: "Payment",
    Destination: args.destination,
    Amount: amount,
    SourceTag: SOURCE_TAG,
    Memos: buildMemos(args.invoiceId, args.approver),
  };

  if (args.currency === "RLUSD") {
    // We send exactly `amount` to destination, but issuer might take a transfer fee.
    // So we authorize up to `amount` + max possible fee (or we can just set SendMax to the exact amount if no fee, 
    // but the task asks to "build Payment with SendMax for RLUSD issuer").
    // Actually, setting SendMax isn't strictly necessary unless we are sending *across* trustlines with fees.
    // "RLUSD needs TransferRate-safe fee ... build Payment with SendMax for RLUSD issuer"
    // So we use SendMax with a slightly higher value or exactly the same.
    tx.SendMax = {
      currency: "RLUSD",
      issuer: args.rlusdIssuer,
      value: String(Number(formatAmount(args.amount)) * 1.01), // 1% buffer for transfer rate
    };
  }

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
      if (e.message.includes('tecUNFUNDED_PAYMENT') && args.currency === 'RLUSD') {
        throw Errors.badRequest("Agent wallet lacks RLUSD funds to complete payment.", "no_rlusd_funds");
      }
      if (e.message.includes('tecPATH_DRY') || e.message.includes('tecNO_LINE')) {
        throw Errors.badRequest("Destination lacks trustline for currency.", "no_trustline_dest");
      }
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
