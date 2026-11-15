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

import type { Hono } from "hono";
import { createApp } from "./app.js";
import { openD1Database, type D1DatabaseBinding } from "./d1.js";
import { setEnv } from "./env.js";
import { UnavailableImageStorage } from "./storage.js";

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
}

// Aplikasi dibuat sekali per isolate Worker, lalu dipakai ulang.
let app: Hono | null = null;

function getApp(env: Env): Hono {
  if (app) return app;
  setEnv({
    sessionSecret: env.SESSION_SECRET ?? "",
    klikqrisApiKey: env.KLIKQRIS_API_KEY ?? "",
    klikqrisMerchantId: env.KLIKQRIS_MERCHANT_ID ?? "",
    klikqrisWebhookSecret: env.KLIKQRIS_WEBHOOK_SECRET ?? "",
    resendApiKey: env.RESEND_API_KEY ?? "",
    resendFrom: env.RESEND_FROM ?? "halo@ringkas.by-rj.com",
    appUrl: env.APP_URL ?? "https://ringkas.by-rj.com"
  });
  app = createApp(openD1Database(env.DB), {
    storage: new UnavailableImageStorage()
  });
  return app;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return getApp(env).fetch(request);
    }
    if (url.pathname.startsWith("/uploads/")) {
      return Response.json(
        {
          error:
            "Berkas gambar tidak tersedia di deployment Cloudflare — upload tidak persisten di Workers. Pasang R2 (lihat README bagian Deploy ke Cloudflare)."
        },
        { status: 404 }
      );
    }
    return env.ASSETS.fetch(request);
  }
};
