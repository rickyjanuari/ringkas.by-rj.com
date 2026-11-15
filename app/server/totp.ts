// totp.ts — TOTP 2FA (RFC 6238) implementasi MANUAL, tanpa pustaka
// eksternal: base32, HMAC-SHA1 lewat WebCrypto, langkah 30 detik,
// toleransi ±1 langkah. Kode pemulihan di-hash SHA-256 (kode aslinya
// TIDAK PERNAH disimpan).
//
// Jalan di Workers maupun Node: hanya globalThis.crypto (getRandomValues
// + subtle) — tanpa modul Node.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 20 byte acak -> base32 (tanpa padding), dipakai sebagai secret TOTP. */
export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/=+$/, "").toUpperCase();
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = BASE32_ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("Secret base32 tidak valid.");
    buffer = (buffer << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export function otpauthUrl(secret: string, account: string, issuer = "Ringkas"): string {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?${params.toString()}`;
}

async function hmacSha1(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, msg as BufferSource);
  return new Uint8Array(sig);
}

/** Kode TOTP 6 digit untuk satu counter (langkah 30 detik). */
async function totpAt(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = await hmacSha1(key, msg);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

/**
 * Verifikasi kode TOTP terhadap secret, toleransi ±`window` langkah
 * (default 1 = ±30 detik). Kode harus tepat 6 digit angka.
 */
export async function verifyTotp(secret: string, code: string, window = 1): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const counter = Math.floor(Date.now() / 1000 / 30);
    for (let d = -window; d <= window; d++) {
      if ((await totpAt(secret, counter + d)) === code) return true;
    }
    return false;
  } catch (err) {
    console.error("[totp] verifikasi gagal:", err);
    return false;
  }
}

// ------------------------- Kode pemulihan -------------------------

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 8 kode format XXXX-XXXX (huruf+angka acak, tanpa huruf ambigu I/O/0/1). */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const bytes = new Uint8Array(8);
    globalThis.crypto.getRandomValues(bytes);
    const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
    codes.push(`${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`);
  }
  return codes;
}

/** SHA-256 (hex) sebuah kode pemulihan — yang disimpan di DB. */
export async function hashRecoveryCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.trim().toUpperCase());
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
