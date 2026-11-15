// worker.ts — entry point Cloudflare Worker (lihat wrangler.toml).
//
// Satu Worker melayani SEMUANYA di satu domain:
//   - /api/*            → aplikasi Hono (server/app.ts) dengan database D1
//   - /uploads/*        → 404 JSON: berkas upload tidak persisten di Workers
//                         (gap yang diketahui — butuh R2, lihat README)
//   - selain itu        → aset statis SvelteKit (build/) lewat binding
//                         ASSETS; not_found_handling single-page-application
//                         di wrangler.toml mengembalikan index.html untuk
//                         rute SPA (mis. /katalog) supaya routing klien jalan.
//
// Tidak ada migrate/seed saat Worker boot: migrasi diterapkan pemilik
// dengan `wrangler d1 migrations apply`, seed dengan
// `wrangler d1 execute --file=server/seed/seed.sql` (lihat README).
// Kredensial dibaca dari secrets Worker via setEnv() — jangan pernah
// menaruh nilai secret di berkas ini atau di wrangler.toml.

import type { Hono, ExecutionContext } from "hono";
import { createApp } from "./app.js";
import { openD1Database, type D1DatabaseBinding } from "./d1.js";
import { setEnv } from "./env.js";
import { UnavailableImageStorage } from "./storage.js";
import { runDailyJob, runWeeklyJob } from "./cron.js";
import { runStudySchedulePush } from "./push.js";

export interface Env {
  DB: D1DatabaseBinding;
  ASSETS: { fetch(request: Request): Promise<Response> };
  SESSION_SECRET?: string;
  KLIKQRIS_API_KEY?: string;
  KLIKQRIS_MERCHANT_ID?: string;
  KLIKQRIS_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  APP_URL?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

// Aplikasi dibuat sekali per isolate Worker, lalu dipakai ulang.
let app: Hono | null = null;
let envReady = false;

function initEnv(env: Env): void {
  if (envReady) return;
  setEnv({
    sessionSecret: env.SESSION_SECRET ?? "",
    klikqrisApiKey: env.KLIKQRIS_API_KEY ?? "",
    klikqrisMerchantId: env.KLIKQRIS_MERCHANT_ID ?? "",
    klikqrisWebhookSecret: env.KLIKQRIS_WEBHOOK_SECRET ?? "",
    resendApiKey: env.RESEND_API_KEY ?? "",
    resendFrom: env.RESEND_FROM ?? "halo@ringkas.by-rj.com",
    appUrl: env.APP_URL ?? "https://ringkas.by-rj.com",
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY ?? "",
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "",
    vapidPublicKey: env.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: env.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: env.VAPID_SUBJECT ?? ""
  });
  envReady = true;
}

function getApp(env: Env): Hono {
  if (app) return app;
  initEnv(env);
  app = createApp(openD1Database(env.DB), {
    storage: new UnavailableImageStorage()
  });
  return app;
}

// Jadwal cron (lihat wrangler.toml [triggers]):
//   "0 0 * * *"   → harian 07:00 WIB: pengingat + ucapan streak.
//   "0 11 * * 0"  → Minggu 18:00 WIB: laporan mingguan orang tua.
//   "*/15 * * * *" → tiap 15 menit: pengingat push jadwal belajar.
// Tanpa RESEND_API_KEY / kunci VAPID, pengiriman dilewati + dicatat di
// log (cron tetap selesai dengan sukses, tidak melempar).
async function runScheduled(env: Env, cron: string): Promise<void> {
  initEnv(env);
  const db = openD1Database(env.DB);
  try {
    if (cron === "0 11 * * 0") {
      const r = await runWeeklyJob(db, new Date());
      console.log(`[cron] weekly: terkirim ${r.sent}, dilewati ${r.skipped}, error ${r.errors.length}`);
    } else if (cron === "*/15 * * * *") {
      const r = await runStudySchedulePush(db, new Date());
      console.log(`[cron] study-push: terkirim ${r.sent}, dilewati ${r.skipped}, error ${r.errors.length}`);
    } else {
      const r = await runDailyJob(db, new Date());
      console.log(`[cron] daily: terkirim ${r.sent}, dilewati ${r.skipped}, error ${r.errors.length}`);
    }
  } catch (err) {
    console.error("[cron] gagal:", err);
  }
}

// ---- Header keamanan (semua respons) ----
//
// CSP utama memakai 'unsafe-inline' di script-src karena build/index.html
// SvelteKit berisi SATU <script> inline: bootstrap hidrasi
// (__sveltekit_... + import() dinamis ke /_app/immutable/entry/*.js).
// Tanpa 'unsafe-inline', SPA tidak bisa boot sama sekali. Semua JS lain
// dimuat dari berkas eksternal ('self'), jadi 'unsafe-inline' di sini
// hanya menutupi bootstrap tersebut, bukan skrip aplikasi.
//
// /shorts/* memakai CSP lebih longgar: halaman video pendek memakai
// skrip inline, DAN diputar di dalam <iframe> dari halaman Belajar
// (src/routes/belajar/[product]/+page.svelte). Karena itu:
//   - frame-ancestors 'self' (bukan 'none'), dan
//   - TANPA header X-Frame-Options (DENY akan memblokir iframe itu).
// Di browser modern frame-ancestors sudah menggantikan X-Frame-Options.
const CSP_MAIN =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'self' https://challenges.cloudflare.com; " +
  "frame-src https://challenges.cloudflare.com; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const CSP_SHORTS =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'self'; " +
  "frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

/**
 * Bungkus respons dengan header keamanan. Respons dari ASSETS bersifat
 * immutable, jadi selalu dibuat Response baru dengan body + status +
 * header yang sama.
 */
function withSecurityHeaders(res: Response, pathname: string): Response {
  const isShorts = pathname.startsWith("/shorts/");
  const headers = new Headers(res.headers);
  headers.set("Content-Security-Policy", isShorts ? CSP_SHORTS : CSP_MAIN);
  // X-Frame-Options DENY memblokir <iframe> video pendek di halaman
  // Belajar — untuk /shorts/* cukup frame-ancestors 'self' di CSP.
  if (!isShorts) headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}

export default {
  // PENTING: `ctx` WAJIB diteruskan ke `app.fetch(request, env, ctx)` —
  // tanpa itu `c.executionCtx` di dalam handler Hono bernilai undefined
  // dan `background()` (email.ts) tidak bisa mendaftarkan `waitUntil`,
  // sehingga SEMUA kerja latar (email lunas/selamat datang, pemenuhan
  // hadiah, hadiah referral) diam-diam tidak pernah jalan setelah
  // respons terkirim. Ditemukan saat verifikasi batch pertumbuhan
  // (webhook PAID membalik status tapi grant/voucher/email tidak muncul).
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return withSecurityHeaders(await getApp(env).fetch(request, env, ctx), url.pathname);
    }
    if (url.pathname.startsWith("/uploads/")) {
      return withSecurityHeaders(
        Response.json(
          {
            error:
              "Berkas gambar tidak tersedia di deployment Cloudflare — upload tidak persisten di Workers. Pasang R2 (lihat README bagian Deploy ke Cloudflare)."
          },
          { status: 404 }
        ),
        url.pathname
      );
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request), url.pathname);
  },

  async scheduled(
    event: { cron: string; scheduledTime: number },
    env: Env,
    ctx: { waitUntil(p: Promise<unknown>): void }
  ): Promise<void> {
    ctx.waitUntil(runScheduled(env, event.cron));
  }
};
