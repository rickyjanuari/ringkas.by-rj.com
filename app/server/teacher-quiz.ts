// teacher-quiz.ts — Guru Buat Kuis Sendiri (FITUR 6).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerTeacherQuizRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah) dan pola modul qa.ts / tryout.ts.
//
// TABEL (migrasi diserahkan koordinator — SQL lengkap di laporan akhir):
//   teacher_quizzes        — satu baris per kuis buatan guru.
//   teacher_quiz_items     — soal-soal kuis (quiz_id, question_id, sort_order).
//   teacher_quiz_attempts  — satu attempt per siswa per kuis
//                            (UNIQUE(quiz_id, user_id)).
// Bank soal TIDAK diubah: modul ini hanya MEMBACA tabel questions.
//
// ATURAN:
// - Guru = pemilik kelas (classes.teacher_user_id = user.id). Semua
//   endpoint guru menolak non-guru kelas itu dengan 403.
// - GET /api/teacher/bank hanya untuk guru pemilik kelas produk itu —
//   karena itu kunci jawaban BOLEH dikembalikan di endpoint ini (guru
//   melihat kunci saat merakit kuis). Endpoint ini TIDAK BOLEH dipakai
//   siswa: siswa tidak pernah menerima field answer dari endpoint
//   mana pun di modul ini.
// - Soal kuis boleh dari mapel/bab mana pun DALAM produk kelas itu
//   (tidak harus satu mapel); judul kuis bebas.
// - Siswa mengerjakan sekali saja: UNIQUE(quiz_id, user_id) menangkap
//   balapan dua submit bersamaan (seperti tryout.ts).
// - Penilaian server-side dengan SALINAN gradeOne dari actions.ts:
//   gradeOne di sana module-private (tidak diekspor) dan actions.ts
//   bukan berkas milik fitur ini, jadi logikanya diduplikasi persis
//   di bawah (ditandai). Bila actions.ts mengubah penilaian, salinan
//   ini harus disinkronkan — sama seperti salinan di tryout.ts.
//
// ENDPOINT:
//   GET  /api/teacher/classes                 — kelas-kelas yang saya ajar
//   GET  /api/teacher/bank?product=&subject=  — soal bank untuk dirakit (guru)
//   POST /api/teacher/quizzes                 — buat kuis
//   GET  /api/teacher/quizzes                 — kuis-kuis buatan saya
//   GET  /api/teacher/quizzes/:id             — detail kuis (guru pembuat / anggota kelas)
//   GET  /api/teacher/quizzes/:id/recap       — rekap per siswa (guru pembuat)
//   GET  /api/teacher/quizzes/:id/questions   — soal kuis TANPA answer (siswa anggota kelas)
//   POST /api/teacher/quizzes/:id/submit      — kirim jawaban (siswa, sekali saja)

import { Hono, type Context } from "hono";
import {
  type Database,
  type QuestionRow,
  type User,
  newId,
  nowIso
} from "./database.js";

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

// ---------------------------------------------------------------------------
// Penilaian — SALINAN PERSIS gradeOne + helper-nya dari actions.ts
// (module-private di sana; lihat catatan di kepala berkas). Bila
// actions.ts mengubah penilaian, salinan ini HARUS disinkronkan.
// ---------------------------------------------------------------------------

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
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

interface GradeInput {
  id: string;
  type: string;
  answer: string;
  discussion: string;
  points: number;
}

