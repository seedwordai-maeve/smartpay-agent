import type { InvoiceStatus } from "../types";
import { nowIso } from "./util";

export interface InvoiceRow {
  id: string;
  status: string;
  submitter: string;
  raw_r2_key: string | null;
  raw_text: string | null;
  extracted_json: string | null;
  validation_json: string | null;
  tx_hash: string | null;
  tx_sequence: number | null;
  ledger_index: number | null;
  xrpl_code: string | null;
  approver: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditRow {
  id: number;
  invoice_id: string;
  event: string;
  payload_json: string | null;
  actor: string | null;
  created_at: string;
}

/** Thin repository over D1 — keeps all SQL in one place. */
export const db = {
  async createInvoice(
    conn: D1Database,
    input: {
      id: string;
      submitter: string;
      raw_r2_key: string | null;
      raw_text: string | null;
    },
  ): Promise<InvoiceRow> {
    const now = nowIso();
    await conn
      .prepare(
        `INSERT INTO invoices (id, status, submitter, raw_r2_key, raw_text, created_at, updated_at)
         VALUES (?1, 'pending_extract', ?2, ?3, ?4, ?5, ?6)`,
      )
      .bind(input.id, input.submitter, input.raw_r2_key, input.raw_text, now, now)
      .run();
    return this.getInvoice(conn, input.id) as Promise<InvoiceRow>;
  },

  async getInvoice(conn: D1Database, id: string): Promise<InvoiceRow | null> {
    return conn.prepare("SELECT * FROM invoices WHERE id = ?1").bind(id).first<InvoiceRow>();
  },

  async setStatus(
    conn: D1Database,
    id: string,
    status: InvoiceStatus,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const cols = Object.keys(extra);
    const sets = ["status = ?2", "updated_at = ?3", ...cols.map((c, i) => `${c} = ?${i + 4}`)].join(", ");
    const values = [id, status, nowIso(), ...Object.values(extra)];
    await conn.prepare(`UPDATE invoices SET ${sets} WHERE id = ?1`).bind(...values).run();
  },

  async appendAudit(
    conn: D1Database,
    input: {
      invoice_id: string;
      event: string;
      payload?: unknown;
      actor?: string;
    },
  ): Promise<void> {
    await conn
      .prepare(
        `INSERT INTO audit_log (invoice_id, event, payload_json, actor, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(
        input.invoice_id,
        input.event,
        input.payload ? JSON.stringify(input.payload) : null,
        input.actor ?? "system",
        nowIso(),
      )
      .run();
  },

  async listAudit(conn: D1Database, invoiceId: string): Promise<AuditRow[]> {
    const res = await conn
      .prepare("SELECT * FROM audit_log WHERE invoice_id = ?1 ORDER BY id ASC")
      .bind(invoiceId)
      .all<AuditRow>();
    return res.results ?? [];
  },

  async listInvoices(conn: D1Database, limit = 50, cursor?: string): Promise<{ items: InvoiceRow[]; next_cursor: string | null }> {
    let stmt;
    if (cursor) {
      stmt = conn
        .prepare("SELECT * FROM invoices WHERE created_at < ?1 ORDER BY created_at DESC LIMIT ?2")
        .bind(cursor, limit);
    } else {
      stmt = conn.prepare("SELECT * FROM invoices ORDER BY created_at DESC LIMIT ?1").bind(limit);
    }
    const res = await stmt.all<InvoiceRow>();
    const items = res.results ?? [];
    const next_cursor = items.length === limit ? items[items.length - 1].created_at : null;
    return { items, next_cursor };
  },
};
