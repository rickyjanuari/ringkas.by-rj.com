import type { DB, Order, Product, User } from "./database.js";
import { newId, nowIso } from "./database.js";
import { getEnv } from "./env.js";
import { TEMPLATE_01_WELCOME_HTML } from "./email-templates/01-welcome.js";
import { TEMPLATE_02_PENDING_HTML } from "./email-templates/02-pending.js";
import { TEMPLATE_03_PAID_HTML } from "./email-templates/03-paid.js";
import { TEMPLATE_04_EXPIRED_HTML } from "./email-templates/04-expired.js";
import { TEMPLATE_05_WEEKLY_HTML } from "./email-templates/05-weekly.js";
import { TEMPLATE_06_REMINDER_HTML } from "./email-templates/06-reminder.js";
import { TEMPLATE_07_STREAK_HTML } from "./email-templates/07-streak.js";
import { TEMPLATE_08_GIFT_HTML } from "./email-templates/08-gift.js";

// ---------------------------------------------------------------------------
// Pengiriman email otomatis via Resend (gratis: 3.000/bln, maks 100/hari).
//
// Pemicu (fire-and-forget, lihat server/actions.ts):
//   register → welcome | checkout (QRIS dibuat) → pending
//   PAID terdeteksi (webhook / polling status) → paid
//   PAID order hadiah terdeteksi → gift (ke PENERIMA, bukan pembeli;
//     email paid TIDAK dikirim untuk order hadiah — salinan template
//     03 ("materimu sudah terbuka") salah untuk pembeli hadiah).
//   EXPIRED terdeteksi (pemeriksaan status) → expired
//   cron harian (server/cron.ts) → reminder (anak 3 hari tidak belajar)
//     + streak (milestone 7/14/21/28 hari)
//   cron mingguan (server/cron.ts) → weekly-report (laporan orang tua)
// Template laporan mingguan orang tua (05) di-wire lewat cron mingguan —
// lihat README bagian "Email otomatis & cron".
//
// Aturan keras:
//   - RESEND_API_KEY tidak ada di repo. Bila kunci belum disetel, kirim
//     dilewati + dicatat di log; alur utama (register/checkout/bayar)
//     TIDAK PERNAH gagal karena email.
//   - Semua placeholder {{...}} HARUS terisi dari data asli (order/user/
//     database). Render melempar Error bila ada yang kosong.
//   - Idempotensi lewat tabel sent_emails (migrasi 0004): baris klaim
//     disisipkan SEBELUM kirim; gagal kirim → klaim dihapus (bisa coba
//     lagi); klaim basi > 10 menit tanpa resend_id boleh direbut ulang.
//   - Kirim ulang admin (`force: true`, lihat sendTemplatedEmail):
//     HANYA dipakai endpoint admin POST /api/admin/resend-email —
//     tidak pernah dipakai pemicu otomatis (register/checkout/webhook/
//     polling/cron). Dengan force, baris sent_emails yang cocok untuk
//     (order_id/user_id, template, period = '') dihapus SEBELUM klaim
//     baru, sehingga kirim ulang selalu mencoba dan mencatat resend_id
//     baru. Hapus hanya menyentuh period = '' — email cron yang memakai
//     kunci periode (reminder/weekly/streak) TIDAK PERNAH tersentuh
//     force. Tanpa force, perilaku idempotensi tidak berubah.
//   - Setiap panggilan Resend WAJIB membawa header User-Agent — tanpa
//     itu API mengembalikan 403 code 1010.
// ---------------------------------------------------------------------------

export interface OrderEmailProduct {
  judul: string;
  harga: number;
}

export interface OrderEmailData {
  order_id: string;
  nama: string;
  email: string;
  produk: OrderEmailProduct[];
  total: number;
  tanggal_bayar: string | null;
  url_produk: string;
}

interface OrderItem {
  product_id: string;
  title: string;
  price: number;
}

/** Subset kolom order yang dipakai pengiriman email. */
export interface OrderForEmail {
  id: string;
  user_id: string;
  items: string; // JSON [{product_id, title, price}]
  total: number;
  status: string;
  total_amount: number | null;
  expired_at: string | null;
  paid_at: string | null;
  /** Kolom hadiah (migrasi 0010) — hanya terisi untuk order hadiah. */
  gift_recipient_email?: string | null;
  gift_recipient_name?: string | null;
  gift_message?: string | null;
  gift_claim_token?: string | null;
  gift_claim_expires_at?: string | null;
}

