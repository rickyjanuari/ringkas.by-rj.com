// qa.ts — Tanya Jawab per Bab (migrasi 0011, tabel chapter_questions).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerQaRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah).
//
// ALUR MODERASI:
//   penanya (login, bab terbuka) --POST--> status 'pending'
//     -> admin Setujui   -> 'approved'  (tampil publik, menunggu jawaban)
//     -> admin Tolak     -> 'rejected'  (hanya penanya yang melihat)
//     -> admin Jawab     -> 'answered'  (tampil publik + jawaban)
//   Pertanyaan pending/rejected TIDAK tampil ke pembaca lain; penanya
//   sendiri melihat statusnya di halaman bab ("Menunggu moderasi" /
//   "Menunggu jawaban" / "Sudah dijawab" / "Ditolak").
//   Admin juga bisa mengedit jawaban (jawab ulang) dan menghapus
//   pertanyaan. Edit tryout tidak dibuat — lihat tryout.ts.
//
// ATURAN:
// - Pertanyaan: teks 1–300 karakter, butuh login, bab harus terbuka
//   untuk penanya (milik produk / bab pertama gratis) — bila bab
//   terkunci, form tidak tampil di UI DAN server menolak (403).
// - Jawaban admin: teks 1–1000 karakter.
// - Nama penanya tampil = nama depan + inisial (bukan email).

import { Hono, type Context } from "hono";
import {
  type Database,
  type Chapter,
  type User,
  nowIso
} from "./database.js";
import { logAdminAction } from "./audit.js";

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

function parseItems(raw: string): { product_id: string }[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (it): it is { product_id: string } =>
        !!it && typeof it === "object" && typeof (it as { product_id: string }).product_id === "string"
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
  return orders.some((o) => parseItems(o.items).some((it) => it.product_id === productId));
}

async function firstChapterId(db: Database, productId: string): Promise<string | null> {
  const row = await db.get<{ id: string }>(
    "SELECT id FROM chapters WHERE product_id = ? ORDER BY sort_order, id LIMIT 1",
    productId
  );
  return row?.id ?? null;
}

/** Bab terbuka untuk pengguna: pemilik produk, atau bab pertama (gratis). */
async function canAccessChapter(
  db: Database,
  userId: string,
  chapter: Chapter
): Promise<boolean> {
  if (await userHasPaidProduct(db, userId, chapter.product_id)) return true;
  const first = await firstChapterId(db, chapter.product_id);
  return first === chapter.id;
}

/** Nama penanya: nama depan + inisial (bukan email). */
function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Anak";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

// ---------------------------------------------------------------------------
// Baris + serialisasi
// ---------------------------------------------------------------------------

interface QaRow {
  id: number;
  product_id: string;
  chapter_id: string;
  user_id: string;
  question: string;
  answer: string | null;
  status: string;
  created_at: string;
  answered_at: string | null;
  answered_by: string | null;
  asker_name?: string;
  chapter_title?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu moderasi",
  approved: "Menunggu jawaban",
  answered: "Sudah dijawab",
  rejected: "Ditolak"
};

function publicQa(q: QaRow): Record<string, unknown> {
  return {
    id: q.id,
    product_id: q.product_id,
    chapter_id: q.chapter_id,
    asker_name: displayName(q.asker_name ?? ""),
    question: q.question,
    answer: q.answer,
    status: q.status,
    status_label: STATUS_LABEL[q.status] ?? q.status,
    created_at: q.created_at,
    answered_at: q.answered_at
  };
}

