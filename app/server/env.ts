// env.ts — akses kredensial/nilai konfigurasi dari SATU tempat.
//
// Lokal (Node): dibaca dari process.env saat modul dimuat. Nilai dari
// berkas .env TIDAK otomatis terbaca — export manual di shell, atau
// jalankan lewat `wrangler dev` yang membaca .dev.vars (lihat README).
// Worker (Cloudflare): process tidak ada, jadi nilai awal kosong, lalu
// server/worker.ts memanggil setEnv() dari binding/secrets Worker
// (wrangler secret put) sebelum request pertama diproses.
//
// Aturan: JANGAN pernah membaca process.env langsung di handler atau
// modul lain — selalu lewat getEnv(). Dengan begitu kredensial tidak
// pernah tertulis di kode, dan satu kode jalan di Node maupun Workers.

export interface AppEnv {
  sessionSecret: string;
  klikqrisApiKey: string;
  klikqrisMerchantId: string;
  klikqrisWebhookSecret: string;
  /** Endpoint API payment pusat, hanya dipakai backend (bukan browser). */
  paymentApiUrl: string;
  /** API key khusus aplikasi untuk api.by-rj.com (secret Worker). */
  paymentApiKey: string;
  /** Secret HMAC untuk webhook internal dari API payment pusat. */
  paymentWebhookSecret: string;
  resendApiKey: string;
  resendFrom: string;
  /** URL dasar situs, dipakai untuk tautan di email (bukan secret). */
  appUrl: string;
  /** Secret server Turnstile (JANGAN PERNAH dikirim ke klien). */
  turnstileSecretKey: string;
  /** Site key publik Turnstile (boleh dikirim ke klien via /api/config). */
  turnstileSiteKey: string;
  /** Kunci publik VAPID (base64url; boleh dikirim ke klien via /api/push/vapid-key). */
  vapidPublicKey: string;
  /** Kunci privat VAPID (base64url, RAHASIA — hanya via wrangler secret). */
  vapidPrivateKey: string;
  /** Subjek VAPID, mis. "mailto:halo@ringkas.by-rj.com". */
  vapidSubject: string;
  /** Token akses WhatsApp Cloud API (RAHASIA — hanya via wrangler secret). */
  whatsappToken: string;
  /** Phone number ID WhatsApp Business (dari Meta for Developers). */
  whatsappPhoneNumberId: string;
  /** Nama template WhatsApp laporan mingguan (bawaan 'laporan_mingguan'). */
  whatsappTemplateName: string;
}

function fromProcessEnv(): AppEnv {
  const p =
    (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {};
  return {
    sessionSecret: p.SESSION_SECRET ?? "",
    klikqrisApiKey: p.KLIKQRIS_API_KEY ?? "",
    klikqrisMerchantId: p.KLIKQRIS_MERCHANT_ID ?? "",
    klikqrisWebhookSecret: p.KLIKQRIS_WEBHOOK_SECRET ?? "",
    paymentApiUrl: p.PAYMENT_API_URL ?? "",
    paymentApiKey: p.PAYMENT_API_KEY ?? "",
    paymentWebhookSecret: p.PAYMENT_WEBHOOK_SECRET ?? "",
    resendApiKey: p.RESEND_API_KEY ?? "",
    resendFrom: p.RESEND_FROM ?? "halo@ringkas.by-rj.com",
    appUrl: p.APP_URL ?? "https://ringkas.by-rj.com",
    turnstileSecretKey: p.TURNSTILE_SECRET_KEY ?? "",
    turnstileSiteKey: p.TURNSTILE_SITE_KEY ?? "",
    vapidPublicKey: p.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: p.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: p.VAPID_SUBJECT ?? "",
    whatsappToken: p.WHATSAPP_TOKEN ?? "",
    whatsappPhoneNumberId: p.WHATSAPP_PHONE_NUMBER_ID ?? "",
    whatsappTemplateName: p.WHATSAPP_TEMPLATE_NAME ?? "laporan_mingguan"
  };
}

let current: AppEnv = fromProcessEnv();

export function getEnv(): AppEnv {
  return current;
}

export function setEnv(patch: Partial<AppEnv>): void {
  current = { ...current, ...patch };
}
