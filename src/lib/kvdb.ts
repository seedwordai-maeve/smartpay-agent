import type { InvoiceRow } from "./db";

class KvPrepared {
  private kv: KVNamespace;
  private sql: string;
  private params: unknown[] = [];

  constructor(kv: KVNamespace, sql: string) {
    this.kv = kv;
    this.sql = sql;
  }

  bind(...values: unknown[]): KvPrepared {
    this.params = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    if (this.sql.includes("FROM invoices WHERE id =")) {
      const id = this.params[0] as string;
      let data = await this.kv.get(`inv:${id}`, { type: "json" });
      if (!data) {
        // Eventual consistency safety: retry once after 250ms on 404
        await new Promise((r) => setTimeout(r, 250));
        data = await this.kv.get(`inv:${id}`, { type: "json" });
      }
      return (data as T) || null;
    }
    return null;
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean }> {
    if (this.sql.includes("FROM audit_log")) {
      const invoice_id = this.params[0] as string;
      const logs = (await this.kv.get<any[]>(`audit:${invoice_id}`, { type: "json" })) || [];
      return { results: logs as T[], success: true };
    }

    if (this.sql.includes("FROM invoices")) {
      let limit = 50;
      let cursor: string | undefined;

      if (this.sql.includes("WHERE created_at <")) {
        cursor = this.params[0] as string;
        limit = this.params[1] as number;
      } else {
        limit = this.params[0] as number;
      }

      const index = (await this.kv.get<string[]>("invoices:by_time", { type: "json" })) || [];
      const results: any[] = [];
      for (const id of index) {
        const inv = await this.kv.get<any>(`inv:${id}`, { type: "json" });
        if (inv) {
          if (cursor && inv.created_at >= cursor) continue;
          results.push(inv);
          if (results.length >= limit) break;
        }
      }
      return { results: results as T[], success: true };
    }

    return { results: [], success: true };
  }

  async run(): Promise<{ success: boolean; meta: any }> {
    const sqlUpper = this.sql.toUpperCase();

    // INSERT INTO invoices
    const insertInvMatch = this.sql.match(/INSERT\s+INTO\s+invoices\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertInvMatch) {
      const cols = insertInvMatch[1].split(",").map((c) => c.trim());
      const valPlaceholders = insertInvMatch[2].split(",").map((v) => v.trim());
      const row: any = {
        extracted_json: null,
        validation_json: null,
        tx_hash: null,
        tx_sequence: null,
        ledger_index: null,
        xrpl_code: null,
        approver: null,
        reject_reason: null,
      };
      
      cols.forEach((col, i) => {
        if (valPlaceholders[i].startsWith("?")) {
          const pidx = Number(valPlaceholders[i].slice(1)) - 1;
          row[col] = this.params[pidx];
        } else {
          row[col] = valPlaceholders[i].replace(/'/g, "");
        }
      });

      await this.kv.put(`inv:${row.id}`, JSON.stringify(row));

      let index = (await this.kv.get<string[]>("invoices:by_time", { type: "json" })) || [];
      index.unshift(row.id);
      if (index.length > 200) index = index.slice(0, 200);
      await this.kv.put("invoices:by_time", JSON.stringify(index));

      return { success: true, meta: { changes: 1, last_row_id: 1 } };
    }

    // UPDATE invoices
    const updateMatch = this.sql.match(/UPDATE\s+invoices\s+SET\s+(.+?)\s+WHERE\s+id\s*=\s*\?1/i);
    if (updateMatch) {
      const id = this.params[0] as string;
      const setClauses = updateMatch[1];
      
      // Note: read-modify-write race condition here, acceptable for single-user demo.
      const row = await this.kv.get<any>(`inv:${id}`, { type: "json" });
      if (!row) return { success: true, meta: { changes: 0, last_row_id: 0 } };

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

      await this.kv.put(`inv:${id}`, JSON.stringify(row));
      return { success: true, meta: { changes: 1, last_row_id: 0 } };
    }

    // INSERT INTO audit_log
    const insertAuditMatch = this.sql.match(/INSERT\s+INTO\s+audit_log\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (insertAuditMatch) {
      const cols = insertAuditMatch[1].split(",").map((c) => c.trim());
      const valPlaceholders = insertAuditMatch[2].split(",").map((v) => v.trim());
      const row: any = {};
      
      cols.forEach((col, i) => {
        if (valPlaceholders[i].startsWith("?")) {
          const pidx = Number(valPlaceholders[i].slice(1)) - 1;
          row[col] = this.params[pidx];
        } else {
          row[col] = valPlaceholders[i].replace(/'/g, "");
        }
      });

      const invoice_id = row.invoice_id;
      const logs = (await this.kv.get<any[]>(`audit:${invoice_id}`, { type: "json" })) || [];
      row.id = logs.length > 0 ? logs[logs.length - 1].id + 1 : 1;
      logs.push(row);
      await this.kv.put(`audit:${invoice_id}`, JSON.stringify(logs));

      return { success: true, meta: { changes: 1, last_row_id: row.id } };
    }

    return { success: true, meta: { changes: 0, last_row_id: 0 } };
  }
}

export function createKvDB(kv: KVNamespace): D1Database {
  const shim: Record<string, unknown> = {
    prepare(sql: string) {
      return new KvPrepared(kv, sql) as unknown as D1PreparedStatement;
    },
    batch() {
      return Promise.resolve([]);
    },
    exec() {
      return Promise.resolve({
        count: 0,
        duration: 0,
        success: true as const,
        meta: { duration: 0, size_after: 0, rows_read: 0, rows_written: 0, changed_db: false, changes: 0, last_row_id: 0 },
      });
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
