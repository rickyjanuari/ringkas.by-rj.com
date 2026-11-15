// voice.ts — Rekam Suara Baca Nyaring (FITUR 3).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerVoiceRoutes(app, db) — mengikuti pola registerTryoutRoutes di
// tryout.ts (file itu TIDAK diubah). Tabel `voice_recordings` dibuat
// koordinator di migrasi 0012 (lihat SQL di laporan akhir).
//
// KEPUTUSAN DESAIN:
// - Rekaman disimpan di D1 sebagai base64 (bukan R2 — belum ada).
//   Batas jujur: maks. 60 detik dan maks. 500 KB per rekaman; lebih dari
//   itu ditolak server (400 durasi / 413 ukuran). Bukan untuk rekaman
//   panjang.
// - audio_base64 TIDAK PERNAH dikembalikan di respons list — hanya lewat
//   GET /api/voice/recordings/:id/audio, dan hanya untuk pihak berhak.
// - Siapa yang boleh melihat/mendengar rekaman seorang anak:
//     * anak itu sendiri (pemilik rekaman),
//     * orang tua yang terhubung (parent_links redeemed=1,
//       child_user_id = pemilik rekaman),
//     * guru kelas yang anggotanya si anak (classes.teacher_user_id =
//       guru, class_members berisi anak).
//   Daftar (GET list) memfilter per rekaman: pihak yang tidak berhak
//   atas rekaman itu tidak melihatnya sama sekali (bukan 403 global),
//   supaya anak yang belum merekam tidak bisa mengintip rekaman anak lain.
// - Bintang (1–5) hanya boleh diberikan orang tua terhubung atau guru
//   kelasnya — BUKAN anak sendiri. Boleh diubah (timpa nilai lama).
//   rated_by menyimpan user id pemberi bintang terakhir.
// - Gating rekam mengikuti getStudyPack di actions.ts: bab pertama tiap
//   produk gratis untuk semua akun login; bab lain butuh LUNAS produk itu
//   (order PAID berisi product_id, termasuk anggota bundel dan hadiah
//   yang diterima — gift_grants).
// - Nama anak tampil sebagai nama depan + inisial (displayName, pola
//   yang sama seperti papan peringkat di tryout.ts), bukan nama lengkap
//   dan bukan email.

import { Hono, type Context } from "hono";
import {
  type Chapter,
  type Database,
  type User,
  newId,
  nowIso
} from "./database.js";

// ---------------------------------------------------------------------------
// Batas rekaman (diekspos untuk pengujian).
// ---------------------------------------------------------------------------

/** Durasi rekaman maksimum (detik). */
export const MAX_DURATION_SECONDS = 60;
/** Ukuran audio maksimum (byte, dihitung dari panjang base64). */
export const MAX_AUDIO_BYTES = 500 * 1024;
/** Panjang teks yang dibaca maksimum (karakter). */
export const MAX_TEXT_LABEL_LENGTH = 300;

// ---------------------------------------------------------------------------
// Helper kecil (duplikasi seperlunya dari actions.ts — berkas itu bukan
// milik fitur ini, jadi helper auth/kepemilikan disalin ringkas di sini).
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

interface OrderItem {
  product_id: string;
}

function parseItems(raw: string): OrderItem[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (it): it is OrderItem =>
        !!it && typeof it === "object" && typeof (it as OrderItem).product_id === "string"
    );
  } catch {
    return [];
  }
}