export type EmailTemplateKey =
  | "welcome"
  | "pending"
  | "paid"
  | "expired"
  | "weekly-report"
  | "reminder"
  | "streak"
  | "gift";

export interface SendEmailResult {
  sent: boolean;
  resendId?: string;
  skipped?: "no-key" | "already-sent";
  error?: string;
}

const TEMPLATES: Record<EmailTemplateKey, string> = {
  welcome: TEMPLATE_01_WELCOME_HTML,
  pending: TEMPLATE_02_PENDING_HTML,
  paid: TEMPLATE_03_PAID_HTML,
  expired: TEMPLATE_04_EXPIRED_HTML,
  "weekly-report": TEMPLATE_05_WEEKLY_HTML,
  reminder: TEMPLATE_06_REMINDER_HTML,
  streak: TEMPLATE_07_STREAK_HTML,
  gift: TEMPLATE_08_GIFT_HTML
};

/** URL dasar situs untuk tautan di email (bisa diubah lewat var APP_URL). */
export function appUrl(): string {
  return (getEnv().appUrl ?? "").trim() || "https://ringkas.by-rj.com";
}

/** "Rp29.331" — sama seperti formatRupiah di frontend. */
export function formatRupiah(n: number): string {
  return "Rp" + new Intl.NumberFormat("id-ID").format(Math.trunc(n));
}

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

/**
 * "Minggu, 15 November 2026, 13:10 WIB".
 * Menerima ISO ("2026-11-15T06:10:29.813Z" = 06:10 UTC → 13:10 WIB)
 * maupun format KlikQRIS "2026-11-15 15:09:39" (sudah waktu dinding WIB).
 * Mengembalikan "—" bila null/tidak bisa diurai.
 */
