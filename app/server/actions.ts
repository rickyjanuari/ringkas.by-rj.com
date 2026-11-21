import { Hono, type Context } from "hono";
import bcrypt from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  type Chapter,
  type Database,
  type Flashcard,
  type Product,
  type ProductImage,
  type QuestionRow,
  type Simulation,
  type User,
  type Order,
  type SQLInputValue,
  newId,
  nowIso
} from "./database.js";
import { getEnv } from "./env.js";
import { validatePassword } from "./password.js";
import { verifyTurnstile } from "./turnstile.js";
import { logAdminAction } from "./audit.js";
import {
  generateSecret,
  otpauthUrl,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode
} from "./totp.js";
import QRCode from "qrcode";
import type { ImageStorage } from "./storage.js";
import { checkQrisStatus, verifyWebhookSignature } from "./klikqris.js";
import { createCentralPayment, getCentralPayment, centralPaymentStatus } from "./payment-api.js";
import { certificatePdf, receiptPdf, worksheetPdf, productPdf } from "./pdf.js";
import {
  appUrl,
  background,
  formatTanggal,
  getOrderEmailData,
  sendExpiredEmail,
  sendGiftEmail,
  sendPaidEmail,
  sendPendingEmail,
  sendWelcomeEmail
} from "./email.js";
import { jobDate, runDailyJob, runWeeklyJob } from "./cron.js";
import { awardXp } from "./xp.js";
import { fulfillDonationOrder, orderHasDonation, recordDonation } from "./donations.js";
// Modul seed dibuat agen lain (server/seed/study.ts belum ada saat berkas ini
// ditulis) — abaikan error resolusi modul sampai modul itu tersedia.
// @ts-ignore
import { dailyQuestions } from "./seed/study.js";
// @ts-ignore
import type { GeneratedQuestion } from "./seed/study.js";
// @ts-ignore
import { storyQuestions, storyRefId, parseStoryRef } from "./seed/story.js";

// ---------------------------------------------------------------------------
// Helper umum
// ---------------------------------------------------------------------------

type OrderRow = Order & {
  expired_at: string | null;
  /** Kolom hadiah (migrasi 0010) — null untuk order biasa. */
  gift_recipient_email?: string | null;
  gift_recipient_name?: string | null;
  gift_message?: string | null;
  gift_claim_token?: string | null;
  gift_claim_expires_at?: string | null;
  gift_claimed_at?: string | null;
  gift_claimed_by?: string | null;
};

interface OrderItem {
  product_id: string;
  title: string;
  price: number;
  /** Baris anggota bundel (harga 0): produk ini termasuk dalam bundel. */
  included_in_bundle?: string;
}

interface VoucherRow {
  code: string;
  type: string;
  value: number;
  max_uses: number | null;
  uses: number;
  min_total: number;
  expires_at: string | null;
  active: number;
  created_at: string;
}

function publicVoucher(v: VoucherRow): Record<string, unknown> {
  return {
    code: v.code,
    type: v.type,
    value: v.value,
    max_uses: v.max_uses,
    uses: v.uses,
    min_total: v.min_total,
    expires_at: v.expires_at,
    active: v.active,
    created_at: v.created_at
  };
}

function rupiah(n: number): string {
  return `Rp${Math.trunc(n).toLocaleString("id-ID")}`;
}

/**
 * Validasi voucher server-side (aktif, belum kedaluwarsa, kuota masih
 * ada, total memenuhi min_total). Mengembalikan diskon (rupiah) bila
 * valid. TIDAK mengubah uses — itu dilakukan saat order dibuat.
 */
async function validateVoucher(
  db: Database,
  codeRaw: string,
  total: number
): Promise<
  | { ok: true; voucher: VoucherRow; discount: number }
  | { ok: false; error: string }
> {
  const code = codeRaw.trim().toUpperCase();
  if (!code) return { ok: false, error: "Kode voucher wajib diisi." };
  const v = await db.get<VoucherRow>("SELECT * FROM vouchers WHERE code = ?", code);
  if (!v) return { ok: false, error: "Kode voucher tidak ditemukan." };
  if (v.active !== 1) return { ok: false, error: "Kode voucher sudah tidak aktif." };
  if (v.expires_at && new Date(v.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "Kode voucher sudah kedaluwarsa." };
  }
  if (v.max_uses !== null && v.uses >= v.max_uses) {
    return { ok: false, error: "Kuota kode voucher sudah habis." };
  }
  if (total < v.min_total) {
    return {
      ok: false,
      error: `Kode voucher ini berlaku untuk pembelian minimal ${rupiah(v.min_total)}.`
    };
  }
  const discount =
    v.type === "percent" ? Math.floor((total * v.value) / 100) : Math.min(v.value, total);
  return { ok: true, voucher: v, discount };
}

/**
 * Kembangkan produk bundel menjadi baris order: baris bundel (harga
 * bundel) + baris anggota (harga 0, bertanda included_in_bundle).
 * Kepemilikan tiap anggota jalan lewat jalur yang sudah ada
 * (userHasPaidProduct memeriksa product_id di items).
 */
async function expandBundleItems(db: Database, products: Product[]): Promise<OrderItem[]> {
  const items: OrderItem[] = [];
  for (const p of products) {
    items.push({ product_id: p.id, title: p.title, price: p.price });
    const members = await db.all<{ product_id: string }>(
      "SELECT product_id FROM bundle_members WHERE bundle_product_id = ? ORDER BY product_id",
      p.id
    );
    for (const m of members) {
      const mp = await db.get<Product>("SELECT * FROM products WHERE id = ?", m.product_id);
      if (mp) {
        items.push({
          product_id: mp.id,
          title: mp.title,
          price: 0,
          included_in_bundle: p.id
        });
      }
    }
  }
  return items;
}

/** Bab pertama (sort_order terendah) sebuah produk — gratis untuk semua. */
async function firstChapterId(db: Database, productId: string): Promise<string | null> {
  const row = await db.get<{ id: string }>(
    "SELECT id FROM chapters WHERE product_id = ? ORDER BY sort_order, id LIMIT 1",
    productId
  );
  return row?.id ?? null;
}

/** Simulasi gratis = Paket A pertama tiap mapel dalam produk itu. */
async function isFreeSimulation(db: Database, sim: Simulation): Promise<boolean> {
  if (!sim.product_id || sim.paket !== "A") return false;
  const first = await db.get<{ id: string }>(
    "SELECT id FROM simulations WHERE product_id = ? AND subject = ? ORDER BY paket, id LIMIT 1",
    sim.product_id,
    sim.subject
  );
  return first?.id === sim.id;
}

async function canAccessSimulation(db: Database, userId: string, sim: Simulation): Promise<boolean> {
  if (sim.product_id && (await userHasPaidProduct(db, userId, sim.product_id))) return true;
  return isFreeSimulation(db, sim);
}

async function canAccessChapter(
  db: Database,
  userId: string,
  chapter: Chapter
): Promise<boolean> {
  if (await userHasPaidProduct(db, userId, chapter.product_id)) return true;
  const first = await firstChapterId(db, chapter.product_id);
  return first === chapter.id;
}

interface PublicQuestion {
  id: string;
  type: string;
  question: string;
  options: unknown;
  images?: string[];
}

interface GradeInput {
  id: string;
  type: string;
  answer: string;
  discussion: string;
  points: number;
}

function parseItems(raw: string): OrderItem[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (it): it is OrderItem =>
          !!it && typeof it === "object" && typeof (it as OrderItem).product_id === "string"
      )
      .map((it) => ({
        product_id: it.product_id,
        title: typeof it.title === "string" ? it.title : it.product_id,
        price: typeof it.price === "number" ? it.price : 0,
        // Penanda anggota bundel DIPERTAHANKAN: orderOut, /api/admin/stats,
        // daftar order admin, CSV, idempotensi checkout, dan struk
        // (pdf.ts: "(termasuk bundel)") semuanya mengandalkannya.
        // (Sebelumnya penanda ini terbuang di sini, sehingga semua
        // filter `!it.included_in_bundle` di atas menjadi no-op dan
        // anggota bundel bocor ke klien/stats/CSV — ketahuan lewat
        // smoke test 2026-11-15.)
        ...(typeof it.included_in_bundle === "string"
          ? { included_in_bundle: it.included_in_bundle }
          : {})
      }));
  } catch {
    return [];
  }
}

// ------------------------- Pengaturan situs (tabel settings) -------------------------
// Migrasi 0008: kunci-nilai umum. Nilai tersimpan sebagai TEXT;
// enabled '0'/'1' dikonversi ke 0/1 di sini. Kunci yang belum ada di
// tabel dianggap nilai default.

interface SiteSettings {
  announcement_text: string;
  announcement_enabled: 0 | 1;
  promo_text: string;
  promo_enabled: 0 | 1;
  /** ISO waktu backup terakhir (diisi endpoint /api/admin/backup). */
  last_backup_at: string | null;
}

const DEFAULT_SETTINGS: SiteSettings = {
  announcement_text: "",
  announcement_enabled: 0,
  promo_text: "",
  promo_enabled: 0,
  last_backup_at: null
};

async function readSettings(db: Database): Promise<SiteSettings> {
  // Tabel belum ada (migrasi 0008 belum diterapkan di DB lama) →
  // kembalikan default, bukan 500; endpoint tetap merespons.
  const rows = await db
    .all<{ key: string; value: string }>("SELECT key, value FROM settings")
    .catch(() => [] as { key: string; value: string }[]);
  const out: SiteSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key === "announcement_text") out.announcement_text = r.value;
    else if (r.key === "promo_text") out.promo_text = r.value;
    else if (r.key === "announcement_enabled") out.announcement_enabled = r.value === "1" ? 1 : 0;
    else if (r.key === "promo_enabled") out.promo_enabled = r.value === "1" ? 1 : 0;
    else if (r.key === "last_backup_at") out.last_backup_at = r.value || null;
  }
  return out;
}

/** Escape satu sel CSV (RFC 4180): kutip bila ada koma/kutip/baris baru. */
function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomAlphaNum(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  const bytes = randomBytes(length);
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

// ------------------------- Referral & hadiah (migrasi 0010) -------------------------
// Kode ajakan: NAMA-XXXX — nama depan dinormalisasi (tanpa diakritik,
// huruf A-Z saja, maks. 12 huruf) + 4 karakter acak alfanumerik.
// Nama yang tidak menghasilkan huruf (mis. hanya angka/simbol) memakai
// awalan TEMAN. Keunikan dicek ke database; tabrakan diatasi dengan
// mencoba lagi (akhirnya dengan akhiran 6 karakter).

const REFERRAL_REWARD_PERCENT = 10;
const REFERRAL_REWARD_DAYS = 90;
const GIFT_CLAIM_DAYS = 30;

function normalizeReferralBase(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, " ")
    .trim();
  const first = cleaned.split(/\s+/)[0] ?? "";
  return (first.slice(0, 12) || "TEMAN");
}

async function generateReferralCode(db: Database, name: string): Promise<string | null> {
  const base = normalizeReferralBase(name);
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `${base}-${randomAlphaNum(attempt < 8 ? 4 : 6)}`;
    try {
      const existing = await db.get<{ referral_code: string | null }>(
        "SELECT referral_code FROM users WHERE referral_code = ?",
        code
      );
      if (!existing) return code;
    } catch {
      // Kolom belum ada (migrasi 0010 belum diterapkan) — jangan
      // gagalkan alur pemanggil; kode dibuat nanti saat GET /api/referral.
      return null;
    }
  }
  return null;
}

/** Kode ajakan pengguna; dibuat + disimpan bila belum ada (pengguna lama). */
async function ensureReferralCode(
  db: Database,
  userId: string,
  name: string
): Promise<string | null> {
  try {
    const row = await db.get<{ referral_code: string | null }>(
      "SELECT referral_code FROM users WHERE id = ?",
      userId
    );
    if (row?.referral_code) return row.referral_code;
    const code = await generateReferralCode(db, name);
    if (!code) return null;
    const res = await db.run(
      "UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL",
      code,
      userId
    );
    if (res.changes === 1) return code;
    const fresh = await db.get<{ referral_code: string | null }>(
      "SELECT referral_code FROM users WHERE id = ?",
      userId
    );
    return fresh?.referral_code ?? null;
  } catch (err) {
    console.error("[referral] kode ajakan gagal dibuat:", err);
    return null;
  }
}

/**
 * Hadiah referral saat pembelian PERTAMA yang LUNAS dari teman yang
 * diajak: voucher 10% sekali pakai untuk pengajak DAN teman.
 * Idempotensi: klaim baris referral_rewards dulu (UNIQUE
 * referred_user_id + order_id) — baru setelah klaim berhasil voucher
 * dibuat. Webhook + polling yang sama-sama melihat PAID hanya
 * menghasilkan satu hadiah; pemenang klaim yang kedua tidak membuat
 * voucher apa pun. Tidak pernah melempar — kegagalan dicatat di log
 * supaya alur PAID tidak terganggu.
 */
async function grantReferralRewards(db: Database, order: OrderRow): Promise<void> {
  try {
    const buyer = await db.get<UserWithReferral>("SELECT * FROM users WHERE id = ?", order.user_id);
    const refCode = (buyer?.referred_by ?? "").trim().toUpperCase();
    if (!buyer || !refCode) return;
    // Hanya pembelian pertama yang lunas: order PAID lain sudah ada
    // (mis. pembelian kedua) -> bukan hadiah pertama lagi.
    const paidCount = await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status = 'PAID'",
      buyer.id
    );
    if ((paidCount?.n ?? 0) !== 1) return;
    const referrer = await db.get<UserWithReferral>(
      "SELECT * FROM users WHERE referral_code = ?",
      refCode
    );
    if (!referrer || referrer.id === buyer.id) return;
    let referrerCode = `REF-${randomAlphaNum(6)}`;
    let referredCode = `REF-${randomAlphaNum(6)}`;
    // Kode voucher hadiah tidak boleh menabrak voucher yang sudah ada.
    const clash = await db
      .get<{ code: string }>("SELECT code FROM vouchers WHERE code IN (?, ?)", referrerCode, referredCode)
      .catch(() => undefined);
    if (clash) {
      referrerCode = `REF-${randomAlphaNum(6)}`;
      referredCode = `REF-${randomAlphaNum(6)}`;
    }
    const claim = await db.run(
      `INSERT OR IGNORE INTO referral_rewards
         (id, referrer_user_id, referred_user_id, order_id, referrer_voucher_code, referred_voucher_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId("ref"),
      referrer.id,
      buyer.id,
      order.id,
      referrerCode,
      referredCode,
      nowIso()
    );
    if (claim.changes !== 1) return; // Sudah diberi hadiah untuk order ini.
    // Klaim berhasil -> baru buat vouchernya (bila gagal, jejak hadiah
    // tetap ada; voucher yang hilang tidak dibuat ulang otomatis —
    // admin bisa membuatkan voucher pengganti dari panel admin).
    const ok1 = await createReferralVoucherWithCode(db, referrerCode);
    const ok2 = await createReferralVoucherWithCode(db, referredCode);
    if (!ok1 || !ok2) {
      console.error(
        `[referral] hadiah order ${order.id} tercatat tapi voucher gagal dibuat (pengajak: ${ok1}, teman: ${ok2}).`
      );
    }
  } catch (err) {
    console.error("[referral] hadiah gagal:", err);
  }
}

/** Sisipkan voucher hadiah referral dengan kode yang sudah ditentukan. */
async function createReferralVoucherWithCode(db: Database, code: string): Promise<boolean> {
  try {
    const expiresAt = new Date(Date.now() + REFERRAL_REWARD_DAYS * 24 * 3600 * 1000).toISOString();
    await db.run(
      "INSERT OR IGNORE INTO vouchers (code, type, value, max_uses, uses, min_total, expires_at, active, created_at) VALUES (?, 'percent', ?, 1, 0, 0, ?, 1, ?)",
      code,
      REFERRAL_REWARD_PERCENT,
      expiresAt,
      nowIso()
    );
    const row = await db.get<{ code: string }>("SELECT code FROM vouchers WHERE code = ?", code);
    return !!row;
  } catch (err) {
    console.error("[referral] voucher hadiah gagal dibuat:", err);
    return false;
  }
}

/** Beri akses produk (bukan anggota bundel) ke penerima hadiah. Idempotent. */
async function grantGiftAccess(db: Database, order: OrderRow, userId: string): Promise<void> {
  for (const it of parseItems(order.items)) {
    if (it.included_in_bundle) continue;
    await db
      .run(
        `INSERT OR IGNORE INTO gift_grants (id, order_id, product_id, user_id, granted_at)
         VALUES (?, ?, ?, ?, ?)`,
        newId("gft"),
        order.id,
        it.product_id,
        userId,
        nowIso()
      )
      .catch((err) => console.error("[gift] grant gagal:", err));
  }
}

/**
 * Pemenuhan order hadiah saat LUNAS: bila email penerima SUDAH punya
 * akun, akses langsung diberikan saat itu juga (dan order ditandai
 * diklaim oleh akun itu); bila belum, akses menunggu claim. Email
 * hadiah (template 08) selalu dikirim ke penerima — idempotensi
 * sent_emails menjaganya sekali per order.
 */
async function fulfillGiftOrder(db: Database, order: OrderRow): Promise<void> {
  const recipientEmail = (order.gift_recipient_email ?? "").trim().toLowerCase();
  if (!recipientEmail || !order.gift_claim_token) return;
  try {
    const recipient = await db
      .get<User>("SELECT * FROM users WHERE email = ?", recipientEmail)
      .catch(() => undefined);
    if (recipient) {
      await grantGiftAccess(db, order, recipient.id);
      await db
        .run(
          "UPDATE orders SET gift_claimed_at = ?, gift_claimed_by = ? WHERE id = ? AND gift_claimed_by IS NULL",
          nowIso(),
          recipient.id,
          order.id
        )
        .catch((err) => console.error("[gift] penanda klaim gagal:", err));
    }
  } catch (err) {
    console.error("[gift] pemberian akses gagal:", err);
  }
  await sendGiftEmail(db, order);
}

/**
 * Tindak lanjut SATU order yang baru menjadi PAID — dipakai webhook
 * DAN polling status, jadi harus idempotent: email lunas/hadiah
 * dijaga sent_emails, hadiah referral dijaga referral_rewards,
 * akses hadiah dijaga gift_grants. Tidak pernah melempar.
 */
async function handlePaidOrder(db: Database, order: OrderRow): Promise<void> {
  try {
    if (order.gift_recipient_email) {
      // Order hadiah: JANGAN kirim email lunas (template 03) ke
      // pembeli — salinannya ("materimu sudah terbuka") salah, karena
      // akses milik penerima, bukan pembeli.
      await fulfillGiftOrder(db, order);
    } else {
      await sendPaidEmail(db, order);
    }
  } catch (err) {
    console.error("[paid] tindak lanjut order gagal:", err);
  }
  // Donasi "beli 1, donasi 1": baris 'pending' order ini menjadi
  // 'available' (siap ditugaskan admin). Tidak pernah melempar.
  await fulfillDonationOrder(db, order);
  await grantReferralRewards(db, order);
}

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

/** Hitungan pindah tab Mode Ujian Fokus: bilangan bulat 0–999; selain itu 0. */
function clampFocusSwitches(v: unknown): number {
  const n = asNumber(v);
  if (n === undefined) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

/** Normalisasi nomor WhatsApp ke 62xx; null bila tidak valid. */
function normalizeWhatsapp(input: string): string | null {
  let s = input.replace(/[\s\-().]/g, "");
  if (s.startsWith("+62")) s = s.slice(1);
  else if (s.startsWith("08")) s = "62" + s.slice(1);
  if (!/^62\d{9,13}$/.test(s)) return null;
  return s;
}

function publicUser(u: User): Record<string, unknown> {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    whatsapp: u.whatsapp,
    role: u.role,
    created_at: u.created_at
  };
}

// ------------------------- Keamanan: lockout login & batas per IP -------------------------
// Migrasi 0009 (auth_lockouts, ip_rate_limits). Semua helper di sini
// DEFENSIF: bila tabel belum ada (migrasi belum diterapkan), login/
// register/checkout tetap jalan — keamanan tambahan tidak boleh
// memblokir layanan inti.

/** User + kolom 2FA (migrasi 0009). */
type UserWithTotp = User & { totp_secret?: string | null; totp_enabled?: number | null };

/** User + kolom referral (migrasi 0010). */
type UserWithReferral = User & {
  referral_code?: string | null;
  referred_by?: string | null;
};

/** IP klien: CF-Connecting-IP, lalu entri pertama X-Forwarded-For. */
function clientIp(c: Context): string {
  const cf = c.req.header("CF-Connecting-IP")?.trim();
  if (cf) return cf;
  const xff = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim();
  if (xff) return xff;
  return "unknown";
}

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

async function getLockout(
  db: Database,
  userId: string
): Promise<{ failed_count: number; locked_until: string | null } | undefined> {
  try {
    return await db.get<{ failed_count: number; locked_until: string | null }>(
      "SELECT failed_count, locked_until FROM auth_lockouts WHERE user_id = ?",
      userId
    );
  } catch (err) {
    console.error("[lockout] baca gagal:", err);
    return undefined;
  }
}

/** Password salah: naikkan hitungan; saat mencapai 5 -> kunci 15 menit. */
async function recordFailedLogin(db: Database, userId: string): Promise<void> {
  try {
    const row = await getLockout(db, userId);
    const count = (row?.failed_count ?? 0) + 1;
    const lockedUntil =
      count >= MAX_FAILED_LOGINS
        ? new Date(Date.now() + LOCKOUT_MS).toISOString()
        : (row?.locked_until ?? null);
    await db.run(
      `INSERT INTO auth_lockouts (user_id, failed_count, locked_until) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET failed_count = excluded.failed_count, locked_until = excluded.locked_until`,
      userId,
      count,
      lockedUntil
    );
  } catch (err) {
    console.error("[lockout] catat gagal:", err);
  }
}

/** Login sukses: reset hitungan gagal + buka kunci. */
async function resetLockout(db: Database, userId: string): Promise<void> {
  try {
    await db.run(
      "UPDATE auth_lockouts SET failed_count = 0, locked_until = NULL WHERE user_id = ?",
      userId
    );
  } catch (err) {
    console.error("[lockout] reset gagal:", err);
  }
}

/**
 * Batas per IP dalam satu jendela waktu (kind = 'register' | 'checkout').
 * true = masih di bawah batas (hitungan dinaikkan), false = sudah mencapai
 * batas. Jendela berganti -> hitungan mulai dari 1 lagi.
 */
async function checkIpLimit(
  db: Database,
  kind: string,
  ip: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  try {
    const key = `${kind}:${ip}`;
    const now = Date.now();
    const row = await db.get<{ count: number; window_start: string }>(
      "SELECT count, window_start FROM ip_rate_limits WHERE key = ?",
      key
    );
    if (!row || now - new Date(row.window_start).getTime() >= windowMs) {
      await db.run(
        `INSERT INTO ip_rate_limits (key, count, window_start) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start`,
        key,
        new Date(now).toISOString()
      );
      return true;
    }
    if (row.count >= max) return false;
    await db.run("UPDATE ip_rate_limits SET count = count + 1 WHERE key = ?", key);
    return true;
  } catch (err) {
    console.error("[rate-limit] gagal, diizinkan:", err);
    return true;
  }
}

/** Escape satu nilai untuk dump SQL backup (pola dump-seed-sql.ts). */
function sqlEsc(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) {
    return `X'${[...value].map((b) => b.toString(16).padStart(2, "0")).join("")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Nama kolom sebuah tabel (pragma, fallback ke kunci baris pertama). */
async function tableColumns(db: Database, table: string): Promise<string[]> {
  try {
    const rows = await db.all<{ name: string }>(
      "SELECT name FROM pragma_table_info(?) ORDER BY cid",
      table
    );
    if (rows.length > 0) return rows.map((r) => r.name);
  } catch {
    // D1 membatasi sebagian PRAGMA — lanjut ke fallback di bawah.
  }
  try {
    const rows = await db.all<Record<string, unknown>>(
      `SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT 1`
    );
    if (rows.length > 0) return Object.keys(rows[0]);
  } catch {
    // abaikan — tabel dilewati dari dump
  }
  return [];
}

function publicProduct(p: Product): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    jenjang: p.jenjang,
    mapel: p.mapel,
    price: p.price,
    strikethrough_price: p.strikethrough_price,
    pages: p.pages,
    cover_label: p.cover_label,
    cover_color: p.cover_color,
    badge: p.badge,
    active: p.active,
    category: p.category,
    description: p.description,
    created_at: p.created_at
  };
}

