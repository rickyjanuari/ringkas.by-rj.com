// settings.ts — Pengaturan Akun (FITUR AKSES 1).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerSettingsRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah) dan pola modul journal.ts.
//
// TABEL (migrasi 0014): user_settings — satu baris per pengguna
// (UPSERT); semua saklar 0/1, default 0. Belum ada baris = semua
// mati (pengaturan hanya tersimpan di perangkat bila pengguna
// mengubahnya).
//
// ENDPOINT:
//   GET  /api/settings/me — pengaturan saya (0 bila belum ada baris)
//   POST /api/settings/me — simpan pengaturan saya (parsial, 0/1)

import { Hono, type Context } from "hono";
import { type Database, type User, nowIso } from "./database.js";

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

const SETTING_KEYS = ["readable_font", "high_contrast", "large_text", "data_saver"] as const;
type SettingKey = (typeof SETTING_KEYS)[number];
type SettingsOut = Record<SettingKey, number>;

const DEFAULT_SETTINGS: SettingsOut = {
  readable_font: 0,
  high_contrast: 0,
  large_text: 0,
  data_saver: 0
};

interface SettingsRow {
  readable_font: number;
  high_contrast: number;
  large_text: number;
  data_saver: number;
}

function toSettings(row: SettingsRow | undefined): SettingsOut {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    readable_font: row.readable_font === 1 ? 1 : 0,
    high_contrast: row.high_contrast === 1 ? 1 : 0,
    large_text: row.large_text === 1 ? 1 : 0,
    data_saver: row.data_saver === 1 ? 1 : 0
  };
}

async function loadSettings(db: Database, userId: string): Promise<SettingsOut> {
  try {
    const row = await db.get<SettingsRow>(
      "SELECT readable_font, high_contrast, large_text, data_saver FROM user_settings WHERE user_id = ?",
      userId
    );
    return toSettings(row);
  } catch {
    // Tabel belum ada (migrasi 0014 belum diterapkan) — default.
    return { ...DEFAULT_SETTINGS };
  }
}

export function registerSettingsRoutes(app: Hono, db: Database): void {
  // Pengaturan saya — 0 bila belum ada baris.
  app.get("/api/settings/me", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    return c.json({ settings: await loadSettings(db, user.id) });
  });

  // Simpan pengaturan saya (parsial; hanya nilai 0/1 yang diterima,
  // field lain dan nilai bukan 0/1 diabaikan).
  app.post("/api/settings/me", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const current = await loadSettings(db, user.id);
    const next: SettingsOut = { ...current };
    for (const key of SETTING_KEYS) {
      const v = body[key];
      if (v === 0 || v === 1) next[key] = v;
    }
    try {
      await db.run(
        `INSERT INTO user_settings (user_id, readable_font, high_contrast, large_text, data_saver, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           readable_font = excluded.readable_font,
           high_contrast = excluded.high_contrast,
           large_text = excluded.large_text,
           data_saver = excluded.data_saver,
           updated_at = excluded.updated_at`,
        user.id,
        next.readable_font,
        next.high_contrast,
        next.large_text,
        next.data_saver,
        nowIso()
      );
    } catch {
      return c.json({ error: "Pengaturan belum bisa disimpan. Coba lagi nanti." }, 503);
    }
    return c.json({ settings: next });
  });
}
