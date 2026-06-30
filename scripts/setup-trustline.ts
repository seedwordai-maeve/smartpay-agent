/**
 * One-time setup: establish the RLUSD trustline on the agent wallet.
 * Requires AGENT_WALLET_SEED to be set in the environment (or .dev.vars).
 *
 * Usage:
 *   AGENT_WALLET_SEED=<seed> npm run setup:trustline
 *
 * NOTE: this is a Node script (not a Worker). It connects directly to Testnet.
 */
import { Client, Wallet, xrpToDrops } from "xrpl";

const SEED = process.env.AGENT_WALLET_SEED;
const ISSUER = process.env.RLUSD_ISSUER ?? "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const LIMIT = "1000000"; // trustline limit

if (!SEED) {
  console.error("AGENT_WALLET_SEED env var is required");
  process.exit(1);
}

async function main() {
  const client = new Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();
  const wallet = Wallet.fromSeed(SEED as string);
  console.log("Agent wallet:", wallet.address);

  // Check if trustline already exists
  const lines = await client.request({
    command: "account_lines",
    account: wallet.address as string,
  });
  const hasRlusd = lines.result.lines.some(
    (l) => l.currency === "RLUSD" && l.account === ISSUER,
  );
  if (hasRlusd) {
    console.log("RLUSD trustline already established — nothing to do.");
    await client.disconnect();
    return;
  }

  console.log(`Establishing RLUSD trustline to issuer ${ISSUER} (limit ${LIMIT})...`);
  const tx = {
    TransactionType: "TrustSet" as const,
    Account: wallet.address,
    LimitAmount: {
      currency: "RLUSD",
      issuer: ISSUER,
      value: LIMIT,
    },
    Fee: xrpToDrops("0.000012"),
  };

  const autofilled = await client.autofill(tx);
  const signed = wallet.sign(autofilled);
  const response = await client.submit(signed.tx_blob);

  console.log("engine_result:", response.result.engine_result);
  console.log("tx_hash:", signed.hash);
  console.log("explorer:", `https://testnet.xrpl.org/transactions/${signed.hash}`);

  await client.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