export function formatTanggal(value: string | null): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!m) return value;
  const [, y, mo, d, h, mi, s, tz] = m;
  const sec = Number(s ?? 0);
  let ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), sec);
  if (tz) {
    // ISO berzona: instans absolut — geser ke WIB (+7 jam).
    if (tz !== "Z") {
      const sign = tz.startsWith("-") ? -1 : 1;
      const parts = tz.replace(/^[+-]/, "").split(":");
      const offMin = Number(parts[0]) * 60 + Number(parts[1] ?? 0);
      ms -= sign * offMin * 60000;
    }
    ms += 7 * 3600 * 1000;
  }
  // Tanpa zona: komponen sudah waktu dinding WIB — dipakai apa adanya.
  const dt = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${NAMA_HARI[dt.getUTCDay()]}, ${dt.getUTCDate()} ${NAMA_BULAN[dt.getUTCMonth()]} ${dt.getUTCFullYear()}, ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())} WIB`;
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
        price: typeof it.price === "number" ? it.price : 0
      }));
  } catch {
    return [];
  }
}

/**
 * Render template: ganti semua {{kunci}}; lempar Error bila ada kunci
 * yang tidak ada di `variables`. Diekspor supaya bisa diuji.
 */
export function renderEmailTemplate(
  template: EmailTemplateKey,
  variables: Record<string, string>
): string {
  const html = TEMPLATES[template];
  const missing = [...new Set([...html.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
    .filter((k) => !(k in variables));
  if (missing.length > 0) {
    throw new Error(`placeholder email belum terisi: ${missing.join(", ")}`);
  }
  let out = html;
  for (const [key, value] of Object.entries(variables)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  if (out.includes("{{")) {
    throw new Error("masih ada placeholder {{...}} yang belum terisi");
  }
  return out;
}

function absoluteUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  const base = appUrl().replace(/\/+$/, "");
  return base + (u.startsWith("/") ? u : `/${u}`);
}

interface SentEmailRow {
  id: string;
  resend_id: string | null;
  created_at: string;
}

const STALE_CLAIM_MS = 10 * 60 * 1000;

async function alreadySent(
  db: DB,
  template: EmailTemplateKey,
  orderId: string | null,
  userId: string | null,
  period: string
): Promise<boolean> {
  const row = orderId
    ? await db.get<SentEmailRow>(
        "SELECT id, resend_id, created_at FROM sent_emails WHERE order_id = ? AND template = ? AND period = ?",
        orderId,
        template,
        period
      )
    : await db.get<SentEmailRow>(
        "SELECT id, resend_id, created_at FROM sent_emails WHERE user_id = ? AND template = ? AND period = ?",
        userId,
        template,
        period
      );
  if (!row) return false;
  if (row.resend_id) return true;
  // Klaim tanpa resend_id yang sudah basi → anggap gagal, boleh direbut.
  if (Date.now() - new Date(row.created_at).getTime() > STALE_CLAIM_MS) {
    await db.run("DELETE FROM sent_emails WHERE id = ?", row.id).catch(() => undefined);
    return false;
  }
  return true;
}

async function claimSlot(
  db: DB,
  template: EmailTemplateKey,
  orderId: string | null,
  userId: string | null,
  period: string
): Promise<string | null> {
  const id = newId("eml");
  const result = await db.run(
    "INSERT OR IGNORE INTO sent_emails (id, order_id, user_id, template, resend_id, period, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)",
    id,
    orderId,
    userId,
    template,
    period,
    nowIso()
  );
  return result.changes === 1 ? id : null;
}

/**
 * Kirim satu email template. TIDAK PERNAH melempar — kegagalan
 * dikembalikan sebagai { sent: false } supaya alur utama tetap jalan.
 * Idempotensi: satu (order, template, period) atau (user, template,
 * period) hanya terkirim sekali; panggilan kedua mengembalikan
 * skipped: "already-sent". Email transaksional memakai period = ''
 * (default); email cron memakai kunci periode, mis.
 * 'reminder:usr-XXX:2026-11-15' atau 'weekly:usr-XXX:2026-W46'.
 * Bila RESEND_API_KEY belum disetel: log + skipped: "no-key" (tanpa klaim
 * yang tertinggal, jadi percobaan berikut tetap bisa mengirim).
 *
 * Opsi `force` (kirim ulang admin saja — lihat komentar di atas):
 * bila true, baris sent_emails yang cocok untuk (order_id/user_id,
 * template, period = '') dihapus SEBELUM klaim baru, sehingga kirim
 * ulang selalu mencoba dan mencatat resend_id baru. Penghapusan hanya
 * untuk period = '' (email cron berperiode tidak tersentuh) dan hanya
 * terjadi SETELAH pemeriksaan RESEND_API_KEY — bila kunci belum
 * disetel, tidak ada baris yang dihapus dan hasil tetap
 * skipped: "no-key" tanpa klaim menggantung.
 */
export async function sendTemplatedEmail(
  db: DB,
  opts: {
    template: EmailTemplateKey;
    to: string;
    subject: string;
    variables: Record<string, string>;
    orderId?: string | null;
    userId?: string | null;
    period?: string;
    force?: boolean;
  }
): Promise<SendEmailResult> {
  const { template, to, subject, variables } = opts;
  const orderId = opts.orderId ?? null;
  const userId = opts.userId ?? null;
  const period = opts.period ?? "";
  const force = opts.force === true;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.warn(`[email] alamat tujuan tidak valid (${template}) — dilewati.`);
    return { sent: false, error: "Alamat email tujuan tidak valid." };
  }
  let html: string;
  try {
    html = renderEmailTemplate(template, variables);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Template gagal di-render.";
    console.error(`[email] ${msg} (${template} ke ${to}) — tidak dikirim.`);
    return { sent: false, error: msg };
  }
  const env = getEnv();
  if (!env.resendApiKey) {
    console.warn(
      `[email] RESEND_API_KEY belum disetel — email ${template} ke ${to} dilewati. ` +
        `Isi dengan: wrangler secret put RESEND_API_KEY`
    );
    return { sent: false, skipped: "no-key" };
  }
  try {
    // Kirim ulang admin (force): hapus klaim lama period = '' supaya
    // klaim baru di bawah selalu berhasil — baru di sini, setelah
    // pemeriksaan kunci, supaya tanpa RESEND_API_KEY tidak ada riwayat
    // terkirim yang terhapus. Email cron (period != '') tidak tersentuh.
    if (force) {
      if (orderId) {
        await db
          .run(
            "DELETE FROM sent_emails WHERE order_id = ? AND template = ? AND period = ''",
            orderId,
            template
          )
          .catch(() => undefined);
      } else if (userId) {
        await db
          .run(
            "DELETE FROM sent_emails WHERE user_id = ? AND template = ? AND period = ''",
            userId,
            template
          )
          .catch(() => undefined);
      }
    }
    if (await alreadySent(db, template, orderId, userId, period)) {
      return { sent: false, skipped: "already-sent" };
    }
    const claimId = await claimSlot(db, template, orderId, userId, period);
    if (!claimId) {
      return { sent: false, skipped: "already-sent" };
    }
    let resendId: string;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.resendApiKey}`,
          // WAJIB: tanpa User-Agent, Resend mengembalikan 403 code 1010.
          "User-Agent": "Ringkas/1.0 (ringkas.by-rj.com)"
        },
        body: JSON.stringify({
          from: `Ringkas <${env.resendFrom || "halo@ringkas.by-rj.com"}>`,
          to,
          subject,
          html
        })
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
            ? (body as { message: string }).message
            : `Resend gagal (HTTP ${res.status})`;
        throw new Error(msg);
      }
      const id =
        body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string"
          ? (body as { id: string }).id
          : "";
      if (!id) throw new Error("Resend tidak mengembalikan id email.");
      resendId = id;
    } catch (err) {
      // Kirim gagal → hapus klaim supaya percobaan berikut bisa mengirim.
      await db.run("DELETE FROM sent_emails WHERE id = ?", claimId).catch(() => undefined);
      throw err;
    }
    await db.run("UPDATE sent_emails SET resend_id = ? WHERE id = ?", resendId, claimId);
    console.log(`[email] terkirim ${template} ke ${to} (resend ${resendId})`);
    return { sent: true, resendId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengirim email.";
    console.error(`[email] gagal mengirim ${template} ke ${to}: ${msg}`);
    return { sent: false, error: msg };
  }
}

