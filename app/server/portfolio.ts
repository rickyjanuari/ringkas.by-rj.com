// portfolio.ts — Portofolio Karya Anak (FITUR AKSES 2).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerPortfolioRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah) dan pola modul voice.ts /
// journal.ts.
//
// TABEL (migrasi 0014):
//   portfolio_items    — karya anak (gambar = data URL JPEG/PNG
//                         base64, maks. 200 KB, maks. 20 item/anak).
//   portfolio_stars    — satu bintang per (item, pemberi).
//   portfolio_comments — komentar pemberi bintang.
//
// SIAPA BOLEH APA (pola voice.ts):
//   - Melihat karya: pemilik sendiri, orang tua yang terhubung
//     (parent_links redeemed = 1), atau guru kelas yang anggotanya
//     si pemilik (classes + class_members).
//   - Memberi bintang / komentar: HANYA orang tua terhubung atau
//     guru kelasnya — BUKAN pemilik sendiri (403).
//   - Nama pemberi tampil sebagai nama depan + inisial (displayName,
//     pola yang sama seperti papan peringkat tryout.ts / voice.ts),
//     bukan nama lengkap dan bukan email.
//
// ENDPOINT:
//   POST /api/portfolio                          — unggah karya (milik sendiri)
//   GET  /api/portfolio                          — karya saya (+ agregat bintang/komentar)
//   GET  /api/portfolio/:id                      — detail karya (+ bintang + komentar)
//   POST /api/portfolio/:id/star                 — beri/ubah bintang 1–5
//   POST /api/portfolio/:id/comment              — beri komentar
//   GET  /api/parent/children/:id/portfolio      — karya satu anak (orang tua terhubung)
//   GET  /api/classes/:id/portfolio              — karya semua murid kelas (guru pemilik kelas)

import { Hono, type Context } from "hono";
import {
  type Database,
  type PortfolioItem,
  type User,
  nowIso
} from "./database.js";

// ---------------------------------------------------------------------------
// Batas portofolio (diekspos untuk pengujian).
// ---------------------------------------------------------------------------

/** Ukuran gambar maksimum (byte, dihitung dari panjang base64). */
export const MAX_IMAGE_BYTES = 200 * 1024;
/** Jumlah karya maksimum per anak. */
export const MAX_ITEMS_PER_USER = 20;
/** Panjang judul karya maksimum (karakter). */
export const MAX_TITLE_LENGTH = 100;
/** Panjang keterangan karya maksimum (karakter). */
export const MAX_CAPTION_LENGTH = 300;
/** Panjang komentar maksimum (karakter). */
export const MAX_COMMENT_LENGTH = 300;

// ---------------------------------------------------------------------------
// Helper kecil (duplikasi seperlunya dari actions.ts — berkas itu bukan
// milik fitur ini).
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

/** Nama tampil: nama depan + inisial (pola voice.ts / tryout.ts). */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Peserta";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

// ---------------------------------------------------------------------------
// Hak akses atas satu karya.
// ---------------------------------------------------------------------------

type ViewerRole = "owner" | "parent" | "teacher" | "none";

/**
 * Peran viewer terhadap pemilik karya: pemilik sendiri, orang tua
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

/** Orang tua ini terhubung dengan anak itu? */
async function isLinkedParent(db: Database, parentId: string, childId: string): Promise<boolean> {
  const link = await db.get<{ id: string }>(
    `SELECT id FROM parent_links
     WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1`,
    parentId,
    childId
  );
  return !!link;
}

/** Pengguna ini guru pemilik kelas itu? */
async function isClassTeacher(
  db: Database,
  userId: string,
  classId: string
): Promise<boolean> {
  const cls = await db.get<{ id: string }>(
    "SELECT id FROM classes WHERE id = ? AND teacher_user_id = ?",
    classId,
    userId
  );
  return !!cls;
}

// ---------------------------------------------------------------------------
// Validasi gambar.
// ---------------------------------------------------------------------------

const DATA_URL_RE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=_-]+={0,2})$/;
const BASE64_RE = /^[A-Za-z0-9+/=_-]*={0,2}$/;

