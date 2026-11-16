import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { getEnv } from "./env.js";

// ---------------------------------------------------------------------------
// KlikQRIS — semua kredensial hanya dari getEnv() (process.env saat Node,
// secrets Worker saat Cloudflare — lihat server/env.ts). Tanpa kredensial,
// createQris melempar Error "KlikQRIS belum dikonfigurasi" (jangan pernah
// membuat QRIS palsu).
// ---------------------------------------------------------------------------

function creds(): { apiKey: string; merchantId: string; webhookSecret: string } {
  const env = getEnv();
  return {
    apiKey: env.klikqrisApiKey,
    merchantId: env.klikqrisMerchantId,
    webhookSecret: env.klikqrisWebhookSecret
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

/** Benar bila nilainya menunjuk berkas gambar (data URI atau URL berekstensi gambar). */
function isImageHref(v: string | null): boolean {
  if (!v) return false;
  if (v.startsWith("data:image/")) return true;
  try {
    const u = new URL(v, "https://contoh.id");
    return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Base64/data-URI gambar QR -> data URI siap pakai di <img>; null bila bukan gambar. */
function normalizeQrImage(v: string | null): string | null {
  if (!v) return null;
  const t = v.trim().replace(/\s+/g, "");
  if (!t) return null;
  if (t.startsWith("data:image/")) return t;
  if (/^[A-Za-z0-9+/=]{100,}$/.test(t)) return `data:image/png;base64,${t}`;
  return null;
}

/** String payload QRIS (EMVCo) selalu diawali 000201. */
function isQrPayload(v: string | null): v is string {
  return !!v && v.startsWith("000201");
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
  // Bentuk respons KlikQRIS berubah-ubah; yang disimpan sebagai qris_url
  // HARUS berupa sumber gambar (<img>), bukan URL halaman bayar:
  //  1) qris_image (base64/data URI) — gambar QR langsung dari API.
  //  2) string payload QRIS (000201...) — gambar dibuat sendiri dari
  //     payload (QRCode.toString svg; cara yang sama sudah dipakai
  //     untuk QR TOTP di Worker). Isi QR-nya identik dengan payload.
  //  3) URL yang memang menunjuk berkas gambar (berekstensi .png/dll).
  // URL halaman bayar (tanpa ekstensi gambar) disimpan sebagai
  // direct_url, supaya tombol "Lanjutkan bayar" tetap jalan.
  // (Sebelumnya: qris_url diambil mentah-mentah, sehingga URL halaman
  // bayar tersimpan sebagai "gambar" — isImageUrl di checkout menolaknya
  // dan gambar QR tidak pernah tampil.)
  let qris_url = normalizeQrImage(
    pickString(data, [
      "qris_image",
      "qr_image",
      "qris_image_base64",
      "qr_image_base64",
      "image_base64",
      "image"
    ])
  );
  if (!qris_url) {
    const payload = pickString(data, ["qr_string", "qris_string", "qris", "qr_content", "payload"]);
    if (isQrPayload(payload)) {
      try {
        const svg = await QRCode.toString(payload, { type: "svg" });
        qris_url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      } catch (err) {
        console.error("[klikqris] gagal membuat gambar QR dari payload:", err);
      }
    }
  }
  if (!qris_url) {
    const imgUrl = pickString(data, ["qris_url", "qr_url", "qr_image_url", "image_url", "qris_image"]);
    if (isImageHref(imgUrl)) qris_url = imgUrl;
  }
  const pageUrl =
    pickString(data, ["direct_url", "payment_url", "checkout_url", "url"]) ??
    pickString(data, ["qris_url", "qr_url"]);
  const direct_url = pageUrl && !isImageHref(pageUrl) ? pageUrl : null;
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
