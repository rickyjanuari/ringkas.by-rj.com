// push.ts — Web Push natif + Jadwal Belajar (FITUR 4).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerPushRoutes(app, db) dan di server/worker.ts (scheduled) lewat
// runStudySchedulePush(db, now). Tabel `push_subscriptions`,
// `study_schedules`, dan `push_sent_log` dibuat koordinator di migrasi
// 0012 (lihat SQL di laporan akhir).
//
// KEPUTUSAN DESAIN:
// - Web Push NATIF Workers: HANYA WebCrypto (subtle), TANPA dependensi
//   npm baru. Pustaka `web-push` memakai http2 Node dan tidak cocok
//   untuk Workers.
// - VAPID: kunci dibaca lewat getEnv() — koordinator menambahkan field
//   `vapidPublicKey` / `vapidPrivateKey` / `vapidSubject` ke env.ts dan
//   worker.ts (lihat snippet di laporan akhir). Bila kunci belum disetel,
//   SEMUA pengiriman dilewati + log
//   `[push] kunci VAPID belum disetel — dilewati` (pola graceful seperti
//   Turnstile di turnstile.ts) — tidak pernah melempar.
// - JWT VAPID ES256: header {typ:"JWT", alg:"ES256"}, claim aud = origin
//   endpoint push, exp = sekarang + 12 jam, sub = vapidSubject. Tanda
//   tangan ECDSA P-256 dikonversi DER → raw R||S (format JOSE).
// - Enkripsi konten RFC 8291 (aes128gcm): ECDH P-256 dengan kunci p256dh
//   klien, HKDF (HMAC-SHA-256), AES-128-GCM, salt acak 16 byte. Body =
//   salt || rs(4096) || kunci publik server || ciphertext.
// - Cron jalan tiap 15 menit (trigger baru `*/15 * * * *`, lihat laporan):
//   jadwal dianggap jatuh tempo bila weekday (WIB) cocok dan waktunya
//   berada dalam jendela 15 menit terakhir (0–15 menit lewat). Idempotensi
//   lewat tabel `push_sent_log` (PRIMARY KEY schedule_id+day+time):
//   klaim INSERT OR IGNORE dulu, baru kirim — jalan kedua di hari yang
//   sama menjadi no-op.
// - Zona waktu: semua perbandingan jadwal memakai WIB (Asia/Jakarta,
//   UTC+7) — dihitung dari UTC + 7 jam, tanpa pustaka zona waktu.
// - Endpoint 404/410 dari push service → subscription usang: dihapus
//   dari `push_subscriptions` oleh runStudySchedulePush.

import { Hono, type Context } from "hono";
import { getEnv } from "./env.js";
import {
  type Database,
  type User,
  newId,
  nowIso
} from "./database.js";

// ---------------------------------------------------------------------------
// Helper kecil (duplikasi seperlunya dari actions.ts).
// ---------------------------------------------------------------------------

async function readJson(c: Context): Promise<Record<string, unknown>> {
  try {
    const v: unknown = await c.req.json();
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

async function authUser(c: Context, db: Database): Promise<User | null> {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const session = await db.get<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE token = ?",
    token
  );
  if (!session) return null;
  return (await db.get<User>("SELECT * FROM users WHERE id = ?", session.user_id)) ?? null;
}

/** Nama tampil: nama depan + inisial (pola tryout.ts). */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Peserta";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

// ---------------------------------------------------------------------------
// Base64url (WebCrypto-safe, tanpa Buffer — jalan di Workers maupun Node).
// ---------------------------------------------------------------------------

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// HKDF (RFC 5869, HMAC-SHA-256) di atas WebCrypto.
// ---------------------------------------------------------------------------

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    salt as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const prk = await crypto.subtle.sign("HMAC", key, ikm as BufferSource);
  return new Uint8Array(prk);
}

async function hkdfExpand(
  prk: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    prk as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const out = new Uint8Array(length);
  let prev = new Uint8Array(0);
  let filled = 0;
  let counter = 1;
  while (filled < length) {
    const data = concat(prev, info, new Uint8Array([counter]));
    const t = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, data as BufferSource)
    );
    const take = Math.min(t.length, length - filled);
    out.set(t.subarray(0, take), filled);
    filled += take;
    prev = t;
    counter += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// VAPID.
// ---------------------------------------------------------------------------