/** Helper auth: mengembalikan User atau null (handler yang membalas 401). */
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
  return await db.get<User>("SELECT * FROM users WHERE id = ?", session.user_id) ?? null;
}

function validInternalPaymentSignature(secret: string, timestamp: string | undefined, signature: string | undefined, rawBody: string): boolean {
  if (!secret || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(Date.now() - sentAt * 1000) > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (signature.length !== expected.length) return false;
  const encoder = new TextEncoder();
  return timingSafeEqual(encoder.encode(signature), encoder.encode(expected));
}

async function orderOut(db: Database, o: OrderRow): Promise<Record<string, unknown>> {
  const items = parseItems(o.items);
  const paid = o.status === "PAID";
  // Order hadiah: akses (externalUrl) milik PENERIMA, bukan pembeli —
  // pembeli tidak boleh mendapat tautan produk dari order ini.
  const isGift = Boolean(o.gift_recipient_email);
  // Baris anggota bundel (harga 0) disembunyikan dari klien — mereka
  // hanya ada di items tersimpan untuk kepemilikan/unduhan; yang dibayar
  // (baris bundel) tetap tampil.
  const itemsOut = await Promise.all(
    items
      .filter((it) => !it.included_in_bundle)
      .map(async (it) => {
        let externalUrl: string | null = null;
        if (paid && !isGift) {
          const p = await db.get<Product>(
            "SELECT external_url FROM products WHERE id = ?",
            it.product_id
          );
          externalUrl = p?.external_url ?? null;
        }
        return { product_id: it.product_id, title: it.title, price: it.price, externalUrl };
      })
  );
  return {
    id: o.id,
    user_id: o.user_id,
    items: itemsOut,
    total: o.total,
    status: o.status,
    klikqris_order_id: o.klikqris_order_id,
    qris_url: o.qris_url,
    direct_url: o.direct_url,
    total_amount: o.total_amount,
    expired_at: o.expired_at,
    idempotency_key: o.idempotency_key,
    whatsapp: o.whatsapp,
    voucher_code: o.voucher_code ?? null,
    discount_amount: o.discount_amount ?? 0,
    created_at: o.created_at,
    paid_at: o.paid_at,
    is_gift: isGift,
    // Donasi "beli 1, donasi 1": true bila order ini punya baris
    // donations (migrasi 0014). Bentuk respons lain tidak berubah.
    donated: await orderHasDonation(db, o.id),
    gift_recipient_email: o.gift_recipient_email ?? null,
    gift_recipient_name: o.gift_recipient_name ?? null,
    gift_message: o.gift_message ?? null,
    gift_claimed: Boolean(o.gift_claimed_at)
  };
}

async function userHasPaidProduct(db: Database, userId: string, productId: string): Promise<boolean> {
  const orders = await db.all<OrderRow>("SELECT * FROM orders WHERE user_id = ? AND status = 'PAID'", userId);
  if (orders.some((o) => parseItems(o.items).some((it) => it.product_id === productId))) return true;
  // Akses dari hadiah yang diterima (migrasi 0010, tabel gift_grants):
  // penerima hadiah memakai jalur gating LUNAS yang sama seperti pembeli.
  try {
    const grant = await db.get<{ x: number }>(
      "SELECT 1 AS x FROM gift_grants WHERE user_id = ? AND product_id = ? LIMIT 1",
      userId,
      productId
    );
    return !!grant;
  } catch {
    // Tabel belum ada (migrasi belum diterapkan) — bukan pemilik.
    return false;
  }
}

async function isSimLocked(db: Database, userId: string): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM parent_links WHERE child_user_id = ? AND redeemed = 1 AND sas_locked = 1",
    userId
  );
  return (row?.n ?? 0) > 0;
}

function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  let streak = 0;
  const d = new Date();
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (!set.has(iso)) break;
    streak += 1;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

function computeBadges(
  doneCount: number,
  stickerCount: number,
  attempts: { kind: string; score: number; max_score: number }[]
): string[] {
  const badges: string[] = [];
  if (doneCount >= 1) badges.push("Langkah Pertama");
  if (stickerCount >= 7) badges.push("Kolektor 7");
  if (stickerCount >= 14) badges.push("Kolektor 14");
  if (stickerCount >= 21) badges.push("Kolektor 21");
  if (stickerCount >= 28) badges.push("Kolektor 28");
  if (attempts.some((a) => a.kind === "simulation")) badges.push("Pejuang Simulasi");
  if (attempts.some((a) => a.max_score > 0 && a.score === a.max_score)) badges.push("Nilai Sempurna");
  return badges;
}

/**
 * Tandai hari belajar hari ini. Mengembalikan true bila hari ini
 * benar-benar baru disisipkan (dipakai hook XP streak — 5 XP per hari
 * belajar baru); false bila hari ini sudah tercatat. Pemanggil lama
 * yang mengabaikan return value tetap kompilasi.
 */
async function markStudyDay(db: Database, userId: string): Promise<boolean> {
  const r = await db.run(
    "INSERT OR IGNORE INTO study_days (user_id, date) VALUES (?, ?)",
    userId,
    todayIso()
  );
  return r.changes > 0;
}

function parseJsonArray(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === "string") out[k] = val;
      }
      return out;
    }
  } catch {
    // abaikan
  }
  return {};
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseOptions(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseImageUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.startsWith("/"))
      : [];
  } catch {
    return [];
  }
}

/** Nilai satu soal; mengembalikan poin yang diperoleh dan benar/tidak. */
function gradeOne(q: GradeInput, userAnswer: unknown): { earned: number; correct: boolean } {
  switch (q.type) {
    case "pg":
    case "bs": {
      const ok =
        typeof userAnswer === "string" &&
        normalizeText(userAnswer) === normalizeText(q.answer);
      return { earned: ok ? q.points : 0, correct: ok };
    }
    case "pg_kompleks": {
      const correctArr = parseJsonArray(q.answer);
      const chosen = Array.isArray(userAnswer) ? userAnswer.map((x) => String(x)) : [];
      const correctChosen = chosen.filter((c) =>
        correctArr.some((a) => normalizeText(a) === normalizeText(c))
      ).length;
      const total = correctArr.length || 1;
      const earned = (q.points * correctChosen) / total;
      const correct = correctChosen === total && chosen.length === total;
      return { earned, correct };
    }
    case "menjodohkan": {
      const key = parseJsonObject(q.answer);
      const ans =
        userAnswer && typeof userAnswer === "object" && !Array.isArray(userAnswer)
          ? (userAnswer as Record<string, unknown>)
          : {};
      const keys = Object.keys(key);
      let okCount = 0;
      for (const k of keys) {
        if (typeof ans[k] === "string" && ans[k] === key[k]) okCount += 1;
      }
      const earned = keys.length > 0 ? (q.points / keys.length) * okCount : 0;
      return { earned, correct: keys.length > 0 && okCount === keys.length };
    }
    case "isian": {
      const ok =
        typeof userAnswer === "string" &&
        normalizeText(userAnswer) === normalizeText(q.answer);
      return { earned: ok ? q.points : 0, correct: ok };
    }
    case "uraian": {
      const keywords = parseJsonArray(q.answer);
      const text = typeof userAnswer === "string" ? normalizeText(userAnswer) : "";
      const found = keywords.filter((k) => text.includes(normalizeText(k))).length;
      const earned =
        keywords.length > 0 ? Math.floor((q.points * found) / keywords.length) : 0;
      return { earned, correct: keywords.length > 0 && found === keywords.length };
    }
    default:
      return { earned: 0, correct: false };
  }
}

interface HardBankItem {
  question_id: number;
  type: string;
  question: string;
  options: unknown;
  subject: string;
  grade: number;
  origin_kind: "quiz" | "simulation";
  origin_title: string;
  product_id: string | null;
  last_wrong_at: string;
}

/**
 * Bank Soal Sulitku — soal yang pernah dijawab salah (kuis bab +
 * simulasi), dihitung ulang dari quiz_attempts + tabel questions.
 * Tidak ada tabel soal baru: yang disimpan hanya penanda "dikuasai"
 * (hard_bank_mastered). Soal yang sama salah di beberapa attempt
 * muncul sekali (yang terbaru). Dibatasi 200 attempt terbaru + 100
 * soal, dan query D1 dibatasi (IN ...) supaya hemat.
 */
async function computeHardBank(db: Database, userId: string): Promise<HardBankItem[]> {
  const attempts = await db.all<{
    kind: string;
    ref_id: string;
    answers: string;
    created_at: string;
  }>(
    "SELECT kind, ref_id, answers, created_at FROM quiz_attempts WHERE user_id = ? AND kind IN ('quiz', 'simulation') ORDER BY created_at DESC LIMIT 200",
    userId
  );
  if (attempts.length === 0) return [];
  const chapterIds = new Set<string>();
  const simIds = new Set<string>();
  for (const a of attempts) {
    if (a.kind === "quiz") chapterIds.add(a.ref_id);
    else if (a.kind === "simulation") simIds.add(a.ref_id);
  }
  const questions: QuestionRow[] = [];
  if (chapterIds.size > 0 || simIds.size > 0) {
    const conds: string[] = [];
    const vals: SQLInputValue[] = [];
    if (chapterIds.size > 0) {
      conds.push(`chapter_id IN (${[...chapterIds].map(() => "?").join(", ")})`);
      vals.push(...[...chapterIds]);
    }
    if (simIds.size > 0) {
      conds.push(`simulation_id IN (${[...simIds].map(() => "?").join(", ")})`);
      vals.push(...[...simIds]);
    }
    const rows = await db.all<QuestionRow>(
      `SELECT * FROM questions WHERE ${conds.join(" OR ")} ORDER BY id`,
      ...vals
    );
    questions.push(...rows);
  }
  const byChapter = new Map<string, QuestionRow[]>();
  const bySim = new Map<string, QuestionRow[]>();
  for (const q of questions) {
    if (q.chapter_id) {
      const list = byChapter.get(q.chapter_id) ?? [];
      list.push(q);
      byChapter.set(q.chapter_id, list);
    } else if (q.simulation_id) {
      const list = bySim.get(q.simulation_id) ?? [];
      list.push(q);
      bySim.set(q.simulation_id, list);
    }
  }
  // Metadata asal soal (judul bab / simulasi) — 2 query IN.
  const origin = new Map<string, { title: string; subject: string; grade: number; product_id: string | null }>();
  if (chapterIds.size > 0) {
    const rows = await db.all<Chapter>(
      `SELECT * FROM chapters WHERE id IN (${[...chapterIds].map(() => "?").join(", ")})`,
      ...[...chapterIds]
    );
    for (const ch of rows) {
      origin.set(`quiz:${ch.id}`, { title: ch.title, subject: ch.subject, grade: ch.grade, product_id: ch.product_id });
    }
  }
  if (simIds.size > 0) {
    const rows = await db.all<Simulation>(
      `SELECT * FROM simulations WHERE id IN (${[...simIds].map(() => "?").join(", ")})`,
      ...[...simIds]
    );
    for (const s of rows) {
      origin.set(`simulation:${s.id}`, { title: s.title, subject: s.subject, grade: s.grade, product_id: s.product_id });
    }
  }
  const mastered = new Set<number>(
    (await db.all<{ question_id: number }>(
      "SELECT question_id FROM hard_bank_mastered WHERE user_id = ?",
      userId
    )).map((r) => r.question_id)
  );
  const wrong = new Map<number, HardBankItem>();
  for (const a of attempts) {
    let answers: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(a.answers);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        answers = parsed as Record<string, unknown>;
      }
    } catch {
      answers = {};
    }
    const list = a.kind === "quiz" ? byChapter.get(a.ref_id) ?? [] : bySim.get(a.ref_id) ?? [];
    const meta = origin.get(`${a.kind}:${a.ref_id}`);
    if (!meta) continue;
    for (const q of list) {
      const result = gradeOne(
        { id: String(q.id), type: q.type, answer: q.answer, discussion: q.discussion, points: q.points },
        answers[String(q.id)]
      );
      if (result.correct) continue;
      if (mastered.has(q.id)) continue;
      const prev = wrong.get(q.id);
      if (prev && prev.last_wrong_at >= a.created_at) continue;
      wrong.set(q.id, {
        question_id: q.id,
        type: q.type,
        question: q.question,
        options: parseOptions(q.options),
        subject: meta.subject,
        grade: meta.grade,
        origin_kind: a.kind as "quiz" | "simulation",
        origin_title: meta.title,
        product_id: meta.product_id,
        last_wrong_at: a.created_at
      });
    }
  }
  return [...wrong.values()]
    .sort((x, y) => (x.last_wrong_at < y.last_wrong_at ? 1 : -1))
    .slice(0, 100);
}

function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// registerRoutes
// ---------------------------------------------------------------------------

