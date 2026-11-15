// adaptive.ts — Latihan Adaptif (soal menyesuaikan jawaban).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerAdaptiveRoutes(app, db) — mengikuti pola registerTryoutRoutes
// di tryout.ts (file itu TIDAK diubah).
//
// MODEL ADAPTIF (heuristik sederhana — BUKAN IRT / BUKAN model Rasch):
//   - Sesi = 10 soal. Mulai di level 2 (Sedang).
//   - 2 jawaban benar beruntun -> naik 1 level (maks. 3 Sulit).
//   - 1 jawaban salah -> turun 1 level (min. 1 Mudah).
//   - Level dihitung di KLIEN dari hasil tiap jawaban; server hanya
//     menyediakan satu soal acak per level dan menilai jawaban.
//   - Teks jujur di UI: "Soal menyesuaikan jawabanmu."
//
// POOL SOAL (tanpa soal baru — memakai tabel questions yang sudah ada):
//   - Level 1 Mudah  : soal kuis bab (chapter_id NOT NULL) untuk
//     product + subject itu. Semua soal kuis bab bertipe pg.
//   - Level 2 Sedang : soal simulasi (simulation_id NOT NULL) tipe
//     pg / bs untuk product + subject itu.
//   - Level 3 Sulit  : soal simulasi tipe pg_kompleks / uraian /
//     menjodohkan untuk product + subject itu.
//   Produk k1–k6; mapel mengikuti SIM_SUBJECTS di seed/study.ts.
//   Bila pool level yang diminta habis (semua sudah dipakai di sesi
//   ini), fallback ke level terdekat yang masih ada soal.
//
// PENILAIAN: server-side dengan SALINAN gradeOne dari actions.ts
// (module-private di sana — lihat catatan di bawah). Kunci TIDAK PERNAH
// dikirim ke klien sebelum submit; endpoint /question hanya mengembalikan
// id, type, question, options, subject, dan label asal soal.
//
// RIWAYAT: POST /api/adaptive/finish menyimpan SATU baris quiz_attempts
// kind='adaptive', ref_id = `adaptive-<product>-<subject>`. /api/prediction
// hanya memakai kind='simulation' (WHERE qa.kind = 'simulation' di
// actions.ts — diverifikasi), jadi latihan adaptif tercatat di riwayat
// TANPA mengganggu prediksi nilai SAS.

import { Hono, type Context } from "hono";
import {
  type Database,
  type QuestionRow,
  type User,
  nowIso
} from "./database.js";

// ---------------------------------------------------------------------------
// Helper kecil (duplikasi seperlunya dari actions.ts — berkas itu bukan
// milik fitur ini, mengikuti pola yang sama seperti tryout.ts).
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mapel per kelas — CERMIN SIM_SUBJECTS di server/seed/study.ts.
 *  Bila daftar mapel di study.ts berubah, samakan di sini. */
