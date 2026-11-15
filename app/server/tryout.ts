// tryout.ts — Tryout Terjadwal + Papan Peringkat per Kelas (migrasi 0011).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerTryoutRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah).
//
// KEPUTUSAN DESAIN (lihat juga laporan akhir):
// - Soal tryout dipilih SEKALI saat tryout dibuat dari bank simulasi
//   kelas itu (soal-soal simulations produk k1–k6, Paket A) — TIDAK ada
//   soal baru, bank soal tidak diubah. Daftar id soal disimpan sebagai
//   JSON di tryouts.question_ids, jadi semua peserta tryout yang sama
//   mengerjakan soal yang sama, dalam urutan yang sama.
// - Pemilihan memakai shuffle ber-seed dari id tryout (mulberry32):
//   deterministik dan bisa diulang, tapi yang mengikat adalah
//   question_ids yang tersimpan — bukan seed-nya.
// - Peserta: pemilik produk kelas k{grade} (cek PAID seperti gating
//   LUNAS, termasuk anggota bundel) ATAU semua akun login bila
//   tryout.is_free = 1. Kebijakan: tryout PERTAMA tiap kelas dibuat
//   gratis (is_free = 1); tryout berikutnya berbayar.
// - Pendaftaran ("Ikut Tryout") dicatat di tryout_registrations;
//   boleh daftar sampai ends_at, selama belum submit. Mengerjakan
//   mensyaratkan: terdaftar + jendela berlangsung + belum pernah submit.
// - Penilaian server-side dengan SALINAN gradeOne dari actions.ts:
//   gradeOne di sana module-private (tidak diekspor) dan actions.ts
//   bukan berkas milik fitur ini, jadi logikanya diduplikasi persis
//   di bawah (ditandai). Bila actions.ts mengubah penilaian, salinan
//   ini harus disinkronkan.
// - Papan peringkat: skor turun, lalu waktu pengerjaan naik, lalu
//   waktu submit naik. Nama tampil = nama depan + inisial (bukan email).

import { Hono, type Context } from "hono";
import {
  type Database,
  type QuestionRow,
  type User,
  newId,
  nowIso
} from "./database.js";
import { logAdminAction } from "./audit.js";

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
  return orders.some((o) => parseItems(o.items).some((it) => it.product_id === productId));
}

/** Nama tampil di papan peringkat: nama depan + inisial (tanpa email). */
export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Peserta";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

// ---------------------------------------------------------------------------
// Penilaian — SALINAN PERSIS gradeOne + helper-nya dari actions.ts
// (module-private di sana; lihat catatan di kepala berkas).
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

