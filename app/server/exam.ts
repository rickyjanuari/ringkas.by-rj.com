// exam.ts — Hitung Mundur SAS & Tryout (FITUR KETERLIBATAN 5).
//
// Tanggal SAS diatur admin per kelas (1-6) dan dibaca publik lewat
// GET /api/exam-dates bersama tryout mendatang. daysLeft dihitung dari
// tanggal kalender WIB: hari ujian = 0, besok = 1, kemarin = -1 (angka
// negatif tetap ditampilkan, bukan disembunyikan).
//
// Helper auth/JSON disalin ringkas dari actions.ts (pola voice.ts).

import { Hono, type Context } from "hono";
import { type Database, type User, nowIso } from "./database.js";

/** Panjang label tanggal SAS maksimum (karakter). */
export const MAX_EXAM_LABEL_LENGTH = 200;

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
// daysLeft WIB (pure — bisa diuji tanpa database).
// ---------------------------------------------------------------------------

/** 'YYYY-MM-DD' -> milidetik tengah malam UTC tanggal itu. */
function dateOnlyUtcMs(isoDay: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Tanggal kalender WIB ('YYYY-MM-DD') untuk satu instans waktu. */
export function wibDateIso(now: Date): string {
  return new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Selisih hari (kalender WIB) antara tanggal ujian dan hari ini:
 * hari ini = 0, besok = 1, kemarin = -1. Mengembalikan null bila
 * tanggal tidak valid.
 */
export function daysLeftWib(examDate: string, now: Date = new Date()): number | null {
  const examMs = dateOnlyUtcMs(examDate);
  const todayMs = dateOnlyUtcMs(wibDateIso(now));
  if (examMs === null || todayMs === null) return null;
  return Math.round((examMs - todayMs) / 86400000);
}

/** daysLeft untuk timestamp ISO (mis. tryouts.starts_at): pakai tanggal WIB-nya. */
export function daysLeftFromTimestamp(isoTimestamp: string, now: Date = new Date()): number | null {
  const ms = Date.parse(isoTimestamp);
  if (!Number.isFinite(ms)) return null;
  return daysLeftWib(wibDateIso(new Date(ms)), now);
}

// ---------------------------------------------------------------------------
// Routes.
// ---------------------------------------------------------------------------

interface ExamDateRow {
  grade: number;
  exam_date: string | null;
  label: string;
}

interface TryoutRow {
  id: string;
  grade: number;
  title: string;
  starts_at: string;
}

export function registerExamRoutes(app: Hono, db: Database): void {
  // Tanggal SAS semua kelas + tryout mendatang (publik, untuk hitung mundur).
  app.get("/api/exam-dates", async (c) => {
    const now = new Date();
    let rows: ExamDateRow[] = [];
    try {
      rows = await db.all<ExamDateRow>(
        "SELECT grade, exam_date, label FROM exam_dates ORDER BY grade"
      );
    } catch {
      // Tabel belum ada (migrasi 0013 belum diterapkan) — semua kosong.
      rows = [];
    }
    const byGrade = new Map<number, ExamDateRow>();
    for (const r of rows) byGrade.set(r.grade, r);
    const dates = [1, 2, 3, 4, 5, 6].map((grade) => {
      const row = byGrade.get(grade);
      const date = row?.exam_date ?? null;
      return {
        grade,
        date,
        label: row?.label ?? "",
        daysLeft: date ? daysLeftWib(date, now) : null
      };
    });
    let tryouts: { id: string; grade: number; title: string; starts_at: string; daysLeft: number | null }[] = [];
    try {
      const upcoming = await db.all<TryoutRow>(
        `SELECT id, grade, title, starts_at FROM tryouts
         WHERE status = 'scheduled' AND starts_at > ?
         ORDER BY starts_at ASC LIMIT 10`,
        now.toISOString()
      );
      tryouts = upcoming.map((t) => ({
        id: t.id,
        grade: t.grade,
        title: t.title,
        starts_at: t.starts_at,
        daysLeft: daysLeftFromTimestamp(t.starts_at, now)
      }));
    } catch {
      // Tabel tryouts belum ada di DB lokal lama — kembalikan daftar kosong.
      tryouts = [];
    }
    return c.json({ dates, tryouts });
  });

  // Atur tanggal SAS satu kelas (admin). date null = hapus tanggalnya
  // (baris tetap ada supaya label tidak hilang).
  app.post("/api/admin/exam-dates", async (c) => {
    const admin = await authUser(c, db);
    if (!admin) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    if (admin.role !== "admin") {
      return c.json({ error: "Hanya admin yang dapat mengakses." }, 403);
    }
    const body = await readJson(c);
    const grade = typeof body.grade === "number" ? body.grade : NaN;
    if (!Number.isInteger(grade) || grade < 1 || grade > 6) {
      return c.json({ error: "Kelas harus angka 1 sampai 6." }, 400);
    }
    const dateRaw = body.date;
    const date: string | null =
      dateRaw === null || dateRaw === undefined ? null : asString(dateRaw);
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: "Tanggal harus format YYYY-MM-DD atau null." }, 400);
    }
    const label = asString(body.label).trim();
    if (label.length > MAX_EXAM_LABEL_LENGTH) {
      return c.json(
        { error: `Label maksimal ${MAX_EXAM_LABEL_LENGTH} karakter.` },
        400
      );
    }
    try {
      await db.run(
        `INSERT INTO exam_dates (grade, exam_date, label, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(grade) DO UPDATE SET exam_date = excluded.exam_date, label = excluded.label, updated_at = excluded.updated_at`,
        grade,
        date,
        label,
        nowIso()
      );
    } catch {
      return c.json({ error: "Fitur tanggal SAS belum siap. Coba lagi nanti." }, 503);
    }
    return c.json({
      ok: true,
      examDate: { grade, date, label, daysLeft: date ? daysLeftWib(date) : null }
    });
  });
}
