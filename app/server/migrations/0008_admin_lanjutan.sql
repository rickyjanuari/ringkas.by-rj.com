-- 0008_admin_lanjutan.sql — pengaturan situs (pengumuman & promo) untuk
-- panel admin lanjutan.
--
-- SETTINGS:
--   - Tabel kunci-nilai umum (key TEXT PRIMARY KEY). Dipakai admin untuk
--     teks pengumuman & promo yang tampil di situs; dibaca publik lewat
--     GET /api/announcement (tanpa auth) dan dikelola lewat
--     GET/POST /api/admin/settings.
--   - 4 kunci bawaan (INSERT OR IGNORE, jadi aman di database baru
--     maupun yang sudah ada — migrasi jalan SEBELUM seed di DB baru):
--       announcement_text    — teks pengumuman di beranda ('' = tidak ada)
--       announcement_enabled — '1' = tampil, '0' = sembunyi
--       promo_text           — teks promo di beranda ('' = tidak ada)
--       promo_enabled        — '1' = tampil, '0' = sembunyi
--   - Nilai disimpan sebagai TEXT; enabled '0'/'1' dikonversi ke 0/1
--     oleh server (lihat server/actions.ts: readSettings).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('announcement_text', '', '2026-11-15T00:00:00.000Z'),
  ('announcement_enabled', '0', '2026-11-15T00:00:00.000Z'),
  ('promo_text', '', '2026-11-15T00:00:00.000Z'),
  ('promo_enabled', '0', '2026-11-15T00:00:00.000Z');
