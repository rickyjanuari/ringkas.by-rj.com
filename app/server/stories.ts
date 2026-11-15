// stories.ts — Cerita Edukasi (FITUR KETERLIBATAN 6).
//
// Daftar + isi cerita GRATIS untuk semua akun login (seperti Latihan
// Harian). Jawaban TIDAK PERNAH dikirim ke klien: GET list/detail hanya
// membawa soal + opsi; penilaian dilakukan server-side di submit.
// Attempt tercatat sebagai quiz_attempts kind = 'cerita',
// ref_id = `cerita-<id>`. XP mengikuti aturan cerita edukasi
// (pertama lulus 10 / gagal 5, ulangan 2; lulus = skor >= 70%).
//
// Penilaian memakai normalisasi yang sama seperti gradeOne di
// actions.ts (lowercase + rapikan spasi). Helper auth/JSON disalin
// ringkas dari actions.ts (pola voice.ts).

import { Hono, type Context } from "hono";
import { type Database, type User, nowIso } from "./database.js";
import { findStory, STORIES } from "./seed/stories.js";
import { awardXp } from "./xp.js";

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

/** Samakan dengan normalizeText di actions.ts: lowercase + rapikan spasi. */
function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function registerStoriesRoutes(app: Hono, db: Database): void {
  // Daftar cerita — tanpa isi cerita dan tanpa jawaban.
  app.get("/api/stories", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    return c.json({
      stories: STORIES.map((s) => ({
        id: s.id,
        grade: s.grade,
        title: s.title,
        moral: s.moral,
        questionCount: s.questions.length
      }))
    });
  });

  // Satu cerita + soalnya — TANPA jawaban.
  app.get("/api/stories/:id", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const story = findStory(c.req.param("id"));
    if (!story) return c.json({ error: "Cerita tidak ditemukan." }, 404);
    return c.json({
      id: story.id,
      grade: story.grade,
      title: story.title,
      moral: story.moral,
      paragraphs: story.paragraphs,
      questions: story.questions.map((q, index) => ({
        index,
        type: "pg",
        question: q.question,
        options: q.options
      }))
    });
  });

  // Kumpulkan jawaban cerita — dinilai server-side.
  app.post("/api/stories/:id/submit", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const story = findStory(c.req.param("id"));
    if (!story) return c.json({ error: "Cerita tidak ditemukan." }, 404);
    const body = await readJson(c);
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    let score = 0;
    const maxScore = story.questions.length;
    const correct: Record<string, boolean> = {};
    const review: { index: number; correct: boolean; discussion: string }[] = [];
    story.questions.forEach((q, index) => {
      const given = answers[String(index)];
      const ok =
        typeof given === "string" && normalizeText(given) === normalizeText(q.answer);
      if (ok) score += 1;
      correct[String(index)] = ok;
      review.push({ index, correct: ok, discussion: q.discussion });
    });
    const refId = `cerita-${story.id}`;
    let attemptId = 0;
    try {
      const inserted = await db.run(
        "INSERT INTO quiz_attempts (user_id, kind, ref_id, score, max_score, answers, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        user.id,
        "cerita",
        refId,
        score,
        maxScore,
        JSON.stringify(answers),
        nowIso()
      );
      attemptId = Number(inserted.lastInsertRowid);
    } catch {
      return c.json({ error: "Hasil cerita belum bisa disimpan. Coba lagi nanti." }, 503);
    }
    // XP cerita edukasi: percobaan pertama lulus 10 / gagal 5, ulangan 2.
    let xpEarned = 0;
    try {
      const countRow = await db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id = ? AND kind = 'cerita' AND ref_id = ?",
        user.id,
        refId
      );
      const first = (countRow?.n ?? 0) <= 1;
      const passed = maxScore > 0 && score / maxScore >= 0.7;
      xpEarned = first ? (passed ? 10 : 5) : 2;
      await awardXp(db, user.id, "cerita", refId, xpEarned);
    } catch {
      // XP tidak boleh menggagalkan respons — nilai 0 bila gagal dicatat.
      xpEarned = 0;
    }
    return c.json({ score, max_score: maxScore, correct, review, attempt_id: attemptId, xpEarned });
  });
}