/** Perkiraan ukuran byte dari string base64 (tanpa mendekode, pola voice.ts). */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/**
 * Validasi data URL gambar. Mengembalikan pesan error (Indonesia) bila
 * tidak valid, atau null bila valid. Urutan cek: format data URL →
 * format base64 → ukuran (413 untuk ukuran, dipetakan pemanggil ke
 * status).
 */
export function validatePortfolioImage(image: string): {
  error: string;
  status: 400 | 413;
} | null {
  const trimmed = image.trim();
  if (!trimmed) return { error: "Gambar karya wajib diunggah.", status: 400 };
  const match = DATA_URL_RE.exec(trimmed);
  if (!match) {
    return {
      error: "Gambar harus berupa foto JPEG atau PNG.",
      status: 400
    };
  }
  const b64 = match[2];
  if (!BASE64_RE.test(b64.replace(/\s/g, ""))) {
    return { error: "Format gambar tidak valid.", status: 400 };
  }
  if (base64ByteLength(b64) > MAX_IMAGE_BYTES) {
    return {
      error: "Ukuran gambar maksimal 200 KB. Coba foto yang lebih kecil.",
      status: 413
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bentuk respons.
// ---------------------------------------------------------------------------

interface PortfolioRow extends PortfolioItem {
  stars_avg?: number | null;
  stars_count?: number;
  comments_count?: number;
}

interface StarRow {
  by_user_id: string;
  stars: number;
}

interface CommentRow {
  by_user_id: string;
  text: string;
  created_at: string;
}

/** Agregat bintang + komentar untuk sekumpulan item (satu query per agregat). */
async function attachAggregates(
  db: Database,
  items: PortfolioItem[]
): Promise<PortfolioRow[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);
  const placeholders = ids.map(() => "?").join(", ");
  const starAgg = await db
    .all<{ item_id: number; avg: number | null; n: number }>(
      `SELECT item_id, AVG(stars) AS avg, COUNT(*) AS n
       FROM portfolio_stars WHERE item_id IN (${placeholders}) GROUP BY item_id`,
      ...ids
    )
    .catch(() => []);
  const commentAgg = await db
    .all<{ item_id: number; n: number }>(
      `SELECT item_id, COUNT(*) AS n
       FROM portfolio_comments WHERE item_id IN (${placeholders}) GROUP BY item_id`,
      ...ids
    )
    .catch(() => []);
  const starsById = new Map(starAgg.map((r) => [r.item_id, r]));
  const commentsById = new Map(commentAgg.map((r) => [r.item_id, r.n]));
  return items.map((item) => {
    const s = starsById.get(item.id);
    return {
      ...item,
      stars_avg:
        s && s.avg !== null ? Math.round(s.avg * 10) / 10 : null,
      stars_count: s?.n ?? 0,
      comments_count: commentsById.get(item.id) ?? 0
    };
  });
}

async function listItemsFor(db: Database, userId: string): Promise<PortfolioRow[]> {
  const rows = await db.all<PortfolioItem>(
    "SELECT * FROM portfolio_items WHERE user_id = ? ORDER BY created_at DESC, id DESC",
    userId
  );
  return attachAggregates(db, rows);
}

async function getItem(db: Database, id: number): Promise<PortfolioItem | undefined> {
  return db.get<PortfolioItem>("SELECT * FROM portfolio_items WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------

export function registerPortfolioRoutes(app: Hono, db: Database): void {
  // Unggah karya baru (milik sendiri).
  app.post("/api/portfolio", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const title = asString(body.title).trim();
    const caption = asString(body.caption).trim();
    const image = asString(body.image);
    if (!title) return c.json({ error: "Judul karya wajib diisi." }, 400);
    if (title.length > MAX_TITLE_LENGTH) {
      return c.json({ error: `Judul karya maksimal ${MAX_TITLE_LENGTH} karakter.` }, 400);
    }
    if (caption.length > MAX_CAPTION_LENGTH) {
      return c.json(
        { error: `Keterangan karya maksimal ${MAX_CAPTION_LENGTH} karakter.` },
        400
      );
    }
    const invalid = validatePortfolioImage(image);
    if (invalid) return c.json({ error: invalid.error }, invalid.status);
    try {
      const count = await db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM portfolio_items WHERE user_id = ?",
        user.id
      );
      if ((count?.n ?? 0) >= MAX_ITEMS_PER_USER) {
        return c.json(
          { error: `Portofolio sudah penuh — maksimal ${MAX_ITEMS_PER_USER} karya. Hapus karya lama dulu ya.` },
          400
        );
      }
      const createdAt = nowIso();
      const inserted = await db.run(
        "INSERT INTO portfolio_items (user_id, title, caption, image, created_at) VALUES (?, ?, ?, ?, ?)",
        user.id,
        title,
        caption || null,
        image.trim(),
        createdAt
      );
      const item: PortfolioItem = {
        id: Number(inserted.lastInsertRowid),
        user_id: user.id,
        title,
        caption: caption || null,
        image: image.trim(),
        created_at: createdAt
      };
      return c.json({ item: { ...item, stars_avg: null, stars_count: 0, comments_count: 0 } }, 201);
    } catch {
      return c.json({ error: "Portofolio belum siap. Coba lagi nanti." }, 503);
    }
  });

  // Karya saya — terbaru dulu, lengkap dengan agregat.
  app.get("/api/portfolio", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    try {
      return c.json({ items: await listItemsFor(db, user.id) });
    } catch {
      return c.json({ items: [] });
    }
  });

  // Detail satu karya — pemilik, orang tua terhubung, atau guru kelasnya.
  app.get("/api/portfolio/:id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "ID karya tidak valid." }, 400);
    }
    let item: PortfolioItem | undefined;
    try {
      item = await getItem(db, id);
    } catch {
      return c.json({ error: "Portofolio belum siap. Coba lagi nanti." }, 503);
    }
    if (!item) return c.json({ error: "Karya tidak ditemukan." }, 404);
    const role = await viewerRole(db, user.id, item.user_id);
    if (role === "none") {
      return c.json({ error: "Kamu tidak berhak melihat karya ini." }, 403);
    }
    const [withAgg] = await attachAggregates(db, [item]);
    const starRows = await db
      .all<StarRow>(
        "SELECT by_user_id, stars FROM portfolio_stars WHERE item_id = ? ORDER BY created_at, by_user_id",
        id
      )
      .catch(() => []);
    const commentRows = await db
      .all<CommentRow>(
        "SELECT by_user_id, text, created_at FROM portfolio_comments WHERE item_id = ? ORDER BY created_at, id",
        id
      )
      .catch(() => []);
    const names = new Map<string, string>();
    for (const r of [...starRows, ...commentRows]) {
      if (!names.has(r.by_user_id)) {
        const u = await db.get<User>("SELECT * FROM users WHERE id = ?", r.by_user_id);
        names.set(r.by_user_id, displayName(u?.name ?? "Peserta"));
      }
    }
    return c.json({
      item: withAgg ?? item,
      stars: starRows.map((r) => ({
        by_name: names.get(r.by_user_id) ?? "Peserta",
        stars: r.stars
      })),
      comments: commentRows.map((r) => ({
        by_name: names.get(r.by_user_id) ?? "Peserta",
        text: r.text,
        created_at: r.created_at
      }))
    });
  });

  // Beri/ubah bintang 1–5 — hanya orang tua terhubung / guru kelasnya.
  app.post("/api/portfolio/:id/star", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "ID karya tidak valid." }, 400);
    }
    const body = await readJson(c);
    const stars = asNumber(body.stars);
    if (stars === undefined || !Number.isInteger(stars) || stars < 1 || stars > 5) {
      return c.json({ error: "Bintang harus angka 1 sampai 5." }, 400);
    }
    let item: PortfolioItem | undefined;
    try {
      item = await getItem(db, id);
    } catch {
      return c.json({ error: "Portofolio belum siap. Coba lagi nanti." }, 503);
    }
    if (!item) return c.json({ error: "Karya tidak ditemukan." }, 404);
    const role = await viewerRole(db, user.id, item.user_id);
    if (role !== "parent" && role !== "teacher") {
      return c.json(
        { error: "Hanya orang tua atau guru yang bisa memberi bintang." },
        403
      );
    }
    await db.run(
      `INSERT INTO portfolio_stars (item_id, by_user_id, stars, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(item_id, by_user_id) DO UPDATE SET stars = excluded.stars, created_at = excluded.created_at`,
      id,
      user.id,
      stars,
      nowIso()
    );
    const [withAgg] = await attachAggregates(db, [item]);
    return c.json({
      ok: true,
      stars_avg: withAgg?.stars_avg ?? null,
      stars_count: withAgg?.stars_count ?? 0
    });
  });

  // Beri komentar — hanya orang tua terhubung / guru kelasnya.
  app.post("/api/portfolio/:id/comment", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) {
      return c.json({ error: "ID karya tidak valid." }, 400);
    }
    const body = await readJson(c);
    const text = asString(body.text).trim();
    if (!text) return c.json({ error: "Tulis dulu komentarmu." }, 400);
    if (text.length > MAX_COMMENT_LENGTH) {
      return c.json(
        { error: `Komentar maksimal ${MAX_COMMENT_LENGTH} karakter.` },
        400
      );
    }
    let item: PortfolioItem | undefined;
    try {
      item = await getItem(db, id);
    } catch {
      return c.json({ error: "Portofolio belum siap. Coba lagi nanti." }, 503);
    }
    if (!item) return c.json({ error: "Karya tidak ditemukan." }, 404);
    const role = await viewerRole(db, user.id, item.user_id);
    if (role !== "parent" && role !== "teacher") {
      return c.json(
        { error: "Hanya orang tua atau guru yang bisa memberi komentar." },
        403
      );
    }
    const createdAt = nowIso();
    const inserted = await db.run(
      "INSERT INTO portfolio_comments (item_id, by_user_id, text, created_at) VALUES (?, ?, ?, ?)",
      id,
      user.id,
      text,
      createdAt
    );
    return c.json(
      {
        comment: {
          id: Number(inserted.lastInsertRowid),
          by_name: displayName(user.name),
          text,
          created_at: createdAt
        }
      },
      201
    );
  });

  // Karya satu anak — hanya orang tua yang terhubung dengan anak itu.
  app.get("/api/parent/children/:id/portfolio", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const childId = c.req.param("id");
    if (!(await isLinkedParent(db, user.id, childId))) {
      return c.json({ error: "Kamu tidak terhubung dengan anak ini." }, 403);
    }
    const child = await db.get<User>("SELECT * FROM users WHERE id = ?", childId);
    if (!child) return c.json({ error: "Anak tidak ditemukan." }, 404);
    try {
      return c.json({ items: await listItemsFor(db, childId) });
    } catch {
      return c.json({ items: [] });
    }
  });

  // Karya semua murid satu kelas — hanya guru pemilik kelas itu.
  app.get("/api/classes/:id/portfolio", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const classId = c.req.param("id");
    if (!(await isClassTeacher(db, user.id, classId))) {
      return c.json({ error: "Hanya guru kelas ini yang bisa melihat portofolio kelas." }, 403);
    }
    try {
      const rows = await db.all<PortfolioItem>(
        `SELECT pi.* FROM portfolio_items pi
         JOIN class_members cm ON cm.user_id = pi.user_id
         WHERE cm.class_id = ? ORDER BY pi.created_at DESC, pi.id DESC`,
        classId
      );
      const items = await attachAggregates(db, rows);
      const names = new Map<string, string>();
      for (const item of items) {
        if (!names.has(item.user_id)) {
          const u = await db.get<User>("SELECT * FROM users WHERE id = ?", item.user_id);
          names.set(item.user_id, u?.name ?? "Peserta");
        }
      }
      return c.json({
        items: items.map((item) => ({
          ...item,
          owner_name: names.get(item.user_id) ?? "Peserta"
        }))
      });
    } catch {
      return c.json({ items: [] });
    }
  });
}