const MAX_QUESTION = 300;
const MAX_ANSWER = 1000;

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerQaRoutes(app: Hono, db: Database): void {
  // ------------------------- Tanya (login, bab terbuka) -------------------------

  app.post("/api/qa/questions", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const productId = asString(body.product).trim();
    const chapterId = asString(body.chapter).trim();
    const question = asString(body.question).trim();
    if (!productId || !chapterId) {
      return c.json({ error: "Produk dan bab wajib diisi." }, 400);
    }
    if (!question) return c.json({ error: "Pertanyaan tidak boleh kosong." }, 400);
    if (question.length > MAX_QUESTION) {
      return c.json({ error: `Pertanyaan maks. ${MAX_QUESTION} karakter.` }, 400);
    }
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    if (!(await canAccessChapter(db, user.id, chapter))) {
      return c.json({ error: "Bab ini terkunci. Beli produknya untuk bertanya." }, 403);
    }
    const inserted = await db.run(
      "INSERT INTO chapter_questions (product_id, chapter_id, user_id, question, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
      productId,
      chapterId,
      user.id,
      question,
      nowIso()
    );
    const row = await db.get<QaRow>(
      "SELECT * FROM chapter_questions WHERE id = ?",
      Number(inserted.lastInsertRowid)
    );
    if (!row) return c.json({ error: "Gagal menyimpan pertanyaan." }, 500);
    return c.json(
      { question: { ...publicQa({ ...row, asker_name: user.name }), mine: true } },
      201
    );
  });

  // ------------------------- Daftar per bab (publik + milik sendiri) -------------------------

  app.get("/api/qa/questions", async (c) => {
    const productId = c.req.query("product") ?? "";
    const chapterId = c.req.query("chapter") ?? "";
    if (!productId || !chapterId) {
      return c.json({ error: "Parameter product dan chapter wajib diisi." }, 400);
    }
    const user = await authUser(c, db);
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    // Semua pembaca: yang approved/answered. Penanya (login): + miliknya
    // sendiri dengan status apa pun, supaya ia melihat status moderasi.
    const rows = user
      ? await db.all<QaRow>(
          `SELECT q.*, u.name AS asker_name FROM chapter_questions q
           JOIN users u ON u.id = q.user_id
           WHERE q.product_id = ? AND q.chapter_id = ?
             AND (q.status IN ('approved', 'answered') OR q.user_id = ?)
           ORDER BY q.created_at ASC`,
          productId,
          chapterId,
          user.id
        )
      : await db.all<QaRow>(
          `SELECT q.*, u.name AS asker_name FROM chapter_questions q
           JOIN users u ON u.id = q.user_id
           WHERE q.product_id = ? AND q.chapter_id = ?
             AND q.status IN ('approved', 'answered')
           ORDER BY q.created_at ASC`,
          productId,
          chapterId
        );
    return c.json({
      questions: rows.map((q) => ({
        ...publicQa(q),
        mine: user ? q.user_id === user.id : false
      }))
    });
  });

  // ------------------------- Admin: daftar semua -------------------------

  app.get("/api/admin/qa", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const status = (c.req.query("status") ?? "").trim();
    const valid = ["pending", "approved", "answered", "rejected"];
    const rows = valid.includes(status)
      ? await db.all<QaRow>(
          `SELECT q.*, u.name AS asker_name, ch.title AS chapter_title
           FROM chapter_questions q
           JOIN users u ON u.id = q.user_id
           LEFT JOIN chapters ch ON ch.id = q.chapter_id
           WHERE q.status = ?
           ORDER BY q.created_at DESC`,
          status
        )
      : await db.all<QaRow>(
          `SELECT q.*, u.name AS asker_name, ch.title AS chapter_title
           FROM chapter_questions q
           JOIN users u ON u.id = q.user_id
           LEFT JOIN chapters ch ON ch.id = q.chapter_id
           ORDER BY q.created_at DESC`
        );
    return c.json({
      questions: rows.map((q) => ({
        ...publicQa(q),
        chapter_title: q.chapter_title ?? q.chapter_id
      }))
    });
  });

  // ------------------------- Admin: moderasi -------------------------

  app.post("/api/admin/qa/:id/approve", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "ID tidak valid." }, 400);
    const q = await db.get<QaRow>("SELECT * FROM chapter_questions WHERE id = ?", id);
    if (!q) return c.json({ error: "Pertanyaan tidak ditemukan." }, 404);
    if (q.status !== "pending") {
      return c.json({ error: "Hanya pertanyaan menunggu moderasi yang bisa disetujui." }, 400);
    }
    await db.run("UPDATE chapter_questions SET status = 'approved' WHERE id = ?", id);
    await logAdminAction(db, admin, "qa_approve", String(id), q.question.slice(0, 80));
    return c.json({ ok: true, status: "approved" });
  });

  app.post("/api/admin/qa/:id/reject", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "ID tidak valid." }, 400);
    const q = await db.get<QaRow>("SELECT * FROM chapter_questions WHERE id = ?", id);
    if (!q) return c.json({ error: "Pertanyaan tidak ditemukan." }, 404);
    if (q.status !== "pending" && q.status !== "approved") {
      return c.json({ error: "Pertanyaan ini tidak bisa ditolak." }, 400);
    }
    await db.run("UPDATE chapter_questions SET status = 'rejected' WHERE id = ?", id);
    await logAdminAction(db, admin, "qa_reject", String(id), q.question.slice(0, 80));
    return c.json({ ok: true, status: "rejected" });
  });

  app.post("/api/admin/qa/:id/answer", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "ID tidak valid." }, 400);
    const q = await db.get<QaRow>("SELECT * FROM chapter_questions WHERE id = ?", id);
    if (!q) return c.json({ error: "Pertanyaan tidak ditemukan." }, 404);
    if (q.status !== "pending" && q.status !== "approved" && q.status !== "answered") {
      return c.json({ error: "Pertanyaan yang ditolak tidak bisa dijawab." }, 400);
    }
    const body = await readJson(c);
    const answer = asString(body.answer).trim();
    if (!answer) return c.json({ error: "Jawaban tidak boleh kosong." }, 400);
    if (answer.length > MAX_ANSWER) {
      return c.json({ error: `Jawaban maks. ${MAX_ANSWER} karakter.` }, 400);
    }
    await db.run(
      "UPDATE chapter_questions SET answer = ?, status = 'answered', answered_at = ?, answered_by = ? WHERE id = ?",
      answer,
      nowIso(),
      admin.id,
      id
    );
    await logAdminAction(
      db,
      admin,
      q.status === "answered" ? "qa_answer_edit" : "qa_answer",
      String(id),
      q.question.slice(0, 80)
    );
    return c.json({ ok: true, status: "answered" });
  });

  app.post("/api/admin/qa/:id/delete", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "ID tidak valid." }, 400);
    const q = await db.get<QaRow>("SELECT * FROM chapter_questions WHERE id = ?", id);
    if (!q) return c.json({ error: "Pertanyaan tidak ditemukan." }, 404);
    await db.run("DELETE FROM chapter_questions WHERE id = ?", id);
    await logAdminAction(db, admin, "qa_delete", String(id), q.question.slice(0, 80));
    return c.json({ ok: true });
  });
}
