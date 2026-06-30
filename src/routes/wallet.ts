import { Hono } from "hono";
import { withClient } from "../xrpl/client";
import { getAgentWallet } from "../xrpl/wallet";
import { getWalletBalances } from "../xrpl/payment";

export const wallet = new Hono<{ Bindings: Env }>();

/** GET /v1/wallet/balance — agent wallet status */
wallet.get("/balance", async (c) => {
  const env = c.env;
  const agent = getAgentWallet(env);

  const balances = await withClient(env, (client) => getWalletBalances(client, agent));

  const rlusd = balances.trustlines.find((t) => t.currency === "RLUSD");

  return c.json({
    address: balances.address,
    network: env.XRPL_NETWORK,
    xrp_balance: balances.xrp_balance,
    rlusd_balance: rlusd?.balance ?? "0",
    trustlines: balances.trustlines,
  });
});
