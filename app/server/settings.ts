// settings.ts — Pengaturan Akun (FITUR AKSES 1 + TEMA 0015).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerSettingsRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah) dan pola modul journal.ts.
//
// TABEL (migrasi 0014 + 0015): user_settings — satu baris per pengguna
// (UPSERT); semua saklar 0/1, default 0, kecuali theme ('light' |
// 'dark' | 'system', default 'system'). Belum ada baris = semua mati
// (pengaturan hanya tersimpan di perangkat bila pengguna mengubahnya).
//
// ENDPOINT:
//   GET  /api/settings/me — pengaturan saya (0 bila belum ada baris)
//   POST /api/settings/me — simpan pengaturan saya (parsial, 0/1;
//          theme hanya 'light' | 'dark' | 'system')

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

/** Pilihan mode gelap anak: terang, gelap, atau ikut sistem perangkat. */
export type ThemePref = "light" | "dark" | "system";

const THEME_VALUES: readonly ThemePref[] = ["light", "dark", "system"];

function isThemePref(v: unknown): v is ThemePref {
  return typeof v === "string" && (THEME_VALUES as readonly string[]).includes(v);
}

/** Saklar 0/1 (theme ditangani terpisah karena nilainya string). */
const NUMERIC_SETTING_KEYS = [
  "readable_font",
  "high_contrast",
  "large_text",
  "data_saver",
  "onboarding_done",
  "sound_enabled"
] as const;

const SETTING_KEYS = [...NUMERIC_SETTING_KEYS, "theme"] as const;

interface SettingsOut {
  readable_font: 0 | 1;
  high_contrast: 0 | 1;
  large_text: 0 | 1;
  data_saver: 0 | 1;
  onboarding_done: 0 | 1;
  sound_enabled: 0 | 1;
  theme: ThemePref;
}

const DEFAULT_SETTINGS: SettingsOut = {
  readable_font: 0,
  high_contrast: 0,
  large_text: 0,
  data_saver: 0,
  onboarding_done: 0,
  sound_enabled: 1,
  theme: "system"
};

interface SettingsRow {
  readable_font: number;
  high_contrast: number;
  large_text: number;
  data_saver: number;
  onboarding_done: number;
  sound_enabled: number;
  theme: string | null;
}

function toSettings(row: SettingsRow | undefined): SettingsOut {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    readable_font: row.readable_font === 1 ? 1 : 0,
    high_contrast: row.high_contrast === 1 ? 1 : 0,
    large_text: row.large_text === 1 ? 1 : 0,
    data_saver: row.data_saver === 1 ? 1 : 0,
    onboarding_done: row.onboarding_done === 1 ? 1 : 0,
    sound_enabled: row.sound_enabled === 1 ? 1 : 0,
    theme: isThemePref(row.theme) ? row.theme : "system"
  };
}

async function loadSettings(db: Database, userId: string): Promise<SettingsOut> {
  try {
    const row = await db.get<SettingsRow>(
      "SELECT readable_font, high_contrast, large_text, data_saver, onboarding_done, sound_enabled, theme FROM user_settings WHERE user_id = ?",
      userId
    );
    return toSettings(row);
  } catch {
    // Tabel/kolom belum ada (migrasi 0014/0015 belum diterapkan) — default.
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

  // Simpan pengaturan saya (parsial; hanya nilai 0/1 untuk saklar dan
  // 'light' | 'dark' | 'system' untuk theme yang diterima, field lain
  // dan nilai di luar itu diabaikan — nilai lama tetap dipakai).
  app.post("/api/settings/me", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const body = await readJson(c);
    const current = await loadSettings(db, user.id);
    const next: SettingsOut = { ...current };
    for (const key of SETTING_KEYS) {
      const v = body[key];
      if (key === "theme") {
        if (isThemePref(v)) next.theme = v;
      } else if (v === 0 || v === 1) {
        next[key] = v;
      }
    }
    try {
      await db.run(
        `INSERT INTO user_settings (user_id, readable_font, high_contrast, large_text, data_saver, onboarding_done, sound_enabled, theme, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           readable_font = excluded.readable_font,
           high_contrast = excluded.high_contrast,
           large_text = excluded.large_text,
           data_saver = excluded.data_saver,
           onboarding_done = excluded.onboarding_done,
           sound_enabled = excluded.sound_enabled,
           theme = excluded.theme,
           updated_at = excluded.updated_at`,
        user.id,
        next.readable_font,
        next.high_contrast,
        next.large_text,
        next.data_saver,
        next.onboarding_done,
        next.sound_enabled,
        next.theme,
        nowIso()
      );
    } catch {
      return c.json({ error: "Pengaturan belum bisa disimpan. Coba lagi nanti." }, 503);
    }
    return c.json({ settings: next });
  });
}