interface VapidKeys {
  publicKey: string; // base64url, kunci publik P-256 (65 byte uncompressed)
  privateKey: string; // base64url, kunci privat P-256 (32 byte)
  subject: string; // mis. "mailto:halo@ringkas.by-rj.com"
}

/**
 * Kunci VAPID dari env. Koordinator menambahkan field
 * vapidPublicKey/vapidPrivateKey/vapidSubject ke env.ts + worker.ts
 * (lihat laporan akhir). Bila belum disetel → null (graceful-skip).
 */
export function getVapidKeys(): VapidKeys | null {
  const env = getEnv() as unknown as Record<string, string | undefined>;
  const publicKey = env.vapidPublicKey ?? "";
  const privateKey = env.vapidPrivateKey ?? "";
  const subject = env.vapidSubject ?? "";
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Konversi tanda tangan ECDSA DER → raw R||S (format JOSE, 64 byte). */
export function derToRawSignature(der: Uint8Array): Uint8Array {
  // DER: 0x30 LEN 0x02 LEN_R R 0x02 LEN_S S
  let off = 2;
  if (der[1] & 0x80) off += der[1] & 0x7f; // panjang long-form (tidak terjadi untuk P-256)
  if (der[off] !== 0x02) throw new Error("Tanda tangan DER tidak valid.");
  const lenR = der[off + 1];
  let r = der.subarray(off + 2, off + 2 + lenR);
  off = off + 2 + lenR;
  if (der[off] !== 0x02) throw new Error("Tanda tangan DER tidak valid.");
  const lenS = der[off + 1];
  let s = der.subarray(off + 2, off + 2 + lenS);
  // Buang byte 0x00 di depan (penanda positif) lalu pad ke 32 byte.
  if (r.length > 32) r = r.subarray(r.length - 32);
  if (s.length > 32) s = s.subarray(s.length - 32);
  const out = new Uint8Array(64);
  out.set(r, 32 - r.length);
  out.set(s, 64 - s.length);
  return out;
}

/** JWT VAPID ES256 untuk satu endpoint push. */
export async function buildVapidJwt(
  keys: VapidKeys,
  endpoint: string,
  nowMs: number = Date.now()
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(nowMs / 1000) + 12 * 3600;
  const header = base64urlEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64urlEncode(
    utf8(JSON.stringify({ aud, exp, sub: keys.subject }))
  );
  const pub = base64urlDecode(keys.publicKey);
  const priv = base64urlDecode(keys.privateKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("Kunci publik VAPID tidak valid (harus 65 byte uncompressed).");
  }
  if (priv.length !== 32) {
    throw new Error("Kunci privat VAPID tidak valid (harus 32 byte).");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: base64urlEncode(pub.subarray(1, 33)),
    y: base64urlEncode(pub.subarray(33, 65)),
    d: base64urlEncode(priv)
  };
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signingInput = utf8(`${header}.${payload}`);
  // WebCrypto mengembalikan tanda tangan ECDSA dalam format raw R||S
  // (IEEE P1363, 64 byte) — BUKAN DER. Bila suatu runtime mengembalikan
  // DER (0x30...), konversi ke raw lewat derToRawSignature.
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signingInput as BufferSource
    )
  );
  const rawSig = sig.length === 64 ? sig : derToRawSignature(sig);
  return `${header}.${payload}.${base64urlEncode(rawSig)}`;
}

// ---------------------------------------------------------------------------
// Enkripsi konten RFC 8291 (aes128gcm).
// ---------------------------------------------------------------------------

/** Enkripsi payload untuk satu subscription. Mengembalikan body siap kirim. */
export async function encryptPushPayload(
  subscription: { p256dh: string; auth: string },
  payload: string
): Promise<Uint8Array> {
  const clientPub = base64urlDecode(subscription.p256dh);
  const authSecret = base64urlDecode(subscription.auth);
  if (clientPub.length !== 65 || clientPub[0] !== 0x04) {
    throw new Error("Kunci p256dh klien tidak valid.");
  }
  if (authSecret.length !== 16) {
    throw new Error("Kunci auth klien tidak valid.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const serverPub = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey)
  );
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPub as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      serverKeys.privateKey,
      256
    )
  );
  // RFC 8291 §3.4: PRK_key = HKDF-Extract(auth, shared_secret).
  const prkKey = await hkdfExtract(authSecret, sharedSecret);
  const keyInfo = concat(
    utf8("WebPush: info"),
    new Uint8Array([0]),
    clientPub,
    serverPub
  );
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);
  // PRK = HKDF-Extract(salt, IKM); CEK/nonce dari PRK itu.
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(prk, concat(utf8("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16);
  const nonce = await hkdfExpand(prk, concat(utf8("Content-Encoding: nonce"), new Uint8Array([0])), 12);
  const cekKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, [
    "encrypt"
  ]);
  // Delimiter 0x02 di akhir plaintext (aes128gcm, tanpa padding tambahan).
  const plaintext = concat(utf8(payload), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      cekKey,
      plaintext as BufferSource
    )
  );
  // Body: salt (16) || rs (4, big-endian, 4096) || serverPub (65) || ciphertext.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, serverPub, ciphertext);
}

