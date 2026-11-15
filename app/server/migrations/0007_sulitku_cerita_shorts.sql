-- 0007_sulitku_cerita_shorts.sql — Bank Soal Sulitku + video pendek vertikal.
--
-- 1) Kolom video pendek per bab (9:16): tautan boleh URL http(s) atau
--    path relatif situs (mis. /shorts/membilang-10.html).
-- 2) Tabel penanda "dikuasai" Bank Soal Sulitku: soal yang pernah dijawab
--    salah keluar dari bank begitu dijawab benar saat latihan ulang.
-- 3) Dua video pendek bawaan dipasang ke babnya (UPDATE ini hanya
--    berpengaruh di database yang SUDAH berisi bab — di database baru,
--    nilainya datang dari seed).
ALTER TABLE chapters ADD COLUMN short_url TEXT;
ALTER TABLE chapters ADD COLUMN short_duration TEXT;

CREATE TABLE IF NOT EXISTS hard_bank_mastered (
  user_id TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  mastered_at TEXT NOT NULL,
  PRIMARY KEY (user_id, question_id)
);

UPDATE chapters SET short_url = '/shorts/membilang-10.html', short_duration = '1 menit'
  WHERE id = 'k1-mtk-bilang';
UPDATE chapters SET short_url = '/shorts/penjumlahan-10.html', short_duration = '1 menit'
  WHERE id = 'k1-mtk-tambah';