/** SALINAN gradeOne dari actions.ts — lihat catatan di kepala berkas. */
export function gradeOne(
  q: GradeInput,
  userAnswer: unknown
): { earned: number; correct: boolean } {
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

function parseOptions(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Baris + helper kelas / kuis
// ---------------------------------------------------------------------------

interface ClassRow {
  id: string;
  code: string;
  teacher_user_id: string;
  product_id: string;
  name: string;
  created_at: string;
  product_title?: string;
  member_count?: number;
}

interface TeacherQuizRow {
  id: string;
  teacher_user_id: string;
  class_id: string;
  title: string;
  subject: string;
  grade: number;
  created_at: string;
  class_name?: string;
  product_id?: string;
  question_count?: number;
  submissions?: number;
}

interface TeacherQuizAttemptRow {
  id: string;
  quiz_id: string;
  user_id: string;
  answers: string;
  score: number;
  max_score: number;
  created_at: string;
}

/** Guru pemilik kelas produk itu? (untuk /api/teacher/bank). */
export async function teacherOwnsClassProduct(
  db: Database,
  userId: string,
  productId: string
): Promise<boolean> {
  const row = await db.get<{ x: number }>(
    "SELECT 1 AS x FROM classes WHERE teacher_user_id = ? AND product_id = ? LIMIT 1",
    userId,
    productId
  );
  return !!row;
}

async function getQuiz(db: Database, id: string): Promise<TeacherQuizRow | undefined> {
  return db.get<TeacherQuizRow>("SELECT * FROM teacher_quizzes WHERE id = ?", id);
}

async function getClass(db: Database, id: string): Promise<ClassRow | undefined> {
  return db.get<ClassRow>("SELECT * FROM classes WHERE id = ?", id);
}

async function isClassMember(db: Database, classId: string, userId: string): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM class_members WHERE class_id = ? AND user_id = ?",
    classId,
    userId
  );
  return (row?.n ?? 0) === 1;
}

async function myAttempt(
  db: Database,
  quizId: string,
  userId: string
): Promise<TeacherQuizAttemptRow | undefined> {
  return db.get<TeacherQuizAttemptRow>(
    "SELECT * FROM teacher_quiz_attempts WHERE quiz_id = ? AND user_id = ?",
    quizId,
    userId
  );
}

async function quizItemIds(db: Database, quizId: string): Promise<number[]> {
  const rows = await db.all<{ question_id: number }>(
    "SELECT question_id FROM teacher_quiz_items WHERE quiz_id = ? ORDER BY sort_order, question_id",
    quizId
  );
  return rows.map((r) => r.question_id);
}

/** Kunci jawaban dalam bentuk yang bisa dibaca guru (bank rakit kuis). */
function answerLabel(q: QuestionRow): string {
  switch (q.type) {
    case "pg_kompleks":
    case "uraian":
      return parseJsonArray(q.answer).join(", ");
    case "menjodohkan": {
      const key = parseJsonObject(q.answer);
      return Object.keys(key)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => `${Number(k) + 1} → ${key[k]}`)
        .join("; ");
    }
    default:
      return q.answer;
  }
}

