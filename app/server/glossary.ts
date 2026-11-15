// glossary.ts — Glosarium Ketuk-Kata (FITUR AKSES 4).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerGlossaryRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah) dan pola modul flashcards.ts.
//
// Glosarium = flashcard bab itu (front → istilah, back → arti),
// urut id. TIDAK ada field example — flashcard tidak punya contoh,
// jadi frontend hanya menampilkan arti.
//
// Gating mengikuti getStudyPack di actions.ts (bab pertama tiap
// produk gratis untuk semua akun login; bab lain butuh LUNAS produk
// itu — order PAID berisi product_id, termasuk anggota bundel, atau
// akses hadiah gift_grants). Helper gating disalin ringkas dari
// flashcards.ts (pola yang sama).
//
// ENDPOINT:
//   GET /api/study/:product/:chapter/glossary — istilah + arti bab itu

import { Hono, type Context } from "hono";
import {
  type Chapter,
  type Database,
  type Flashcard,
  type User
} from "./database.js";

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

/**
 * Gate LUNAS — SAMA seperti userHasPaidProduct di actions.ts:
 * order PAID berisi produk itu, ATAU akses hadiah gift_grants.
 */
async function userHasPaidProduct(
  db: Database,
  userId: string,
  productId: string
): Promise<boolean> {
  let orders: { items: string }[] = [];
  try {
    orders = await db.all<{ items: string }>(
      "SELECT items FROM orders WHERE user_id = ? AND status = 'PAID'",
      userId
    );
  } catch {
    // Tabel orders belum ada — bukan pemilik lewat jalur ini.
    return false;
  }
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

/** Bab pertama (sort_order terendah) sebuah produk — gratis untuk semua. */
async function firstChapterId(db: Database, productId: string): Promise<string | null> {
  const row = await db.get<{ id: string }>(
    "SELECT id FROM chapters WHERE product_id = ? ORDER BY sort_order, id LIMIT 1",
    productId
  );
  return row?.id ?? null;
}

/** Boleh membaca glosarium bab ini: pemilik LUNAS produk itu ATAU bab gratis. */
async function canAccessChapter(
  db: Database,
  userId: string,
  chapter: Chapter
): Promise<boolean> {
  if (await userHasPaidProduct(db, userId, chapter.product_id)) return true;
  const first = await firstChapterId(db, chapter.product_id);
  return first === chapter.id;
}

export function registerGlossaryRoutes(app: Hono, db: Database): void {
  // Glosarium satu bab — istilah (front) + arti (back) flashcard-nya.
  app.get("/api/study/:product/:chapter/glossary", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const productId = c.req.param("product");
    const chapterId = c.req.param("chapter");
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    if (!(await canAccessChapter(db, user.id, chapter))) {
      return c.json({ error: "Bab ini terkunci. Beli produknya dulu ya." }, 403);
    }
    const flashcards = await db.all<Flashcard>(
      "SELECT * FROM flashcards WHERE chapter_id = ? ORDER BY id",
      chapter.id
    );
    return c.json({
      terms: flashcards.map((f) => ({ term: f.front, meaning: f.back }))
    });
  });
}
