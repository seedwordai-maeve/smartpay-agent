import { Client } from "xrpl";

/**
 * xrpl.js Client is a long-lived WebSocket connection. Workers don't have
 * true long-lived sockets across requests, so we lazily connect per-request
 * and disconnect in a `finally`. `nodejs_compat` provides the needed Node
 * primitives (events, buffer) for xrpl.js v4.
 */
export async function withClient<T>(
  env: Env,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(env.XRPL_WSS, {
    connectionTimeout: 10_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect().catch(() => {});
  }
}
