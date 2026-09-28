import { Hono } from "hono";
import { getAgentWallet } from "../xrpl/wallet";
import { getWalletBalances } from "../xrpl/payment";

export const wallet = new Hono<{ Bindings: Env }>();

/** GET /v1/wallet/balance — agent wallet status */
wallet.get("/balance", async (c) => {
  const env = c.env;
  const agent = getAgentWallet(env);
  
  const { XrplRpc } = await import("../xrpl/rpc");
  const rpcUrls: Record<string, string> = {
    testnet: "https://s.altnet.rippletest.net:51234",
    devnet: "https://s.devnet.rippletest.net:51234",
    mainnet: "https://xrplcluster.com",
  };
  const rpc = new XrplRpc({ url: rpcUrls[env.XRPL_NETWORK] || rpcUrls.testnet });

  const balances = await getWalletBalances(rpc, agent);

  const rlusd = balances.trustlines.find((t) => t.currency === "RLUSD");

  return c.json({
    address: balances.address,
    network: env.XRPL_NETWORK,
    xrp_balance: balances.xrp_balance,
    rlusd_balance: rlusd?.balance ?? "0",
    trustlines: balances.trustlines,
  });
});
