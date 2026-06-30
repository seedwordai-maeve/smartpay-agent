import { Wallet } from "xrpl";
import { Errors } from "../lib/errors";

/**
 * Load the agent wallet from the AGENT_WALLET_SEED secret.
 * Throws a 500 HttpError if the secret is missing — that's a deploy-time
 * misconfiguration surfaced to the operator, not a user error.
 */
export function getAgentWallet(env: Env): Wallet {
  if (!env.AGENT_WALLET_SEED) {
    throw Errors.noSeed();
  }
  return Wallet.fromSeed(env.AGENT_WALLET_SEED);
}