const SUBJECTS_BY_GRADE: Record<number, string[]> = {
  1: ["Matematika", "B. Indonesia", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  2: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  3: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  4: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  5: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"],
  6: ["Matematika", "B. Indonesia", "IPAS", "Pancasila", "B. Inggris", "PJOK", "PAI", "Seni Rupa"]
};

const LEVEL_LABEL: Record<number, string> = { 1: "Mudah", 2: "Sedang", 3: "Sulit" };

function parseProduct(v: string | null | undefined): { product: string; grade: number } | null {
  if (!v) return null;
  const m = /^k([1-6])$/.exec(v.trim());
  if (!m) return null;
  return { product: v.trim(), grade: Number(m[1]) };
}

function parseExclude(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, 100);
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
// Penilaian — SALINAN PERSIS gradeOne + helper-nya dari actions.ts
// (module-private di sana; salinan gradeOne dari actions.ts — sinkronkan
// bila berubah). Disalin apa adanya, termasuk perilaku tiap tipe:
// pg/bs/isian = cocok persis setelah normalisasi; pg_kompleks =
// proporsional tanpa pengurangan; menjodohkan = 1 poin per pasangan;
// uraian = kata kunci ditemukan, dibulatkan ke bawah.
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

/** Salinan gradeOne dari actions.ts — sinkronkan bila berubah. */
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

// ---------------------------------------------------------------------------
// Pool soal per level
// ---------------------------------------------------------------------------

interface PoolRow extends QuestionRow {
  origin_title: string | null;
}

/** Satu soal acak dari pool level itu (tanpa jawaban). null bila kosong. */
async function pickFromLevel(
  db: Database,
  product: string,
  subject: string,
  level: number,
  exclude: number[]
): Promise<PoolRow | null> {
  const excludeSql =
    exclude.length > 0 ? ` AND q.id NOT IN (${exclude.map(() => "?").join(", ")})` : "";
  const excludeParams: (string | number)[] = exclude;
  let rows: PoolRow[];
  if (level === 1) {
    // Mudah: kuis bab (chapter_id NOT NULL).
    rows = await db.all<PoolRow>(
      `SELECT q.*, ch.title AS origin_title
       FROM questions q JOIN chapters ch ON ch.id = q.chapter_id
       WHERE ch.product_id = ? AND ch.subject = ?${excludeSql}
       ORDER BY RANDOM() LIMIT 1`,
      product,
      subject,
      ...excludeParams
    );
  } else {
    // Sedang (pg/bs) / Sulit (pg_kompleks/uraian/menjodohkan): soal simulasi.
    const types = level === 2 ? ["pg", "bs"] : ["pg_kompleks", "uraian", "menjodohkan"];
    rows = await db.all<PoolRow>(
      `SELECT q.*, s.title AS origin_title
       FROM questions q JOIN simulations s ON s.id = q.simulation_id
       WHERE s.product_id = ? AND s.subject = ? AND q.type IN (${types.map(() => "?").join(", ")})${excludeSql}
       ORDER BY RANDOM() LIMIT 1`,
      product,
      subject,
      ...types,
      ...excludeParams
    );
  }
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerAdaptiveRoutes(app: Hono, db: Database): void {
  /**
   * GET /api/adaptive/question?product=k1&subject=Matematika&level=2&exclude=1,2,3
   * Satu soal acak dari pool level itu, TANPA jawaban/pembahasan.
   * Bila pool level itu habis, fallback ke level terdekat yang masih
   * ada soal (urutan: level diminta, lalu tetangga terdekat).
   */
  app.get("/api/adaptive/question", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);

    const parsed = parseProduct(c.req.query("product"));
    if (!parsed) return c.json({ error: "Produk tidak dikenal. Pilih Kelas 1 sampai 6." }, 400);
    const subject = asString(c.req.query("subject"));
    if (!(SUBJECTS_BY_GRADE[parsed.grade] ?? []).includes(subject)) {
      return c.json({ error: "Mapel tidak dikenal untuk kelas ini." }, 400);
    }
    const levelRaw = Number(c.req.query("level") ?? "2");
    const level = levelRaw === 1 || levelRaw === 2 || levelRaw === 3 ? levelRaw : 2;
    const exclude = parseExclude(c.req.query("exclude"));

    // Urutan coba: level diminta dulu, lalu tetangga terdekat.
    const order = level === 2 ? [2, 1, 3] : level === 1 ? [1, 2, 3] : [3, 2, 1];
    let picked: PoolRow | null = null;
    let pickedLevel = level;
    for (const lv of order) {
      picked = await pickFromLevel(db, parsed.product, subject, lv, exclude);
      if (picked) {
        pickedLevel = lv;
        break;
      }
    }
    if (!picked) {
      return c.json({ error: "Soal latihan untuk pilihan ini sudah habis." }, 404);
    }

    return c.json({
      question: {
        id: picked.id,
        type: picked.type,
        question: picked.question,
        options: parseOptions(picked.options),
        subject: picked.subject,
        origin_kind: picked.chapter_id ? "quiz" : "simulation",
        origin_title: picked.origin_title ?? ""
      },
      level: pickedLevel,
      level_label: LEVEL_LABEL[pickedLevel],
      requested_level: level
    });
  });

  /**
   * POST /api/adaptive/answer {question_id, answer}
   * Nilai SATU jawaban server-side. Mengembalikan benar/tidak, poin,
   * dan pembahasan — kunci tidak pernah bocor sebelum submit.
   */
  app.post("/api/adaptive/answer", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const questionId = Number(body.question_id);
    if (!Number.isInteger(questionId) || questionId <= 0) {
      return c.json({ error: "question_id tidak valid." }, 400);
    }
    const q = await db.get<QuestionRow>("SELECT * FROM questions WHERE id = ?", questionId);
    if (!q) return c.json({ error: "Soal tidak ditemukan." }, 404);

    const result = gradeOne(
      { id: String(q.id), type: q.type, answer: q.answer, discussion: q.discussion, points: q.points },
      body.answer
    );
    return c.json({
      question_id: q.id,
      type: q.type,
      correct: result.correct,
      earned: result.earned,
      points: q.points,
      discussion: q.discussion
    });
  });

  /**
   * POST /api/adaptive/finish {product, subject, results: [{question_id, correct, earned, points}]}
   * Simpan SATU baris quiz_attempts kind='adaptive' supaya sesi tercatat
   * di riwayat. Poin maksimum diambil dari DB (bukan dari klien);
   * earned dijepit ke [0, points DB]. Tidak mengganggu prediksi SAS
   * (prediksi hanya memakai kind='simulation').
   */
  app.post("/api/adaptive/finish", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const parsed = parseProduct(asString(body.product));
    if (!parsed) return c.json({ error: "Produk tidak dikenal. Pilih Kelas 1 sampai 6." }, 400);
    const subject = asString(body.subject);
    if (!(SUBJECTS_BY_GRADE[parsed.grade] ?? []).includes(subject)) {
      return c.json({ error: "Mapel tidak dikenal untuk kelas ini." }, 400);
    }
    const results = Array.isArray(body.results) ? body.results : [];
    if (results.length === 0 || results.length > 10) {
      return c.json({ error: "Hasil sesi harus berisi 1 sampai 10 soal." }, 400);
    }

    // Ambil poin resmi tiap soal dari DB.
    const ids = results
      .map((r) => (r && typeof r === "object" ? Number((r as Record<string, unknown>).question_id) : NaN))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length !== results.length) {
      return c.json({ error: "Ada question_id yang tidak valid." }, 400);
    }
    const rows = await db.all<{ id: number; points: number }>(
      `SELECT id, points FROM questions WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ...ids
    );
    const pointsById = new Map(rows.map((r) => [r.id, r.points]));
    if (rows.length !== ids.length) {
      return c.json({ error: "Ada soal yang tidak ditemukan." }, 400);
    }

    let totalEarned = 0;
    let maxScore = 0;
    const summary = results.map((r) => {
      const rec = r as Record<string, unknown>;
      const qid = Number(rec.question_id);
      const points = pointsById.get(qid) ?? 0;
      const earnedRaw = typeof rec.earned === "number" && Number.isFinite(rec.earned) ? rec.earned : 0;
      const earned = Math.max(0, Math.min(points, earnedRaw));
      totalEarned += earned;
      maxScore += points;
      return { question_id: qid, correct: rec.correct === true, earned, points };
    });

    const score = Math.round(totalEarned);
    const refId = `adaptive-${parsed.product}-${subject}`;
    const inserted = await db.run(
      "INSERT INTO quiz_attempts (user_id, kind, ref_id, score, max_score, answers, focus_switches, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
      user.id,
      "adaptive",
      refId,
      score,
      maxScore,
      JSON.stringify(summary),
      nowIso()
    );
    await db.run("INSERT OR IGNORE INTO study_days (user_id, date) VALUES (?, ?)", user.id, todayIso());

    return c.json({
      attempt_id: Number(inserted.lastInsertRowid),
      score,
      max_score: maxScore,
      ref_id: refId
    });
  });
}
