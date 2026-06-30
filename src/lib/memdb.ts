/**
 * In-memory D1 shim for deploying without a real D1 database.
 * Uses a global Map persisted across requests within the same isolate.
 * Data is ephemeral — good enough for demo/PoC, not production.
 */

function getStore(): Map<string, Record<string, unknown>[]> {
  if (!(globalThis as Record<string, unknown>).__memdb_store) {
    (globalThis as Record<string, unknown>).__memdb_store = new Map<string, Record<string, unknown>[]>();
  }
  return (globalThis as Record<string, unknown>).__memdb_store as Map<string, Record<string, unknown>[]>;
}

class MemPrepared {
  private sql: string;
  private params: unknown[] = [];

  constructor(sql: string) {
    this.sql = sql;
  }

  bind(...values: unknown[]): MemPrepared {
    this.params = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const store = getStore();
    const m = this.sql.match(/SELECT.*FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*\?(\d+))?/i);
    if (!m) return null;
    const table = m[1];
    const col = m[2];
    const pidx = m[3] ? Number(m[3]) - 1 : -1;
    const rows = (store.get(table) ?? []) as T[];
    if (col && pidx >= 0) {
      const val = this.params[pidx];
      return rows.find((r) => (r as Record<string, unknown>)[col] === val) ?? null;
    }
    return rows[0] ?? null;
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean }> {
    const store = getStore();
    const m = this.sql.match(/SELECT.*FROM\s+(\w+)(?:\s+WHERE\s+(\w+)\s*=\s*\?(\d+))?(?:\s+ORDER\s+BY\s+(\w+)\s+(ASC|DESC))?(?:\s+LIMIT\s+(\d+))?/i);
    if (!m) return { results: [], success: true };
    const table = m[1];
    const col = m[2];
    const pidx = m[3] ? Number(m[3]) - 1 : -1;
    const orderCol = m[4];
    const orderDir = m[5]?.toUpperCase() === "DESC" ? -1 : 1;
    const limit = m[6] ? Number(m[6]) : undefined;
    let rows = (store.get(table) ?? []) as T[];
    if (col && pidx >= 0) {
      const val = this.params[pidx];
      rows = rows.filter((r) => (r as Record<string, unknown>)[col] === val);
    }
    if (orderCol) {
      rows = [...rows].sort((a, b) => {
        const va = (a as Record<string, unknown>)[orderCol] as string;
        const vb = (b as Record<string, unknown>)[orderCol] as string;
        return va < vb ? -orderDir : va > vb ? orderDir : 0;
      });
    }
    if (limit) rows = rows.slice(0, limit);
    return { results: rows, success: true };
  }

  async run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
    const store = getStore();
    const sql = this.sql.toUpperCase();

    // INSERT
    const insertMatch = this.sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertMatch) {
      const table = insertMatch[1];
      const cols = insertMatch[2].split(",").map((c) => c.trim());
      const valPlaceholders = insertMatch[3].split(",").map((v) => v.trim());
      const row: Record<string, unknown> = {};
      cols.forEach((col, i) => {
        if (valPlaceholders[i].startsWith("?")) {
          const pidx = Number(valPlaceholders[i].slice(1)) - 1;
          row[col] = this.params[pidx];
        } else {
          row[col] = valPlaceholders[i].replace(/'/g, "");
        }
      });
      const rows = (store.get(table) ?? []) as Record<string, unknown>[];
      rows.push(row);
      store.set(table, rows);
      return { success: true, meta: { changes: 1, last_row_id: rows.length } };
    }

    // UPDATE
    const updateMatch = this.sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(\w+)\s*=\s*\?(\d+)/i);
    if (updateMatch) {
      const table = updateMatch[1];
      const setClauses = updateMatch[2];
      const whereCol = updateMatch[3];
      const whereIdx = Number(updateMatch[4]) - 1;
      const whereVal = this.params[whereIdx];
      const rows = (store.get(table) ?? []) as Record<string, unknown>[];
      let changes = 0;
      for (const row of rows) {
        if (row[whereCol] === whereVal) {
          const sets = setClauses.split(",").map((s) => s.trim());
          for (const set of sets) {
            const [col, expr] = set.split("=");
            if (expr.trim().startsWith("?")) {
              const pidx = Number(expr.trim().slice(1)) - 1;
              row[col.trim()] = this.params[pidx];
            } else {
              row[col.trim()] = expr.trim().replace(/'/g, "");
            }
          }
          changes++;
        }
      }
      store.set(table, rows);
      return { success: true, meta: { changes, last_row_id: 0 } };
    }

    // CREATE TABLE / CREATE INDEX — no-op in memory
    if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
      return { success: true, meta: { changes: 0, last_row_id: 0 } };
    }

    return { success: true, meta: { changes: 0, last_row_id: 0 } };
  }
}

export function createMemDB(): D1Database {
  const shim: Record<string, unknown> = {
    prepare(sql: string) {
      return new MemPrepared(sql) as unknown as D1PreparedStatement;
    },
    batch() {
      return Promise.resolve([]);
    },
    exec() {
      return Promise.resolve({ count: 0, duration: 0, success: true as const, meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, changed_db: false, changes: 0, last_row_id: 0 } });
    },
    withSession() {
      return Promise.resolve({ raw: [], session: null });
    },
    dump() {
      return Promise.resolve(new ReadableStream());
    },
  };
  return shim as unknown as D1Database;
}
