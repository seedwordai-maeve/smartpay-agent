/**
 * Generate a fresh XRPL Testnet wallet and print the seed.
 * Usage: npm run setup:wallet
 *
 * Then fund it via the faucet (link printed below) and store the seed:
 *   wrangler secret put AGENT_WALLET_SEED
 */
import { Wallet, Client } from "xrpl";

async function main() {
  const wallet = Wallet.generate();
  console.log("=== New XRPL wallet (LOCAL ONLY — fund on Testnet) ===");
  console.log("Address:", wallet.address);
  console.log("Seed:   ", wallet.seed);
  console.log("");
  console.log("Next steps:");
  console.log("1. Fund this address on Testnet:");
  console.log("   curl -X POST https://faucet.altnet.rippletest.net/accounts -H 'content-type: application/json' -d '{\"address\":\"" + wallet.address + "\"}'");
  console.log("2. Store the seed as a Wrangler secret:");
  console.log("   echo \"" + wallet.seed + "\" | wrangler secret put AGENT_WALLET_SEED");
  console.log("3. (Optional) Establish the RLUSD trustline — see scripts/setup-trustline.ts");

  // Try to auto-fund via faucet if reachable
  try {
    console.log("\nAuto-funding via faucet (may take 10s)...");
    const client = new Client("wss://s.altnet.rippletest.net:51233");
    await client.connect();
    const funded = await client.fundWallet(wallet);
    console.log("Faucet response:", JSON.stringify(funded, null, 2));
    await client.disconnect();
  } catch (e) {
    console.log("Auto-fund skipped:", (e as Error).message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
