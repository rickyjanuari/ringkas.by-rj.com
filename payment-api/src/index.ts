import { Hono, type Context } from "hono";
import { Client } from "pg";

type Bindings = {
  HYPERDRIVE: { connectionString: string };
  SUMOPOD_API_URL: string;
  PAYMENT_ENVIRONMENT: "live" | "sandbox";
  SUMOPOD_API_KEY: string;
  SUMOPOD_WEBHOOK_SECRET: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

type AppKey = { application_id: string; allowed_origins: string[] };
type PaymentOrder = {
  id: string;
  application_id: string;
  external_reference: string;
  amount: string;
  currency: string;
  environment: "live" | "sandbox";
  status: string;
  provider_transaction_id: string | null;
  provider_order_id: string | null;
  payment_link_url: string | null;
  provider_fee: string | null;
  provider_net_amount: string | null;
  expires_at: string | null;
  paid_at: string | null;
};

type CreatePaymentInput = {
  order_id: string;
  amount: number;
  currency?: "IDR";
  expires_in_hours?: number;
  success_return_url?: string;
  cancel_return_url?: string;
  payment_method_type_code?: "QRIS";
  customer_email?: string;
  customer_name?: string;
  metadata?: Record<string, unknown>;
};

type SumoPodPayment = {
  payment_id: string;
  order_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  payment_link_url: string;
  status: string;
  expires_at: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", async (c, next) => {
  const length = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(length) && length > 64 * 1024) {
    return c.json({ error: "Request body is too large" }, 413);
  }
  await next();
});

app.use("/v1/*", async (c, next) => {
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  const origin = c.req.header("origin");
  if (origin) c.header("Vary", "Origin");
  await next();
});

app.get("/health", (c) => c.json({ ok: true, environment: c.env.PAYMENT_ENVIRONMENT }));

app.post("/v1/payments", async (c) => {
  const input = await readJson<CreatePaymentInput>(c);
  if (!input || !isValidCreateInput(input)) {
    return c.json({ error: "Invalid payment request" }, 400);
  }

  const apiKey = c.req.header("x-api-key");
  if (!apiKey) return c.json({ error: "Missing X-Api-Key" }, 401);
  const appKey = await authenticate(c.env, apiKey);
  if (!appKey) return c.json({ error: "Invalid API key" }, 401);
  if (!setCors(c, appKey.allowed_origins)) return c.json({ error: "Origin is not allowed" }, 403);

  const idempotencyKey = c.req.header("idempotency-key");
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return c.json({ error: "Idempotency-Key is required" }, 400);
  }

  const order = await createPayment(c.env, appKey.application_id, input, idempotencyKey);
  return c.json(toResponse(order), order.status === "failed" ? 502 : 201);
});

app.get("/v1/payments/:id", async (c) => {
  const apiKey = c.req.header("x-api-key");
  if (!apiKey) return c.json({ error: "Missing X-Api-Key" }, 401);
  const appKey = await authenticate(c.env, apiKey);
  if (!appKey) return c.json({ error: "Invalid API key" }, 401);
  if (!setCors(c, appKey.allowed_origins)) return c.json({ error: "Origin is not allowed" }, 403);

  const db = await connect(c.env);
  try {
    const result = await db.query<PaymentOrder>(
      `select id, application_id, external_reference, amount, currency, status,
              environment, provider_transaction_id, provider_order_id, payment_link_url,
              provider_fee, provider_net_amount, expires_at, paid_at
       from core.payment_orders where id = $1 and application_id = $2`,
      [c.req.param("id"), appKey.application_id],
    );
    if (!result.rowCount) return c.json({ error: "Payment not found" }, 404);
    return c.json(toResponse(result.rows[0]));
  } finally {
    await db.end();
  }
});

