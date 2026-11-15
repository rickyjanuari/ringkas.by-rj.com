// turnstile.ts — verifikasi Cloudflare Turnstile (CAPTCHA) server-side.
//
// Bila TURNSTILE_SECRET_KEY belum dikonfigurasi, verifikasi dilewati
// (return true + log) supaya register/login tetap jalan di lingkungan
// yang belum memasang Turnstile. Secret TIDAK PERNAH dikembalikan ke
// klien — hanya site key yang boleh publik (GET /api/config).

import { getEnv } from "./env.js";

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = getEnv().turnstileSecretKey;
  if (!secret) {
    console.log("[turnstile] belum dikonfigurasi — dilewati");
    return true;
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams({
      secret,
      response: token,
      remoteip: ip
    });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return false;
    const data: unknown = await res.json();
    return (
      !!data && typeof data === "object" && (data as { success?: unknown }).success === true
    );
  } catch (err) {
    console.error("[turnstile] verifikasi gagal:", err);
    return false;
  }
}
