// xp.ts — XP, Level & Tahap Avatar Pendamping (FITUR KETERLIBATAN 1).
//
// Total XP = SUM(xp_events) per pengguna (bukan kolom saldo) supaya satu
// tulis yang gagal tidak bisa merusak saldo. awardXp() TIDAK PERNAH
// melempar: error internal ditangkap, dicatat di log, dan total lama
// dikembalikan — pemberian XP tidak boleh menggagalkan respons utama
// (penyelesaian bab / submit kuis).
//
// Aturan XP (lihat README + API_CONTRACT):
//   chapter pertama selesai ......... 20
//   kuis bab percobaan pertama ...... lulus 10 / gagal 5, ulangan 2
//   simulasi percobaan pertama ...... lulus 25 / gagal 10, ulangan 5
//   soal cerita pertama ............. 5, ulangan 1
//   latihan harian pertama .......... 5, ulangan 1
//   cerita edukasi pertama .......... lulus 10 / gagal 5, ulangan 2
//   hari belajar baru (streak) ...... 5
// Lulus = skor >= 70%. "Percobaan pertama" = COUNT(*) quiz_attempts
// untuk (user, kind, ref_id) == 1 setelah insert attempt itu sendiri.
// Hook pemanggil ada di actions.ts (chapter-done + quiz/submit) dan
// stories.ts (submit cerita edukasi).

import { Hono, type Context } from "hono";
import { type Database, type User, nowIso } from "./database.js";

// ---------------------------------------------------------------------------
// Level & tahap (pure — bisa diuji tanpa database).
// ---------------------------------------------------------------------------

/** Ambang XP tiap level (indeks = level - 1). Level 1 mulai dari 0 XP. */
export const LEVEL_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200] as const;

export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

export interface LevelInfo {
  level: number;
  /** XP yang sudah dikumpulkan di dalam level ini. */
  xpIntoLevel: number;
  /** XP yang dibutuhkan untuk naik dari level ini ke level berikut (0 di level maks). */
  xpForNextLevel: number;
  /** Total XP ambang level berikut (null di level maks). */
  nextLevelAt: number | null;
  /** Tahap avatar: 1 Benih, 2 Tunas, 3 Bunga, 4 Pohon. */
  stage: number;
  stageName: "Benih" | "Tunas" | "Bunga" | "Pohon";
}

export function levelFor(totalXp: number): LevelInfo {
  const total = Math.max(0, Math.floor(totalXp));
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (total >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  const stageName: LevelInfo["stageName"] =
    level <= 2 ? "Benih" : level <= 4 ? "Tunas" : level <= 7 ? "Bunga" : "Pohon";
  const stage = stageName === "Benih" ? 1 : stageName === "Tunas" ? 2 : stageName === "Bunga" ? 3 : 4;
  const base = LEVEL_THRESHOLDS[level - 1];
  const next = level < MAX_LEVEL ? LEVEL_THRESHOLDS[level] : null;
  return {
    level,
    xpIntoLevel: total - base,
    xpForNextLevel: next === null ? 0 : next - base,
    nextLevelAt: next,
    stage,
    stageName
  };
}

// ---------------------------------------------------------------------------
// Penyimpanan XP.
// ---------------------------------------------------------------------------

export async function totalXp(db: Database, userId: string): Promise<number> {
  try {
    const row = await db.get<{ total: number | null }>(
      "SELECT COALESCE(SUM(xp), 0) AS total FROM xp_events WHERE user_id = ?",
      userId
    );
    return row?.total ?? 0;
  } catch {
    // Tabel belum ada (migrasi 0013 belum diterapkan) — dianggap 0 XP.
    return 0;
  }
}

/**
 * Catat satu pemberian XP dan kembalikan total XP baru. TIDAK PERNAH
 * melempar: bila insert gagal, catat di log dan kembalikan total lama.
 */
export async function awardXp(
  db: Database,
  userId: string,
  action: string,
  refId: string,
  xp: number
): Promise<number> {
  const before = await totalXp(db, userId);
  if (!Number.isFinite(xp) || xp <= 0) return before;
  try {
    await db.run(
      "INSERT INTO xp_events (user_id, action, ref_id, xp, created_at) VALUES (?, ?, ?, ?, ?)",
      userId,
      action,
      refId,
      Math.floor(xp),
      nowIso()
    );
    return before + Math.floor(xp);
  } catch (err) {
    console.error("[xp] gagal mencatat XP:", err);
    return before;
  }
}

// ---------------------------------------------------------------------------
// Auth (duplikasi ringkas dari actions.ts — berkas itu bukan milik fitur
// ini, jadi helper auth disalin di sini seperti pola voice.ts).
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

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------

interface XpEventRow {
  action: string;
  ref_id: string;
  xp: number;
  created_at: string;
}

export function registerXpRoutes(app: Hono, db: Database): void {
  app.get("/api/xp", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const total = await totalXp(db, user.id);
    let events: XpEventRow[] = [];
    try {
      events = await db.all<XpEventRow>(
        `SELECT action, ref_id, xp, created_at FROM xp_events
         WHERE user_id = ? ORDER BY id DESC LIMIT 10`,
        user.id
      );
    } catch {
      // Tabel belum ada (migrasi 0013 belum diterapkan) — daftar kosong.
      events = [];
    }
    return c.json({ totalXp: total, ...levelFor(total), events });
  });
}
