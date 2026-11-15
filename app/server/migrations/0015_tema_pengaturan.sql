-- 0015_tema_pengaturan.sql — mode gelap anak + tema warna per kelas
-- (pengaturan tema, suara, dan penanda onboarding).
--
--   - user_settings: tiga kolom baru di tabel yang dibuat migrasi 0014
--     (satu baris per pengguna, UPSERT di server/settings.ts).
--       onboarding_done: 0/1, default 0 — 1 bila pengguna sudah
--         menyelesaikan tur perkenalan (onboarding).
--       sound_enabled: 0/1, default 1 — 1 bila efek suara diizinkan.
--       theme: 'light' | 'dark' | 'system', default 'system' — pilihan
--         mode gelap anak; 'system' mengikuti sistem perangkat.
--
-- SQLite D1 mendukung ADD COLUMN; kolom TEXT/TINTEGER dengan DEFAULT
-- langsung terisi untuk baris yang sudah ada. Tidak ada tabel baru.

ALTER TABLE user_settings ADD COLUMN onboarding_done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'system';