/** Jalankan janji di background tanpa menggagalkan response. */
export function background(
  c: { executionCtx?: { waitUntil(p: Promise<unknown>): void } },
  promise: Promise<unknown>
): void {
  try {
    c.executionCtx?.waitUntil(promise);
  } catch {
    // Bukan runtime Workers — lanjut tanpa waitUntil.
  }
  promise.catch((err) => console.error("[email] gagal (background):", err));
}

// ---------------------------------------------------------------------------
// Pengirim per pemicu — semua mengembalikan SendEmailResult, tidak melempar.
// ---------------------------------------------------------------------------

/** Register berhasil → template 01 (sekali per user). */
export async function sendWelcomeEmail(
  db: DB,
  user: User,
  opts?: { force?: boolean }
): Promise<SendEmailResult> {
  const base = appUrl();
  return sendTemplatedEmail(db, {
    template: "welcome",
    to: user.email,
    subject: "Selamat datang di Ringkas!",
    variables: {
      nama: user.name,
      email: user.email,
      url_katalog: `${base}/katalog`,
      url_aplikasi: base
    },
    userId: user.id,
    force: opts?.force
  });
}

/**
 * Checkout berhasil membuat tagihan QRIS (PENDING) → template 02.
 * Dipanggil HANYA saat order baru dibuat (bukan saat order lama yang
 * masih PENDING dikembalikan karena idempotensi checkout).
 */
export async function sendPendingEmail(
  db: DB,
  order: OrderForEmail,
  opts?: { force?: boolean }
): Promise<SendEmailResult> {
  const user = await db.get<User>("SELECT * FROM users WHERE id = ?", order.user_id);
  if (!user) return { sent: false, error: "Pengguna order tidak ditemukan." };
  const items = parseItems(order.items);
  const produk = items.map((it) => it.title).join(", ") || "Rangkuman Ringkas";
  const totalAmount = order.total_amount ?? order.total;
  const base = appUrl();
  return sendTemplatedEmail(db, {
    template: "pending",
    to: user.email,
    subject: `Pesananmu menunggu pembayaran — ${order.id}`,
    variables: {
      nama: user.name,
      email: user.email,
      order_id: order.id,
      produk,
      harga: formatRupiah(order.total),
      kode_unik: formatRupiah(Math.max(0, totalAmount - order.total)),
      total: formatRupiah(totalAmount),
      batas_bayar: formatTanggal(order.expired_at),
      url_pesanan: `${base}/pesanan`
    },
    orderId: order.id,
    force: opts?.force
  });
}

