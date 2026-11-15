// donations.ts — Beli 1, Donasi 1 (FITUR DAMPAK 6).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerDonationRoutes(app, db). Logika checkout-nya tinggal di
// actions.ts (file itu BUKAN milik fitur ini — yang diubah di sana
// hanya: baca flag `donate`, tagih finalTotal + donationAmount,
// simpan baris donations best-effort, dan panggil
// fulfillDonationOrder dari handlePaidOrder).
//
// ALUR:
//   1. Checkout dengan `donate: true` → donationAmount = jumlah harga
//      produk (SEBELUM diskon voucher; anggota bundel berharga 0 jadi
//      tidak mengubah jumlah). Yang ditagih ke KlikQRIS =
//      finalTotal + donationAmount (donasi = 2× tagihan: harga produk
//      + donasi penuh). Satu baris `donations` (status 'pending')
//      disimpan best-effort setelah order berhasil dibuat — bila
//      tabel belum ada (migrasi 0014 belum diterapkan), checkout
//      tetap jalan sebagai order biasa.
//   2. Order jadi PAID (webhook ATAU polling status — keduanya lewat
//      handlePaidOrder di actions.ts) → fulfillDonationOrder mengubah
//      baris 'pending' menjadi 'available'. Idempotent: UPDATE hanya
//      menyentuh baris yang masih 'pending'.
//   3. Admin menugaskan donasi 'available' ke satu akun lewat
//      POST /api/admin/donations/:id/assign {email} → akses produk
//      dicatat di gift_grants (pola yang sama seperti hadiah —
//      gating LUNAS yang sudah ada langsung mengenalinya) dan status
//      menjadi 'assigned'.
//
// CATATAN PRODUK: satu baris donations per order, product_id = baris
// berbayar pertama (produk inti; bila checkout berisi bundel, itu id
// bundelnya). Donasi selalu merujuk ke SATU produk itu.
//
// ENDPOINT:
//   GET  /api/admin/donations                 — daftar donasi (admin)
//   POST /api/admin/donations/:id/assign      — tugaskan ke penerima (admin)

import { Hono, type Context } from "hono";
import { logAdminAction } from "./audit.js";
import {
  type Database,
  type Donation,
  type User,
  newId,
  nowIso
} from "./database.js";

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

/** Order ini punya baris donations? (dipakai idempotensi checkout + orderOut). */
export async function orderHasDonation(db: Database, orderId: string): Promise<boolean> {
  try {
    const row = await db.get<{ x: number }>(
      "SELECT 1 AS x FROM donations WHERE order_id = ? LIMIT 1",
      orderId
    );
    return !!row;
  } catch {
    // Tabel belum ada (migrasi 0014 belum diterapkan) — bukan donasi.
    return false;
  }
}

/**
 * Simpan baris donations untuk order yang baru dibuat. Best-effort:
 * mengembalikan false (bukan throw) bila tabel belum ada atau tulis
 * gagal — checkout TIDAK PERNAH gagal karena donasi.
 */
export async function recordDonation(
  db: Database,
  orderId: string,
  productId: string,
  donorUserId: string,
  amount: number
): Promise<boolean> {
  try {
    await db.run(
      `INSERT INTO donations (id, order_id, product_id, donor_user_id, amount, status, recipient_user_id, assigned_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?)`,
      newId("don"),
      orderId,
      productId,
      donorUserId,
      amount,
      nowIso()
    );
    return true;
  } catch (err) {
    console.error("[donation] simpan gagal (checkout tetap jalan):", err);
    return false;
  }
}

/**
 * Pemenuhan donasi saat order jadi LUNAS: baris 'pending' order itu
 * menjadi 'available' (siap ditugaskan admin). Idempotent — UPDATE
 * hanya menyentuh baris yang masih 'pending', jadi webhook +
 * polling yang sama-sama melihat PAID tidak menggandakan apa pun.
 * Tidak pernah melempar.
 */
