// endless.ts — Latihan Tanpa Habis (FITUR AKSES 3).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerEndlessRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah) dan pola modul stories.ts.
//
// Setiap panggilan GET membuat 5 soal aritmetika SEGAR dengan angka
// acak (Math.random — tanpa seed, jadi dua panggilan berurutan
// menghasilkan soal berbeda) dan menyimpan set + kunci ke
// endless_sets (migrasi 0014). Kunci TIDAK PERNAH dikembalikan ke
// klien — penilaian selalu server-side saat submit.
//
// RENTANG SOAL PER KELAS (didokumentasikan juga di API_CONTRACT.md):
//   K1: tambah/kurang, hasil ≤ 20.
//   K2: tambah/kurang s.d. 100.
//   K3: perkalian 2–9.
//   K4: perkalian s.d. 12 + pembagian hasil bulat.
//   K5: pecahan sederhana (tambah/kurang penyebut sama, hasil
//       disederhanakan) + desimal 1 angka di belakang koma.
//   K6: operasi campuran 2 langkah, bilangan s.d. 100.
//
// Attempt dicatat ke quiz_attempts kind = 'endless' (ref_id = set_id).
// Prediksi SAS HANYA memakai kind = 'simulation' (actions.ts), jadi
// latihan ini TIDAK PERNAH memengaruhi prediksi — logika prediksi
// tidak diubah.
//
// ENDPOINT:
//   GET  /api/endless/:grade         — 5 soal segar TANPA jawaban
//   POST /api/endless/:grade/submit  — nilai jawaban (server-side)

import { Hono, type Context } from "hono";
import { type Database, type User, newId, nowIso } from "./database.js";

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
// Acak + generator soal (pure — bisa diuji tanpa database).
// ---------------------------------------------------------------------------

/** Bilangan bulat acak min..max (inklusif). */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Acak urutan (Fisher–Yates). */
export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface EndlessQuestion {
  id: string;
  question: string;
  options: string[];
  answer: string;
  points: number;
}

