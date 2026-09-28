import { describe, it, expect, beforeEach } from "vitest";
import { createKvDB } from "../src/lib/kvdb";
import { db } from "../src/lib/db";

class MockKV {
  private store = new Map<string, string>();
  
  async get(key: string, options?: any) {
    const val = this.store.get(key);
    if (!val) return null;
    if (options?.type === "json") return JSON.parse(val);
    return val;
  }
  
  async put(key: string, value: string, options?: any) {
    this.store.set(key, value);
  }
  
  async delete(key: string) {
    this.store.delete(key);
  }
}

describe("kvdb", () => {
  let kv: any;
  let conn: any;

  beforeEach(() => {
    kv = new MockKV();
    conn = createKvDB(kv);
  });

  it("should create and get an invoice", async () => {
    const inv = await db.createInvoice(conn, {
      id: "inv_123",
      submitter: "alice",
      raw_r2_key: null,
      raw_text: "test",
    });
    expect(inv.id).toBe("inv_123");
    expect(inv.status).toBe("pending_extract");
    
    const fetched = await db.getInvoice(conn, "inv_123");
    expect(fetched?.submitter).toBe("alice");
  });

  it("should set status", async () => {
    await db.createInvoice(conn, {
      id: "inv_123",
      submitter: "alice",
      raw_r2_key: null,
      raw_text: "test",
    });
    await db.setStatus(conn, "inv_123", "approved", { approver: "bob" });
    const fetched = await db.getInvoice(conn, "inv_123");
    expect(fetched?.status).toBe("approved");
    expect(fetched?.approver).toBe("bob");
  });

  it("should append and list audit logs", async () => {
    await db.appendAudit(conn, { invoice_id: "inv_123", event: "test_event", actor: "system" });
    await db.appendAudit(conn, { invoice_id: "inv_123", event: "test_event_2", actor: "bob" });
    
    const logs = await db.listAudit(conn, "inv_123");
    expect(logs.length).toBe(2);
    expect(logs[0].event).toBe("test_event");
    expect(logs[1].event).toBe("test_event_2");
    expect(logs[0].id).toBe(1);
    expect(logs[1].id).toBe(2);
  });

  it("should list invoices and respect limit", async () => {
    await db.createInvoice(conn, { id: "inv_1", submitter: "a", raw_r2_key: null, raw_text: "t" });
    await new Promise((r) => setTimeout(r, 10)); // Ensure distinct timestamps
    await db.createInvoice(conn, { id: "inv_2", submitter: "b", raw_r2_key: null, raw_text: "t" });
    
    const list = await db.listInvoices(conn, 1);
    expect(list.items.length).toBe(1);
    expect(list.items[0].id).toBe("inv_2"); // newest first
    
    const list2 = await db.listInvoices(conn, 10, list.items[0].created_at);
    expect(list2.items.length).toBe(1);
    expect(list2.items[0].id).toBe("inv_1");
  });
});