export async function fulfillDonationOrder(
  db: Database,
  order: { id: string }
): Promise<void> {
  try {
    await db.run(
      "UPDATE donations SET status = 'available' WHERE order_id = ? AND status = 'pending'",
      order.id
    );
  } catch (err) {
    console.error("[donation] pemenuhan gagal:", err);
  }
}

export function registerDonationRoutes(app: Hono, db: Database): void {
  // Daftar donasi — admin saja, terbaru dulu.
  app.get("/api/admin/donations", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    let rows: (Donation & {
      product_title: string | null;
      donor_name: string | null;
      donor_email: string | null;
      recipient_name: string | null;
      recipient_email: string | null;
    })[];
    try {
      rows = await db.all<Donation & {
        product_title: string | null;
        donor_name: string | null;
        donor_email: string | null;
        recipient_name: string | null;
        recipient_email: string | null;
      }>(
        `SELECT d.*,
                p.title AS product_title,
                donor.name AS donor_name, donor.email AS donor_email,
                recip.name AS recipient_name, recip.email AS recipient_email
         FROM donations d
         LEFT JOIN products p ON p.id = d.product_id
         LEFT JOIN users donor ON donor.id = d.donor_user_id
         LEFT JOIN users recip ON recip.id = d.recipient_user_id
         ORDER BY d.created_at DESC, d.id DESC`
      );
    } catch {
      return c.json({ donations: [] });
    }
    return c.json({
      donations: rows.map((d) => ({
        id: d.id,
        order_id: d.order_id,
        product_title: d.product_title ?? d.product_id,
        donor_name: d.donor_name ?? null,
        donor_email: d.donor_email ?? null,
        amount: d.amount,
        status: d.status,
        recipient_name: d.recipient_name ?? null,
        recipient_email: d.recipient_email ?? null,
        created_at: d.created_at,
        assigned_at: d.assigned_at
      }))
    });
  });

  // Tugaskan donasi ke penerima — admin saja; donasi harus 'available'.
  app.post("/api/admin/donations/:id/assign", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const body = await readJson(c);
    const email = asString(body.email).trim().toLowerCase();
    if (!email) return c.json({ error: "Email penerima wajib diisi." }, 400);
    let donation: Donation | undefined;
    try {
      donation = await db.get<Donation>("SELECT * FROM donations WHERE id = ?", c.req.param("id"));
    } catch {
      return c.json({ error: "Fitur donasi belum siap. Coba lagi nanti." }, 503);
    }
    if (!donation) return c.json({ error: "Donasi tidak ditemukan." }, 404);
    const recipient = await db.get<User>("SELECT * FROM users WHERE email = ?", email);
    if (!recipient) return c.json({ error: "Akun tidak ditemukan." }, 404);
    if (donation.status !== "available") {
      return c.json({ error: "Donasi ini belum bisa ditugaskan — tunggu sampai lunas dulu ya." }, 400);
    }
    // Akses produk untuk penerima (pola gift_grants dari fulfillGiftOrder
    // di actions.ts — INSERT OR IGNORE supaya idempotent).
    try {
      await db.run(
        `INSERT OR IGNORE INTO gift_grants (id, order_id, product_id, user_id, granted_at)
         VALUES (?, ?, ?, ?, ?)`,
        newId("gft"),
        donation.order_id,
        donation.product_id,
        recipient.id,
        nowIso()
      );
    } catch (err) {
      console.error("[donation] grant gagal:", err);
      return c.json({ error: "Akses donasi belum bisa diberikan. Coba lagi nanti." }, 503);
    }
    const updated = await db.run(
      `UPDATE donations SET status = 'assigned', recipient_user_id = ?, assigned_at = ?
       WHERE id = ? AND status = 'available'`,
      recipient.id,
      nowIso(),
      donation.id
    );
    if (updated.changes !== 1) {
      // Balapan dua assign bersamaan: yang satu menang, yang lain kalah.
      return c.json({ error: "Donasi ini sudah ditugaskan." }, 400);
    }
    await logAdminAction(db, admin, "donation_assign", donation.id, email);
    return c.json({ ok: true });
  });
}