interface Generated {
  question: string;
  answer: string;
  /** Calon pengecoh (string); diambil 3 yang unik & ≠ jawaban. */
  distractors: string[];
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

/** Sederhanakan pecahan n/d menjadi "n/d" (atau bilangan bulat bila d = 1). */
function simplifyFraction(n: number, d: number): string {
  const g = gcd(n, d);
  const sn = n / g;
  const sd = d / g;
  return sd === 1 ? String(sn) : `${sn}/${sd}`;
}

/** Nilai pecahan "a/b" (atau bilangan bulat) sebagai bilangan. */
function fractionValue(s: string): number {
  const parts = s.split("/");
  if (parts.length === 2) return Number(parts[0]) / Number(parts[1]);
  return Number(s);
}

/** Format persepuluhan sebagai desimal Indonesia ("2,5"). */
function formatTenths(t: number): string {
  return `${Math.floor(t / 10)},${t % 10}`;
}

/** Pengecoh numerik di sekitar jawaban (bilangan bulat, ≥ 0, ≠ jawaban). */
function numericDistractors(answer: number, extra: number[] = []): string[] {
  const out: string[] = [];
  for (const c of [...extra, answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10, answer + 5, answer * 2]) {
    if (Number.isInteger(c) && c >= 0 && c !== answer && !out.includes(String(c))) {
      out.push(String(c));
    }
  }
  return out;
}

function genAddSub(maxSum: number, minA: number): Generated {
  if (Math.random() < 0.5) {
    // Penjumlahan: a + b = hasil ≤ maxSum.
    const a = randInt(minA, Math.max(minA, maxSum - 1));
    const b = randInt(1, Math.max(1, maxSum - a));
    const ans = a + b;
    return {
      question: `${a} + ${b} = ?`,
      answer: String(ans),
      distractors: numericDistractors(ans)
    };
  }
  // Pengurangan: a − b, hasil ≥ 1.
  const a = randInt(Math.max(minA, 5), maxSum);
  const b = randInt(1, a - 1);
  const ans = a - b;
  return {
    question: `${a} − ${b} = ?`,
    answer: String(ans),
    distractors: numericDistractors(ans)
  };
}

function genMultiply(maxFactor: number): Generated {
  const a = randInt(2, maxFactor);
  const b = randInt(2, maxFactor);
  const ans = a * b;
  return {
    question: `${a} × ${b} = ?`,
    answer: String(ans),
    distractors: numericDistractors(ans, [a * (b + 1), (a + 1) * b, a + b])
  };
}

function genDivide(): Generated {
  const d = randInt(2, 12);
  const q = randInt(2, 12);
  const ans = q;
  return {
    question: `${d * q} : ${d} = ?`,
    answer: String(ans),
    distractors: numericDistractors(ans, [d, q + 1, d * q])
  };
}

/** Pengecoh pecahan cadangan (penyebut lain) — dipakai bila pengecoh
 *  penyebut sama kurang dari 3 (mis. penyebut 3 hanya punya 2
 *  pembilang mungkin). Nilai yang sama dengan jawaban disaring. */
const FRACTION_FALLBACKS = ["1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "1/6", "5/6"];

function fractionDistractors(ans: string, sameDenom: string[]): string[] {
  const out: string[] = [];
  for (const s of [...sameDenom, ...FRACTION_FALLBACKS]) {
    if (fractionValue(s) !== fractionValue(ans) && !out.includes(s)) out.push(s);
  }
  return out;
}

function genFraction(): Generated {
  const d = [2, 3, 4, 5, 6, 8, 10][randInt(0, 6)];
  // Penyebut 2 tidak bisa dijumlahkan dua pecahan murni (1/2 + 1/2 = 1).
  if (d !== 2 && Math.random() < 0.5) {
    // Penjumlahan penyebut sama, hasil tetap pecahan murni (< 1).
    const a = randInt(1, d - 2);
    const b = randInt(1, d - 1 - a);
    const ans = simplifyFraction(a + b, d);
    const same: string[] = [];
    for (const n of [a + b - 1, a + b + 1, a + b + 2, a, b]) {
      if (n >= 1 && n < d) {
        const s = simplifyFraction(n, d);
        if (!same.includes(s)) same.push(s);
      }
    }
    return { question: `${a}/${d} + ${b}/${d} = ?`, answer: ans, distractors: fractionDistractors(ans, same) };
  }
  // Pengurangan penyebut sama, hasil > 0.
  const a = randInt(2, d - 1);
  const b = randInt(1, a - 1);
  const ans = simplifyFraction(a - b, d);
  const same: string[] = [];
  for (const n of [a - b + 1, a - b + 2, a, b, a - b - 1]) {
    if (n >= 1 && n < d) {
      const s = simplifyFraction(n, d);
      if (!same.includes(s)) same.push(s);
    }
  }
  return { question: `${a}/${d} − ${b}/${d} = ?`, answer: ans, distractors: fractionDistractors(ans, same) };
}

function genDecimal(): Generated {
  if (Math.random() < 0.5) {
    const a = randInt(11, 89);
    const b = randInt(11, 99 - a);
    const ans = a + b;
    const distractors = [ans + 1, ans - 1, ans + 10, ans - 10, ans + 2]
      .filter((t) => t >= 11 && t !== ans)
      .map((t) => formatTenths(t));
    return {
      question: `${formatTenths(a)} + ${formatTenths(b)} = ?`,
      answer: formatTenths(ans),
      distractors
    };
  }
  const a = randInt(21, 99);
  const b = randInt(11, a - 11);
  const ans = a - b;
  const distractors = [ans + 1, ans - 1, ans + 10, ans - 10, ans + 2]
    .filter((t) => t >= 1 && t !== ans)
    .map((t) => formatTenths(t));
  return {
    question: `${formatTenths(a)} − ${formatTenths(b)} = ?`,
    answer: formatTenths(ans),
    distractors
  };
}

function genMixed(): Generated {
  const kind = randInt(1, 5);
  if (kind === 1) {
    // a + b × c (perkalian dulu).
    const a = randInt(5, 50);
    const b = randInt(2, 9);
    const c = randInt(2, 9);
    const ans = a + b * c;
    return {
      question: `${a} + ${b} × ${c} = ?`,
      answer: String(ans),
      distractors: numericDistractors(ans, [(a + b) * c, a + b + c, a * b + c])
    };
  }
  if (kind === 2) {
    // a × b + c.
    const a = randInt(2, 12);
    const b = randInt(2, 12);
    const c = randInt(5, 50);
    const ans = a * b + c;
    return {
      question: `${a} × ${b} + ${c} = ?`,
      answer: String(ans),
      distractors: numericDistractors(ans, [a * (b + c), a * b, a + b + c])
    };
  }
  if (kind === 3) {
    // a + b − c (a + b ≤ 100).
    const a = randInt(20, 60);
    const b = randInt(10, 100 - a);
    const c = randInt(5, a + b - 1);
    const ans = a + b - c;
    return {
      question: `${a} + ${b} − ${c} = ?`,
      answer: String(ans),
      distractors: numericDistractors(ans, [a + b + c, a + b, a - b + c])
    };
  }
  if (kind === 4) {
    // (a + b) × c.
    const a = randInt(2, 9);
    const b = randInt(2, 9);
    const c = randInt(2, 5);
    const ans = (a + b) * c;
    return {
      question: `(${a} + ${b}) × ${c} = ?`,
      answer: String(ans),
      distractors: numericDistractors(ans, [a + b * c, a * b * c, a + b + c])
    };
  }
  // a − b + c.
  const a = randInt(40, 100);
  const b = randInt(5, a - 5);
  const c = randInt(5, 50);
  const ans = a - b + c;
  return {
    question: `${a} − ${b} + ${c} = ?`,
    answer: String(ans),
    distractors: numericDistractors(ans, [a - b - c, a + b + c, a - b])
  };
}

/** Satu soal segar untuk kelas 1–6 (tanpa id — id dipasang pemanggil). */
export function generateOne(grade: number): Generated {
  switch (grade) {
    case 1:
      return genAddSub(20, 1);
    case 2:
      return genAddSub(100, 10);
    case 3:
      return genMultiply(9);
    case 4:
      return Math.random() < 0.5 ? genMultiply(12) : genDivide();
    case 5:
      return Math.random() < 0.5 ? genFraction() : genDecimal();
    case 6:
      return genMixed();
    default:
      return genAddSub(20, 1);
  }
}

/**
 * Rakit 5 soal segar: tiap soal { id, question, options (4, jawaban
 * benar ada di antaranya, urutan acak), answer, points: 1 }.
 */
export function generateSet(grade: number): EndlessQuestion[] {
  const questions: EndlessQuestion[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (questions.length < 5 && guard < 50) {
    guard += 1;
    const g = generateOne(grade);
    // Hindari dua soal dengan teks yang sama dalam satu set.
    if (seen.has(g.question)) continue;
    seen.add(g.question);
    const options = shuffle([
      g.answer,
      ...shuffle(g.distractors.filter((d) => d !== g.answer)).slice(0, 3)
    ]);
    // Pengaman: bila pengecoh kurang dari 3 (tidak mungkin untuk
    // generator di atas, tapi jangan sampai opsi < 4), isi dengan
    // varian jawaban (pecahan: pecahan lain; desimal/bulat: +10+n).
    let n = 1;
    while (options.length < 4) {
      let fill: string;
      if (g.answer.includes("/")) {
        fill = FRACTION_FALLBACKS[(n - 1) % FRACTION_FALLBACKS.length];
        if (fractionValue(fill) === fractionValue(g.answer)) {
          n += 1;
          continue;
        }
      } else {
        const num = Number(g.answer.replace(",", "."));
        fill = Number.isFinite(num) ? String(Math.trunc(num) + 10 + n) : `x${n}`;
      }
      if (!options.includes(fill)) options.push(fill);
      n += 1;
    }
    questions.push({
      id: newId("end"),
      question: g.question,
      options: shuffle(options),
      answer: g.answer,
      points: 1
    });
  }
  return questions;
}

interface EndlessSetRow {
  id: string;
  user_id: string;
  grade: number;
  questions: string;
  created_at: string;
}

function parseStoredQuestions(raw: string): EndlessQuestion[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (q): q is EndlessQuestion =>
        !!q &&
        typeof q === "object" &&
        typeof (q as EndlessQuestion).id === "string" &&
        typeof (q as EndlessQuestion).question === "string" &&
        Array.isArray((q as EndlessQuestion).options) &&
        typeof (q as EndlessQuestion).answer === "string"
    );
  } catch {
    return [];
  }
}

/** Pembahasan teman-belajar singkat untuk satu soal. */
function discussionFor(q: EndlessQuestion, correct: boolean): string {
  const solved = q.question.replace("= ?", `= ${q.answer}`);
  return correct
    ? `Benar! ${solved}`
    : `Belum tepat. ${solved}, coba lagi yuk!`;
}

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------

export function registerEndlessRoutes(app: Hono, db: Database): void {
  // 5 soal segar TANPA jawaban.
  app.get("/api/endless/:grade", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const grade = Number(c.req.param("grade"));
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
      return c.json({ error: "Kelas harus angka 1 sampai 6." }, 400);
    }
    const questions = generateSet(grade);
    const setId = newId("endset");
    try {
      await db.run(
        "INSERT INTO endless_sets (id, user_id, grade, questions, created_at) VALUES (?, ?, ?, ?, ?)",
        setId,
        user.id,
        grade,
        JSON.stringify(questions),
        nowIso()
      );
    } catch {
      return c.json({ error: "Latihan belum siap. Coba lagi nanti." }, 503);
    }
    return c.json({
      set_id: setId,
      grade,
      questions: questions.map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        points: q.points
      }))
    });
  });

  // Kirim jawaban — dinilai server-side dari kunci tersimpan.
  app.post("/api/endless/:grade/submit", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const grade = Number(c.req.param("grade"));
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
      return c.json({ error: "Kelas harus angka 1 sampai 6." }, 400);
    }
    const body = await readJson(c);
    const setId = asString(body.set_id).trim();
    if (!setId) return c.json({ error: "set_id wajib diisi." }, 400);
    const answers =
      body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
        ? (body.answers as Record<string, unknown>)
        : {};
    let set: EndlessSetRow | undefined;
    try {
      set = await db.get<EndlessSetRow>("SELECT * FROM endless_sets WHERE id = ?", setId);
    } catch {
      return c.json({ error: "Latihan belum siap. Coba lagi nanti." }, 503);
    }
    if (!set) return c.json({ error: "Set latihan tidak ditemukan." }, 404);
    if (set.user_id !== user.id) {
      return c.json({ error: "Set latihan ini bukan milikmu." }, 403);
    }
    if (set.grade !== grade) {
      return c.json({ error: "Set latihan ini bukan untuk kelas tersebut." }, 400);
    }
    const stored = parseStoredQuestions(set.questions);
    if (stored.length === 0) {
      return c.json({ error: "Set latihan ini rusak. Minta set baru ya." }, 400);
    }
    let score = 0;
    const reviews = stored.map((q) => {
      const givenRaw = answers[q.id];
      const given = typeof givenRaw === "string" ? givenRaw.trim() : null;
      const correct = given !== null && given === q.answer;
      if (correct) score += q.points;
      return {
        id: q.id,
        question: q.question,
        correct,
        answer: q.answer,
        given,
        discussion: discussionFor(q, correct)
      };
    });
    const max = stored.reduce((sum, q) => sum + q.points, 0);
    // Catat attempt kind 'endless' — prediksi SAS hanya memakai
    // kind='simulation', jadi ini tidak memengaruhi prediksi.
    try {
      await db.run(
        "INSERT INTO quiz_attempts (user_id, kind, ref_id, score, max_score, answers, focus_switches, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
        user.id,
        "endless",
        setId,
        score,
        max,
        JSON.stringify(answers),
        nowIso()
      );
    } catch (err) {
      console.error("[endless] catat attempt gagal:", err);
    }
    return c.json({ score, max, reviews });
  });
}