app.post("/v1/webhooks/sumopod", async (c) => {
  if (!c.env.SUMOPOD_WEBHOOK_SECRET) {
    return c.json({ error: "Webhook signing secret is not configured" }, 503);
  }
  const rawBody = await c.req.text();
  const svixId = c.req.header("svix-id");
  const svixTimestamp = c.req.header("svix-timestamp");
  const svixSignature = c.req.header("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature || !await verifySvix(c.env.SUMOPOD_WEBHOOK_SECRET, svixId, svixTimestamp, svixSignature, rawBody)) {
    return c.json({ error: "Invalid webhook signature" }, 401);
  }

  let event: { event_type?: string; data?: Record<string, unknown> };
  try { event = JSON.parse(rawBody); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  if (!event.event_type) return c.json({ error: "Invalid webhook payload" }, 400);
  // SumoPod's dashboard test event intentionally has no payment/order data.
  // It is only a connectivity check, so a signature-verified 2xx is enough.
  if (event.event_type === "payment.test") return c.json({ received: true, test: true }, 200);
  const providerOrderId = typeof event.data?.order_id === "string" ? event.data.order_id : null;
  if (!providerOrderId) return c.json({ error: "Invalid webhook payload" }, 400);

  const db = await connect(c.env);
  try {
    await db.query("begin");
    const orderResult = await db.query<Pick<PaymentOrder, "id" | "application_id">>(
      "select id, application_id from core.payment_orders where provider_order_id = $1 for update",
      [providerOrderId],
    );
    if (!orderResult.rowCount) {
      await db.query("rollback");
      return c.json({ received: true, ignored: "unknown_order" }, 200);
    }
    const order = orderResult.rows[0];
    const eventResult = await db.query(
      `insert into core.payment_events
       (payment_order_id, application_id, provider, provider_event_id, event_type, payload, signature_valid, processing_status)
       values ($1, $2, 'sumopod', $3, $4, $5::jsonb, true, 'received')
       on conflict (provider, provider_event_id) do nothing
       returning id`,
      [order.id, order.application_id, svixId, event.event_type, rawBody],
    );
    if (eventResult.rowCount) {
      const data = event.data ?? {};
      const status = statusFromEvent(event.event_type);
      await db.query(
        `update core.payment_orders
         set status = $1, paid_at = coalesce($2::timestamptz, paid_at), updated_at = now()
         where id = $3`,
        [status, typeof data.paid_at === "string" ? data.paid_at : null, order.id],
      );
      await db.query(
        "update core.payment_events set processing_status = 'processed', processed_at = now() where id = $1",
        [eventResult.rows[0].id],
      );
    }
    await db.query("commit");
    return c.json({ received: true }, 200);
  } catch (error) {
    await db.query("rollback");
    console.error("sumopod webhook processing failed", error);
    await sendTelegram(c.env, `⚠️ Payment webhook gagal diproses (${c.env.PAYMENT_ENVIRONMENT}). Periksa log API payment.`);
    return c.json({ error: "Webhook processing failed" }, 500);
  } finally {
    await db.end();
  }
});

async function createPayment(env: Bindings, applicationId: string, input: CreatePaymentInput, idempotencyKey: string): Promise<PaymentOrder> {
  const db = await connect(env);
  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtext($1))", [`${applicationId}:${idempotencyKey}`]);
    const existing = await db.query<PaymentOrder>(
      `select id, application_id, external_reference, amount, currency, environment, status,
              provider_transaction_id, provider_order_id, payment_link_url,
              provider_fee, provider_net_amount, expires_at, paid_at
       from core.payment_orders where application_id = $1 and idempotency_key = $2`,
      [applicationId, idempotencyKey],
    );
    if (existing.rowCount) {
      await db.query("commit");
      return existing.rows[0];
    }

    const providerOrderId = `RJ-${applicationId.toUpperCase()}-${crypto.randomUUID()}`;
    const sumo = await requestSumoPod(env, providerOrderId, input);
    const status = sumo.status === "pending" ? "pending" : "failed";
    const inserted = await db.query<PaymentOrder>(
      `insert into core.payment_orders
       (application_id, external_reference, customer_email, customer_name, currency, amount, status,
        payment_provider, provider_transaction_id, provider_order_id, idempotency_key, payment_link_url,
        provider_fee, provider_net_amount, metadata, expires_at, environment)
       values ($1, $2, $3, $4, $5, $6, $7, 'sumopod', $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16)
       returning id, application_id, external_reference, amount, currency, environment, status, provider_transaction_id,
                 provider_order_id, payment_link_url, provider_fee, provider_net_amount, expires_at, paid_at`,
      [applicationId, input.order_id, input.customer_email ?? null, input.customer_name ?? null, input.currency ?? "IDR", input.amount, status, sumo.payment_id, providerOrderId, idempotencyKey, sumo.payment_link_url, sumo.fee, sumo.net_amount, JSON.stringify(input.metadata ?? {}), sumo.expires_at, env.PAYMENT_ENVIRONMENT],
    );
    await db.query("commit");
    return inserted.rows[0];
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

async function requestSumoPod(env: Bindings, orderId: string, input: CreatePaymentInput): Promise<SumoPodPayment> {
  const response = await fetch(`${env.SUMOPOD_API_URL}/api/v1/payments`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.SUMOPOD_API_KEY },
    body: JSON.stringify({ ...input, order_id: orderId, currency: input.currency ?? "IDR", payment_method_type_code: input.payment_method_type_code ?? "QRIS" }),
  });
  if (!response.ok) throw new Error(`SumoPod returned ${response.status}`);
  return await response.json() as SumoPodPayment;
}

async function authenticate(env: Bindings, apiKey: string): Promise<AppKey | null> {
  const db = await connect(env);
  try {
    const hash = await sha256(apiKey);
    const result = await db.query<AppKey>(
      `select key.application_id, app.allowed_origins
       from core.application_api_keys key join core.applications app on app.id = key.application_id
       where key.key_hash = $1 and key.active and app.active
         and (key.expires_at is null or key.expires_at > now())`, [hash],
    );
    if (!result.rowCount) return null;
    await db.query("update core.application_api_keys set last_used_at = now() where key_hash = $1", [hash]);
    return result.rows[0];
  } finally { await db.end(); }
}

