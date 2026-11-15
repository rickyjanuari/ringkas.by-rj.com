// anbk.ts — Simulasi ANBK Kelas 5 (Literasi + Numerasi).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerAnbkRoutes(app, db) — mengikuti pola registerTryoutRoutes di
// tryout.ts (file itu TIDAK diubah).
//
// KEPUTUSAN DESAIN (lihat juga laporan akhir Worker A):
// - Bank soal: server/seed/anbk.ts (orisinal, 2 × 20 soal, 60 menit,
//   max_points 34). Soal + submit PAKAI endpoint yang SUDAH ADA:
//   GET /api/simulations/:id/questions dan POST /api/quiz/submit
//   kind='simulation', ref_id = id simulasi ANBK. Keduanya membaca tabel
//   simulations/questions secara generik, jadi jalan untuk simulasi baru
//   tanpa perubahan — yang perlu hanyalah barisnya ada di DB (migrasi
//   0012) dan paket ANBK ini satu-satunya endpoint baru di modul ini.
// - Gating LUNAS: simulasi ANBK memakai product_id 'k5' dan paket
//   'ANBK'. isFreeSimulation di actions.ts hanya membebaskan paket 'A',
//   jadi ANBK TIDAK gratis — hanya pemilik produk k5 (termasuk anggota
//   bundel dan penerima hadiah) yang bisa membuka. Itu disengaja: ANBK
//   adalah bagian dari paket Kelas 5. Halaman daftar /anbk menampilkan
//   status terkunci + tautan beli untuk yang belum punya.
// - Karena product_id 'k5', simulasi ANBK otomatis muncul juga di
//   GET /api/study/k5 (daftar simulasi Ruang Belajar) dan bisa dibuka
//   dari halaman Belajar — rute /anbk di sini adalah daftar khusus
//   yang lebih mudah ditemukan anak.
// - Catatan prediksi: attempt kind='simulation' dengan ref_id ANBK ikut
//   dihitung /api/prediction (join ke simulations, subject Literasi /
//   Numerasi, grade 5) — perilaku yang sama seperti simulasi SAS lain,
//   bukan pengecualian. Sertifikat (skor >= 70%) juga berlaku.

import { Hono, type Context } from "hono";
import {
  type Database,
  type Simulation,
  type User,
  nowIso
} from "./database.js";
import { ANBK_SIMULATIONS } from "./seed/anbk.js";

// ---------------------------------------------------------------------------
// Helper kecil (duplikasi seperlunya dari actions.ts — berkas itu bukan
// milik fitur ini, jadi helper auth/kepemilikan disalin ringkas di sini,
// mengikuti pola yang sama seperti tryout.ts).
// ---------------------------------------------------------------------------

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

interface OrderItem {
  product_id: string;
}

function parseItems(raw: string): OrderItem[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter(
          (it): it is OrderItem =>
            !!it && typeof it === "object" && typeof (it as OrderItem).product_id === "string"
        )
      : [];
  } catch {
    return [];
  }
}

/** Pemilik produk = order PAID berisi produk itu, atau penerima hadiah
 *  (gift_grants, migrasi 0010) — jalur gating LUNAS yang sama seperti
 *  userHasPaidProduct di actions.ts. */
async function userHasPaidProduct(
  db: Database,
  userId: string,
  productId: string
): Promise<boolean> {
  const orders = await db.all<{ items: string }>(
    "SELECT items FROM orders WHERE user_id = ? AND status = 'PAID'",
    userId
  );
  if (orders.some((o) => parseItems(o.items).some((it) => it.product_id === productId))) {
    return true;
  }
  try {
    const grant = await db.get<{ x: number }>(
      "SELECT 1 AS x FROM gift_grants WHERE user_id = ? AND product_id = ? LIMIT 1",
      userId,
      productId
    );
    return !!grant;
  } catch {
    return false;
  }
}

/** Simulasi dikunci orang tua (parent_links.sas_locked) — sama seperti
 *  isSimLocked di actions.ts. */
async function isSimLocked(db: Database, userId: string): Promise<boolean> {
  const row = await db
    .get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM parent_links WHERE child_user_id = ? AND redeemed = 1 AND sas_locked = 1",
      userId
    )
    .catch(() => ({ n: 0 }));
  return (row?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerAnbkRoutes(app: Hono, db: Database): void {
  /**
   * GET /api/anbk — daftar 2 paket simulasi ANBK Kelas 5.
   * Tiap paket: id, title, subject, grade, paket, total soal,
   * total menit, max poin, exists (sudah ada di DB?), locked (butuh
   * produk k5?), simLocked (dikunci orang tua?).
   * Soal + submit TIDAK di sini — pakai endpoint yang sudah ada:
   * GET /api/simulations/:id/questions dan POST /api/quiz/submit
   * kind='simulation'.
   */
  app.get("/api/anbk", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);

    const ownedK5 = await userHasPaidProduct(db, user.id, "k5");
    const simLocked = await isSimLocked(db, user.id);

    const packages = await Promise.all(
      ANBK_SIMULATIONS.map(async (seed) => {
        const sim = await db.get<Simulation>("SELECT * FROM simulations WHERE id = ?", seed.id);
        const maxPoints = seed.questions.reduce((sum, q) => sum + q.points, 0);
        return {
          id: seed.id,
          title: seed.title,
          subject: seed.subject,
          grade: seed.grade,
          paket: seed.paket,
          total_questions: seed.questions.length,
          total_minutes: seed.total_minutes,
          max_points: maxPoints,
          // Bila migrasi 0012 belum diterapkan, paket tampil sebagai
          // "segera hadir" (exists false) — bukan 500.
          exists: !!sim,
          max_points_db: sim ? sim.max_points : null,
          locked: !ownedK5,
          simLocked
        };
      })
    );

    return c.json({ packages, owned_k5: ownedK5, simLocked, now: nowIso() });
  });
}