/** PAID terdeteksi (webhook / polling) → template 03 (sekali per order). */
export async function sendPaidEmail(
  db: DB,
  order: OrderForEmail,
  opts?: { force?: boolean }
): Promise<SendEmailResult> {
  if (order.status !== "PAID") return { sent: false, error: "Order belum lunas." };
  const data = await getOrderEmailData(db, order.id);
  const items = parseItems(order.items);
  const first = items[0];
  const base = appUrl();
  const urlBelajar = first ? `${base}/belajar/${first.product_id}` : `${base}/pesanan`;
  return sendTemplatedEmail(db, {
    template: "paid",
    to: data.email,
    subject: `Pembayaran lunas — ${(first?.title ?? "produkmu")} sudah terbuka!`,
    variables: {
      nama: data.nama,
      email: data.email,
      order_id: data.order_id,
      produk: data.produk.map((p) => p.judul).join(", ") || "Rangkuman Ringkas",
      tanggal_bayar: formatTanggal(data.tanggal_bayar),
      total: formatRupiah(order.total_amount ?? order.total),
      url_belajar: urlBelajar,
      // Struk diunduh dari halaman Pesanan Saya (endpoint struk butuh login).
      url_struk: `${base}/pesanan`,
      url_produk: absoluteUrl(data.url_produk)
    },
    orderId: order.id,
    force: opts?.force
  });
}

/** EXPIRED terdeteksi (pemeriksaan status) → template 04 (sekali per order). */
export async function sendExpiredEmail(
  db: DB,
  order: OrderForEmail,
  opts?: { force?: boolean }
): Promise<SendEmailResult> {
  const user = await db.get<User>("SELECT * FROM users WHERE id = ?", order.user_id);
  if (!user) return { sent: false, error: "Pengguna order tidak ditemukan." };
  const items = parseItems(order.items);
  const produk = items.map((it) => it.title).join(", ") || "Rangkuman Ringkas";
  const base = appUrl();
  return sendTemplatedEmail(db, {
    template: "expired",
    to: user.email,
    subject: `Pembayaranmu kedaluwarsa — ${order.id}`,
    variables: {
      nama: user.name,
      email: user.email,
      order_id: order.id,
      produk,
      total: formatRupiah(order.total_amount ?? order.total),
      batas_bayar: formatTanggal(order.expired_at),
      url_katalog: `${base}/katalog`
    },
    orderId: order.id,
    force: opts?.force
  });
}

/** Order hadiah LUNAS → template 08 ke PENERIMA (sekali per order).
 * Bila penerima belum punya akun, email ini satu-satunya jalan klaim;
 * bila sudah punya akun, akses sudah diberikan saat PAID dan tautan
 * claim di email ini berfungsi sebagai cadangan. Batas klaim tampil
 * sebagai tanggal WIB (formatTanggal). Pesan kosong diganti kalimat
 * baku supaya placeholder {{pesan}} selalu terisi. */
export async function sendGiftEmail(
  db: DB,
  order: OrderForEmail,
  opts?: { force?: boolean }
): Promise<SendEmailResult> {
  if (order.status !== "PAID") return { sent: false, error: "Order belum lunas." };
  const recipientEmail = (order.gift_recipient_email ?? "").trim().toLowerCase();
  if (!recipientEmail || !order.gift_claim_token) {
    return { sent: false, error: "Order ini bukan order hadiah." };
  }
  const buyer = await db.get<User>("SELECT * FROM users WHERE id = ?", order.user_id);
  const items = parseItems(order.items);
  const produk = items.map((it) => it.title).join(", ") || "Rangkuman Ringkas";
  const base = appUrl();
  return sendTemplatedEmail(db, {
    template: "gift",
    to: recipientEmail,
    subject: `${buyer?.name ?? "Seseorang"} membelikanmu hadiah di Ringkas!`,
    variables: {
      nama_penerima: (order.gift_recipient_name ?? "").trim() || "Teman Belajar",
      nama_pemberi: buyer?.name ?? "Seseorang",
      produk,
      pesan: (order.gift_message ?? "").trim() || "Selamat belajar — semoga bermanfaat!",
      url_claim: `${base}/hadiah?token=${order.gift_claim_token}`,
      batas_claim: formatTanggal(order.gift_claim_expires_at ?? null),
      email: recipientEmail
    },
    orderId: order.id,
    force: opts?.force
  });
}