async function connect(env: Bindings) {
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
    connectionTimeoutMillis: 7_000,
    query_timeout: 7_000,
  });
  await client.connect();
  return client;
}

async function monitorPayments(env: Bindings) {
  const db = await connect(env);
  try {
    const result = await db.query<{ stale_pending: string; failed_webhooks: string }>(
      `select
         count(*) filter (where status = 'pending' and created_at < now() - interval '30 minutes') as stale_pending,
         (select count(*) from core.payment_events
          where processing_status = 'failed' and received_at > now() - interval '24 hours') as failed_webhooks
       from core.payment_orders
       where environment = $1`,
      [env.PAYMENT_ENVIRONMENT],
    );
    const { stale_pending, failed_webhooks } = result.rows[0];
    const fingerprint = `${stale_pending}:${failed_webhooks}`;
    const previous = await db.query<{ last_fingerprint: string | null; last_alert_at: string | null }>(
      "select last_fingerprint, last_alert_at from core.payment_monitor_state where environment = $1",
      [env.PAYMENT_ENVIRONMENT],
    );
    const last = previous.rows[0];
    const shouldAlert = (Number(stale_pending) || Number(failed_webhooks))
      && (!last || last.last_fingerprint !== fingerprint || !last.last_alert_at
        || Date.now() - new Date(last.last_alert_at).getTime() >= 6 * 60 * 60 * 1000);
    if (shouldAlert) {
      await sendTelegram(
        env,
        `⚠️ Payment monitor ${env.PAYMENT_ENVIRONMENT}\nPending >30m: ${stale_pending}\nWebhook gagal (24 jam): ${failed_webhooks}`,
      );
    }
    await db.query(
      `insert into core.payment_monitor_state (environment, last_fingerprint, last_alert_at, updated_at)
       values ($1, $2, case when $3 then now() else null end, now())
       on conflict (environment) do update set
         last_fingerprint = excluded.last_fingerprint,
         last_alert_at = case when $3 then now() else core.payment_monitor_state.last_alert_at end,
         updated_at = now()`,
      [env.PAYMENT_ENVIRONMENT, fingerprint, shouldAlert],
    );
  } catch (error) {
    console.error("payment monitoring failed", error);
    await sendTelegram(env, `⚠️ Payment monitor gagal berjalan (${env.PAYMENT_ENVIRONMENT}). Periksa log API payment.`);
  } finally {
    await db.end();
  }
}

async function sendTelegram(env: Bindings, text: string) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!response.ok) console.error("telegram alert failed", response.status);
  } catch (error) {
    console.error("telegram alert failed", error);
  }
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function verifySvix(secret: string, id: string, timestamp: string, signature: string, rawBody: string) {
  const unix = Number(timestamp);
  if (!Number.isInteger(unix) || Math.abs(Date.now() / 1000 - unix) > 300) return false;
  const key = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), char => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)));
  const expected = btoa(String.fromCharCode(...bytes));
  return signature.split(" ").some(part => part.startsWith("v1,") && constantTimeEquals(part.slice(3), expected));
}

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function statusFromEvent(eventType: string) {
  if (eventType === "payment.completed") return "paid";
  if (eventType === "payment.expired") return "expired";
  if (eventType === "payment.failed") return "failed";
  return "pending";
}

function isValidCreateInput(input: CreatePaymentInput) {
  return typeof input.order_id === "string" && input.order_id.length > 0 && input.order_id.length <= 128
    && Number.isSafeInteger(input.amount) && input.amount > 0
    && (input.expires_in_hours === undefined || (Number.isInteger(input.expires_in_hours) && input.expires_in_hours > 0 && input.expires_in_hours <= 24));
}

async function readJson<T>(c: Context<{ Bindings: Bindings }>): Promise<T | null> {
  try { return await c.req.json<T>(); } catch { return null; }
}

function setCors(c: Context<{ Bindings: Bindings }>, allowedOrigins: string[]) {
  const origin = c.req.header("origin");
  if (!origin) return true;
  if (!allowedOrigins.includes(origin)) return false;
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, Idempotency-Key");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return true;
}

function toResponse(order: PaymentOrder) {
  return {
    payment_id: order.id,
    order_id: order.external_reference,
    environment: order.environment,
    amount: Number(order.amount),
    currency: order.currency,
    fee: order.provider_fee === null ? null : Number(order.provider_fee),
    net_amount: order.provider_net_amount === null ? null : Number(order.provider_net_amount),
    payment_link_url: order.payment_link_url,
    status: order.status,
    expires_at: order.expires_at,
    paid_at: order.paid_at,
  };
}

export default {
  fetch: app.fetch,
  scheduled(_event: unknown, env: Bindings, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    ctx.waitUntil(monitorPayments(env));
  },
};