// ---------------------------------------------------------------------------
// Pengiriman push.
// ---------------------------------------------------------------------------

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSendResult {
  sent: boolean;
  status?: number;
  /** Endpoint mengembalikan 404/410: subscription usang, hapus. */
  gone?: boolean;
  reason?: string;
}

type FetchImpl = (
  input: string,
  init?: RequestInit
) => Promise<{ status: number }>;

export async function sendPush(
  subscription: PushSubscription,
  payload: string,
  fetchImpl?: FetchImpl
): Promise<PushSendResult> {
  const keys = getVapidKeys();
  if (!keys) {
    console.log("[push] kunci VAPID belum disetel — dilewati");
    return { sent: false, reason: "no-key" };
  }
  if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) {
    return { sent: false, reason: "bad-subscription" };
  }
  const doFetch: FetchImpl =
    fetchImpl ??
    ((async (input: string, init?: RequestInit) => {
      const res = await fetch(input, init);
      return { status: res.status };
    }) as FetchImpl);
  let jwt: string;
  let body: Uint8Array;
  try {
    jwt = await buildVapidJwt(keys, subscription.endpoint);
    body = await encryptPushPayload(subscription, payload);
  } catch (err) {
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "crypto-error"
    };
  }
  let res: { status: number };
  try {
    res = await doFetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: "86400",
        Urgency: "normal",
        Authorization: `vapid t=${jwt}, k=${keys.publicKey}`
      },
      body: body as unknown as BodyInit
    });
  } catch {
    return { sent: false, reason: "fetch-error" };
  }
  if (res.status === 200 || res.status === 201) {
    return { sent: true, status: res.status };
  }
  if (res.status === 404 || res.status === 410) {
    return { sent: false, gone: true, status: res.status };
  }
  return { sent: false, status: res.status, reason: `http-${res.status}` };
}

// ---------------------------------------------------------------------------
// Logika jadwal (pure — bisa diuji tanpa database).
// ---------------------------------------------------------------------------

export interface StudyScheduleInput {
  weekday: number; // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
  time: string; // "HH:MM"
}

/** Nama hari Indonesia untuk pesan push (indeks = weekday JS, 0 Minggu). */
export const NAMA_HARI = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu"
] as const;

/** Bagian tanggal/waktu WIB dari sebuah Date (UTC+7, tanpa pustaka). */
export function wibParts(now: Date): {
  weekday: number;
  day: string; // "YYYY-MM-DD" (WIB)
  minutes: number; // menit sejak 00:00 WIB
  time: string; // "HH:MM" (WIB)
} {
  const wib = new Date(now.getTime() + 7 * 3600 * 1000);
  const hh = wib.getUTCHours();
  const mm = wib.getUTCMinutes();
  return {
    weekday: wib.getUTCDay(),
    day: wib.toISOString().slice(0, 10),
    minutes: hh * 60 + mm,
    time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
  };
}

