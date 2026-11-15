import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// KlikQRIS — semua kredensial hanya dari process.env. Tanpa kredensial,
// createQris melempar Error "KlikQRIS belum dikonfigurasi" (jangan pernah
// membuat QRIS palsu).
// ---------------------------------------------------------------------------

function creds(): { apiKey: string; merchantId: string; webhookSecret: string } {
  return {
    apiKey: process.env.KLIKQRIS_API_KEY ?? "",
    merchantId: process.env.KLIKQRIS_MERCHANT_ID ?? "",
    webhookSecret: process.env.KLIKQRIS_WEBHOOK_SECRET ?? ""
  };
}

export interface QrisResult {
  qris_url: string | null;
  direct_url: string | null;
  total_amount: number | null;
  expired_at: string | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v);
  }
  return null;
}

export async function createQris(
  orderId: string,
  amount: number,
  keterangan: string
): Promise<QrisResult> {
  const { apiKey, merchantId } = creds();
  if (!apiKey || !merchantId) {
    throw new Error("KlikQRIS belum dikonfigurasi");
  }
  const res = await fetch("https://klikqris.com/api/qrisv2/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      id_merchant: merchantId
    },
    body: JSON.stringify({ order_id: orderId, id_merchant: merchantId, amount, keterangan })
  });
  const json: unknown = await res.json().catch(() => null);
  const root = asRecord(json);
  const data = asRecord(root.data ?? root);
  if (!res.ok) {
    const msg = pickString(data, ["message", "error"]) ?? pickString(root, ["message", "error"]);
    throw new Error(msg ? `KlikQRIS gagal: ${msg}` : `KlikQRIS gagal (HTTP ${res.status})`);
  }
  const qris_url = pickString(data, ["qris_url", "qr_url", "qris", "qr_image_url", "image_url"]);
  const direct_url = pickString(data, ["direct_url", "payment_url", "checkout_url", "url"]);
  if (!qris_url && !direct_url) {
    throw new Error("KlikQRIS tidak mengembalikan kode QR");
  }
  return {
    qris_url,
    direct_url,
    total_amount: pickNumber(data, ["total_amount", "amount"]) ?? amount,
    expired_at: pickString(data, ["expired_at", "expired", "expiry", "expires_at"])
  };
}

/** Mengembalikan status KlikQRIS apa adanya (mis. "PAID", "PENDING", "EXPIRED"). */
export async function checkQrisStatus(orderId: string): Promise<string> {
  const { apiKey, merchantId } = creds();
  if (!apiKey || !merchantId) {
    throw new Error("KlikQRIS belum dikonfigurasi");
  }
  const url = `https://klikqris.com/api/qrisv2/status/${encodeURIComponent(merchantId)}/${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": apiKey, id_merchant: merchantId }
  });
  const json: unknown = await res.json().catch(() => null);
  const root = asRecord(json);
  const data = asRecord(root.data ?? root);
  if (!res.ok) {
    const msg = pickString(data, ["message", "error"]) ?? pickString(root, ["message", "error"]);
    throw new Error(msg ? `KlikQRIS gagal: ${msg}` : `KlikQRIS gagal (HTTP ${res.status})`);
  }
  const status = pickString(data, ["status", "payment_status", "state"]);
  if (!status) throw new Error("Status pembayaran tidak ditemukan.");
  return status.toUpperCase();
}

/**
 * HMAC-SHA256 hex dari JSON.stringify(payload) dengan
 * KLIKQRIS_WEBHOOK_SECRET, dibandingkan secara aman (timingSafeEqual).
 * Mengembalikan false bila secret kosong atau signature tidak cocok.
 */
export function verifyWebhookSignature(
  payload: unknown,
  signature: string | null | undefined
): boolean {
  const { webhookSecret } = creds();
  if (!webhookSecret || !signature) return false;
  const expected = createHmac("sha256", webhookSecret)
    .update(JSON.stringify(payload))
    .digest("hex");
  const a = Buffer.from(expected.toLowerCase(), "utf8");
  const b = Buffer.from(signature.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
