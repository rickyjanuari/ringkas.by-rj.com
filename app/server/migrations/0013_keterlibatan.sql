-- 0013_keterlibatan.sql — 6 fitur keterlibatan (XP & avatar pendamping,
-- jurnal refleksi, hitung mundur SAS, laporan WhatsApp, cerita edukasi).
--
--   - xp_events: satu baris per pemberian XP. Total XP dihitung dari
--     SUM(xp) (bukan kolom saldo) supaya riwayat tidak bisa rusak oleh
--     satu tulis yang gagal; anti-farm dijaga server lewat aturan
--     "percobaan pertama vs ulangan" di server/xp.ts + actions.ts.
--   - journal_entries: satu entri per anak per tanggal (UTC, sama seperti
--     study_days) — tulis ulang hari yang sama menimpa entri lama.
--   - exam_dates: satu baris per kelas (1-6); exam_date NULL = tanggal
--     belum diatur (tetap tampil dengan daysLeft null).
--   - wa_sent_log: idempotensi laporan WhatsApp mingguan — satu kirim
--     per anak per minggu ISO (klaim dulu, kirim, baru isi message_id;
--     gagal kirim -> klaim dihapus supaya bisa dicoba lagi).
--
-- Sengaja TANPA foreign key (pola migrasi 0005/0011/0012): migrasi jalan
-- SEBELUM seed di database baru.

CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  ref_id TEXT NOT NULL DEFAULT '',
  xp INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xp_events_user_created ON xp_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS journal_entries (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS exam_dates (
  grade INTEGER PRIMARY KEY,
  exam_date TEXT,
  label TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_sent_log (
  child_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  message_id TEXT,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (child_id, week_key)
);