function mode<T extends string | number>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerTeacherQuizRoutes(app: Hono, db: Database): void {
  // ------------------------- Guru: kelas-kelas yang saya ajar -------------------------

  app.get("/api/teacher/classes", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const rows = await db.all<ClassRow>(
      `SELECT c.*, p.title AS product_title,
              (SELECT COUNT(*) FROM class_members WHERE class_id = c.id) AS member_count
       FROM classes c LEFT JOIN products p ON p.id = c.product_id
       WHERE c.teacher_user_id = ? ORDER BY c.created_at DESC`,
      user.id
    );
    return c.json({
      classes: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        product_id: r.product_id,
        product_title: r.product_title ?? r.product_id,
        member_count: r.member_count ?? 0,
        created_at: r.created_at
      }))
    });
  });

  // ------------------------- Guru: bank soal untuk dirakit -------------------------
  // Kunci BOLEH dilihat guru — endpoint ini hanya untuk guru pemilik
  // kelas produk itu (403 bila bukan). Siswa TIDAK PERNAH menerima
  // field answer dari modul ini.

  app.get("/api/teacher/bank", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const productId = (c.req.query("product") ?? "").trim();
    const subject = (c.req.query("subject") ?? "").trim();
    if (!productId) {
      return c.json({ error: "Parameter product wajib diisi (mis. k1)." }, 400);
    }
    const product = await db.get<{ id: string }>(
      "SELECT id FROM products WHERE id = ?",
      productId
    );
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 404);
    if (!(await teacherOwnsClassProduct(db, user.id, productId))) {
      return c.json(
        { error: "Bank soal ini hanya untuk guru pemilik kelas produk tersebut." },
        403
      );
    }
    // Soal kuis bab (chapter_id) + soal simulasi (simulation_id) dari
    // produk itu; tanpa soal baru, bank soal tidak diubah.
    const where = subject
      ? "WHERE (ch.product_id = ? OR s.product_id = ?) AND q.subject = ?"
      : "WHERE (ch.product_id = ? OR s.product_id = ?)";
    const params: (string | number)[] = subject
      ? [productId, productId, subject]
      : [productId, productId];
    const rows = await db.all<
      QuestionRow & { chapter_title: string | null; sim_title: string | null }
    >(
      `SELECT q.*, ch.title AS chapter_title, s.title AS sim_title
       FROM questions q
       LEFT JOIN chapters ch ON ch.id = q.chapter_id
       LEFT JOIN simulations s ON s.id = q.simulation_id
       ${where}
       ORDER BY q.subject, q.id
       LIMIT 200`,
      ...params
    );
    return c.json({
      product: productId,
      subject: subject || null,
      total: rows.length,
      questions: rows.map((q) => ({
        id: q.id,
        type: q.type,
        question: q.question,
        options: parseOptions(q.options),
        points: q.points,
        subject: q.subject,
        grade: q.grade,
        origin: q.chapter_title
          ? `Bab: ${q.chapter_title}`
          : q.sim_title
            ? `Simulasi: ${q.sim_title}`
            : "Bank soal",
        answer: q.answer,
        answer_label: answerLabel(q)
      }))
    });
  });

  // ------------------------- Guru: buat kuis -------------------------

  app.post("/api/teacher/quizzes", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const classId = asString(body.class_id).trim();
    const title = asString(body.title).trim();
    const rawIds = Array.isArray(body.question_ids) ? body.question_ids : [];
    if (!classId) return c.json({ error: "Kelas wajib dipilih." }, 400);
    const cls = await getClass(db, classId);
    if (!cls) return c.json({ error: "Kelas tidak ditemukan." }, 404);
    if (cls.teacher_user_id !== user.id) {
      return c.json({ error: "Hanya guru kelas ini yang bisa membuat kuis." }, 403);
    }
    if (title.length < 3 || title.length > 120) {
      return c.json({ error: "Judul kuis 3–120 karakter." }, 400);
    }
    const ids = [...new Set(rawIds.filter((x): x is number => typeof x === "number" && Number.isInteger(x)))];
    if (ids.length < 1 || ids.length > 30) {
      return c.json({ error: "Pilih 1–30 soal untuk kuis ini." }, 400);
    }
    // Semua question_id harus ada di DB dan berasal dari produk kelas itu.
    const found = await db.all<
      QuestionRow & { ch_product: string | null; sim_product: string | null }
    >(
      `SELECT q.*, ch.product_id AS ch_product, s.product_id AS sim_product
       FROM questions q
       LEFT JOIN chapters ch ON ch.id = q.chapter_id
       LEFT JOIN simulations s ON s.id = q.simulation_id
       WHERE q.id IN (${ids.map(() => "?").join(", ")})`,
      ...ids
    );
    const byId = new Map(found.map((q) => [q.id, q]));
    for (const id of ids) {
      const q = byId.get(id);
      if (!q) return c.json({ error: `Soal dengan id ${id} tidak ditemukan.` }, 400);
      const origin = q.ch_product ?? q.sim_product ?? null;
      if (origin !== cls.product_id) {
        return c.json(
          { error: `Soal dengan id ${id} bukan dari produk kelas ini.` },
          400
        );
      }
    }
    const id = newId("tq");
    const createdAt = nowIso();
    const subject = mode(found.map((q) => q.subject)) ?? "";
    const grade = mode(found.map((q) => q.grade)) ?? 1;
    await db.run(
      "INSERT INTO teacher_quizzes (id, teacher_user_id, class_id, title, subject, grade, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id,
      user.id,
      cls.id,
      title,
      subject,
      grade,
      createdAt
    );
    for (let i = 0; i < ids.length; i++) {
      await db.run(
        "INSERT INTO teacher_quiz_items (quiz_id, question_id, sort_order) VALUES (?, ?, ?)",
        id,
        ids[i],
        i
      );
    }
    return c.json(
      {
        quiz: {
          id,
          class_id: cls.id,
          class_name: cls.name,
          title,
          subject,
          grade,
          question_count: ids.length,
          submissions: 0,
          created_at: createdAt
        }
      },
      201
    );
  });

  // ------------------------- Guru: kuis-kuis buatan saya -------------------------

  app.get("/api/teacher/quizzes", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const rows = await db.all<TeacherQuizRow>(
      `SELECT tq.*, cl.name AS class_name, cl.product_id,
              (SELECT COUNT(*) FROM teacher_quiz_items WHERE quiz_id = tq.id) AS question_count,
              (SELECT COUNT(*) FROM teacher_quiz_attempts WHERE quiz_id = tq.id) AS submissions
       FROM teacher_quizzes tq
       JOIN classes cl ON cl.id = tq.class_id
       WHERE tq.teacher_user_id = ?
       ORDER BY tq.created_at DESC`,
      user.id
    );
    return c.json({
      quizzes: rows.map((q) => ({
        id: q.id,
        class_id: q.class_id,
        class_name: q.class_name ?? q.class_id,
        product_id: q.product_id ?? null,
        title: q.title,
        subject: q.subject,
        grade: q.grade,
        question_count: q.question_count ?? 0,
        submissions: q.submissions ?? 0,
        created_at: q.created_at
      }))
    });
  });

  // ------------------------- Detail kuis (guru pembuat / anggota kelas) -------------------------

  app.get("/api/teacher/quizzes/:id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const quiz = await getQuiz(db, c.req.param("id"));
    if (!quiz) return c.json({ error: "Kuis tidak ditemukan." }, 404);
    const cls = await getClass(db, quiz.class_id);
    const isTeacher = quiz.teacher_user_id === user.id;
    const isMember = cls ? await isClassMember(db, cls.id, user.id) : false;
    if (!isTeacher && !isMember) {
      return c.json({ error: "Kamu bukan guru atau anggota kelas kuis ini." }, 403);
    }
    const attempt = await myAttempt(db, quiz.id, user.id);
    const questionCount = (await quizItemIds(db, quiz.id)).length;
    const submissions = (await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM teacher_quiz_attempts WHERE quiz_id = ?",
      quiz.id
    ))?.n ?? 0;
    return c.json({
      quiz: {
        id: quiz.id,
        class_id: quiz.class_id,
        class_name: cls?.name ?? quiz.class_id,
        product_id: cls?.product_id ?? null,
        title: quiz.title,
        subject: quiz.subject,
        grade: quiz.grade,
        question_count: questionCount,
        submissions,
        created_at: quiz.created_at,
        is_teacher: isTeacher,
        submitted: !!attempt,
        my_score: attempt ? attempt.score : null,
        my_max_score: attempt ? attempt.max_score : null
      }
    });
  });

  // ------------------------- Guru: rekap per siswa -------------------------

  app.get("/api/teacher/quizzes/:id/recap", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const quiz = await getQuiz(db, c.req.param("id"));
    if (!quiz) return c.json({ error: "Kuis tidak ditemukan." }, 404);
    if (quiz.teacher_user_id !== user.id) {
      return c.json({ error: "Hanya guru pembuat kuis yang dapat melihat rekap." }, 403);
    }
    const cls = await getClass(db, quiz.class_id);
    const members = await db.all<{ user_id: string; name: string; joined_at: string }>(
      `SELECT cm.user_id, u.name, cm.joined_at FROM class_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.class_id = ? ORDER BY u.name`,
      quiz.class_id
    );
    const attempts = await db.all<TeacherQuizAttemptRow>(
      "SELECT * FROM teacher_quiz_attempts WHERE quiz_id = ?",
      quiz.id
    );
    const byUser = new Map(attempts.map((a) => [a.user_id, a]));
    const students = members.map((m) => {
      const a = byUser.get(m.user_id);
      return {
        id: m.user_id,
        name: m.name,
        submitted: !!a,
        score: a ? a.score : null,
        max_score: a ? a.max_score : null,
        percent:
          a && a.max_score > 0 ? Math.round((a.score / a.max_score) * 1000) / 10 : null,
        submitted_at: a ? a.created_at : null
      };
    });
    const done = students.filter((s) => s.submitted && s.percent !== null);
    const average =
      done.length > 0
        ? Math.round((done.reduce((sum, s) => sum + (s.percent ?? 0), 0) / done.length) * 10) / 10
        : null;
    return c.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        subject: quiz.subject,
        grade: quiz.grade,
        class_name: cls?.name ?? quiz.class_id,
        question_count: (await quizItemIds(db, quiz.id)).length,
        created_at: quiz.created_at
      },
      total_students: students.length,
      submitted_count: done.length,
      average_percent: average,
      students
    });
  });

  // ------------------------- Siswa: soal kuis (TANPA jawaban) -------------------------

  app.get("/api/teacher/quizzes/:id/questions", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const quiz = await getQuiz(db, c.req.param("id"));
    if (!quiz) return c.json({ error: "Kuis tidak ditemukan." }, 404);
    if (!(await isClassMember(db, quiz.class_id, user.id))) {
      return c.json({ error: "Kuis ini hanya untuk anggota kelas tersebut." }, 403);
    }
    if (await myAttempt(db, quiz.id, user.id)) {
      return c.json({ error: "Kamu sudah mengerjakan kuis ini." }, 400);
    }
    const ids = await quizItemIds(db, quiz.id);
    if (ids.length === 0) return c.json({ error: "Soal kuis belum siap." }, 500);
    const rows = await db.all<QuestionRow>(
      `SELECT * FROM questions WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ...ids
    );
    const byId = new Map(rows.map((q) => [q.id, q]));
    // Urutan soal = urutan saat guru merakit kuis (sort_order).
    // Jawaban TIDAK PERNAH bocor ke siswa (pola getStudyPack).
    const questions = ids
      .map((id) => byId.get(id))
      .filter((q): q is QuestionRow => !!q)
      .map((q) => ({
        id: String(q.id),
        type: q.type,
        question: q.question,
        options: parseOptions(q.options),
        points: q.points,
        subject: q.subject
      }));
    return c.json({
      quiz: { id: quiz.id, title: quiz.title, subject: quiz.subject, grade: quiz.grade },
      questions
    });
  });

  // ------------------------- Siswa: kirim jawaban (sekali saja) -------------------------

  app.post("/api/teacher/quizzes/:id/submit", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const quiz = await getQuiz(db, c.req.param("id"));
    if (!quiz) return c.json({ error: "Kuis tidak ditemukan." }, 404);
    if (!(await isClassMember(db, quiz.class_id, user.id))) {
      return c.json({ error: "Kuis ini hanya untuk anggota kelas tersebut." }, 403);
    }
    if (await myAttempt(db, quiz.id, user.id)) {
      return c.json({ error: "Kamu sudah mengerjakan kuis ini." }, 400);
    }
    const body = await readJson(c);
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    const ids = await quizItemIds(db, quiz.id);
    if (ids.length === 0) return c.json({ error: "Soal kuis belum siap." }, 500);
    const rows = await db.all<QuestionRow>(
      `SELECT * FROM questions WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ...ids
    );
    const byId = new Map(rows.map((q) => [q.id, q]));
    let totalEarned = 0;
    let maxScore = 0;
    const correct: Record<string, boolean> = {};
    const review: { questionId: string; correct: boolean; discussion: string }[] = [];
    for (const id of ids) {
      const q = byId.get(id);
      if (!q) continue;
      const result = gradeOne(
        { id: String(q.id), type: q.type, answer: q.answer, discussion: q.discussion, points: q.points },
        answers[String(q.id)]
      );
      totalEarned += result.earned;
      maxScore += q.points;
      correct[String(q.id)] = result.correct;
      review.push({ questionId: String(q.id), correct: result.correct, discussion: q.discussion });
    }
    const score = Math.round(totalEarned);
    try {
      await db.run(
        "INSERT INTO teacher_quiz_attempts (id, quiz_id, user_id, answers, score, max_score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        newId("tqa"),
        quiz.id,
        user.id,
        JSON.stringify(answers),
        score,
        maxScore,
        nowIso()
      );
    } catch {
      // Balapan dua submit bersamaan: UNIQUE(quiz_id, user_id) menang satu.
      return c.json({ error: "Kamu sudah mengerjakan kuis ini." }, 400);
    }
    return c.json({ score, max_score: maxScore, correct, review });
  });
}