function parseOptions(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pemilihan soal: shuffle ber-seed (deterministik per tryout).
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPick(ids: number[], seedText: string, count: number): number[] {
  const rng = mulberry32(hashStr(seedText));
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

function parseQuestionIds(raw: string): number[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is number => typeof x === "number" && Number.isInteger(x));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Baris + serialisasi
// ---------------------------------------------------------------------------

interface TryoutRow {
  id: string;
  grade: number;
  title: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  question_count: number;
  question_ids: string;
  is_free: number;
  status: string;
  created_by: string | null;
  created_at: string;
}

type Phase = "upcoming" | "live" | "ended";

function phaseOf(t: TryoutRow, nowMs: number): Phase {
  if (nowMs < new Date(t.starts_at).getTime()) return "upcoming";
  if (nowMs <= new Date(t.ends_at).getTime()) return "live";
  return "ended";
}

async function countsByTryout(
  db: Database
): Promise<Map<string, { participants: number; submissions: number }>> {
  const out = new Map<string, { participants: number; submissions: number }>();
  const regs = await db.all<{ tryout_id: string; n: number }>(
    "SELECT tryout_id, COUNT(*) AS n FROM tryout_registrations GROUP BY tryout_id"
  );
  for (const r of regs) {
    out.set(r.tryout_id, { participants: r.n, submissions: 0 });
  }
  const atts = await db.all<{ tryout_id: string; n: number }>(
    "SELECT tryout_id, COUNT(*) AS n FROM tryout_attempts GROUP BY tryout_id"
  );
  for (const a of atts) {
    const cur = out.get(a.tryout_id) ?? { participants: 0, submissions: 0 };
    cur.submissions = a.n;
    out.set(a.tryout_id, cur);
  }
  return out;
}

function publicTryout(
  t: TryoutRow,
  nowMs: number,
  counts: Map<string, { participants: number; submissions: number }>,
  mine?: { registered: boolean; submitted: boolean; score?: number; max_score?: number }
): Record<string, unknown> {
  const c = counts.get(t.id) ?? { participants: 0, submissions: 0 };
  return {
    id: t.id,
    grade: t.grade,
    title: t.title,
    starts_at: t.starts_at,
    ends_at: t.ends_at,
    duration_minutes: t.duration_minutes,
    question_count: t.question_count,
    is_free: t.is_free,
    status: t.status,
    phase: phaseOf(t, nowMs),
    participants: c.participants,
    submissions: c.submissions,
    created_at: t.created_at,
    ...(mine ? { registered: mine.registered, submitted: mine.submitted, ...(mine.score !== undefined ? { my_score: mine.score, my_max_score: mine.max_score } : {}) } : {})
  };
}

/** Boleh ikut? Gratis (is_free) untuk semua akun login; kalau tidak, pemilik produk k{grade}. */
async function canJoinTryout(db: Database, userId: string, t: TryoutRow): Promise<boolean> {
  if (t.is_free === 1) return true;
  return userHasPaidProduct(db, userId, `k${t.grade}`);
}

async function myAttempt(
  db: Database,
  tryoutId: string,
  userId: string
): Promise<{ score: number; max_score: number; duration_seconds: number; submitted_at: string } | undefined> {
  return db.get<{
    score: number;
    max_score: number;
    duration_seconds: number;
    submitted_at: string;
  }>(
    "SELECT score, max_score, duration_seconds, submitted_at FROM tryout_attempts WHERE tryout_id = ? AND user_id = ?",
    tryoutId,
    userId
  );
}

async function leaderboardRows(db: Database, tryoutId: string) {
  const rows = await db.all<{
    user_id: string;
    name: string;
    score: number;
    max_score: number;
    duration_seconds: number;
    submitted_at: string;
  }>(
    `SELECT a.user_id, u.name, a.score, a.max_score, a.duration_seconds, a.submitted_at
     FROM tryout_attempts a JOIN users u ON u.id = a.user_id
     WHERE a.tryout_id = ?
     ORDER BY a.score DESC, a.duration_seconds ASC, a.submitted_at ASC`,
    tryoutId
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    name: displayName(r.name),
    score: r.score,
    max_score: r.max_score,
    duration_seconds: r.duration_seconds,
    submitted_at: r.submitted_at
  }));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerTryoutRoutes(app: Hono, db: Database): void {
  // ------------------------- Publik: daftar tryout -------------------------

  app.get("/api/tryouts", async (c) => {
    const user = await authUser(c, db);
    const rows = await db.all<TryoutRow>(
      "SELECT * FROM tryouts WHERE status != 'cancelled' ORDER BY starts_at ASC"
    );
    const counts = await countsByTryout(db);
    const nowMs = Date.now();
    const out = [];
    for (const t of rows) {
      let mine: { registered: boolean; submitted: boolean; score?: number; max_score?: number } | undefined;
      if (user) {
        const reg = await db.get<{ tryout_id: string }>(
          "SELECT tryout_id FROM tryout_registrations WHERE tryout_id = ? AND user_id = ?",
          t.id,
          user.id
        );
        const att = await myAttempt(db, t.id, user.id);
        mine = {
          registered: !!reg,
          submitted: !!att,
          ...(att ? { score: att.score, max_score: att.max_score } : {})
        };
      }
      out.push(publicTryout(t, nowMs, counts, mine));
    }
    return c.json({ tryouts: out });
  });

  // ------------------------- Publik: detail + peringkat -------------------------

  app.get("/api/tryouts/:id", async (c) => {
    const user = await authUser(c, db);
    const t = await db.get<TryoutRow>("SELECT * FROM tryouts WHERE id = ?", c.req.param("id"));
    if (!t || t.status === "cancelled") {
      return c.json({ error: "Tryout tidak ditemukan." }, 404);
    }
    const counts = await countsByTryout(db);
    const nowMs = Date.now();
    let mine: { registered: boolean; submitted: boolean; score?: number; max_score?: number } | undefined;
    let canJoin = false;
    if (user) {
      const reg = await db.get<{ tryout_id: string }>(
        "SELECT tryout_id FROM tryout_registrations WHERE tryout_id = ? AND user_id = ?",
        t.id,
        user.id
      );
      const att = await myAttempt(db, t.id, user.id);
      mine = {
        registered: !!reg,
        submitted: !!att,
        ...(att ? { score: att.score, max_score: att.max_score } : {})
      };
      canJoin = await canJoinTryout(db, user.id, t);
    }
    const phase = phaseOf(t, nowMs);
    // Peringkat tampil setelah berakhir, atau untuk peserta yang sudah submit.
    const showBoard = phase === "ended" || mine?.submitted === true;
    return c.json({
      tryout: { ...publicTryout(t, nowMs, counts, mine), can_join: canJoin },
      leaderboard: showBoard ? await leaderboardRows(db, t.id) : null
    });
  });

  // ------------------------- Pendaftaran -------------------------

  app.post("/api/tryouts/:id/register", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const t = await db.get<TryoutRow>("SELECT * FROM tryouts WHERE id = ?", c.req.param("id"));
    if (!t || t.status === "cancelled") {
      return c.json({ error: "Tryout tidak ditemukan." }, 404);
    }
    if (Date.now() > new Date(t.ends_at).getTime()) {
      return c.json({ error: "Pendaftaran sudah ditutup — tryout sudah berakhir." }, 400);
    }
    if (await myAttempt(db, t.id, user.id)) {
      return c.json({ error: "Kamu sudah mengerjakan tryout ini." }, 400);
    }
    if (!(await canJoinTryout(db, user.id, t))) {
      return c.json(
        { error: `Tryout ini hanya untuk pemilik produk Kelas ${t.grade}. Beli produknya di katalog ya.` },
        403
      );
    }
    await db.run(
      "INSERT OR IGNORE INTO tryout_registrations (tryout_id, user_id, registered_at) VALUES (?, ?, ?)",
      t.id,
      user.id,
      nowIso()
    );
    return c.json({ ok: true, registered: true });
  });

  // ------------------------- Soal (tanpa kunci) -------------------------

  app.get("/api/tryouts/:id/questions", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const t = await db.get<TryoutRow>("SELECT * FROM tryouts WHERE id = ?", c.req.param("id"));
    if (!t || t.status === "cancelled") {
      return c.json({ error: "Tryout tidak ditemukan." }, 404);
    }
    const nowMs = Date.now();
    if (phaseOf(t, nowMs) !== "live") {
      return c.json(
        { error: phaseOf(t, nowMs) === "upcoming" ? "Tryout belum dimulai." : "Tryout sudah berakhir." },
        400
      );
    }
    const reg = await db.get<{ tryout_id: string }>(
      "SELECT tryout_id FROM tryout_registrations WHERE tryout_id = ? AND user_id = ?",
      t.id,
      user.id
    );
    if (!reg) {
      return c.json({ error: "Daftar dulu sebagai peserta tryout ini." }, 403);
    }
    if (await myAttempt(db, t.id, user.id)) {
      return c.json({ error: "Kamu sudah mengerjakan tryout ini." }, 400);
    }
    const ids = parseQuestionIds(t.question_ids);
    if (ids.length === 0) return c.json({ error: "Soal tryout belum siap." }, 500);
    const rows = await db.all<QuestionRow>(
      `SELECT * FROM questions WHERE id IN (${ids.map(() => "?").join(", ")})`,
      ...ids
    );
    const byId = new Map(rows.map((q) => [q.id, q]));
    // Urutan soal = urutan question_ids yang tersimpan (sama untuk semua peserta).
    const questions = ids
      .map((id) => byId.get(id))
      .filter((q): q is QuestionRow => !!q)
      .map((q) => ({
        id: String(q.id),
        type: q.type,
        question: q.question,
        options: parseOptions(q.options),
        subject: q.subject
      }));
    // Sisa waktu = durasi tryout, dibatasi ujung jendela (bila mulai mepet).
    const remainingSeconds = Math.max(
      0,
      Math.min(
        t.duration_minutes * 60,
        Math.floor((new Date(t.ends_at).getTime() - nowMs) / 1000)
      )
    );
    return c.json({
      tryout: {
        id: t.id,
        grade: t.grade,
        title: t.title,
        ends_at: t.ends_at,
        duration_minutes: t.duration_minutes
      },
      remaining_seconds: remainingSeconds,
      questions
    });
  });

  // ------------------------- Submit (sekali saja, dinilai server) -------------------------

  app.post("/api/tryouts/:id/submit", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const t = await db.get<TryoutRow>("SELECT * FROM tryouts WHERE id = ?", c.req.param("id"));
    if (!t || t.status === "cancelled") {
      return c.json({ error: "Tryout tidak ditemukan." }, 404);
    }
    if (Date.now() > new Date(t.ends_at).getTime()) {
      return c.json({ error: "Waktu tryout sudah berakhir." }, 400);
    }
    const reg = await db.get<{ tryout_id: string }>(
      "SELECT tryout_id FROM tryout_registrations WHERE tryout_id = ? AND user_id = ?",
      t.id,
      user.id
    );
    if (!reg) {
      return c.json({ error: "Daftar dulu sebagai peserta tryout ini." }, 403);
    }
    if (await myAttempt(db, t.id, user.id)) {
      return c.json({ error: "Kamu sudah mengerjakan tryout ini." }, 400);
    }
    const body = await readJson(c);
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    const ids = parseQuestionIds(t.question_ids);
    if (ids.length === 0) return c.json({ error: "Soal tryout belum siap." }, 500);
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
    // Durasi pengerjaan dari klien, dibatasi durasi tryout + toleransi 3 menit.
    const claimed = asNumber(body.duration_seconds);
    const durationSeconds =
      claimed === undefined
        ? 0
        : Math.max(0, Math.min(t.duration_minutes * 60 + 180, Math.floor(claimed)));
    try {
      await db.run(
        "INSERT INTO tryout_attempts (tryout_id, user_id, answers, score, max_score, duration_seconds, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        t.id,
        user.id,
        JSON.stringify(answers),
        score,
        maxScore,
        durationSeconds,
        nowIso()
      );
    } catch {
      // Balapan dua submit bersamaan: UNIQUE(tryout_id, user_id) menang satu.
      return c.json({ error: "Kamu sudah mengerjakan tryout ini." }, 400);
    }
    return c.json({ score, max_score: maxScore, correct, review });
  });

  // ------------------------- Papan peringkat -------------------------

  app.get("/api/tryouts/:id/leaderboard", async (c) => {
    const user = await authUser(c, db);
    const t = await db.get<TryoutRow>("SELECT * FROM tryouts WHERE id = ?", c.req.param("id"));
    if (!t || t.status === "cancelled") {
      return c.json({ error: "Tryout tidak ditemukan." }, 404);
    }
    const phase = phaseOf(t, Date.now());
    const submitted = user ? !!(await myAttempt(db, t.id, user.id)) : false;
    if (phase !== "ended" && !submitted) {
      return c.json(
        { error: "Papan peringkat tampil setelah tryout berakhir." },
        403
      );
    }
    return c.json({ tryout_id: t.id, leaderboard: await leaderboardRows(db, t.id) });
  });

  // ------------------------- Admin: daftar -------------------------

  app.get("/api/admin/tryouts", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const rows = await db.all<TryoutRow>("SELECT * FROM tryouts ORDER BY starts_at DESC");
    const counts = await countsByTryout(db);
    const nowMs = Date.now();
    return c.json({
      tryouts: rows.map((t) => {
        const cc = counts.get(t.id) ?? { participants: 0, submissions: 0 };
        return {
          id: t.id,
          grade: t.grade,
          title: t.title,
          starts_at: t.starts_at,
          ends_at: t.ends_at,
          duration_minutes: t.duration_minutes,
          question_count: t.question_count,
          question_ids_count: parseQuestionIds(t.question_ids).length,
          is_free: t.is_free,
          status: t.status,
          phase: phaseOf(t, nowMs),
          participants: cc.participants,
          submissions: cc.submissions,
          created_at: t.created_at
        };
      })
    });
  });

  // ------------------------- Admin: buat (pilih soal sekali) -------------------------

  app.post("/api/admin/tryouts", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const body = await readJson(c);
    const grade = asNumber(body.grade);
    const title = asString(body.title).trim();
    const startsAt = asString(body.starts_at).trim();
    const endsAt = asString(body.ends_at).trim();
    const duration = asNumber(body.duration_minutes) ?? 60;
    const count = asNumber(body.question_count) ?? 25;
    const isFree = body.is_free === true || body.is_free === 1 ? 1 : 0;
    if (!grade || !Number.isInteger(grade) || grade < 1 || grade > 6) {
      return c.json({ error: "Kelas harus 1–6." }, 400);
    }
    if (!title || title.length > 120) {
      return c.json({ error: "Judul wajib diisi (maks. 120 karakter)." }, 400);
    }
    const startMs = new Date(startsAt).getTime();
    const endMs = new Date(endsAt).getTime();
    if (!startsAt || !endsAt || Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return c.json({ error: "Tanggal mulai dan selesai wajib diisi (format tanggal+jam)." }, 400);
    }
    if (endMs <= startMs) {
      return c.json({ error: "Waktu selesai harus setelah waktu mulai." }, 400);
    }
    if (!Number.isInteger(duration) || duration < 10 || duration > 180) {
      return c.json({ error: "Durasi harus 10–180 menit." }, 400);
    }
    if (!Number.isInteger(count) || count < 5 || count > 50) {
      return c.json({ error: "Jumlah soal harus 5–50." }, 400);
    }
    // Pool soal: semua soal simulasi produk k{grade} (Paket A) — lintas
    // mapel, tanpa soal baru, tanpa mengubah bank soal.
    const pool = await db.all<{ id: number }>(
      `SELECT q.id FROM questions q
       JOIN simulations s ON s.id = q.simulation_id
       WHERE s.product_id = ? AND s.grade = ?
       ORDER BY q.id`,
      `k${grade}`,
      grade
    );
    if (pool.length === 0) {
      return c.json({ error: `Belum ada bank simulasi untuk Kelas ${grade}.` }, 400);
    }
    if (pool.length < count) {
      return c.json(
        { error: `Bank simulasi Kelas ${grade} hanya punya ${pool.length} soal — kurangi jumlah soal.` },
        400
      );
    }
    const id = newId("tryout");
    const picked = seededPick(
      pool.map((r) => r.id),
      id,
      count
    );
    const createdAt = nowIso();
    await db.run(
      `INSERT INTO tryouts (id, grade, title, starts_at, ends_at, duration_minutes, question_count, question_ids, is_free, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      id,
      grade,
      title,
      new Date(startMs).toISOString(),
      new Date(endMs).toISOString(),
      duration,
      count,
      JSON.stringify(picked),
      isFree,
      admin.id,
      createdAt
    );
    await logAdminAction(db, admin, "tryout_create", id, `Kelas ${grade}: ${title} (${picked.length} soal)`);
    return c.json(
      {
        tryout: {
          id,
          grade,
          title,
          starts_at: new Date(startMs).toISOString(),
          ends_at: new Date(endMs).toISOString(),
          duration_minutes: duration,
          question_count: count,
          question_ids_count: picked.length,
          is_free: isFree,
          status: "scheduled",
          phase: "upcoming",
          participants: 0,
          submissions: 0,
          created_at: createdAt
        }
      },
      201
    );
  });

  // ------------------------- Admin: hapus (hanya sebelum dimulai) -------------------------

  app.delete("/api/admin/tryouts/:id", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    const t = await db.get<TryoutRow>("SELECT * FROM tryouts WHERE id = ?", c.req.param("id"));
    if (!t) return c.json({ error: "Tryout tidak ditemukan." }, 404);
    if (Date.now() >= new Date(t.starts_at).getTime()) {
      return c.json({ error: "Tryout yang sudah dimulai tidak bisa dihapus." }, 400);
    }
    await db.run("DELETE FROM tryout_registrations WHERE tryout_id = ?", t.id);
    await db.run("DELETE FROM tryout_attempts WHERE tryout_id = ?", t.id);
    await db.run("DELETE FROM tryouts WHERE id = ?", t.id);
    await logAdminAction(db, admin, "tryout_delete", t.id, `Kelas ${t.grade}: ${t.title}`);
    return c.json({ ok: true });
  });
}