export function registerRoutes(app: Hono, db: Database, storage: ImageStorage): void {
  // ------------------------- Auth & akun -------------------------

  app.post("/api/auth/register", async (c) => {
    const body = await readJson(c);
    const name = asString(body.name).trim();
    const email = asString(body.email).trim().toLowerCase();
    const password = asString(body.password);
    const whatsappRaw = asString(body.whatsapp).trim();
    // Batas per IP: maks 10 pendaftaran/jam/IP.
    if (!(await checkIpLimit(db, "register", clientIp(c), 10, 60 * 60 * 1000))) {
      return c.json({ error: "Terlalu banyak pendaftaran dari alamat ini. Coba lagi nanti." }, 429);
    }
    if (!name) return c.json({ error: "Nama tidak boleh kosong." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json({ error: "Format email tidak valid." }, 400);
    }
    // Turnstile: wajib + valid bila secret terkonfigurasi; dilewati bila
    // secret kosong (verifyTurnstile mengembalikan true + log).
    if (getEnv().turnstileSecretKey) {
      const captchaOk = await verifyTurnstile(asString(body.turnstile_token), clientIp(c));
      if (!captchaOk) {
        return c.json({ error: "Verifikasi CAPTCHA gagal. Silakan coba lagi." }, 400);
      }
    }
    // Kebijakan kata sandi: minimal 8 karakter + denylist + cek bocor
    // HaveIBeenPwned (gagal-terbuka).
    const pwCheck = await validatePassword(password);
    if (!pwCheck.ok) return c.json({ error: pwCheck.error }, 400);
    let whatsapp: string | null = null;
    if (whatsappRaw) {
      whatsapp = normalizeWhatsapp(whatsappRaw);
      if (!whatsapp) return c.json({ error: "Nomor WhatsApp tidak valid." }, 400);
    }
    // Kode ajakan (opsional): kode yang tidak ada DITOLAK — pendaftaran
    // tidak dibuat — supaya pengguna tahu kodenya salah dan bisa
    // memperbaikinya, bukan diam-diam kehilangan hadiah referral.
    // referred_by hanya bisa diisi sekali, di sini, saat register.
    const referralCodeRaw = asString(body.referral_code).trim().toUpperCase();
    let referrer: UserWithReferral | undefined;
    if (referralCodeRaw) {
      if (!/^[A-Z0-9-]{3,24}$/.test(referralCodeRaw)) {
        return c.json({ error: "Kode ajakan tidak valid. Periksa lagi kodenya ya." }, 400);
      }
      referrer = await db
        .get<UserWithReferral>("SELECT * FROM users WHERE referral_code = ?", referralCodeRaw)
        .catch(() => undefined);
      if (!referrer) {
        return c.json(
          { error: "Kode ajakan tidak ditemukan. Periksa lagi kodenya, atau lanjutkan daftar tanpa kode." },
          400
        );
      }
      if (referrer.email === email) {
        return c.json({ error: "Kode ajakan itu milikmu sendiri — pakai kode teman lain ya." }, 400);
      }
    }
    const existing = await db.get<User>("SELECT id FROM users WHERE email = ?", email);
    if (existing) return c.json({ error: "Email sudah terdaftar." }, 409);
    const id = newId("usr");
    const hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
    await db.run(
      "INSERT INTO users (id, name, email, password_hash, whatsapp, role, created_at) VALUES (?, ?, ?, ?, ?, 'customer', ?)",
      id,
      name,
      email,
      hash,
      whatsapp,
      nowIso()
    );
    // Kode ajakan sendiri + pengajak dicatat di sini (best-effort:
    // bila kolom referral belum ada, akun tetap jadi dan kodenya
    // dibuat nanti saat GET /api/referral).
    try {
      const myCode = await generateReferralCode(db, name);
      await db.run(
        "UPDATE users SET referral_code = ?, referred_by = ? WHERE id = ?",
        myCode,
        referrer ? referralCodeRaw : null,
        id
      );
    } catch (err) {
      console.error("[register] referral gagal disimpan:", err);
    }
    const user = await db.get<User>("SELECT * FROM users WHERE id = ?", id);
    if (!user) return c.json({ error: "Gagal membuat akun." }, 500);
    const token = newToken();
    await db.run("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, id, nowIso());
    // Email selamat datang (template 01) — fire-and-forget; bila kunci
    // Resend belum disetel, pengiriman dilewati + dicatat di log.
    background(c, sendWelcomeEmail(db, user));
    return c.json({ user: publicUser(user), token }, 201);
  });

  app.post("/api/auth/login", async (c) => {
    const body = await readJson(c);
    const email = asString(body.email).trim().toLowerCase();
    const password = asString(body.password);
    const user = await db.get<UserWithTotp>("SELECT * FROM users WHERE email = ?", email);
    // Akun terkunci: tolak apa pun (walau password benar) sampai batas
    // waktu habis. Email tak terdaftar tetap 401 generik di bawah.
    if (user) {
      const lock = await getLockout(db, user.id);
      if (lock?.locked_until && new Date(lock.locked_until).getTime() > Date.now()) {
        const minutes = Math.max(
          1,
          Math.ceil((new Date(lock.locked_until).getTime() - Date.now()) / 60000)
        );
        return c.json(
          { error: `Akun terkunci karena terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.` },
          401
        );
      }
    }
    // Turnstile: wajib + valid bila secret terkonfigurasi.
    if (getEnv().turnstileSecretKey) {
      const captchaOk = await verifyTurnstile(asString(body.turnstile_token), clientIp(c));
      if (!captchaOk) {
        return c.json({ error: "Verifikasi CAPTCHA gagal. Silakan coba lagi." }, 400);
      }
    }
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      if (user) await recordFailedLogin(db, user.id);
      return c.json({ error: "Email atau password salah." }, 401);
    }
    await resetLockout(db, user.id);
    // 2FA admin: bila aktif, JANGAN buat sesi dulu — kembalikan challenge
    // yang harus ditebus lewat POST /api/auth/login-2fa.
    if (user.role === "admin" && user.totp_enabled === 1) {
      try {
        const challengeId = newId("tfa");
        await db.run(
          "INSERT INTO totp_challenges (id, user_id, expires_at) VALUES (?, ?, ?)",
          challengeId,
          user.id,
          new Date(Date.now() + 5 * 60 * 1000).toISOString()
        );
        return c.json({ needs2fa: true, challenge: challengeId });
      } catch (err) {
        // Tabel challenge belum ada (migrasi 0009 belum diterapkan) ->
        // login tetap jalan tanpa 2FA, bukan 500.
        console.error("[login] challenge 2FA gagal dibuat, lanjut tanpa 2FA:", err);
      }
    }
    const token = newToken();
    await db.run("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, user.id, nowIso());
    return c.json({ user: publicUser(user), token });
  });

  // ------------------------- Login 2FA & TOTP -------------------------
  // Admin dengan totp_enabled=1 menebus challenge dari /api/auth/login
  // di sini (kode TOTP ATAU satu kode pemulihan sekali pakai). Challenge
  // TIDAK dihapus bila kode salah — bisa coba lagi sampai kedaluwarsa.

  app.post("/api/auth/login-2fa", async (c) => {
    const body = await readJson(c);
    const challengeId = asString(body.challenge);
    const code = asString(body.code).trim();
    if (!challengeId || !code) {
      return c.json({ error: "Challenge dan kode wajib diisi." }, 400);
    }
    const challenge = await db
      .get<{ id: string; user_id: string; expires_at: string }>(
        "SELECT * FROM totp_challenges WHERE id = ?",
        challengeId
      )
      .catch(() => undefined);
    if (!challenge) {
      return c.json({ error: "Sesi verifikasi tidak ditemukan. Silakan login ulang." }, 400);
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await db.run("DELETE FROM totp_challenges WHERE id = ?", challengeId).catch(() => undefined);
      return c.json({ error: "Sesi verifikasi kedaluwarsa. Silakan login ulang." }, 400);
    }
    const user = await db.get<UserWithTotp>("SELECT * FROM users WHERE id = ?", challenge.user_id);
    if (!user) return c.json({ error: "Pengguna tidak ditemukan." }, 404);
    let ok = false;
    if (user.totp_secret && (await verifyTotp(user.totp_secret, code))) {
      ok = true;
    } else {
      // Kode pemulihan: bandingkan hash SHA-256, sekali pakai.
      const hash = await hashRecoveryCode(code);
      const rc = await db
        .get<{ id: number; used: number }>(
          "SELECT id, used FROM recovery_codes WHERE user_id = ? AND code_hash = ?",
          user.id,
          hash
        )
        .catch(() => undefined);
      if (rc && rc.used === 0) {
        await db.run("UPDATE recovery_codes SET used = 1 WHERE id = ?", rc.id);
        ok = true;
      }
    }
    if (!ok) return c.json({ error: "Kode verifikasi salah." }, 400);
    await db.run("DELETE FROM totp_challenges WHERE id = ?", challengeId);
    const token = newToken();
    await db.run("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)", token, user.id, nowIso());
    return c.json({ user: publicUser(user), token });
  });

  // Setup 2FA (admin-only). Secret + kode pemulihan HANYA dikembalikan
  // di sini (saat setup) — tidak pernah di endpoint lain.
  app.post("/api/2fa/setup/start", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const secret = generateSecret();
    const url = otpauthUrl(secret, admin.email);
    const qrSvg = await QRCode.toString(url, { type: "svg" });
    const recoveryCodes = generateRecoveryCodes();
    const stamp = nowIso();
    await db.run("UPDATE users SET totp_secret = ? WHERE id = ?", secret, admin.id);
    await db.run("DELETE FROM recovery_codes WHERE user_id = ?", admin.id);
    for (const code of recoveryCodes) {
      await db.run(
        "INSERT INTO recovery_codes (user_id, code_hash, used, created_at) VALUES (?, ?, 0, ?)",
        admin.id,
        await hashRecoveryCode(code),
        stamp
      );
    }
    return c.json({ secret, otpauthUrl: url, qrSvg, recoveryCodes });
  });

  app.post("/api/2fa/setup/confirm", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const user = await db.get<UserWithTotp>("SELECT * FROM users WHERE id = ?", admin.id);
    if (!user?.totp_secret) {
      return c.json({ error: "2FA belum disiapkan. Mulai setup terlebih dahulu." }, 400);
    }
    const code = asString((await readJson(c)).code).trim();
    if (!(await verifyTotp(user.totp_secret, code))) {
      return c.json({ error: "Kode verifikasi salah." }, 400);
    }
    await db.run("UPDATE users SET totp_enabled = 1 WHERE id = ?", admin.id);
    return c.json({ ok: true });
  });

  app.post("/api/2fa/disable", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const user = await db.get<UserWithTotp>("SELECT * FROM users WHERE id = ?", admin.id);
    if (!user?.totp_secret || user.totp_enabled !== 1) {
      return c.json({ error: "2FA belum aktif." }, 400);
    }
    const code = asString((await readJson(c)).code).trim();
    if (!(await verifyTotp(user.totp_secret, code))) {
      return c.json({ error: "Kode verifikasi salah." }, 400);
    }
    await db.run("UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?", admin.id);
    await db.run("DELETE FROM recovery_codes WHERE user_id = ?", admin.id);
    return c.json({ ok: true });
  });

  app.get("/api/2fa/status", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const user = await db.get<UserWithTotp>(
      "SELECT totp_enabled FROM users WHERE id = ?",
      admin.id
    );
    return c.json({ enabled: (user?.totp_enabled ?? 0) === 1 });
  });

  // ------------------------- Konfigurasi publik -------------------------
  // Hanya site key Turnstile (publik). Secret TIDAK PERNAH di sini.

  app.get("/api/config", async (c) => {
    return c.json({ turnstileSiteKey: getEnv().turnstileSiteKey || null });
  });

  app.get("/api/auth/me", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    return c.json({ user: publicUser(user) });
  });

  app.post("/api/auth/logout", async (c) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (token) await db.run("DELETE FROM sessions WHERE token = ?", token);
    return c.json({ ok: true });
  });

  app.post("/api/account/whatsapp", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const whatsapp = normalizeWhatsapp(asString(body.whatsapp).trim());
    if (!whatsapp) return c.json({ error: "Nomor WhatsApp tidak valid." }, 400);
    await db.run("UPDATE users SET whatsapp = ? WHERE id = ?", whatsapp, user.id);
    const updated = await db.get<User>("SELECT * FROM users WHERE id = ?", user.id);
    return c.json({ user: publicUser(updated ?? user) });
  });

  // ------------------------- Tracker -------------------------

  app.get("/api/tracker", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const days = (await db.all<{ date: string }>("SELECT date FROM study_days WHERE user_id = ? ORDER BY date DESC", user.id))
      .map((r) => r.date);
    const doneChapters = await db.all<{ product_id: string; chapter_id: string; done_at: string }>(
      "SELECT product_id, chapter_id, done_at FROM tracker WHERE user_id = ? ORDER BY done_at DESC",
      user.id
    );
    const stickers = await db.all<{ chapter_id: string; earned_at: string }>(
      "SELECT chapter_id, earned_at FROM stickers WHERE user_id = ? ORDER BY earned_at",
      user.id
    );
    const scores = await db.all<{ id: number; kind: string; ref_id: string; score: number; max_score: number; created_at: string }>(
      "SELECT id, kind, ref_id, score, max_score, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC",
      user.id
    );
    const badges = computeBadges(doneChapters.length, stickers.length, scores);
    return c.json({
      streak: computeStreak(days),
      studyDays: days,
      doneChapters,
      badges,
      stickers,
      scores
    });
  });

  // ------------------------- Prediksi nilai SAS -------------------------
  // Perkiraan nilai SAS dari rata-rata BERBOBOT skor simulasi per mapel:
  // di tiap mapel, simulasi lama berbobot 1, makin baru makin berat
  // (bobot = urutan ke-i, jadi simulasi terbaru paling menentukan).
  // Hanya simulasi SAS per mapel (kind = 'simulation') yang dipakai,
  // bukan kuis bab 10 soal. Hasilnya perkiraan, bukan nilai resmi.

  app.get("/api/prediction", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);

    const attempts = await db.all<{
      ref_id: string;
      score: number;
      max_score: number;
      created_at: string;
      subject: string;
      grade: number;
      product_id: string | null;
      title: string;
    }>(
      `SELECT qa.ref_id, qa.score, qa.max_score, qa.created_at,
              s.subject, s.grade, s.product_id, s.title
       FROM quiz_attempts qa JOIN simulations s ON s.id = qa.ref_id
       WHERE qa.user_id = ? AND qa.kind = 'simulation'
       ORDER BY qa.created_at ASC, qa.id ASC`,
      user.id
    );
    if (attempts.length === 0) {
      return c.json({ hasData: false, overall: null, totalSimulations: 0, subjects: [], weakChapters: [] });
    }

    const groups = new Map<string, typeof attempts>();
    for (const a of attempts) {
      const key = `${a.subject}|||${a.grade}`;
      const arr = groups.get(key) ?? [];
      arr.push(a);
      groups.set(key, arr);
    }
    const subjects = [...groups.values()]
      .map((arr) => {
        const last = arr[arr.length - 1];
        let weighted = 0;
        let weightSum = 0;
        arr.forEach((a, i) => {
          const pct = a.max_score > 0 ? (a.score / a.max_score) * 100 : 0;
          const w = i + 1;
          weighted += pct * w;
          weightSum += w;
        });
        return {
          subject: last.subject,
          grade: last.grade,
          product_id: last.product_id,
          prediction: Math.round(weighted / weightSum),
          attempts: arr.length,
          latest_percent: last.max_score > 0 ? Math.round((last.score / last.max_score) * 100) : 0,
          latest_at: last.created_at
        };
      })
      .sort((a, b) => a.prediction - b.prediction || a.subject.localeCompare(b.subject));
    const overall = Math.round(subjects.reduce((sum, s) => sum + s.prediction, 0) / subjects.length);

    // Bab yang perlu diulang: dari 2 mapel terlemah, utamakan bab yang
    // belum selesai; bila semua sudah selesai, sarankan ulang bab awal.
    const done = new Set(
      (await db.all<{ chapter_id: string }>("SELECT chapter_id FROM tracker WHERE user_id = ?", user.id)).map(
        (r) => r.chapter_id
      )
    );
    const weakChapters: {
      chapter_id: string;
      product_id: string;
      title: string;
      subject: string;
      grade: number;
      reason: string;
    }[] = [];
    for (const s of subjects.slice(0, 2)) {
      if (weakChapters.length >= 3) break;
      let chs = s.product_id
        ? await db.all<{ id: string; product_id: string; title: string; subject: string; grade: number }>(
            "SELECT id, product_id, title, subject, grade FROM chapters WHERE product_id = ? AND subject = ? AND grade = ? ORDER BY sort_order, id",
            s.product_id,
            s.subject,
            s.grade
          )
        : [];
      if (chs.length === 0) {
        chs = await db.all<{ id: string; product_id: string; title: string; subject: string; grade: number }>(
          "SELECT id, product_id, title, subject, grade FROM chapters WHERE subject = ? AND grade = ? ORDER BY sort_order, id",
          s.subject,
          s.grade
        );
      }
      const notDone = chs.filter((ch) => !done.has(ch.id));
      const picks = (notDone.length > 0 ? notDone : chs).slice(0, 3 - weakChapters.length);
      for (const ch of picks) {
        weakChapters.push({
          chapter_id: ch.id,
          product_id: ch.product_id,
          title: ch.title,
          subject: ch.subject,
          grade: ch.grade,
          reason:
            notDone.length > 0
              ? `${s.subject} Kelas ${s.grade} masih ${s.prediction}% — pelajari bab ini, yuk!`
              : `${s.subject} Kelas ${s.grade} masih ${s.prediction}% — ulang lagi bab ini!`
        });
      }
    }
    return c.json({ hasData: true, overall, totalSimulations: attempts.length, subjects, weakChapters });
  });

  app.get("/api/stickers", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const stickers = await db.all<{ chapter_id: string; earned_at: string }>(
      "SELECT chapter_id, earned_at FROM stickers WHERE user_id = ? ORDER BY earned_at",
      user.id
    );
    const doneCount = (await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ?",
      user.id
    ))?.n ?? 0;
    const scores = await db.all<{ kind: string; score: number; max_score: number }>(
      "SELECT kind, score, max_score FROM quiz_attempts WHERE user_id = ?",
      user.id
    );
    return c.json({ stickers, badges: computeBadges(doneCount, stickers.length, scores) });
  });

  // ------------------------- Katalog & produk -------------------------

  app.get("/api/catalog", async (c) => {
    const products = await db.all<Product>("SELECT * FROM products WHERE active = 1 ORDER BY created_at, id");
    return c.json({ products: products.map(publicProduct) });
  });

  app.get("/api/products/:id", async (c) => {
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const chapters = await db.all<Chapter>(
      "SELECT * FROM chapters WHERE product_id = ? ORDER BY sort_order, id",
      product.id
    );
    const images = await db.all<ProductImage>(
      "SELECT * FROM product_images WHERE product_id = ? ORDER BY id",
      product.id
    );
    const memberRows = await db.all<{ product_id: string }>(
      "SELECT product_id FROM bundle_members WHERE bundle_product_id = ? ORDER BY product_id",
      product.id
    );
    const bundleItems = (
      await Promise.all(
        memberRows.map((m) => db.get<Product>("SELECT * FROM products WHERE id = ?", m.product_id))
      )
    )
      .filter((p): p is Product => !!p)
      .map((p) => ({ product_id: p.id, title: p.title, price: p.price }));
    return c.json({
      product: publicProduct(product),
      chapters: chapters.map((ch) => ({
        id: ch.id,
        title: ch.title,
        subject: ch.subject,
        grade: ch.grade,
        semester: ch.semester,
        sort_order: ch.sort_order,
        video_url: ch.video_url,
        video_duration: ch.video_duration,
        short_url: ch.short_url,
        short_duration: ch.short_duration
      })),
      images: images.map((im) => ({ id: im.id, url: im.url, kind: im.kind })),
      bundleItems
    });
  });

  // ------------------------- Admin: produk -------------------------

  app.get("/api/admin/products", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const products = await db.all<Product>("SELECT * FROM products ORDER BY created_at, id");
    return c.json({ products });
  });

  // ------------------------- Admin: ringkasan dashboard -------------------------
  // Satu endpoint untuk tab Ringkasan: angka-angka agregat + 10 order
  // terbaru. Semua dari database asli; tanpa migrasi/tabel baru.

  app.get("/api/admin/stats", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const productRow = await db.get<{ total: number; visible: number; hidden: number }>(
      "SELECT COUNT(*) AS total, COALESCE(SUM(active = 1), 0) AS visible, COALESCE(SUM(active = 0), 0) AS hidden FROM products"
    );
    const userRow = await db.get<{ total: number }>("SELECT COUNT(*) AS total FROM users");
    const orderRow = await db.get<{ total: number; paid: number; revenue: number }>(
      "SELECT COUNT(*) AS total, COALESCE(SUM(status = 'PAID'), 0) AS paid, COALESCE(SUM(CASE WHEN status = 'PAID' THEN COALESCE(total_amount, total) ELSE 0 END), 0) AS revenue FROM orders"
    );
    const voucherRow = await db.get<{ active: number }>(
      "SELECT COALESCE(SUM(active = 1), 0) AS active FROM vouchers"
    );
    const emailRow = await db.get<{ total: number }>("SELECT COUNT(*) AS total FROM sent_emails");
    const recent = await db.all<{
      id: string;
      total: number;
      total_amount: number | null;
      status: string;
      created_at: string;
      paid_at: string | null;
      items: string;
      buyer_name: string | null;
      buyer_email: string | null;
    }>(
      `SELECT o.id, o.total, o.total_amount, o.status, o.created_at, o.paid_at, o.items,
              u.name AS buyer_name, u.email AS buyer_email
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 10`
    );
    return c.json({
      stats: {
        products_total: productRow?.total ?? 0,
        products_visible: productRow?.visible ?? 0,
        products_hidden: productRow?.hidden ?? 0,
        users_total: userRow?.total ?? 0,
        orders_total: orderRow?.total ?? 0,
        orders_paid: orderRow?.paid ?? 0,
        revenue_paid: orderRow?.revenue ?? 0,
        vouchers_active: voucherRow?.active ?? 0,
        emails_sent: emailRow?.total ?? 0
      },
      recentOrders: recent.map((o) => ({
        id: o.id,
        buyer_name: o.buyer_name,
        buyer_email: o.buyer_email,
        products: parseItems(o.items)
          .filter((it) => !it.included_in_bundle)
          .map((it) => it.title),
        total: o.total_amount ?? o.total,
        status: o.status,
        created_at: o.created_at,
        paid_at: o.paid_at
      }))
    });
  });

  app.post("/api/admin/products", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const body = await readJson(c);
    const title = asString(body.title).trim();
    const price = asNumber(body.price);
    if (!title) return c.json({ error: "Judul produk wajib diisi." }, 400);
    if (price === undefined || price < 0) return c.json({ error: "Harga produk tidak valid." }, 400);
    const id = asString(body.id).trim() || newId("prd");
    const existing = await db.get<Product>("SELECT id FROM products WHERE id = ?", id);
    if (existing) return c.json({ error: "ID produk sudah dipakai." }, 409);
    const externalUrl = asString(body.external_url).trim() || null;
    if (externalUrl && !isHttpUrl(externalUrl)) {
      return c.json({ error: "Link eksternal harus diawali http:// atau https://." }, 400);
    }
    await db.run(
      `INSERT INTO products (id, title, jenjang, mapel, price, strikethrough_price, pages, cover_label, cover_color, badge, active, category, description, external_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      title,
      asString(body.jenjang) || "SD",
      asString(body.mapel) || "",
      price,
      asNumber(body.strikethrough_price) ?? null,
      asNumber(body.pages) ?? 0,
      asString(body.cover_label) || "",
      asString(body.cover_color) || "#2273d8",
      asString(body.badge) || null,
      asNumber(body.active) ?? 1,
      asString(body.category) || "SD",
      asString(body.description) || "",
      externalUrl,
      nowIso()
    );
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", id);
    await logAdminAction(db, admin, "product_create", id, title);
    return c.json({ product }, 201);
  });

  app.put("/api/admin/products/:id", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const id = c.req.param("id");
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", id);
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const allowed: (keyof Product)[] = [
      "title", "jenjang", "mapel", "price", "strikethrough_price", "pages",
      "cover_label", "cover_color", "badge", "active", "category", "description", "external_url"
    ];
    const sets: string[] = [];
    const params: SQLInputValue[] = [];
    for (const key of allowed) {
      if (key in body) {
        if (key === "external_url") {
          const v = asString(body.external_url).trim() || null;
          if (v && !isHttpUrl(v)) {
            return c.json({ error: "Link eksternal harus diawali http:// atau https://." }, 400);
          }
          sets.push("external_url = ?");
          params.push(v);
        } else if (key === "price" || key === "strikethrough_price" || key === "pages" || key === "active") {
          const v = asNumber(body[key]);
          if (v === undefined && key === "price") {
            return c.json({ error: "Harga produk tidak valid." }, 400);
          }
          sets.push(`${key} = ?`);
          params.push(v ?? null);
        } else {
          sets.push(`${key} = ?`);
          params.push(asString(body[key]));
        }
      }
    }
    if (sets.length === 0) return c.json({ error: "Tidak ada perubahan." }, 400);
    await db.run(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`, ...params, id);
    const updated = await db.get<Product>("SELECT * FROM products WHERE id = ?", id);
    await logAdminAction(db, admin, "product_update", id, updated?.title ?? product.title);
    return c.json({ product: updated });
  });

  app.delete("/api/admin/products/:id", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    // bundle_members tidak memiliki foreign key agar seed database baru bisa berjalan,
    // sehingga referensi bundel harus dibersihkan eksplisit saat produk dihapus.
    await db.run("DELETE FROM bundle_members WHERE bundle_product_id = ? OR product_id = ?", product.id, product.id);
    await db.run("DELETE FROM products WHERE id = ?", product.id);
    await logAdminAction(db, admin, "product_delete", product.id, product.title);
    return c.json({ ok: true });
  });

  app.post("/api/admin/products/:id/active", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const active = asNumber(body.active);
    if (active !== 0 && active !== 1) return c.json({ error: "Nilai active harus 0 atau 1." }, 400);
    await db.run("UPDATE products SET active = ? WHERE id = ?", active, product.id);
    const updated = await db.get<Product>("SELECT * FROM products WHERE id = ?", product.id);
    await logAdminAction(db, admin, "product_set_active", product.id, `${product.title} -> active=${active}`);
    return c.json({ product: updated });
  });

  app.post("/api/admin/products/:id/external-link", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const url = asString(body.url).trim() || null;
    if (url && !isHttpUrl(url)) {
      return c.json({ error: "Link eksternal harus diawali http:// atau https://." }, 400);
    }
    await db.run("UPDATE products SET external_url = ? WHERE id = ?", url, product.id);
    const updated = await db.get<Product>("SELECT * FROM products WHERE id = ?", product.id);
    await logAdminAction(db, admin, "product_external_link", product.id, url ?? "(dihapus)");
    return c.json({ product: updated });
  });

  app.post("/api/admin/products/:id/images", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const filename = asString(body.filename).trim();
    const dataUrl = asString(body.dataUrl);
    const kind = asString(body.kind) === "feature" ? "feature" : "gallery";
    if (!filename || !dataUrl) {
      return c.json({ error: "Nama berkas dan data gambar wajib diisi." }, 400);
    }
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    const mime = match ? match[1] : "image/png";
    const base64 = match ? match[2] : dataUrl;
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(base64)) {
      return c.json({ error: "Data gambar base64 tidak valid." }, 400);
    }
    const extFromMime: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif"
    };
    const safeBase = filename.split(/[\\/]/).pop()?.replace(/[^A-Za-z0-9._-]/g, "_") || "gambar";
    const hasExt = /\.[A-Za-z0-9]{2,5}$/.test(safeBase);
    const safeName = `${Date.now()}-${hasExt ? safeBase : safeBase + (extFromMime[mime] ?? ".png")}`;
    let url: string;
    try {
      // Di Worker (Cloudflare), storage ini melempar Error dan handler
      // mengembalikan 501 — berkas tidak persisten di Workers (butuh R2).
      url = await storage.save(product.id, safeName, base64);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Gagal menyimpan gambar." },
        501
      );
    }
    if (kind === "feature") {
      await db.run("UPDATE product_images SET kind = 'gallery' WHERE product_id = ? AND kind = 'feature'", product.id);
    }
    const result = await db.run(
      "INSERT INTO product_images (product_id, url, kind, created_at) VALUES (?, ?, ?, ?)",
      product.id,
      url,
      kind,
      nowIso()
    );
    const image = await db.get<ProductImage>(
      "SELECT * FROM product_images WHERE id = ?",
      Number(result.lastInsertRowid)
    );
    await logAdminAction(db, admin, "product_image_upload", product.id, `${safeName} (${kind})`);
    return c.json({ image }, 201);
  });

  app.delete("/api/admin/images/:id", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const image = await db.get<ProductImage>("SELECT * FROM product_images WHERE id = ?", c.req.param("id"));
    if (!image) return c.json({ error: "Gambar tidak ditemukan." }, 404);
    // Berkas dihapus best-effort; baris DB tetap dihapus apa pun hasilnya.
    await storage.delete(image.url);
    await db.run("DELETE FROM product_images WHERE id = ?", image.id);
    await logAdminAction(db, admin, "product_image_delete", String(image.id), `produk ${image.product_id}`);
    return c.json({ ok: true });
  });

  app.post("/api/admin/products/:id/feature", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const body = await readJson(c);
    const imageId = asNumber(body.image_id);
    if (imageId === undefined) return c.json({ error: "image_id wajib diisi." }, 400);
    const image = await db.get<ProductImage>(
      "SELECT * FROM product_images WHERE id = ? AND product_id = ?",
      imageId,
      product.id
    );
    if (!image) return c.json({ error: "Gambar tidak ditemukan." }, 404);
    await db.run("UPDATE product_images SET kind = 'gallery' WHERE product_id = ? AND kind = 'feature'", product.id);
    await db.run("UPDATE product_images SET kind = 'feature' WHERE id = ?", imageId);
    const updated = await db.get<ProductImage>("SELECT * FROM product_images WHERE id = ?", imageId);
    await logAdminAction(db, admin, "product_set_feature", product.id, `gambar ${imageId}`);
    return c.json({ image: updated });
  });

  app.get("/api/admin/users", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const users = await db.all<{
      id: string; name: string; email: string; role: string; whatsapp: string | null;
      created_at: string; order_count: number;
    }>(
      `SELECT u.id, u.name, u.email, u.role, u.whatsapp, u.created_at,
              COUNT(o.id) AS order_count
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at, u.email`
    );
    return c.json({ users });
  });

  app.post("/api/admin/users/:id/role", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const targetId = c.req.param("id");
    if (targetId === admin.id) {
      return c.json({ error: "Admin tidak dapat mengubah role akunnya sendiri." }, 403);
    }
    const target = await db.get<User>("SELECT * FROM users WHERE id = ?", targetId);
    if (!target) return c.json({ error: "Pengguna tidak ditemukan." }, 404);
    const body = await readJson(c);
    const role = asString(body.role);
    if (role !== "admin" && role !== "customer") {
      return c.json({ error: "Role harus admin atau customer." }, 400);
    }
    await db.run("UPDATE users SET role = ? WHERE id = ?", role, targetId);
    const updated = await db.get<User>("SELECT * FROM users WHERE id = ?", targetId);
    await logAdminAction(db, admin, "user_set_role", targetId, `${target.email} -> ${role}`);
    return c.json({ user: publicUser(updated ?? target) });
  });

  app.post("/api/admin/users/:id/reset-password", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const targetId = c.req.param("id");
    if (targetId === admin.id) {
      return c.json({ error: "Admin tidak dapat mereset kata sandi akunnya sendiri." }, 403);
    }
    const target = await db.get<User>("SELECT * FROM users WHERE id = ?", targetId);
    if (!target) return c.json({ error: "Pengguna tidak ditemukan." }, 404);
    const body = await readJson(c);
    const password = asString(body.password);
    const pwCheck = await validatePassword(password);
    if (!pwCheck.ok) return c.json({ error: pwCheck.error }, 400);
    // Kata sandi TIDAK PERNAH masuk log/respons — hanya hash-nya yang
    // disimpan, persis seperti register (bcryptjs, salt 10). Ini reset
    // oleh admin, BUKAN alur lupa-kata-sandi mandiri (alur itu belum ada).
    const hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
    await db.run("UPDATE users SET password_hash = ? WHERE id = ?", hash, targetId);
    await logAdminAction(db, admin, "user_reset_password", targetId, target.email);
    return c.json({ ok: true });
  });

  // ------------------------- Admin: order (daftar + detail) -------------------------

  app.get("/api/admin/orders", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const q = (c.req.query("q") ?? "").trim();
    const statusRaw = (c.req.query("status") ?? "").trim().toUpperCase();
    const status = statusRaw === "" ? null : statusRaw;
    if (status !== null && status !== "PENDING" && status !== "PAID" && status !== "EXPIRED") {
      return c.json({ error: "Status harus PENDING, PAID, atau EXPIRED." }, 400);
    }
    const page = Math.max(1, Math.floor(Number(c.req.query("page") ?? 1) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(c.req.query("limit") ?? 20) || 20)));
    const conds: string[] = [];
    const params: SQLInputValue[] = [];
    if (q) {
      const like = `%${q}%`;
      conds.push("(o.id LIKE ? OR u.email LIKE ?)");
      params.push(like, like);
    }
    if (status) {
      conds.push("o.status = ?");
      params.push(status);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const total = (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM orders o LEFT JOIN users u ON u.id = o.user_id ${where}`,
      ...params
    ))?.n ?? 0;
    const rows = await db.all<{
      id: string;
      total: number;
      total_amount: number | null;
      status: string;
      created_at: string;
      paid_at: string | null;
      items: string;
      buyer_name: string | null;
      buyer_email: string | null;
    }>(
      `SELECT o.id, o.total, o.total_amount, o.status, o.created_at, o.paid_at, o.items,
              u.name AS buyer_name, u.email AS buyer_email
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
       ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      ...params,
      limit,
      (page - 1) * limit
    );
    const pages = Math.max(1, Math.ceil(total / limit));
    return c.json({
      orders: rows.map((o) => ({
        id: o.id,
        buyer_name: o.buyer_name,
        buyer_email: o.buyer_email,
        // Seperti /api/admin/stats: baris anggota bundel disembunyikan.
        products: parseItems(o.items)
          .filter((it) => !it.included_in_bundle)
          .map((it) => it.title),
        total: o.total_amount ?? o.total,
        status: o.status,
        created_at: o.created_at,
        paid_at: o.paid_at
      })),
      total,
      page,
      pages
    });
  });

  app.get("/api/admin/orders/:id", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    const buyer = await db.get<User>("SELECT * FROM users WHERE id = ?", order.user_id);
    return c.json({
      order: {
        id: order.id,
        user_id: order.user_id,
        buyer_name: buyer?.name ?? null,
        buyer_email: buyer?.email ?? null,
        whatsapp: order.whatsapp ?? buyer?.whatsapp ?? null,
        // Detail admin menampilkan SEMUA baris items, termasuk anggota
        // bundel (included_in_bundle) — beda dengan orderOut klien.
        items: parseItems(order.items),
        total: order.total,
        total_amount: order.total_amount,
        discount_amount: order.discount_amount ?? 0,
        voucher_code: order.voucher_code ?? null,
        status: order.status,
        created_at: order.created_at,
        paid_at: order.paid_at,
        expired_at: order.expired_at,
        klikqris_order_id: order.klikqris_order_id
      }
    });
  });

  // ------------------------- Admin: kirim ulang email -------------------------
  // Satu-satunya pemakai `force: true` — lihat server/email.ts. Pemicu
  // otomatis (register/checkout/webhook/polling/cron) TIDAK PERNAH
  // memakai force, jadi idempotensi mereka tidak berubah.

  app.post("/api/admin/resend-email", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const body = await readJson(c);
    const template = asString(body.template);
    if (
      template !== "welcome" &&
      template !== "pending" &&
      template !== "paid" &&
      template !== "expired"
    ) {
      return c.json({ error: "Template harus welcome, pending, paid, atau expired." }, 400);
    }
    let result: Awaited<ReturnType<typeof sendWelcomeEmail>>;
    let target = "";
    let detail = "";
    if (template === "welcome") {
      const userId = asString(body.userId);
      if (!userId) return c.json({ error: "userId wajib diisi untuk template welcome." }, 400);
      const user = await db.get<User>("SELECT * FROM users WHERE id = ?", userId);
      if (!user) return c.json({ error: "Pengguna tidak ditemukan." }, 404);
      result = await sendWelcomeEmail(db, user, { force: true });
      target = user.id;
      detail = `welcome -> ${user.email}`;
    } else {
      const orderId = asString(body.orderId);
      if (!orderId) return c.json({ error: "orderId wajib diisi untuk template ini." }, 400);
      const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", orderId);
      if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
      // paid menuntut status PAID — diperiksa di dalam sendPaidEmail
      // (mengembalikan { sent: false, error: "Order belum lunas." }).
      if (template === "pending") result = await sendPendingEmail(db, order, { force: true });
      else if (template === "paid") result = await sendPaidEmail(db, order, { force: true });
      else result = await sendExpiredEmail(db, order, { force: true });
      target = order.id;
      detail = `${template} -> order ${order.id}`;
    }
    await logAdminAction(db, admin, "email_resend", target, detail);
    return c.json(result);
  });

  // ------------------------- Admin: ekspor CSV -------------------------
  // RFC 4180 lewat csvCell (kutip bila ada koma/kutip/baris baru,
  // gandakan kutip). Tanpa BOM — sama seperti rekap kelas di
  // GET /api/class/:id/recap.

  app.get("/api/admin/export/orders.csv", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const rows = await db.all<{
      id: string;
      created_at: string;
      paid_at: string | null;
      total: number;
      total_amount: number | null;
      voucher_code: string | null;
      discount_amount: number;
      status: string;
      whatsapp: string | null;
      items: string;
      buyer_name: string | null;
      buyer_email: string | null;
    }>(
      `SELECT o.id, o.created_at, o.paid_at, o.total, o.total_amount,
              o.voucher_code, o.discount_amount, o.status, o.whatsapp, o.items,
              u.name AS buyer_name, u.email AS buyer_email
       FROM orders o LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 5000`
    );
    const lines = [
      "order_id,tanggal_buat,tanggal_bayar,pembeli_nama,pembeli_email,whatsapp,produk,total,total_dibayar,kode_voucher,diskon,status"
    ];
    for (const o of rows) {
      // Produk digabung "; " (bukan koma) supaya tetap satu sel yang
      // mudah dibaca; baris anggota bundel disembunyikan seperti stats.
      const produk = parseItems(o.items)
        .filter((it) => !it.included_in_bundle)
        .map((it) => it.title)
        .join("; ");
      lines.push(
        [
          csvCell(o.id),
          csvCell(o.created_at),
          csvCell(o.paid_at),
          csvCell(o.buyer_name),
          csvCell(o.buyer_email),
          csvCell(o.whatsapp),
          csvCell(produk),
          csvCell(o.total),
          csvCell(o.total_amount ?? o.total),
          csvCell(o.voucher_code),
          csvCell(o.discount_amount ?? 0),
          csvCell(o.status)
        ].join(",")
      );
    }
    await logAdminAction(db, admin, "export_orders", undefined, `${rows.length} order`);
    return c.body(lines.join("\n"), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rekap-order-ringkas.csv"`
    });
  });

  app.get("/api/admin/export/users.csv", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const rows = await db.all<{
      id: string;
      name: string;
      email: string;
      role: string;
      whatsapp: string | null;
      created_at: string;
      order_count: number;
    }>(
      `SELECT u.id, u.name, u.email, u.role, u.whatsapp, u.created_at,
              COUNT(o.id) AS order_count
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at, u.email`
    );
    const lines = ["nama,email,whatsapp,role,tanggal_daftar,jumlah_order"];
    for (const u of rows) {
      lines.push(
        [
          csvCell(u.name),
          csvCell(u.email),
          csvCell(u.whatsapp),
          csvCell(u.role),
          csvCell(u.created_at),
          csvCell(u.order_count)
        ].join(",")
      );
    }
    await logAdminAction(db, admin, "export_users", undefined, `${rows.length} pengguna`);
    return c.body(lines.join("\n"), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pengguna-ringkas.csv"`
    });
  });

  // ------------------------- Admin: pengaturan situs -------------------------
  // Tabel settings (migrasi 0008). Teks maks. 500 karakter; saklar
  // hanya 0/1. Body parsial — hanya kunci yang dikirim yang diubah.

  app.get("/api/admin/settings", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    return c.json({ settings: await readSettings(db) });
  });

  app.post("/api/admin/settings", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const body = await readJson(c);
    const updates: [string, string][] = [];
    for (const key of ["announcement_text", "promo_text"] as const) {
      if (key in body) {
        const v = body[key];
        if (typeof v !== "string" || v.length > 500) {
          return c.json({ error: `${key} harus teks maksimal 500 karakter.` }, 400);
        }
        updates.push([key, v]);
      }
    }
    for (const key of ["announcement_enabled", "promo_enabled"] as const) {
      if (key in body) {
        const v = body[key];
        if (v !== 0 && v !== 1) {
          return c.json({ error: `${key} harus 0 atau 1.` }, 400);
        }
        updates.push([key, String(v)]);
      }
    }
    if (updates.length === 0) return c.json({ error: "Tidak ada perubahan." }, 400);
    const stamp = nowIso();
    for (const [key, value] of updates) {
      await db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        key,
        value,
        stamp
      );
    }
    await logAdminAction(
      db,
      admin,
      "settings_update",
      undefined,
      updates.map(([key]) => key).join(", ")
    );
    return c.json({ settings: await readSettings(db) });
  });

  // ------------------------- Pengumuman (publik) -------------------------
  // Dibaca halaman beranda tanpa login; hanya teks + saklar tampil
  // (tidak ada data pengguna/order di sini).

  app.get("/api/announcement", async (c) => {
    return c.json(await readSettings(db));
  });

  app.post("/api/admin/chapters/:id/video", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const chapter = await db.get<Chapter>("SELECT * FROM chapters WHERE id = ?", c.req.param("id"));
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    const body = await readJson(c);
    const videoUrl = asString(body.video_url).trim() || null;
    if (videoUrl && !isHttpUrl(videoUrl)) {
      return c.json({ error: "Link video harus diawali http:// atau https://." }, 400);
    }
    const videoDuration = videoUrl ? asString(body.video_duration).trim() || null : null;
    // Video pendek vertikal (9:16): boleh URL http(s) atau path relatif
    // situs (mis. /shorts/membilang-10.html) — halaman statis Ringkas.
    const shortUrlRaw = asString(body.short_url).trim() || null;
    let shortUrl: string | null = null;
    if (shortUrlRaw) {
      if (isHttpUrl(shortUrlRaw) || shortUrlRaw.startsWith("/")) shortUrl = shortUrlRaw;
      else {
        return c.json(
          { error: "Link video pendek harus diawali http://, https://, atau / (path situs)." },
          400
        );
      }
    }
    const shortDuration = shortUrl ? asString(body.short_duration).trim() || null : null;
    await db.run(
      "UPDATE chapters SET video_url = ?, video_duration = ?, short_url = ?, short_duration = ? WHERE id = ?",
      videoUrl,
      videoDuration,
      shortUrl,
      shortDuration,
      chapter.id
    );
    const updated = await db.get<Chapter>("SELECT * FROM chapters WHERE id = ?", chapter.id);
    await logAdminAction(db, admin, "chapter_video_set", chapter.id, chapter.title);
    return c.json({ chapter: updated });
  });

  // ------------------------- Admin: voucher & cron -------------------------

  app.get("/api/admin/vouchers", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const vouchers = await db.all<VoucherRow>("SELECT * FROM vouchers ORDER BY created_at DESC, code");
    return c.json({ vouchers: vouchers.map(publicVoucher) });
  });

  app.post("/api/admin/vouchers", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const body = await readJson(c);
    const code = asString(body.code).trim().toUpperCase();
    const type = asString(body.type);
    const value = asNumber(body.value);
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) {
      return c.json({ error: "Kode voucher harus 3-20 karakter huruf/angka/strip." }, 400);
    }
    if (type !== "percent" && type !== "fixed") {
      return c.json({ error: "Tipe voucher harus 'percent' atau 'fixed'." }, 400);
    }
    if (value === undefined || value <= 0 || (type === "percent" && value > 100)) {
      return c.json({ error: "Nilai voucher tidak valid (persen 1-100, nominal > 0)." }, 400);
    }
    const maxUses = asNumber(body.max_uses);
    if (maxUses !== undefined && (!Number.isInteger(maxUses) || maxUses < 1)) {
      return c.json({ error: "Maksimal pemakaian harus bilangan bulat minimal 1." }, 400);
    }
    const minTotal = asNumber(body.min_total) ?? 0;
    if (minTotal < 0) return c.json({ error: "Minimal belanja tidak valid." }, 400);
    const expiresRaw = asString(body.expires_at).trim() || null;
    let expiresAt: string | null = null;
    if (expiresRaw) {
      const d = new Date(expiresRaw);
      if (Number.isNaN(d.getTime())) {
        return c.json({ error: "Tanggal kedaluwarsa tidak valid." }, 400);
      }
      expiresAt = d.toISOString();
    }
    const existing = await db.get<VoucherRow>("SELECT code FROM vouchers WHERE code = ?", code);
    if (existing) return c.json({ error: "Kode voucher sudah dipakai." }, 409);
    await db.run(
      "INSERT INTO vouchers (code, type, value, max_uses, uses, min_total, expires_at, active, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, 1, ?)",
      code,
      type,
      value,
      maxUses ?? null,
      minTotal,
      expiresAt,
      nowIso()
    );
    const voucher = await db.get<VoucherRow>("SELECT * FROM vouchers WHERE code = ?", code);
    await logAdminAction(db, admin, "voucher_create", code, `${type} ${value}`);
    return c.json({ voucher: voucher ? publicVoucher(voucher) : null }, 201);
  });

  app.post("/api/admin/vouchers/:code/active", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const code = c.req.param("code").toUpperCase();
    const voucher = await db.get<VoucherRow>("SELECT * FROM vouchers WHERE code = ?", code);
    if (!voucher) return c.json({ error: "Voucher tidak ditemukan." }, 404);
    const body = await readJson(c);
    const active = asNumber(body.active);
    if (active !== 0 && active !== 1) {
      return c.json({ error: "Nilai active harus 0 atau 1." }, 400);
    }
    await db.run("UPDATE vouchers SET active = ? WHERE code = ?", active, code);
    const updated = await db.get<VoucherRow>("SELECT * FROM vouchers WHERE code = ?", code);
    await logAdminAction(db, admin, "voucher_set_active", code, `active=${active}`);
    return c.json({ voucher: updated ? publicVoucher(updated) : null });
  });

  app.post("/api/admin/cron/run", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const body = await readJson(c);
    const job = asString(body.job);
    const date = jobDate(asString(body.date) || undefined);
    if (job !== "daily" && job !== "weekly") {
      return c.json({ error: "job harus 'daily' atau 'weekly'." }, 400);
    }
    const result = job === "daily" ? await runDailyJob(db, date) : await runWeeklyJob(db, date);
    await logAdminAction(db, admin, "cron_run", undefined, job);
    return c.json(result);
  });

  // ------------------------- Admin: audit log & backup -------------------------
  // Audit log (migrasi 0009) dibaca di sini; backup mendump semua tabel
  // pengguna sebagai SQL dan mencatat last_backup_at di settings.

  app.get("/api/admin/audit-log", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const action = (c.req.query("action") ?? "").trim();
    const q = (c.req.query("q") ?? "").trim();
    const page = Math.max(1, Math.floor(Number(c.req.query("page") ?? 1) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(c.req.query("limit") ?? 20) || 20)));
    const conds: string[] = [];
    const params: SQLInputValue[] = [];
    if (action) {
      conds.push("action = ?");
      params.push(action);
    }
    if (q) {
      const like = `%${q}%`;
      conds.push("(admin_email LIKE ? OR detail LIKE ?)");
      params.push(like, like);
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
    const total = (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM admin_audit_log ${where}`,
      ...params
    ))?.n ?? 0;
    const items = await db.all<{
      id: number;
      admin_email: string;
      action: string;
      target: string | null;
      detail: string | null;
      created_at: string;
    }>(
      `SELECT id, admin_email, action, target, detail, created_at
       FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ...params,
      limit,
      (page - 1) * limit
    );
    return c.json({ items, total, page, limit });
  });

  app.get("/api/admin/backup", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const tables = await db.all<{ name: string }>(
      // _migrations (jejak migrasi lokal, dibuat db.migrate() — bukan
      // oleh berkas migrasi) dikecualikan seperti d1_migrations: tabel
      // pembukuan internal, bukan data pengguna.
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations', '_migrations') ORDER BY name"
    );
    const lines: string[] = [
      "-- ringkas-backup — dump database Ringkas (semua tabel pengguna).",
      `-- Dibuat: ${nowIso()}`,
      "-- Pulihkan dengan: sqlite3 ringkas.db < berkas-ini  (atau wrangler d1 execute --file=...)",
      "PRAGMA foreign_keys=OFF;",
      "BEGIN TRANSACTION;"
    ];
    for (const t of tables) {
      const cols = await tableColumns(db, t.name);
      if (cols.length === 0) continue;
      const safeName = t.name.replace(/"/g, '""');
      const rows = await db.all<Record<string, unknown>>(`SELECT * FROM "${safeName}"`);
      const colList = cols.map((col) => `"${col.replace(/"/g, '""')}"`).join(", ");
      for (const row of rows) {
        // INSERT OR REPLACE: restore ke DB yang sudah dimigrasi/di-seed
        // (mis. baris settings bawaan migrasi 0008) tidak boleh gagal
        // karena konflik PRIMARY KEY — nilai backup yang menang.
        lines.push(
          `INSERT OR REPLACE INTO "${safeName}" (${colList}) VALUES (${cols.map((col) => sqlEsc(row[col])).join(", ")});`
        );
      }
      lines.push(`-- ${t.name}: ${rows.length} baris`);
    }
    lines.push("COMMIT;");
    const sql = `${lines.join("\n")}\n`;
    // Catat waktu backup terakhir (best-effort; tabel settings dari
    // migrasi 0008 — bila belum ada, backup tetap dikembalikan).
    const stamp = nowIso();
    await db
      .run(
        `INSERT INTO settings (key, value, updated_at) VALUES ('last_backup_at', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        stamp,
        stamp
      )
      .catch((err) => console.error("[backup] gagal mencatat last_backup_at:", err));
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const filename = `ringkas-backup-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.sql`;
    return c.body(sql, 200, {
      "Content-Type": "application/sql",
      "Content-Disposition": `attachment; filename="${filename}"`
    });
  });

  // ------------------------- Voucher (cek sebelum checkout) -------------------------

  app.get("/api/voucher/validate", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const code = c.req.query("code") ?? "";
    const total = Number(c.req.query("total") ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      return c.json({ error: "Total tidak valid." }, 400);
    }
    const v = await validateVoucher(db, code, total);
    if (!v.ok) return c.json({ error: v.error }, 400);
    return c.json({
      valid: true,
      code: v.voucher.code,
      type: v.voucher.type,
      value: v.voucher.value,
      discount: v.discount,
      total_after: Math.max(total - v.discount, 100)
    });
  });

  // ------------------------- Referral -------------------------
  // GET /api/referral: kode ajakan saya (dibuat bila belum ada),
  // tautan bagikan, jumlah teman yang berhasil (referred_by = kode
  // saya DAN sudah pernah punya order PAID), dan daftar voucher
  // hadiah saya (sebagai pengajak maupun sebagai teman yang diajak).

  app.get("/api/referral", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const code = await ensureReferralCode(db, user.id, user.name);
    if (!code) {
      return c.json({ error: "Kode ajakan belum tersedia. Coba lagi sebentar lagi." }, 500);
    }
    const countRow = await db
      .get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM users u
         WHERE u.referred_by = ?
           AND EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'PAID')`,
        code
      )
      .catch(() => ({ n: 0 }));
    const rewards = await db
      .all<{
        referrer_user_id: string;
        referred_user_id: string;
        order_id: string;
        referrer_voucher_code: string;
        referred_voucher_code: string;
        created_at: string;
      }>(
        `SELECT * FROM referral_rewards
         WHERE referrer_user_id = ? OR referred_user_id = ?
         ORDER BY created_at DESC`,
        user.id,
        user.id
      )
      .catch(() => []);
    const vouchers: Record<string, unknown>[] = [];
    for (const r of rewards) {
      const isReferrer = r.referrer_user_id === user.id;
      const vcode = isReferrer ? r.referrer_voucher_code : r.referred_voucher_code;
      const v = await db
        .get<VoucherRow>("SELECT * FROM vouchers WHERE code = ?", vcode)
        .catch(() => undefined);
      if (!v) continue;
      vouchers.push({
        code: v.code,
        type: v.type,
        value: v.value,
        expires_at: v.expires_at,
        uses: v.uses,
        max_uses: v.max_uses,
        active: v.active,
        role: isReferrer ? "pengajak" : "teman",
        created_at: r.created_at
      });
    }
    return c.json({
      referral_code: code,
      share_url: `${appUrl()}/akun?ref=${code}`,
      referred_count: countRow?.n ?? 0,
      vouchers
    });
  });

  // ------------------------- Hadiah: klaim -------------------------
  // GET /api/gift/claim?token=... : info hadiah untuk halaman /hadiah.
  // Token adalah rahasianya — tapi endpoint ini TIDAK membocorkan
  // email pembeli maupun email penerima; hanya nama pemberi, nama
  // penerima (bila diisi), pesan, judul produk, dan status token.
  // POST /api/gift/claim: klaim butuh login, dan email akun HARUS sama
  // dengan email penerima hadiah. Akses dicatat di gift_grants
  // (lihat grantGiftAccess) sehingga gating LUNAS yang sudah ada
  // langsung mengenalinya.

  app.get("/api/gift/claim", async (c) => {
    const token = (c.req.query("token") ?? "").trim();
    if (!token) return c.json({ error: "Token klaim tidak ditemukan." }, 400);
    const order = await db
      .get<OrderRow>("SELECT * FROM orders WHERE gift_claim_token = ?", token)
      .catch(() => undefined);
    if (!order) {
      return c.json({ error: "Tautan hadiah tidak ditemukan. Periksa lagi tautan dari email hadiahmu." }, 404);
    }
    const buyer = await db
      .get<{ name: string }>("SELECT name FROM users WHERE id = ?", order.user_id)
      .catch(() => undefined);
    const items = parseItems(order.items).filter((it) => !it.included_in_bundle);
    const expired = order.gift_claim_expires_at
      ? new Date(order.gift_claim_expires_at).getTime() <= Date.now()
      : false;
    return c.json({
      valid: order.status === "PAID" && !expired && !order.gift_claimed_at,
      paid: order.status === "PAID",
      claimed: Boolean(order.gift_claimed_at),
      expired,
      products: items.map((it) => ({ product_id: it.product_id, title: it.title })),
      giver_name: buyer?.name ?? "Seseorang",
      recipient_name: order.gift_recipient_name ?? null,
      message: order.gift_message ?? null,
      expires_at: order.gift_claim_expires_at ?? null
    });
  });

  app.post("/api/gift/claim", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const token = asString((await readJson(c)).token).trim();
    if (!token) return c.json({ error: "Token klaim tidak ditemukan." }, 400);
    const order = await db
      .get<OrderRow>("SELECT * FROM orders WHERE gift_claim_token = ?", token)
      .catch(() => undefined);
    if (!order) {
      return c.json({ error: "Tautan hadiah tidak ditemukan. Periksa lagi tautan dari email hadiahmu." }, 404);
    }
    if (order.status !== "PAID") {
      return c.json({ error: "Hadiah ini belum lunas — tunggu sampai pembeli menyelesaikan pembayaran ya." }, 400);
    }
    if (order.gift_claim_expires_at && new Date(order.gift_claim_expires_at).getTime() <= Date.now()) {
      return c.json({ error: "Tautan klaim hadiah ini sudah kedaluwarsa. Minta pembeli untuk menghubungi admin Ringkas ya." }, 400);
    }
    if (
      (order.gift_recipient_email ?? "").trim().toLowerCase() !== user.email.toLowerCase()
    ) {
      return c.json(
        { error: "Hadiah ini dikirim ke alamat email lain. Masuk dengan email penerima hadiah untuk mengklaimnya." },
        403
      );
    }
    const items = parseItems(order.items).filter((it) => !it.included_in_bundle);
    const products = items.map((it) => ({ product_id: it.product_id, title: it.title }));
    if (order.gift_claimed_by && order.gift_claimed_by !== user.id) {
      return c.json({ error: "Hadiah ini sudah diklaim orang lain." }, 400);
    }
    // Sudah diklaim oleh akun ini (mis. akses otomatis saat PAID karena
    // email sudah punya akun) -> kembalikan sukses tanpa duplikasi grant.
    const already = await db
      .get<{ x: number }>(
        "SELECT 1 AS x FROM gift_grants WHERE order_id = ? AND user_id = ? LIMIT 1",
        order.id,
        user.id
      )
      .catch(() => undefined);
    if (already || order.gift_claimed_by === user.id) {
      return c.json({ ok: true, already: true, products });
    }
    await grantGiftAccess(db, order, user.id);
    await db.run(
      "UPDATE orders SET gift_claimed_at = ?, gift_claimed_by = ? WHERE id = ? AND gift_claimed_by IS NULL",
      nowIso(),
      user.id,
      order.id
    );
    return c.json({ ok: true, already: false, products });
  });

  // ------------------------- Checkout & order -------------------------

  app.post("/api/checkout", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    // Batas per IP: maks 20 checkout/jam/IP (setelah auth).
    if (!(await checkIpLimit(db, "checkout", clientIp(c), 20, 60 * 60 * 1000))) {
      return c.json({ error: "Terlalu banyak percobaan checkout dari alamat ini. Coba lagi nanti." }, 429);
    }
    const body = await readJson(c);
    const items = Array.isArray(body.items)
      ? body.items.filter((x): x is string => typeof x === "string")
      : [];
    if (items.length === 0) return c.json({ error: "Keranjang masih kosong." }, 400);
    const idempotencyKey = asString(body.idempotency_key).trim() || null;
    // Donasi "beli 1, donasi 1" (migrasi 0014): default false — alur
    // checkout normal tidak berubah bila flag ini tidak dikirim.
    const donate = body.donate === true;
    // Hadiah dibayar oleh pembeli tetapi kepemilikannya diberikan ke
    // penerima. Karena itu pembeli yang sudah memiliki produk tetap boleh
    // membeli item yang sama bila checkout ini benar-benar sebuah hadiah.
    const giftEmailRaw = asString(body.gift_recipient_email).trim().toLowerCase();
    const giftNameRaw = asString(body.gift_recipient_name).trim();
    const giftMessageRaw = asString(body.gift_message);
    const isGiftCheckout = giftEmailRaw !== "" || giftNameRaw !== "" || giftMessageRaw !== "";

    const products: Product[] = [];
    for (const pid of items) {
      const p = await db.get<Product>("SELECT * FROM products WHERE id = ?", pid);
      if (!p) return c.json({ error: `Produk ${pid} tidak ditemukan.` }, 404);
      if (p.active !== 1) return c.json({ error: `Produk ${p.title} sedang tidak aktif.` }, 400);
      products.push(p);
    }
    // Backend adalah pengaman utama: UI bisa usang, keranjang bisa tersisa
    // di localStorage, atau endpoint bisa dipanggil langsung. Produk yang
    // sudah dimiliki akun ini tidak boleh ditagihkan kembali.
    const alreadyOwned = await Promise.all(
      products.map(async (product) => (await userHasPaidProduct(db, user.id, product.id)) ? product.title : null)
    );
    const ownedTitles = alreadyOwned.filter((title): title is string => title !== null);
    if (!isGiftCheckout && ownedTitles.length) {
      return c.json(
        { error: `Produk sudah dimiliki: ${ownedTitles.join(", ")}. Buka dari Ruang Belajar.` },
        409
      );
    }
    const total = products.reduce((sum, p) => sum + p.price, 0);
    const itemsKey = [...items].sort().join(",");

    // Nomor WA dari checkout (opsional): snapshot di order + perbarui akun.
    let orderWhatsapp = user.whatsapp;
    const waRaw = asString(body.whatsapp).trim();
    if (waRaw) {
      const wa = normalizeWhatsapp(waRaw);
      if (!wa) return c.json({ error: "Nomor WhatsApp tidak valid." }, 400);
      orderWhatsapp = wa;
      if (wa !== user.whatsapp) {
        await db.run("UPDATE users SET whatsapp = ? WHERE id = ?", wa, user.id);
      }
    }

    // Idempotensi kunci: kunci sama selalu mengembalikan order yang sama
    // (tanpa validasi voucher ulang — kuota sudah terpakai di percobaan
    // pertama, jangan sampai retry gagal karena kuota habis).
    if (idempotencyKey) {
      const byKey = await db.get<OrderRow>(
        "SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ?",
        user.id,
        idempotencyKey
      );
      if (byKey) return c.json({ order: await orderOut(db, byKey) });
    }

    // Voucher (opsional): kodenya dinormalisasi dulu — dipakai untuk
    // mencocokkan order PENDING yang sama di bawah (retry checkout
    // dengan voucher yang sama harus mengembalikan order lama, bukan
    // gagal karena kuotanya sudah terpakai oleh order itu sendiri).
    const voucherCode = asString(body.voucher_code).trim().toUpperCase() || null;

    // Beli sebagai hadiah (opsional): bila salah satu field hadiah
    // dikirim, email penerima wajib + valid dan bukan email sendiri;
    // nama penerima opsional; pesan maks. 200 karakter. Token klaim
    // dibuat di sini (32 byte acak, heksadesimal) dan kedaluwarsa
    // 30 hari — akses pembeli TIDAK berubah: order hadiah tetap
    // dibayar pembeli, tapi aksesnya milik penerima (lihat orderOut
    // + fulfillGiftOrder).
    let giftEmail: string | null = null;
    let giftName: string | null = null;
    let giftMessage: string | null = null;
    let giftToken: string | null = null;
    let giftExpiresAt: string | null = null;
    if (isGiftCheckout) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(giftEmailRaw)) {
        return c.json({ error: "Email penerima hadiah wajib diisi dengan format yang benar." }, 400);
      }
      if (giftEmailRaw === user.email.toLowerCase()) {
        return c.json(
          { error: "Hadiah tidak bisa dikirim ke emailmu sendiri — alamat itu sudah punyamu." },
          400
        );
      }
      if (giftMessageRaw.length > 200) {
        return c.json({ error: "Pesan hadiah maksimal 200 karakter." }, 400);
      }
      giftEmail = giftEmailRaw;
      giftName = giftNameRaw.slice(0, 100) || null;
      giftMessage = giftMessageRaw.trim() || null;
      giftToken = newToken();
      giftExpiresAt = new Date(Date.now() + GIFT_CLAIM_DAYS * 24 * 3600 * 1000).toISOString();
    }

    // Idempotensi: item + kode voucher sama dan masih PENDING.
    // Baris anggota bundel (harga 0) tidak dihitung sebagai item inti.
    const pending = await db.all<OrderRow>(
      "SELECT * FROM orders WHERE user_id = ? AND status = 'PENDING'",
      user.id
    );
    for (const o of pending) {
      const oKey = parseItems(o.items)
        .filter((it) => !it.included_in_bundle)
        .map((it) => it.product_id)
        .sort()
        .join(",");
      const notExpired = !o.expired_at || new Date(o.expired_at).getTime() > Date.now();
      // Order hadiah hanya cocok dengan order hadiah ke penerima yang sama.
      const sameGift = (o.gift_recipient_email ?? null) === giftEmail;
      // Order donasi hanya cocok dengan order donasi (dan sebaliknya):
      // order lama punya baris donations ⇔ checkout ini donate.
      const sameDonate = (await orderHasDonation(db, o.id)) === donate;
      if (oKey === itemsKey && (o.voucher_code ?? null) === voucherCode && sameGift && sameDonate && notExpired) {
        return c.json({ order: await orderOut(db, o) });
      }
    }

    // Voucher divalidasi server-side terhadap total SEBELUM diskon.
    // Total akhir minimal Rp100 — tidak pernah negatif/nol.
    let discount = 0;
    if (voucherCode) {
      const v = await validateVoucher(db, voucherCode, total);
      if (!v.ok) return c.json({ error: v.error }, 400);
      discount = v.discount;
    }
    const finalTotal = Math.max(total - discount, 100);
    // Donasi: jumlahnya = total harga produk SEBELUM diskon voucher
    // (anggota bundel berharga 0, jadi tidak mengubah jumlah); yang
    // ditagih ke KlikQRIS = finalTotal + donationAmount (donasi = 2×
    // tagihan: harga produk + donasi penuh). Kolom orders.total tetap
    // menyimpan finalTotal (harga setelah diskon, tanpa donasi) —
    // total yang benar-benar dibayar tercatat di total_amount.
    const donationAmount = donate ? total : 0;
    const chargeTotal = finalTotal + donationAmount;

    const orderId = `RM-${randomAlphaNum(12)}`;
    const orderItems = await expandBundleItems(db, products);
    const checkoutFingerprint = [itemsKey, voucherCode ?? "", giftEmail ?? "", donate ? "donate" : "standard"].join("\u001f");
    // INSERT OR IGNORE adalah atomik di SQLite/D1. Kunci hanya ditahan
    // selama payment link dan order lokal sedang dibuat; sesudahnya order
    // PENDING yang sudah ada menjadi jalur idempotensi normal di atas.
    let lock = await db.run(
      "INSERT OR IGNORE INTO checkout_locks (user_id, fingerprint, order_id, created_at) VALUES (?, ?, ?, ?)",
      user.id,
      checkoutFingerprint,
      orderId,
      nowIso()
    );
    if (lock.changes === 0) {
      const activeLock = await db.get<{ order_id: string; created_at: string }>(
        "SELECT order_id, created_at FROM checkout_locks WHERE user_id = ? AND fingerprint = ?",
        user.id,
        checkoutFingerprint
      );
      // Worker yang berhenti di tengah request tidak boleh mengunci checkout
      // selamanya. Dua menit lebih lama daripada timeout API payment.
      if (activeLock && Date.now() - new Date(activeLock.created_at).getTime() > 2 * 60 * 1000) {
        await db.run(
          "DELETE FROM checkout_locks WHERE user_id = ? AND fingerprint = ? AND order_id = ?",
          user.id,
          checkoutFingerprint,
          activeLock.order_id
        );
        lock = await db.run(
          "INSERT OR IGNORE INTO checkout_locks (user_id, fingerprint, order_id, created_at) VALUES (?, ?, ?, ?)",
          user.id,
          checkoutFingerprint,
          orderId,
          nowIso()
        );
      }
      if (lock.changes === 0) {
        const existing = activeLock
          ? await db.get<OrderRow>("SELECT * FROM orders WHERE id = ? AND user_id = ?", activeLock.order_id, user.id)
          : undefined;
        if (existing) return c.json({ order: await orderOut(db, existing) });
        return c.json({ error: "Checkout sedang diproses. Coba lagi beberapa detik lagi." }, 409);
      }
    }
    let qris: {
      qris_url: string | null;
      direct_url: string | null;
      total_amount: number | null;
      expired_at: string | null;
    };
    // Kolom klikqris_order_id dipertahankan sebagai referensi payment
    // provider demi kompatibilitas skema lama. Untuk API pusat, nilainya
    // adalah payment_id dari api.by-rj.com, bukan order ID KlikQRIS.
    let paymentReference = orderId;
    try {
      const env = getEnv();
      if (!env.paymentApiUrl || !env.paymentApiKey) {
        throw new Error("Payment API belum dikonfigurasi");
      }
      const central = await createCentralPayment({
        orderId,
        amount: chargeTotal,
        idempotencyKey: idempotencyKey ?? `auto-${orderId}`,
        successReturnUrl: `${env.appUrl}/sukses?order=${encodeURIComponent(orderId)}`,
        cancelReturnUrl: `${env.appUrl}/checkout?order=${encodeURIComponent(orderId)}`,
        customerEmail: user.email,
        customerName: user.name,
        metadata: { source: "ringkas", user_id: user.id }
      });
      if (!central.payment_link_url) throw new Error("Payment API tidak mengembalikan tautan bayar.");
      paymentReference = central.payment_id;
      qris = {
        qris_url: null,
        direct_url: central.payment_link_url,
        total_amount: central.amount,
        expired_at: central.expires_at
      };
    } catch (err) {
      await db.run("DELETE FROM checkout_locks WHERE user_id = ? AND fingerprint = ? AND order_id = ?", user.id, checkoutFingerprint, orderId);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("belum dikonfigurasi")) {
        return c.json({ error: "Payment gateway belum dikonfigurasi. Pembayaran belum bisa diproses." }, 503);
      }
      console.error("[checkout] pembuatan payment gagal:", err);
      return c.json({ error: "Pembayaran QRIS gagal dibuat, silakan coba lagi." }, 503);
    }
    try {
      await db.run(
        `INSERT INTO orders (id, user_id, items, total, status, klikqris_order_id, qris_url, direct_url, total_amount, expired_at, whatsapp, idempotency_key, voucher_code, discount_amount, created_at, paid_at)
         VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        orderId,
        user.id,
        JSON.stringify(orderItems),
        finalTotal,
        paymentReference,
        qris.qris_url,
        qris.direct_url,
        qris.total_amount,
        qris.expired_at,
        orderWhatsapp,
        idempotencyKey ?? `auto-${orderId}`,
        voucherCode,
        discount,
        nowIso()
      );
    } catch (err) {
      await db.run("DELETE FROM checkout_locks WHERE user_id = ? AND fingerprint = ? AND order_id = ?", user.id, checkoutFingerprint, orderId);
      throw err;
    }
    await db.run("DELETE FROM checkout_locks WHERE user_id = ? AND fingerprint = ? AND order_id = ?", user.id, checkoutFingerprint, orderId);
    // Kuota voucher terpakai saat order dibuat (tidak kembali bila order
    // kedaluwarsa — lihat migrasi 0005).
    if (voucherCode) {
      await db.run("UPDATE vouchers SET uses = uses + 1 WHERE code = ?", voucherCode);
    }
    // Detail hadiah disimpan terpisah dari INSERT utama (best-effort):
    // bila kolom hadiah belum ada (migrasi 0010 belum diterapkan),
    // order tetap jadi sebagai order biasa, bukan gagal checkout.
    if (giftEmail && giftToken) {
      await db
        .run(
          `UPDATE orders SET gift_recipient_email = ?, gift_recipient_name = ?, gift_message = ?,
             gift_claim_token = ?, gift_claim_expires_at = ? WHERE id = ?`,
          giftEmail,
          giftName,
          giftMessage,
          giftToken,
          giftExpiresAt,
          orderId
        )
        .catch((err) => console.error("[checkout] hadiah gagal disimpan:", err));
    }
    // Donasi disimpan terpisah dari INSERT utama (best-effort, pola
    // yang sama seperti hadiah): bila tabel donations belum ada
    // (migrasi 0014 belum diterapkan), order tetap jadi sebagai
    // order biasa, bukan gagal checkout. product_id = baris berbayar
    // pertama (produk inti; bila bundel, id bundelnya).
    if (donate) {
      await recordDonation(db, orderId, products[0]?.id ?? "", user.id, total);
    }
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", orderId);
    if (!order) return c.json({ error: "Gagal membuat order." }, 500);
    // Email menunggu bayar (template 02) — hanya untuk order BARU (jalur
    // idempotensi di atas mengembalikan order lama tanpa email baru).
    background(c, sendPendingEmail(db, order));
    return c.json({ order: await orderOut(db, order) }, 201);
  });

  app.get("/api/payment/status/:order_id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("order_id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    if (order.user_id !== user.id) return c.json({ error: "Order ini bukan milikmu." }, 403);
    const env = getEnv();
    const isCentralPayment = Boolean(order.klikqris_order_id && order.klikqris_order_id !== order.id);
    if (order.status === "PENDING" && isCentralPayment && env.paymentApiUrl && env.paymentApiKey && order.klikqris_order_id) {
      try {
        const payment = await getCentralPayment(order.klikqris_order_id);
        const status = centralPaymentStatus(payment.status);
        if (status === "PAID") {
          await db.run("UPDATE orders SET status = 'PAID', paid_at = ? WHERE id = ?", payment.paid_at ?? nowIso(), order.id);
        } else if (status === "EXPIRED") {
          await db.run("UPDATE orders SET status = 'EXPIRED' WHERE id = ?", order.id);
        }
      } catch (err) {
        console.error("[payment/status] Payment API gagal:", err);
      }
    } else if (order.status === "PENDING" && env.klikqrisApiKey && env.klikqrisMerchantId) {
      try {
        const status = await checkQrisStatus(order.klikqris_order_id ?? order.id);
        if (status === "PAID" || status === "SUCCESS") {
          await db.run("UPDATE orders SET status = 'PAID', paid_at = ? WHERE id = ?", nowIso(), order.id);
        } else if (status === "EXPIRED") {
          await db.run("UPDATE orders SET status = 'EXPIRED' WHERE id = ?", order.id);
        }
      } catch (err) {
        console.error("[payment/status] checkQrisStatus gagal:", err);
      }
    }
    const fresh = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", order.id);
    const current = fresh ?? order;
    // Email lunas / kedaluwarsa — dipicu setiap kali endpoint ini melihat
    // order berstatus terminal; pemeriksaan idempotensi di pengirim
    // memastikan email yang sama tidak terkirim dua kali (juga bila
    // status sudah berubah sebelum kunci Resend disetel). Untuk order
    // PAID, handlePaidOrder juga memenuhi hadiah (email + akses
    // penerima) dan hadiah referral — semuanya idempotent, jadi
    // pemanggilan berulang dari polling aman.
    if (current.status === "PAID") {
      background(c, handlePaidOrder(db, current));
    } else if (current.status === "EXPIRED") {
      background(c, sendExpiredEmail(db, current));
    }
    return c.json({ order: await orderOut(db, current) });
  });

  app.post("/api/webhook/klikqris", async (c) => {
    const body = await readJson(c);
    const orderId = asString(body.order_id);
    const status = asString(body.status).toUpperCase();
    const signature = typeof body.signature === "string" ? body.signature : null;
    const secret = getEnv().klikqrisWebhookSecret;
    if (!secret) {
      console.warn("[webhook] KLIKQRIS_WEBHOOK_SECRET tidak disetel — signature tidak divalidasi.");
    } else {
      const { signature: _sig, ...payload } = body;
      if (!verifyWebhookSignature(payload, signature)) {
        return c.json({ received: true, applied: false }, 200);
      }
    }
    if (!orderId || (status !== "PAID" && status !== "SUCCESS")) {
      return c.json({ received: true, applied: false }, 200);
    }
    const order = await db.get<OrderRow>(
      "SELECT * FROM orders WHERE id = ? OR klikqris_order_id = ?",
      orderId,
      orderId
    );
    if (!order) return c.json({ received: true, applied: false }, 200);
    if (order.status === "PAID") return c.json({ received: true, applied: false }, 200);
    await db.run("UPDATE orders SET status = 'PAID', paid_at = ? WHERE id = ?", nowIso(), order.id);
    // Tindak lanjut PAID (email lunas / pemenuhan hadiah / hadiah
    // referral) — fire-and-forget, idempotent per order.
    const paid = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", order.id);
    if (paid) background(c, handlePaidOrder(db, paid));
    return c.json({ received: true, applied: true }, 200);
  });

  // Webhook privat dari api.by-rj.com. Endpoint ini tidak bergantung pada
  // browser pelanggan; payment yang telah dilunasi langsung memenuhi order,
  // email, hadiah, referral, dan donasi lewat handlePaidOrder yang idempoten.
  app.post("/api/webhook/payment", async (c) => {
    const rawBody = await c.req.text();
    const env = getEnv();
    if (!validInternalPaymentSignature(
      env.paymentWebhookSecret,
      c.req.header("x-payment-timestamp"),
      c.req.header("x-payment-signature"),
      rawBody
    )) {
      return c.json({ error: "Webhook signature tidak valid." }, 401);
    }

    let payload: { event_id?: unknown; event_type?: unknown; payment_id?: unknown; order_id?: unknown; status?: unknown; paid_at?: unknown };
    try {
      payload = JSON.parse(rawBody) as typeof payload;
    } catch {
      return c.json({ error: "Payload webhook tidak valid." }, 400);
    }
    const eventId = typeof payload.event_id === "string" ? payload.event_id : "";
    const paymentId = typeof payload.payment_id === "string" ? payload.payment_id : "";
    const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
    const eventType = typeof payload.event_type === "string" ? payload.event_type : "";
    const status = typeof payload.status === "string" ? payload.status : "";
    if (!eventId || !paymentId || !orderId || !eventType || !["paid", "expired", "failed"].includes(status)) {
      return c.json({ error: "Payload webhook tidak lengkap." }, 400);
    }

    const order = await db.get<OrderRow>(
      "SELECT * FROM orders WHERE id = ? AND klikqris_order_id = ?",
      orderId,
      paymentId
    );
    if (!order) return c.json({ received: true, ignored: "unknown_order" }, 200);

    const seen = await db.run(
      "INSERT OR IGNORE INTO payment_webhook_events (event_id, payment_id, order_id, event_type, received_at) VALUES (?, ?, ?, ?, ?)",
      eventId,
      paymentId,
      orderId,
      eventType,
      nowIso()
    );
    if (seen.changes === 0) return c.json({ received: true, duplicate: true }, 200);

    if (status === "paid") {
      await db.run(
        "UPDATE orders SET status = 'PAID', paid_at = COALESCE(?, ?) WHERE id = ? AND status = 'PENDING'",
        typeof payload.paid_at === "string" ? payload.paid_at : null,
        nowIso(),
        order.id
      );
      const paid = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", order.id);
      if (paid?.status === "PAID") background(c, handlePaidOrder(db, paid));
    } else {
      await db.run("UPDATE orders SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'", order.id);
    }
    return c.json({ received: true }, 200);
  });

  app.get("/api/orders", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const orders = await db.all<OrderRow>(
      "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      user.id
    );
    const mine = await Promise.all(orders.map((o) => orderOut(db, o)));
    // Hadiah yang diterima (migrasi 0010): tampil sebagai order LUNAS
    // milik penerima — item + tombol Belajar/Unduh normal, tanpa struk
    // (struk milik pembeli). Gagal baca gift_grants (migrasi belum
    // diterapkan) -> daftar order sendiri tetap dikembalikan.
    const received: Record<string, unknown>[] = [];
    try {
      const grants = await db.all<{
        order_id: string;
        product_id: string;
        granted_at: string;
      }>(
        "SELECT order_id, product_id, granted_at FROM gift_grants WHERE user_id = ? ORDER BY granted_at DESC",
        user.id
      );
      if (grants.length > 0) {
        const byOrder = new Map<string, { product_id: string; granted_at: string }[]>();
        for (const g of grants) {
          const list = byOrder.get(g.order_id) ?? [];
          list.push({ product_id: g.product_id, granted_at: g.granted_at });
          byOrder.set(g.order_id, list);
        }
        for (const [orderId, granted] of byOrder) {
          const src = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", orderId);
          if (!src || src.status !== "PAID") continue;
          const giver = await db.get<{ name: string }>(
            "SELECT name FROM users WHERE id = ?",
            src.user_id
          );
          const grantedIds = new Set(granted.map((g) => g.product_id));
          const itemsOut = await Promise.all(
            parseItems(src.items)
              .filter((it) => !it.included_in_bundle && grantedIds.has(it.product_id))
              .map(async (it) => {
                const p = await db.get<Product>(
                  "SELECT external_url FROM products WHERE id = ?",
                  it.product_id
                );
                return {
                  product_id: it.product_id,
                  title: it.title,
                  price: it.price,
                  externalUrl: p?.external_url ?? null
                };
              })
          );
          if (itemsOut.length === 0) continue;
          received.push({
            id: src.id,
            user_id: user.id,
            items: itemsOut,
            total: src.total,
            status: "PAID",
            klikqris_order_id: null,
            qris_url: null,
            direct_url: null,
            total_amount: src.total_amount ?? src.total,
            expired_at: null,
            idempotency_key: null,
            whatsapp: null,
            voucher_code: null,
            discount_amount: 0,
            created_at: granted[0]?.granted_at ?? src.paid_at ?? src.created_at,
            paid_at: src.paid_at,
            is_gift: false,
            is_gift_received: true,
            gift_from_name: giver?.name ?? null,
            gift_claimed: true
          });
        }
      }
    } catch (err) {
      console.error("[orders] hadiah diterima gagal dimuat:", err);
    }
    const all = [...mine, ...received].sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );
    return c.json({ orders: all });
  });

  app.get("/api/orders/:id/receipt", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    if (order.user_id !== user.id) return c.json({ error: "Order ini bukan milikmu." }, 403);
    if (order.status !== "PAID") return c.json({ error: "Struk hanya tersedia untuk order yang sudah lunas." }, 400);
    const pdf = await receiptPdf(
      { ...order, buyer_name: user.name, buyer_email: user.email },
      parseItems(order.items)
    );
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="struk-${order.id}.pdf"`
    });
  });

  app.get("/api/orders/:id/download/:product_id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    const productId = c.req.param("product_id");
    // Pemilik order boleh mengunduh; penerima hadiah juga boleh bila
    // produk itu sudah diberikan kepadanya (gift_grants). Struk tetap
    // pemilik saja (endpoint receipt tidak diubah).
    let viaGift = false;
    if (order.user_id !== user.id) {
      const grant = await db
        .get<{ x: number }>(
          "SELECT 1 AS x FROM gift_grants WHERE order_id = ? AND product_id = ? AND user_id = ? LIMIT 1",
          order.id,
          productId,
          user.id
        )
        .catch(() => undefined);
      viaGift = !!grant;
    }
    if (order.user_id !== user.id && !viaGift) {
      return c.json({ error: "Order ini bukan milikmu." }, 403);
    }
    if (order.status !== "PAID") return c.json({ error: "Unduhan hanya tersedia untuk order yang sudah lunas." }, 400);
    if (!parseItems(order.items).some((it) => it.product_id === productId)) {
      return c.json({ error: "Produk ini tidak ada di order tersebut." }, 403);
    }
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", productId);
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const chapters = await db.all<Chapter>(
      "SELECT * FROM chapters WHERE product_id = ? ORDER BY sort_order, id",
      productId
    );
    const pdf = await productPdf(product, chapters);
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ringkasan-${product.id}.pdf"`
    });
  });

  app.get("/api/order-email-data/:order_id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const order = await db.get<OrderRow>("SELECT * FROM orders WHERE id = ?", c.req.param("order_id"));
    if (!order) return c.json({ error: "Order tidak ditemukan." }, 404);
    if (order.user_id !== user.id) return c.json({ error: "Order ini bukan milikmu." }, 403);
    if (order.status !== "PAID") return c.json({ error: "Data email hanya tersedia untuk order yang sudah lunas." }, 400);
    try {
      return c.json(await getOrderEmailData(db, order.id));
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Gagal mengambil data order." }, 400);
    }
  });

  // ------------------------- Belajar -------------------------

  app.get("/api/study/:product_id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", c.req.param("product_id"));
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    const chapters = await db.all<Chapter>(
      "SELECT * FROM chapters WHERE product_id = ? ORDER BY sort_order, id",
      product.id
    );
    // Hemat query D1: ambil SEMUA flashcard + soal bab produk ini dalam
    // 2 query (IN ...), lalu kelompokkan di JS — bukan 2 query PER bab.
    // Penting di Workers Gratis (batas ±50 query D1 per satu pemanggilan):
    // Kelas 1 punya 26 bab — cara lama butuh ~59 query per request,
    // cara baru ~8 query.
    const chapterIds = chapters.map((c) => c.id);
    const flashcardsByChapter = new Map<string, Flashcard[]>();
    const quizByChapter = new Map<string, QuestionRow[]>();
    if (chapterIds.length > 0) {
      const placeholders = chapterIds.map(() => "?").join(", ");
      const allFlashcards = await db.all<Flashcard>(
        `SELECT * FROM flashcards WHERE chapter_id IN (${placeholders}) ORDER BY id`,
        ...chapterIds
      );
      for (const f of allFlashcards) {
        const list = flashcardsByChapter.get(f.chapter_id) ?? [];
        list.push(f);
        flashcardsByChapter.set(f.chapter_id, list);
      }
      const allQuestions = await db.all<QuestionRow>(
        `SELECT * FROM questions WHERE chapter_id IN (${placeholders}) ORDER BY sort_order, id`,
        ...chapterIds
      );
      for (const q of allQuestions) {
        const key = q.chapter_id ?? "";
        const list = quizByChapter.get(key) ?? [];
        list.push(q);
        quizByChapter.set(key, list);
      }
    }
    const owned = await userHasPaidProduct(db, user.id, product.id);
    const fullChapters = chapters.map((ch) => {
      const flashcards = flashcardsByChapter.get(ch.id) ?? [];
      const quiz = (quizByChapter.get(ch.id) ?? []).map((q): PublicQuestion => ({
        id: String(q.id),
        type: q.type,
        question: q.question,
        options: parseOptions(q.options)
      }));
      let points: string[] = [];
      try {
        const parsed: unknown = JSON.parse(ch.points);
        if (Array.isArray(parsed)) points = parsed.filter((p): p is string => typeof p === "string");
      } catch {
        points = [];
      }
      // Coba gratis: bab pertama tiap produk terbuka untuk semua akun
      // login; bab lain terkunci bila produk belum dibeli (hanya metadata).
      const free = chapters.length > 0 && ch.id === chapters[0].id;
      const locked = !free && !owned;
      if (locked) {
        return {
          id: ch.id,
          product_id: ch.product_id,
          title: ch.title,
          subject: ch.subject,
          grade: ch.grade,
          semester: ch.semester,
          summary: "",
          points: [],
          focus_text: "",
          video_url: null,
          video_duration: null,
          short_url: null,
          short_duration: null,
          sort_order: ch.sort_order,
          flashcards: [],
          quiz: [],
          free: false,
          locked: true
        };
      }
      return {
        id: ch.id,
        product_id: ch.product_id,
        title: ch.title,
        subject: ch.subject,
        grade: ch.grade,
        semester: ch.semester,
        summary: ch.summary,
        points,
        focus_text: ch.focus_text,
        video_url: ch.video_url,
        video_duration: ch.video_duration,
        short_url: ch.short_url,
        short_duration: ch.short_duration,
        sort_order: ch.sort_order,
        flashcards: flashcards.map((f) => ({ front: f.front, back: f.back })),
        quiz,
        free,
        locked: false
      };
    });
    const simulations = await db.all<Simulation>(
      "SELECT * FROM simulations WHERE product_id = ? ORDER BY subject, paket",
      product.id
    );
    // Coba gratis: simulasi pertama tiap mapel (Paket A) terbuka untuk
    // semua akun login; paket lain terkunci bila produk belum dibeli.
    const simulationsOut = await Promise.all(
      simulations.map(async (s) => {
        const isFirstOfSubject =
          (await db.get<{ id: string }>(
            "SELECT id FROM simulations WHERE product_id = ? AND subject = ? ORDER BY paket, id LIMIT 1",
            product.id,
            s.subject
          ))?.id === s.id;
        const free = s.paket === "A" && isFirstOfSubject;
        return {
          id: s.id,
          subject: s.subject,
          grade: s.grade,
          paket: s.paket,
          title: s.title,
          total_minutes: s.total_minutes,
          max_points: s.max_points,
          free,
          locked: !free && !owned
        };
      })
    );
    const externalUrl = owned ? product.external_url : null;
    return c.json({
      product: publicProduct(product),
      chapters: fullChapters,
      simulations: simulationsOut,
      externalUrl,
      simLocked: await isSimLocked(db, user.id)
    });
  });

  app.post("/api/study/chapter-done", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const chapterId = asString(body.chapter_id);
    const productId = asString(body.product_id);
    if (!chapterId || !productId) return c.json({ error: "chapter_id dan product_id wajib diisi." }, 400);
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    const hadSticker = await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM stickers WHERE user_id = ? AND chapter_id = ?",
      user.id,
      chapterId
    );
    await db.run(
      `INSERT INTO tracker (user_id, product_id, chapter_id, done, done_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(user_id, chapter_id) DO UPDATE SET done = 1, done_at = excluded.done_at`,
      user.id,
      productId,
      chapterId,
      nowIso()
    );
    let sticker = false;
    if ((hadSticker?.n ?? 0) === 0) {
      await db.run(
        "INSERT OR IGNORE INTO stickers (user_id, chapter_id, earned_at) VALUES (?, ?, ?)",
        user.id,
        chapterId,
        nowIso()
      );
      sticker = true;
    }
    // Hook XP (fitur keterlibatan): bab pertama selesai +20 XP, dan
    // hari belajar baru +5 XP streak. awardXp tidak pernah melempar,
    // tapi tetap dibungkus supaya respons utama tidak pernah gagal.
    try {
      if (sticker) await awardXp(db, user.id, "chapter", chapterId, 20);
      if (await markStudyDay(db, user.id)) {
        await awardXp(db, user.id, "streak", todayIso(), 5);
      }
    } catch {
      // abaikan — XP gagal dicatat tidak boleh menggagalkan respons
    }
    return c.json({ ok: true, sticker });
  });

  app.post("/api/bookmark", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const chapterId = asString(body.chapter_id);
    const productId = asString(body.product_id);
    if (!chapterId || !productId) return c.json({ error: "chapter_id dan product_id wajib diisi." }, 400);
    if (body.bookmarked === true) {
      await db.run(
        "INSERT OR IGNORE INTO bookmarks (user_id, product_id, chapter_id, created_at) VALUES (?, ?, ?, ?)",
        user.id,
        productId,
        chapterId,
        nowIso()
      );
    } else {
      await db.run("DELETE FROM bookmarks WHERE user_id = ? AND chapter_id = ?", user.id, chapterId);
    }
    return c.json({ ok: true });
  });

  app.post("/api/note", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const chapterId = asString(body.chapter_id);
    const productId = asString(body.product_id);
    const note = asString(body.note).trim();
    if (!chapterId || !productId) return c.json({ error: "chapter_id dan product_id wajib diisi." }, 400);
    if (!note) {
      await db.run("DELETE FROM notes WHERE user_id = ? AND chapter_id = ?", user.id, chapterId);
    } else {
      await db.run(
        `INSERT INTO notes (user_id, product_id, chapter_id, note, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, chapter_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
        user.id,
        productId,
        chapterId,
        note,
        nowIso()
      );
    }
    return c.json({ ok: true });
  });

  app.get("/api/search", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ products: [], chapters: [], terms: [] });
    const like = `%${q}%`;
    const products = await db.all<Product>(
      "SELECT * FROM products WHERE active = 1 AND title LIKE ? ORDER BY title LIMIT 20",
      like
    );
    const chapters = await db.all<{ id: string; product_id: string; title: string; subject: string }>(
      "SELECT id, product_id, title, subject FROM chapters WHERE title LIKE ? ORDER BY title LIMIT 20",
      like
    );
    const terms = (await db.all<{ front: string }>(
        "SELECT DISTINCT front FROM flashcards WHERE front LIKE ? OR back LIKE ? LIMIT 10",
        like,
        like
      ))
      .map((r) => r.front);
    return c.json({
      products: products.map(publicProduct),
      chapters,
      terms
    });
  });

  app.get("/api/daily", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const date = todayIso();
    const generated = dailyQuestions(date, 1) as GeneratedQuestion[];
    const questions: PublicQuestion[] = generated.map((q, i) => ({
      id: `daily-${i}`,
      type: q.type,
      question: q.question,
      options: q.options
    }));
    return c.json({ date, questions });
  });

  // ------------------------- Bank Soal Sulitku -------------------------
  // Soal yang pernah dijawab salah (kuis bab + simulasi). Dijawab benar
  // saat latihan ulang = keluar dari bank (dianggap dikuasai).

  app.get("/api/hard-bank", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const items = await computeHardBank(db, user.id);
    return c.json({ total: items.length, items });
  });

  app.post("/api/hard-bank/practice", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    const bank = await computeHardBank(db, user.id);
    const bankIds = new Set(bank.map((b) => b.question_id));
    const ids = Object.keys(answers)
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && bankIds.has(n));
    if (ids.length === 0) {
      return c.json({ error: "Tidak ada soal sulit yang dikirim." }, 400);
    }
    const rows = await db.all<QuestionRow>(
      `SELECT * FROM questions WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ...ids
    );
    let totalEarned = 0;
    let maxScore = 0;
    const correct: Record<string, boolean> = {};
    const review: { questionId: string; correct: boolean; discussion: string }[] = [];
    const masteredIds: number[] = [];
    for (const q of rows) {
      const result = gradeOne(
        { id: String(q.id), type: q.type, answer: q.answer, discussion: q.discussion, points: q.points },
        answers[String(q.id)]
      );
      totalEarned += result.earned;
      maxScore += q.points;
      correct[String(q.id)] = result.correct;
      review.push({ questionId: String(q.id), correct: result.correct, discussion: q.discussion });
      if (result.correct) masteredIds.push(q.id);
    }
    for (const qid of masteredIds) {
      await db.run(
        "INSERT OR IGNORE INTO hard_bank_mastered (user_id, question_id, mastered_at) VALUES (?, ?, ?)",
        user.id,
        qid,
        nowIso()
      );
    }
    await markStudyDay(db, user.id);
    const remaining = await computeHardBank(db, user.id);
    return c.json({
      score: Math.round(totalEarned),
      max_score: maxScore,
      correct,
      review,
      mastered: masteredIds,
      remaining: remaining.length
    });
  });

  // ------------------------- Soal Cerita Sehari-hari -------------------------
  // Latihan gratis untuk semua akun login (seperti Latihan Harian):
  // 10 soal per kelas per mapel (Matematika & B. Indonesia), dinilai
  // server lewat kind = "story" di /api/quiz/submit.

  app.get("/api/story/:grade/:subject", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const grade = Number(c.req.param("grade"));
    const slug = c.req.param("subject");
    const subject =
      slug === "matematika" ? "Matematika" : slug === "bahasa-indonesia" ? "B. Indonesia" : "";
    if (!Number.isInteger(grade) || grade < 1 || grade > 6 || !subject) {
      return c.json({ error: "Kelas atau mapel tidak dikenal." }, 400);
    }
    const questions: PublicQuestion[] = storyQuestions(grade, subject).map((q, i) => ({
      id: `story-${i}`,
      type: q.type,
      question: q.question,
      options: q.options
    }));
    return c.json({ grade, subject, ref_id: storyRefId(grade, subject), questions });
  });

  app.get("/api/simulations/:id/questions", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const sim = await db.get<Simulation>(
      "SELECT * FROM simulations WHERE id = ?",
      c.req.param("id")
    );
    if (!sim) return c.json({ error: "Simulasi tidak ditemukan." }, 404);
    if (await isSimLocked(db, user.id)) {
      return c.json({ error: "Simulasi dikunci oleh orang tua." }, 403);
    }
    // Coba gratis: simulasi pertama tiap mapel (Paket A) terbuka; yang
    // lain hanya untuk pemilik produk yang sudah lunas.
    if (!(await canAccessSimulation(db, user.id, sim))) {
      return c.json({ error: "Simulasi ini hanya untuk pemilik produk. Beli produknya untuk membuka semua simulasi." }, 403);
    }
    const questions = (await db.all<QuestionRow>(
        "SELECT * FROM questions WHERE simulation_id = ? ORDER BY sort_order, id",
        sim.id
      ))
      .map((q): PublicQuestion => ({
        id: String(q.id),
        type: q.type,
        question: q.question,
        options: parseOptions(q.options),
        images: parseImageUrls(q.image_urls)
      }));
    return c.json({
      simulation: {
        id: sim.id,
        subject: sim.subject,
        grade: sim.grade,
        paket: sim.paket,
        title: sim.title,
        total_minutes: sim.total_minutes,
        max_points: sim.max_points
      },
      questions
    });
  });

  app.post("/api/quiz/submit", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const kind = asString(body.kind);
    const refId = asString(body.ref_id);
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    if (kind !== "quiz" && kind !== "simulation" && kind !== "daily" && kind !== "story") {
      return c.json({ error: "Jenis kuis tidak dikenal." }, 400);
    }
    if (!refId) return c.json({ error: "ref_id wajib diisi." }, 400);
    if (kind === "simulation" && await isSimLocked(db, user.id)) {
      return c.json({ error: "Simulasi dikunci oleh orang tua." }, 403);
    }
    // Coba gratis: kuis bab pertama dan simulasi pertama tiap mapel
    // terbuka; sisanya hanya untuk pemilik produk yang sudah lunas.
    // Worksheet dan unduhan produk tetap di-gate di endpointnya sendiri.
    if (kind === "quiz") {
      const chapter = await db.get<Chapter>("SELECT * FROM chapters WHERE id = ?", refId);
      if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
      if (!(await canAccessChapter(db, user.id, chapter))) {
        return c.json({ error: "Bab ini hanya untuk pemilik produk. Beli produknya untuk membuka semua bab." }, 403);
      }
    } else if (kind === "simulation") {
      const sim = await db.get<Simulation>("SELECT * FROM simulations WHERE id = ?", refId);
      if (!sim) return c.json({ error: "Simulasi tidak ditemukan." }, 404);
      if (!(await canAccessSimulation(db, user.id, sim))) {
        return c.json({ error: "Simulasi ini hanya untuk pemilik produk. Beli produknya untuk membuka semua simulasi." }, 403);
      }
    }

    let gradeList: GradeInput[] = [];
    if (kind === "quiz") {
      gradeList = (await db.all<QuestionRow>(
          "SELECT * FROM questions WHERE chapter_id = ? ORDER BY sort_order, id",
          refId
        ))
        .map((q) => ({ id: String(q.id), type: q.type, answer: q.answer, discussion: q.discussion, points: q.points }));
    } else if (kind === "simulation") {
      gradeList = (await db.all<QuestionRow>(
          "SELECT * FROM questions WHERE simulation_id = ? ORDER BY sort_order, id",
          refId
        ))
        .map((q) => ({ id: String(q.id), type: q.type, answer: q.answer, discussion: q.discussion, points: q.points }));
    } else if (kind === "story") {
      // Latihan Soal Cerita: gratis untuk semua akun login; ref_id
      // bentuk story-<kelas>-<mapel> (mis. story-3-matematika).
      const parsed = parseStoryRef(refId);
      if (!parsed) return c.json({ error: "Latihan cerita tidak dikenal." }, 400);
      gradeList = storyQuestions(parsed.grade, parsed.subject).map((q, i) => ({
        id: `story-${i}`,
        type: q.type,
        answer: typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer),
        discussion: q.discussion,
        points: q.points
      }));
    } else {
      const generated = dailyQuestions(refId, 1) as GeneratedQuestion[];
      gradeList = generated.map((q, i) => ({
        id: `daily-${i}`,
        type: q.type,
        answer: typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer),
        discussion: q.discussion,
        points: q.points
      }));
    }
    if (gradeList.length === 0) return c.json({ error: "Soal tidak ditemukan." }, 404);

    let totalEarned = 0;
    let maxScore = 0;
    const correct: Record<string, boolean> = {};
    const review: { questionId: string; correct: boolean; discussion: string }[] = [];
    for (const q of gradeList) {
      const result = gradeOne(q, answers[q.id]);
      totalEarned += result.earned;
      maxScore += q.points;
      correct[q.id] = result.correct;
      review.push({ questionId: q.id, correct: result.correct, discussion: q.discussion });
    }
    const score = Math.round(totalEarned);
    // Mode Ujian Fokus: hitungan pindah tab/jendela selama simulasi
    // (hanya kind = simulation; jenis lain selalu 0).
    const focusSwitches = kind === "simulation" ? clampFocusSwitches(body.focus_switches) : 0;
    const inserted = await db.run(
      "INSERT INTO quiz_attempts (user_id, kind, ref_id, score, max_score, answers, focus_switches, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      user.id,
      kind,
      refId,
      score,
      maxScore,
      JSON.stringify(answers),
      focusSwitches,
      nowIso()
    );
    // Hook XP (fitur keterlibatan): percobaan pertama vs ulangan, plus
    // 5 XP bila ini hari belajar baru. awardXp tidak pernah melempar,
    // tapi tetap dibungkus supaya respons utama tidak pernah gagal.
    try {
      const countRow = await db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id = ? AND kind = ? AND ref_id = ?",
        user.id,
        kind,
        refId
      );
      const first = (countRow?.n ?? 0) <= 1;
      const passedQuiz = maxScore > 0 && score / maxScore >= 0.7;
      let quizXp = 0;
      if (kind === "quiz") quizXp = first ? (passedQuiz ? 10 : 5) : 2;
      else if (kind === "simulation") quizXp = first ? (passedQuiz ? 25 : 10) : 5;
      else if (kind === "story") quizXp = first ? 5 : 1;
      else if (kind === "daily") quizXp = first ? 5 : 1;
      if (quizXp > 0) await awardXp(db, user.id, kind, refId, quizXp);
      if (await markStudyDay(db, user.id)) {
        await awardXp(db, user.id, "streak", todayIso(), 5);
      }
    } catch {
      // abaikan — XP gagal dicatat tidak boleh menggagalkan respons
    }
    // Sertifikat: lulus simulasi SAS bila skor >= 70%.
    const passed = kind === "simulation" && maxScore > 0 && score / maxScore >= 0.7;
    return c.json({
      score,
      max_score: maxScore,
      correct,
      review,
      attempt_id: Number(inserted.lastInsertRowid),
      passed,
      focus_switches: focusSwitches
    });
  });

  // ------------------------- Sertifikat -------------------------

  app.get("/api/certificate/:attemptId", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const attemptId = Number(c.req.param("attemptId"));
    if (!Number.isInteger(attemptId)) {
      return c.json({ error: "ID attempt tidak valid." }, 400);
    }
    const attempt = await db.get<{
      id: number; user_id: string; kind: string; ref_id: string;
      score: number; max_score: number; created_at: string;
    }>("SELECT * FROM quiz_attempts WHERE id = ?", attemptId);
    if (!attempt) return c.json({ error: "Hasil simulasi tidak ditemukan." }, 404);
    if (attempt.user_id !== user.id) {
      return c.json({ error: "Sertifikat ini bukan milikmu." }, 403);
    }
    if (attempt.kind !== "simulation") {
      return c.json({ error: "Sertifikat hanya untuk simulasi SAS." }, 400);
    }
    if (attempt.max_score <= 0 || attempt.score / attempt.max_score < 0.7) {
      return c.json({ error: "Sertifikat hanya untuk simulasi yang lulus (skor minimal 70%)." }, 400);
    }
    const sim = await db.get<Simulation>("SELECT * FROM simulations WHERE id = ?", attempt.ref_id);
    if (!sim) return c.json({ error: "Simulasi tidak ditemukan." }, 404);
    const percent = Math.round((attempt.score / attempt.max_score) * 100);
    const dateLabel = formatTanggal(attempt.created_at).replace(/, \d{2}:\d{2} WIB$/, "");
    const pdf = await certificatePdf({
      studentName: user.name,
      subject: sim.subject,
      grade: sim.grade,
      simulationTitle: sim.title,
      score: attempt.score,
      maxScore: attempt.max_score,
      percent,
      dateLabel,
      number: `SRT-${String(attempt.id).padStart(6, "0")}`
    });
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="sertifikat-${attempt.id}.pdf"`
    });
  });

  app.get("/api/study/:product_id/:chapter_id/worksheet", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const productId = c.req.param("product_id");
    const chapterId = c.req.param("chapter_id");
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    if (!(await userHasPaidProduct(db, user.id, productId))) {
      return c.json({ error: "Worksheet hanya untuk pemilik produk yang sudah lunas." }, 403);
    }
    const questions = await db.all<QuestionRow>(
      "SELECT * FROM questions WHERE chapter_id = ? ORDER BY sort_order, id",
      chapterId
    );
    const pdf = await worksheetPdf(chapter, questions);
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="worksheet-${chapter.id}.pdf"`
    });
  });

  // ------------------------- Keluarga & kelas -------------------------

  app.post("/api/parent/link", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const code = randomAlphaNum(6);
    await db.run(
      "INSERT INTO parent_links (id, parent_user_id, child_user_id, code, redeemed, sas_locked, daily_target, created_at) VALUES (?, ?, NULL, ?, 0, 0, 0, ?)",
      newId("pl"),
      user.id,
      code,
      nowIso()
    );
    return c.json({ code });
  });

  app.post("/api/parent/redeem", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const code = asString(body.code).trim().toUpperCase();
    if (!code) return c.json({ error: "Kode wajib diisi." }, 400);
    const link = await db.get<{ id: string; parent_user_id: string; redeemed: number }>(
      "SELECT * FROM parent_links WHERE code = ?",
      code
    );
    if (!link || link.redeemed === 1) return c.json({ error: "Kode tidak ditemukan atau sudah ditebus." }, 404);
    if (link.parent_user_id === user.id) {
      return c.json({ error: "Kamu tidak bisa menebus kode buatanmu sendiri." }, 400);
    }
    await db.run("UPDATE parent_links SET child_user_id = ?, redeemed = 1 WHERE id = ?", user.id, link.id);
    return c.json({ ok: true });
  });

  app.get("/api/parent/children", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const links = await db.all<{
      child_user_id: string; sas_locked: number; daily_target: number;
    }>(
      "SELECT child_user_id, sas_locked, daily_target FROM parent_links WHERE parent_user_id = ? AND redeemed = 1 AND child_user_id IS NOT NULL",
      user.id
    );
    const children = (await Promise.all(
      links.map(async (link) => {
        const child = await db.get<User>("SELECT * FROM users WHERE id = ?", link.child_user_id);
        if (!child) return null;
        const days = (await db.all<{ date: string }>("SELECT date FROM study_days WHERE user_id = ?", child.id))
          .map((r) => r.date);
        const doneCount = (await db.get<{ n: number }>(
          "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ?",
          child.id
        ))?.n ?? 0;
        const scores = await db.all<{ id: number; kind: string; ref_id: string; score: number; max_score: number; created_at: string }>(
          "SELECT id, kind, ref_id, score, max_score, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC",
          child.id
        );
        return {
          id: child.id,
          name: child.name,
          email: child.email,
          sas_locked: link.sas_locked,
          daily_target: link.daily_target,
          streak: computeStreak(days),
          done_chapters: doneCount,
          scores
        };
      })
    )).filter((x): x is NonNullable<typeof x> => x !== null);
    return c.json({ children });
  });

  app.post("/api/parent/lock", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const childId = asString(body.child_id);
    const locked = body.sas_locked === true ? 1 : 0;
    if (!childId) return c.json({ error: "child_id wajib diisi." }, 400);
    const link = await db.get<{ id: string }>(
      "SELECT id FROM parent_links WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1",
      user.id,
      childId
    );
    if (!link) return c.json({ error: "Anak ini tidak terhubung denganmu." }, 403);
    await db.run("UPDATE parent_links SET sas_locked = ? WHERE id = ?", locked, link.id);
    return c.json({ ok: true });
  });

  app.post("/api/parent/target", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const childId = asString(body.child_id);
    const target = asNumber(body.daily_target);
    if (!childId) return c.json({ error: "child_id wajib diisi." }, 400);
    if (target === undefined || target < 0) return c.json({ error: "Target harian tidak valid." }, 400);
    const link = await db.get<{ id: string }>(
      "SELECT id FROM parent_links WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1",
      user.id,
      childId
    );
    if (!link) return c.json({ error: "Anak ini tidak terhubung denganmu." }, 403);
    await db.run("UPDATE parent_links SET daily_target = ? WHERE id = ?", target, link.id);
    return c.json({ ok: true });
  });

  app.post("/api/class", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const productId = asString(body.product_id);
    const name = asString(body.name).trim();
    if (!productId || !name) return c.json({ error: "product_id dan nama kelas wajib diisi." }, 400);
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", productId);
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    if (!(await userHasPaidProduct(db, user.id, productId))) {
      return c.json({ error: "Guru harus sudah membeli produk ini." }, 403);
    }
    const id = newId("cls");
    const code = randomAlphaNum(6);
    await db.run(
      "INSERT INTO classes (id, code, teacher_user_id, product_id, name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      code,
      user.id,
      productId,
      name,
      nowIso()
    );
    return c.json({ class: { id, code, name } }, 201);
  });

  app.post("/api/class/join", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const code = asString(body.code).trim().toUpperCase();
    if (!code) return c.json({ error: "Kode kelas wajib diisi." }, 400);
    const cls = await db.get<{ id: string; code: string; name: string; product_id: string }>(
      "SELECT * FROM classes WHERE code = ?",
      code
    );
    if (!cls) return c.json({ error: "Kelas tidak ditemukan." }, 404);
    await db.run(
      "INSERT OR IGNORE INTO class_members (class_id, user_id, joined_at) VALUES (?, ?, ?)",
      cls.id,
      user.id,
      nowIso()
    );
    return c.json({ class: { id: cls.id, code: cls.code, name: cls.name } });
  });

  app.get("/api/class/:id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const cls = await db.get<{
      id: string; code: string; teacher_user_id: string; product_id: string; name: string; created_at: string;
    }>("SELECT * FROM classes WHERE id = ?", c.req.param("id"));
    if (!cls) return c.json({ error: "Kelas tidak ditemukan." }, 404);
    const isTeacher = cls.teacher_user_id === user.id;
    const isMember =
      (await db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM class_members WHERE class_id = ? AND user_id = ?",
        cls.id,
        user.id
      ))?.n === 1;
    if (!isTeacher && !isMember) return c.json({ error: "Kamu bukan anggota kelas ini." }, 403);
    const memberRows = await db.all<{ user_id: string }>(
      "SELECT user_id FROM class_members WHERE class_id = ? ORDER BY joined_at",
      cls.id
    );
    const members = (await Promise.all(
      memberRows.map(async (m) => {
        const member = await db.get<User>("SELECT * FROM users WHERE id = ?", m.user_id);
        if (!member) return null;
        const doneCount = (await db.get<{ n: number }>(
          "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ?",
          member.id
        ))?.n ?? 0;
        const scores = await db.all<{ id: number; kind: string; ref_id: string; score: number; max_score: number; created_at: string }>(
          "SELECT id, kind, ref_id, score, max_score, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY created_at DESC",
          member.id
        );
        return { id: member.id, name: member.name, done_chapters: doneCount, scores };
      })
    )).filter((x): x is NonNullable<typeof x> => x !== null);
    return c.json({
      class: { id: cls.id, code: cls.code, name: cls.name, product_id: cls.product_id, teacher_user_id: cls.teacher_user_id, created_at: cls.created_at },
      members
    });
  });

  app.get("/api/class/:id/recap", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const cls = await db.get<{ id: string; teacher_user_id: string }>(
      "SELECT * FROM classes WHERE id = ?",
      c.req.param("id")
    );
    if (!cls) return c.json({ error: "Kelas tidak ditemukan." }, 404);
    if (cls.teacher_user_id !== user.id) {
      return c.json({ error: "Hanya guru kelas yang dapat mengunduh rekap." }, 403);
    }
    const memberRows = await db.all<{ user_id: string }>(
      "SELECT user_id FROM class_members WHERE class_id = ? ORDER BY joined_at",
      cls.id
    );
    const lines = ["siswa,bab_selesai,skor_rata_simulasi"];
    for (const m of memberRows) {
      const member = await db.get<User>("SELECT * FROM users WHERE id = ?", m.user_id);
      if (!member) continue;
      const doneCount = (await db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ?",
        member.id
      ))?.n ?? 0;
      const avg = (await db.get<{ avg: number | null }>(
        "SELECT AVG(score) AS avg FROM quiz_attempts WHERE user_id = ? AND kind = 'simulation'",
        member.id
      ))?.avg;
      const avgText = avg === null || avg === undefined ? "0" : String(Math.round(avg * 10) / 10);
      const safeName = member.name.includes(",") ? `"${member.name.replace(/"/g, '""')}"` : member.name;
      lines.push(`${safeName},${doneCount},${avgText}`);
    }
    const csv = lines.join("\n");
    return c.body(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rekap-${cls.id}.csv"`
    });
  });
}