async function userHasPaidProduct(
  db: Database,
  userId: string,
  productId: string
): Promise<boolean> {
  const orders = await db.all<{ items: string }>(
    "SELECT items FROM orders WHERE user_id = ? AND status = 'PAID'",
    userId
  );
  if (orders.some((o) => parseItems(o.items).some((it) => it.product_id === productId)))
    return true;
  // Akses dari hadiah yang diterima (migrasi 0010, tabel gift_grants).
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

/** Bab pertama (sort_order terendah) sebuah produk — gratis untuk semua. */
async function firstChapterId(db: Database, productId: string): Promise<string | null> {
  const row = await db.get<{ id: string }>(
    "SELECT id FROM chapters WHERE product_id = ? ORDER BY sort_order, id LIMIT 1",
    productId
  );
  return row?.id ?? null;
}

/** Boleh merekam di bab ini: pemilik LUNAS produk itu ATAU bab gratis. */
async function canAccessChapter(
  db: Database,
  userId: string,
  chapter: Chapter
): Promise<boolean> {
  if (await userHasPaidProduct(db, userId, chapter.product_id)) return true;
  const first = await firstChapterId(db, chapter.product_id);
  return first === chapter.id;
}

/** Nama tampil: nama depan + inisial (bukan email, bukan nama lengkap). */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Peserta";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

// ---------------------------------------------------------------------------
// Validasi rekaman (pure — bisa diuji tanpa database).
// ---------------------------------------------------------------------------

export interface VoiceRecordingInput {
  text_label: string;
  audio_base64: string;
  mime: string;
  duration_seconds: number;
}

/** Perkiraan ukuran byte dari string base64 (tanpa mendekode). */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

const BASE64_RE = /^[A-Za-z0-9+/=_-]*={0,2}$/;

/**
 * Validasi input rekaman. Mengembalikan pesan error (Indonesia) bila
 * tidak valid, atau null bila valid. Urutan cek: teks → durasi → format
 * base64 → ukuran (413 untuk ukuran, dipetakan pemanggil ke status).
 */
export function validateVoiceRecording(input: VoiceRecordingInput): {
  error: string;
  status: 400 | 413;
} | null {
  const label = input.text_label.trim();
  if (!label) return { error: "Tulis dulu teks yang dibaca.", status: 400 };
  if (label.length > MAX_TEXT_LABEL_LENGTH) {
    return {
      error: `Teks yang dibaca maksimal ${MAX_TEXT_LABEL_LENGTH} karakter.`,
      status: 400
    };
  }
  if (!Number.isFinite(input.duration_seconds) || input.duration_seconds <= 0) {
    return { error: "Durasi rekaman tidak valid.", status: 400 };
  }
  if (input.duration_seconds > MAX_DURATION_SECONDS) {
    return {
      error: `Rekaman maksimal ${MAX_DURATION_SECONDS} detik.`,
      status: 400
    };
  }
  const b64 = input.audio_base64.trim();
  if (!b64) return { error: "Audio rekaman tidak ada.", status: 400 };
  if (!BASE64_RE.test(b64.replace(/\s/g, ""))) {
    return { error: "Format audio tidak valid.", status: 400 };
  }
  if (base64ByteLength(b64) > MAX_AUDIO_BYTES) {
    return {
      error: "Ukuran rekaman maksimal 500 KB. Coba rekaman yang lebih pendek.",
      status: 413
    };
  }
  if (!input.mime || !input.mime.startsWith("audio/")) {
    return { error: "Format audio tidak valid.", status: 400 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hak akses atas satu rekaman.
// ---------------------------------------------------------------------------

interface VoiceRecordingRow {
  id: string;
  user_id: string;
  chapter_id: string;
  product_id: string;
  text_label: string;
  audio_base64: string;
  mime: string;
  duration_seconds: number;
  stars: number | null;
  rated_by: string | null;
  created_at: string;
}

type ViewerRole = "owner" | "parent" | "teacher" | "none";

/**
 * Peran viewer terhadap pemilik rekaman: pemilik sendiri, orang tua
 * terhubung, atau guru kelas yang anggotanya si pemilik.
 */
async function viewerRole(
  db: Database,
  viewerId: string,
  ownerId: string
): Promise<ViewerRole> {
  if (viewerId === ownerId) return "owner";
  const parent = await db.get<{ id: string }>(
    "SELECT id FROM parent_links WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1",
    viewerId,
    ownerId
  );
  if (parent) return "parent";
  const teacher = await db.get<{ id: string }>(
    `SELECT c.id FROM classes c
       JOIN class_members m ON m.class_id = c.id
     WHERE c.teacher_user_id = ? AND m.user_id = ?
     LIMIT 1`,
    viewerId,
    ownerId
  );
  if (teacher) return "teacher";
  return "none";
}

/** Boleh melihat/mendengar rekaman: pemilik, orang tua, atau guru. */
async function canViewRecording(
  db: Database,
  viewerId: string,
  rec: VoiceRecordingRow
): Promise<boolean> {
  return (await viewerRole(db, viewerId, rec.user_id)) !== "none";
}

/** Boleh memberi bintang: orang tua terhubung atau guru — BUKAN pemilik. */
async function canRateRecording(
  db: Database,
  viewerId: string,
  rec: VoiceRecordingRow
): Promise<boolean> {
  const role = await viewerRole(db, viewerId, rec.user_id);
  return role === "parent" || role === "teacher";
}

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------

export function registerVoiceRoutes(app: Hono, db: Database): void {
  // Rekam baru (anak yang merekam; bab harus bisa diaksesnya).
  app.post("/api/voice/recordings", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const chapterId = asString(body.chapter_id);
    const productId = asString(body.product_id);
    const input: VoiceRecordingInput = {
      text_label: asString(body.text_label),
      audio_base64: asString(body.audio_base64),
      mime: asString(body.mime),
      duration_seconds: asNumber(body.duration_seconds) ?? 0
    };
    if (!chapterId || !productId) {
      return c.json({ error: "chapter_id dan product_id wajib diisi." }, 400);
    }
    const invalid = validateVoiceRecording(input);
    if (invalid) return c.json({ error: invalid.error }, invalid.status);
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    if (!(await canAccessChapter(db, user.id, chapter))) {
      return c.json({ error: "Bab ini terkunci. Beli produknya dulu ya." }, 403);
    }
    const id = newId("vrec");
    const createdAt = nowIso();
    try {
      await db.run(
        `INSERT INTO voice_recordings
           (id, user_id, chapter_id, product_id, text_label, audio_base64, mime, duration_seconds, stars, rated_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
        id,
        user.id,
        chapterId,
        productId,
        input.text_label.trim(),
        input.audio_base64.trim(),
        input.mime,
        Math.round(input.duration_seconds),
        createdAt
      );
    } catch {
      // Tabel belum ada (migrasi 0012 belum diterapkan).
      return c.json({ error: "Fitur rekaman suara belum siap. Coba lagi nanti." }, 503);
    }
    return c.json({ id, created_at: createdAt }, 201);
  });

  // Daftar rekaman satu bab — TANPA audio_base64. Hanya rekaman yang
  // boleh dilihat viewer yang dikembalikan (lihat viewerRole).
  app.get("/api/voice/recordings", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const chapterId = c.req.query("chapter_id") ?? "";
    if (!chapterId) {
      return c.json({ error: "chapter_id wajib diisi." }, 400);
    }
    const chapter = await db.get<Chapter>("SELECT * FROM chapters WHERE id = ?", chapterId);
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    let rows: VoiceRecordingRow[];
    try {
      rows = await db.all<VoiceRecordingRow>(
        `SELECT * FROM voice_recordings WHERE chapter_id = ? ORDER BY created_at DESC`,
        chapterId
      );
    } catch {
      return c.json({ recordings: [] });
    }
    const out: Record<string, unknown>[] = [];
    for (const r of rows) {
      const role = await viewerRole(db, user.id, r.user_id);
      if (role === "none") continue;
      const owner = await db.get<User>("SELECT * FROM users WHERE id = ?", r.user_id);
      out.push({
        id: r.id,
        name: displayName(owner?.name ?? "Peserta"),
        text_label: r.text_label,
        duration_seconds: r.duration_seconds,
        stars: r.stars,
        created_at: r.created_at,
        can_rate: role === "parent" || role === "teacher"
      });
    }
    return c.json({ recordings: out });
  });

  // Audio satu rekaman — hanya pihak berhak (pemilik / orang tua / guru).
  app.get("/api/voice/recordings/:id/audio", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    let rec: VoiceRecordingRow | undefined;
    try {
      rec = await db.get<VoiceRecordingRow>(
        "SELECT * FROM voice_recordings WHERE id = ?",
        c.req.param("id")
      );
    } catch {
      return c.json({ error: "Fitur rekaman suara belum siap. Coba lagi nanti." }, 503);
    }
    if (!rec) return c.json({ error: "Rekaman tidak ditemukan." }, 404);
    if (!(await canViewRecording(db, user.id, rec))) {
      return c.json({ error: "Kamu tidak berhak mendengar rekaman ini." }, 403);
    }
    return c.json({
      mime: rec.mime,
      audio_base64: rec.audio_base64,
      duration_seconds: rec.duration_seconds
    });
  });

  // Beri/ubah bintang 1–5 — hanya orang tua terhubung atau guru kelasnya.
  app.post("/api/voice/recordings/:id/star", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const stars = asNumber(body.stars);
    if (stars === undefined || !Number.isInteger(stars) || stars < 1 || stars > 5) {
      return c.json({ error: "Bintang harus angka 1 sampai 5." }, 400);
    }
    let rec: VoiceRecordingRow | undefined;
    try {
      rec = await db.get<VoiceRecordingRow>(
        "SELECT * FROM voice_recordings WHERE id = ?",
        c.req.param("id")
      );
    } catch {
      return c.json({ error: "Fitur rekaman suara belum siap. Coba lagi nanti." }, 503);
    }
    if (!rec) return c.json({ error: "Rekaman tidak ditemukan." }, 404);
    if (!(await canRateRecording(db, user.id, rec))) {
      return c.json(
        { error: "Hanya orang tua atau guru yang bisa memberi bintang." },
        403
      );
    }
    await db.run(
      "UPDATE voice_recordings SET stars = ?, rated_by = ? WHERE id = ?",
      stars,
      user.id,
      rec.id
    );
    return c.json({ ok: true, stars });
  });
}
