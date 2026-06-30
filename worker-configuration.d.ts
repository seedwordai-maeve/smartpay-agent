// Cloudflare Workers bindings — hand-authored; replace with `wrangler types`
// output once you have run `wrangler login` and the bound resources exist.

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
  exec(query: string): Promise<D1Response>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run<T = unknown>(): Promise<D1Result<T>>
}

interface D1Result<T = unknown> {
  results?: T[]
  success: boolean
  meta: {
    duration: number
    changes: number
    last_row_id: number
    changed_db: boolean
    size_after: number
    rows_read: number
    rows_written: number
  }
  error?: string
}

interface D1Response { count: number; duration: number }

interface Fetcher { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> }

interface KVNamespace {
  get(key: string, options?: KVNamespaceGetOptions): Promise<string | null>
  getWithMetadata<T = unknown>(key: string, options?: KVNamespaceGetOptions): Promise<KVNamespaceGetWithMetadataResult<T>>
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>
  delete(key: string): Promise<void>
  list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult>
}

interface KVNamespaceGetOptions {
  type?: "text" | "json" | "arrayBuffer" | "stream"
  cacheTtl?: number
}
interface KVNamespacePutOptions { expirationTtl?: number; metadata?: unknown }
interface KVNamespaceListOptions { prefix?: string; limit?: number; cursor?: string }
interface KVNamespaceListResult { keys: { name: string; expiration?: number; metadata?: unknown }[]; list_complete: boolean; cursor?: string }
interface KVNamespaceGetWithMetadataResult<T> { value: string | null; metadata: T | null }

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>
  put(key: string, value: ReadableStream | ArrayBuffer | string | Blob | null, options?: R2PutOptions): Promise<R2Object>
  delete(keys: string | string[]): Promise<void>
  head(key: string): Promise<R2Object | null>
  list(options?: R2ListOptions): Promise<R2Objects>
}
interface R2Object {
  key: string; size: number; etag: string; uploaded: Date; writeHttpMetadata(meta: Headers): void
}
interface R2ObjectBody extends R2Object {
  body: ReadableStream; bodyUsed: boolean
  arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string>; json<T>(): Promise<T>; blob(): Promise<Blob>
}
interface R2PutOptions { httpMetadata?: Record<string, string>; customMetadata?: Record<string, string> }
interface R2ListOptions { limit?: number; prefix?: string; cursor?: string; delimiter?: string }
interface R2Objects { objects: R2Object[]; truncated: boolean; cursor?: string; delimitedPrefixes: string[] }

interface Ai {
  run<T = unknown>(model: string, inputs: AiInputs | object, options?: AiOptions): Promise<T>
  gateway(gatewayId: string | object): Ai
}
interface AiOptions { gateway?: string | object }
type AiInputs = {
  messages: { role: string; content: string }[]
  tools?: unknown[]
  response_format?: { type: string }
  max_tokens?: number
  temperature?: number
}

interface Env {
  DB: D1Database
  KV: KVNamespace
  R2?: R2Bucket
  AI: Ai
  XRPL_NETWORK: "testnet" | "mainnet" | "devnet"
  XRPL_WSS: string
  XRPL_FAUCET: string
  RLUSD_ISSUER: string
  AI_MODEL: string
  RATE_LIMIT_PER_MIN: string
  SETTLE_POLL_INTERVAL_MS: string
  SETTLE_POLL_TIMEOUT_MS: string
  AGENT_WALLET_SEED?: string
  AI_GATEWAY_URL?: string
}
