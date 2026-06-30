/** Small utilities — ULID-ish IDs, timestamps, hex encoding for XRPL Memos. */

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Crockford-base32 ULID (time-ordered, 26 chars). Sufficient for demo IDs. */
export function ulid(prefix = "inv_"): string {
  const time = Date.now();
  let ts = "";
  let t = time;
  for (let i = 9; i >= 0; i--) {
    ts = ULID_ALPHABET[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand += ULID_ALPHABET[Math.floor(Math.random() * 32)];
  }
  return `${prefix}${ts}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** UTF-8 → uppercase hex (XRPL MemoData format). */
export function toHex(s: string): string {
  return Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
}

/** Convert "1234.5" RLUSD into the XRPL issued-currency amount format (string). */
export function formatAmount(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${amount}`);
  return n.toFixed(2);
}