/** "HH:MM" → menit sejak 00:00 (null bila format salah). */
export function timeToMinutes(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Apakah jadwal jatuh tempo pada `now`: weekday (WIB) cocok DAN waktu
 * jadwal berada dalam jendela 15 menit terakhir (0–15 menit lewat).
 * Di luar jendela (terlalu dini / lebih dari 15 menit lewat) → false.
 */
export function scheduleDueInWindow(
  schedule: StudyScheduleInput,
  now: Date = new Date()
): boolean {
  const wib = wibParts(now);
  if (schedule.weekday !== wib.weekday) return false;
  const schedMin = timeToMinutes(schedule.time);
  if (schedMin === null) return false;
  const diff = wib.minutes - schedMin;
  return diff >= 0 && diff <= 15;
}

// ---------------------------------------------------------------------------
// Cron: kirim pengingat untuk jadwal yang jatuh tempo.
// ---------------------------------------------------------------------------

export interface StudySchedulePushResult {
  sent: number;
  skipped: number;
  errors: string[];
}

interface ScheduleRow {
  id: string;
  parent_user_id: string;
  child_user_id: string;
  weekday: number;
  time: string;
  enabled: number;
  created_at: string;
}

export async function runStudySchedulePush(
  db: Database,
  now: Date = new Date(),
  fetchImpl?: FetchImpl
): Promise<StudySchedulePushResult> {
  const result: StudySchedulePushResult = { sent: 0, skipped: 0, errors: [] };
  let schedules: ScheduleRow[];
  try {
    schedules = await db.all<ScheduleRow>(
      "SELECT * FROM study_schedules WHERE enabled = 1"
    );
  } catch (err) {
    // Tabel belum ada (migrasi 0012 belum diterapkan) — cron tetap sukses.
    result.errors.push(
      `jadwal tidak bisa dibaca: ${err instanceof Error ? err.message : "gagal"}`
    );
    return result;
  }
  const due = schedules.filter((s) => scheduleDueInWindow(s, now));
  if (due.length === 0) return result;
  if (!getVapidKeys()) {
    console.log("[push] kunci VAPID belum disetel — dilewati");
    result.skipped += due.length;
    return result;
  }
  const wib = wibParts(now);
  for (const s of due) {
    try {
      // Idempotensi: klaim (schedule_id, day, time) dulu — jalan kedua
      // di hari yang sama menjadi no-op (INSERT OR IGNORE → changes 0).
      const claimed = await db.run(
        "INSERT OR IGNORE INTO push_sent_log (schedule_id, day, time, sent_at) VALUES (?, ?, ?, ?)",
        s.id,
        wib.day,
        s.time,
        nowIso()
      );
      if (claimed.changes === 0) {
        result.skipped += 1;
        continue;
      }
      const subs = await db.all<PushSubscription>(
        "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
        s.parent_user_id
      );
      if (subs.length === 0) {
        result.skipped += 1;
        continue;
      }
      const child = await db.get<User>(
        "SELECT * FROM users WHERE id = ?",
        s.child_user_id
      );
      const payload = JSON.stringify({
        title: "Waktunya belajar di Ringkas",
        body: `Ayo buka Ringkas — jadwal belajar ${NAMA_HARI[s.weekday]} pukul ${s.time} sudah tiba.`,
        url: "/belajar",
        child_name: child ? displayName(child.name) : undefined
      });
      for (const sub of subs) {
        const r = await sendPush(sub, payload, fetchImpl);
        if (r.sent) {
          result.sent += 1;
        } else if (r.gone) {
          // Subscription usang — hapus supaya tidak dicoba lagi.
          await db.run(
            "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
            s.parent_user_id,
            sub.endpoint
          );
          result.skipped += 1;
        } else {
          result.errors.push(`${s.id}: ${r.reason ?? `http-${r.status ?? "?"}`}`);
        }
      }
    } catch (err) {
      result.errors.push(`${s.id}: ${err instanceof Error ? err.message : "gagal"}`);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------

export function registerPushRoutes(app: Hono, db: Database): void {
  // Kunci publik VAPID (untuk PushManager.subscribe di klien).
  app.get("/api/push/vapid-key", (c) => {
    const keys = getVapidKeys();
    return c.json({ publicKey: keys ? keys.publicKey : null });
  });

  // Simpan subscription push milik akun yang login (per endpoint).
  app.post("/api/push/subscribe", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const endpoint = asString(body.endpoint).trim();
    const keysRaw = body.keys && typeof body.keys === "object" ? body.keys : {};
    const p256dh = asString((keysRaw as Record<string, unknown>).p256dh);
    const auth = asString((keysRaw as Record<string, unknown>).auth);
    if (!endpoint.startsWith("https://")) {
      return c.json({ error: "Endpoint push tidak valid." }, 400);
    }
    // Validasi bentuk kunci (p256dh 65 byte, auth 16 byte).
    try {
      if (base64urlDecode(p256dh).length !== 65) throw new Error("p256dh");
      if (base64urlDecode(auth).length !== 16) throw new Error("auth");
    } catch {
      return c.json({ error: "Kunci push tidak valid." }, 400);
    }
    try {
      await db.run(
        `INSERT OR REPLACE INTO push_subscriptions
           (user_id, endpoint, p256dh, auth, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        user.id,
        endpoint,
        p256dh,
        auth,
        nowIso()
      );
    } catch {
      return c.json({ error: "Fitur pengingat belum siap. Coba lagi nanti." }, 503);
    }
    return c.json({ ok: true });
  });

  // Hapus subscription push milik akun yang login.
  app.post("/api/push/unsubscribe", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const endpoint = asString(body.endpoint).trim();
    if (!endpoint) return c.json({ error: "endpoint wajib diisi." }, 400);
    try {
      await db.run(
        "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
        user.id,
        endpoint
      );
    } catch {
      return c.json({ error: "Fitur pengingat belum siap. Coba lagi nanti." }, 503);
    }
    return c.json({ ok: true });
  });

  // Daftar jadwal: yang saya buat sebagai orang tua + jadwal saya sendiri
  // sebagai anak (bila ada).
  app.get("/api/push/schedules", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    let rows: ScheduleRow[];
    try {
      rows = await db.all<ScheduleRow>(
        `SELECT * FROM study_schedules
         WHERE parent_user_id = ? OR child_user_id = ?
         ORDER BY weekday, time`,
        user.id,
        user.id
      );
    } catch {
      return c.json({ schedules: [] });
    }
    const schedules = await Promise.all(
      rows.map(async (r) => {
        const child = await db.get<User>("SELECT * FROM users WHERE id = ?", r.child_user_id);
        const parent = await db.get<User>(
          "SELECT * FROM users WHERE id = ?",
          r.parent_user_id
        );
        return {
          id: r.id,
          parent_user_id: r.parent_user_id,
          parent_name: parent ? displayName(parent.name) : null,
          child_user_id: r.child_user_id,
          child_name: child ? displayName(child.name) : null,
          weekday: r.weekday,
          time: r.time,
          enabled: r.enabled,
          created_at: r.created_at
        };
      })
    );
    return c.json({ schedules });
  });

  // Buat jadwal — hanya orang tua yang terhubung ke anak itu.
  app.post("/api/push/schedules", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const childId = asString(body.child_user_id);
    const weekday = asNumber(body.weekday);
    const time = asString(body.time).trim();
    const enabled = body.enabled === false ? 0 : 1;
    if (!childId) return c.json({ error: "child_user_id wajib diisi." }, 400);
    if (
      weekday === undefined ||
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6
    ) {
      return c.json({ error: "Hari harus 0 (Minggu) sampai 6 (Sabtu)." }, 400);
    }
    if (timeToMinutes(time) === null) {
      return c.json({ error: "Jam harus format HH:MM (mis. 16:30)." }, 400);
    }
    const link = await db.get<{ id: string }>(
      "SELECT id FROM parent_links WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1",
      user.id,
      childId
    );
    if (!link) {
      return c.json({ error: "Anak ini tidak terhubung denganmu." }, 403);
    }
    const id = newId("sch");
    const createdAt = nowIso();
    try {
      await db.run(
        `INSERT INTO study_schedules
           (id, parent_user_id, child_user_id, weekday, time, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        user.id,
        childId,
        weekday,
        time,
        enabled,
        createdAt
      );
    } catch {
      return c.json({ error: "Fitur pengingat belum siap. Coba lagi nanti." }, 503);
    }
    return c.json(
      {
        schedule: {
          id,
          parent_user_id: user.id,
          child_user_id: childId,
          weekday,
          time,
          enabled,
          created_at: createdAt
        }
      },
      201
    );
  });

  // Hapus jadwal — hanya pembuatnya (orang tua pemilik jadwal).
  app.delete("/api/push/schedules/:id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    let row: ScheduleRow | undefined;
    try {
      row = await db.get<ScheduleRow>(
        "SELECT * FROM study_schedules WHERE id = ?",
        c.req.param("id")
      );
    } catch {
      return c.json({ error: "Fitur pengingat belum siap. Coba lagi nanti." }, 503);
    }
    if (!row) return c.json({ error: "Jadwal tidak ditemukan." }, 404);
    if (row.parent_user_id !== user.id) {
      return c.json({ error: "Hanya pembuat jadwal yang bisa menghapusnya." }, 403);
    }
    await db.run("DELETE FROM study_schedules WHERE id = ?", row.id);
    return c.json({ ok: true });
  });
}
