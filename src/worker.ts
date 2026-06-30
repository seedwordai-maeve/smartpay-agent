import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { invoices, auditList } from "./routes/invoices";
import { wallet } from "./routes/wallet";
import { HttpError } from "./lib/errors";
import type { ProblemDetails } from "./types";

const app = new Hono<{ Bindings: Env }>();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use("*", logger());
app.use("*", cors({
  origin: [
    "http://localhost:4321",
    "http://localhost:8788",
    "https://smartpay-demo.pages.dev",
    "https://*.smartpay-demo.pages.dev",
  ],
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// ── Health ─────────────────────────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "smartpay-api",
    network: c.env.XRPL_NETWORK,
    xrpl_wss: c.env.XRPL_WSS,
    timestamp: new Date().toISOString(),
  }),
);

// ── API v1 ─────────────────────────────────────────────────────────────────
app.route("/v1/invoices", invoices);
app.route("/v1/wallet", wallet);

// Audit endpoint (uses the shared handler exported from invoices module)
app.get("/v1/audit", (c) => auditList(c));

// ── Error handling ─────────────────────────────────────────────────────────
app.onError((err, c) => {
  if (err instanceof HttpError) {
    const problem: ProblemDetails = {
      ...err.problem,
      instance: err.problem.instance ?? new URL(c.req.url).pathname,
    };
    return c.json(problem, err.status as ContentfulStatusCode);
  }
  console.error("unhandled error:", err);
  return c.json(
    {
      type: "https://smartpay/errors/internal",
      title: "Internal server error",
      status: 500,
      detail: err.message,
      instance: new URL(c.req.url).pathname,
    },
    500,
  );
});

// ── 404 ────────────────────────────────────────────────────────────────────
app.notFound((c) =>
  c.json(
    {
      type: "https://smartpay/errors/not_found",
      title: "Not found",
      status: 404,
      detail: `${c.req.method} ${new URL(c.req.url).pathname} is not a valid endpoint`,
    },
    { status: 404 },
  ),
);

export default app;