/** Cron harian: anak 3 hari tidak belajar → pengingat ke orang tua. */
export async function sendReminderEmail(
  db: DB,
  opts: {
    parent: User;
    child: User;
    daysSince: number;
    lastStudyLabel: string;
    period: string;
  }
): Promise<SendEmailResult> {
  const base = appUrl();
  return sendTemplatedEmail(db, {
    template: "reminder",
    to: opts.parent.email,
    subject: `Pengingat belajar — ${opts.child.name} sudah ${opts.daysSince} hari tidak belajar`,
    variables: {
      nama_orang_tua: opts.parent.name,
      nama_anak: opts.child.name,
      hari_tidak_belajar: String(opts.daysSince),
      tanggal_terakhir_belajar: opts.lastStudyLabel,
      url_belajar: `${base}/katalog`,
      email: opts.parent.email
    },
    userId: opts.parent.id,
    period: opts.period
  });
}

/** Cron harian: streak anak mencapai milestone 7/14/21/28 hari. */
export async function sendStreakEmail(
  db: DB,
  opts: { parent: User; child: User; streak: number; period: string }
): Promise<SendEmailResult> {
  const base = appUrl();
  return sendTemplatedEmail(db, {
    template: "streak",
    to: opts.parent.email,
    subject: `${opts.child.name} mencapai streak ${opts.streak} hari!`,
    variables: {
      nama_orang_tua: opts.parent.name,
      nama_anak: opts.child.name,
      streak_hari: String(opts.streak),
      url_belajar: `${base}/akun`,
      email: opts.parent.email
    },
    userId: opts.parent.id,
    period: opts.period
  });
}

export interface WeeklyReportVariables {
  bab_selesai: string;
  streak_hari: string;
  rata_simulasi: string;
  pencapaian_1: string;
  pencapaian_2: string;
  bab_lemah: string;
  target_harian: string;
  periode_minggu: string;
}

/** Cron mingguan: laporan belajar anak ke orang tua (template 05). */
export async function sendWeeklyReportEmail(
  db: DB,
  opts: {
    parent: User;
    child: User;
    report: WeeklyReportVariables;
    period: string;
  }
): Promise<SendEmailResult> {
  const base = appUrl();
  return sendTemplatedEmail(db, {
    template: "weekly-report",
    to: opts.parent.email,
    subject: `Laporan belajar mingguan ${opts.child.name}`,
    variables: {
      nama_anak: opts.child.name,
      nama_orang_tua: opts.parent.name,
      email: opts.parent.email,
      url_laporan: `${base}/akun`,
      ...opts.report
    },
    userId: opts.parent.id,
    period: opts.period
  });
}

export async function getOrderEmailData(db: DB, orderId: string): Promise<OrderEmailData> {
  const order = await db.get<Order>("SELECT * FROM orders WHERE id = ?", orderId);
  if (!order) throw new Error("Order tidak ditemukan.");
  if (order.status !== "PAID") throw new Error("Order belum lunas.");
  const user = await db.get<User>("SELECT * FROM users WHERE id = ?", order.user_id);
  const items = parseItems(order.items);
  let url_produk = items.length > 0 ? `/belajar/${items[0].product_id}` : "/belajar";
  if (items.length > 0) {
    const first = await db.get<Product>("SELECT * FROM products WHERE id = ?", items[0].product_id);
    if (first?.external_url) url_produk = first.external_url;
  }
  return {
    order_id: order.id,
    nama: user?.name ?? "",
    email: user?.email ?? "",
    produk: items.map((it) => ({ judul: it.title, harga: it.price })),
    total: order.total,
    tanggal_bayar: order.paid_at,
    url_produk
  };
}
