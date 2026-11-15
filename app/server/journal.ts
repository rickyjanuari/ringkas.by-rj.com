// journal.ts — Jurnal Refleksi Harian Anak (FITUR KETERLIBATAN 4).
//
// Satu entri per anak per tanggal (UTC, sama seperti study_days):
// tulis ulang di hari yang sama menimpa entri lama. Teks kosong
// menghapus entri hari itu. Orang tua hanya boleh membaca jurnal anak
// yang terhubung dengannya (parent_links redeemed = 1) — selain itu 403.
//
// Helper auth/JSON disalin ringkas dari actions.ts (pola voice.ts) —
// berkas itu bukan milik fitur ini.

import { Hono, type Context } from "hono";
import { type Database, type User, nowIso } from "./database.js";

/** Panjang teks jurnal maksimum (karakter). */
export const MAX_JOURNAL_LENGTH = 500;
/** Jumlah entri yang dikembalikan per permintaan. */
export const JOURNAL_LIST_LIMIT = 30;

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

/** Tanggal hari ini (UTC, 'YYYY-MM-DD') — sama seperti todayIso di actions.ts. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface JournalRow {
  date: string;
  text: string;
  updated_at: string;
}

async function listEntries(db: Database, userId: string): Promise<JournalRow[]> {
  try {
    return await db.all<JournalRow>(
      `SELECT date, text, updated_at FROM journal_entries
       WHERE user_id = ? ORDER BY date DESC LIMIT ?`,
      userId,
      JOURNAL_LIST_LIMIT
    );
  } catch {
    // Tabel belum ada (migrasi 0013 belum diterapkan) — daftar kosong.
    return [];
  }
}

export function registerJournalRoutes(app: Hono, db: Database): void {
  // Jurnal saya: entri hari ini + 30 entri terbaru.
  app.get("/api/journal", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const entries = await listEntries(db, user.id);
    const today = todayIso();
    const todayEntry = entries.find((e) => e.date === today) ?? null;
    return c.json({
      today: todayEntry ? { date: todayEntry.date, text: todayEntry.text } : null,
      entries
    });
  });

  // Tulis jurnal hari ini (maks. 500 karakter); teks kosong = hapus.
  app.post("/api/journal", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const text = asString(body.text).trim();
    if (text.length > MAX_JOURNAL_LENGTH) {
      return c.json(
        { error: `Jurnal maksimal ${MAX_JOURNAL_LENGTH} karakter.` },
        400
      );
    }
    const date = todayIso();
    try {
      if (!text) {
        await db.run("DELETE FROM journal_entries WHERE user_id = ? AND date = ?", user.id, date);
        return c.json({ ok: true, deleted: true });
      }
      await db.run(
        `INSERT INTO journal_entries (user_id, date, text, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
        user.id,
        date,
        text,
        nowIso()
      );
    } catch {
      return c.json({ error: "Fitur jurnal belum siap. Coba lagi nanti." }, 503);
    }
    return c.json({ ok: true, date });
  });

  // Jurnal satu anak — hanya orang tua yang terhubung dengan anak itu.
  app.get("/api/parent/children/:childId/journal", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const childId = c.req.param("childId");
    const link = await db.get<{ id: string }>(
      `SELECT id FROM parent_links
       WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1`,
      user.id,
      childId
    );
    if (!link) {
      return c.json({ error: "Kamu tidak terhubung dengan anak ini." }, 403);
    }
    const child = await db.get<User>("SELECT * FROM users WHERE id = ?", childId);
    if (!child) return c.json({ error: "Anak tidak ditemukan." }, 404);
    const entries = await listEntries(db, childId);
    return c.json({ child: { id: child.id, name: child.name }, entries });
  });
}
