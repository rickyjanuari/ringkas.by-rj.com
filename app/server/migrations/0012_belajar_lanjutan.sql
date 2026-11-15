-- 0012_belajar_lanjutan.sql — 6 fitur belajar lanjutan.
--
-- Bagian A — Kuis Buatan Guru (Worker C): teacher_quizzes,
-- teacher_quiz_items, teacher_quiz_attempts.
-- Bagian B — Rekam Suara + Web Push (Worker B): voice_recordings,
-- push_subscriptions, study_schedules, push_sent_log.
-- Bagian C — Simulasi ANBK Kelas 5 (Worker A): 2 simulasi + 40 soal
-- (id eksplisit 10000-10039; seed lama memakai 1-3396).
-- SQL Bagian C dibangkitkan dari server/seed/anbk.ts (bukan diketik
-- ulang) supaya tidak ada selisih ketik.
--
-- Sengaja TANPA foreign key (pola migrasi 0005/0011): migrasi jalan
-- SEBELUM seed di database baru.

-- ------------------------- Bagian A: Kuis Buatan Guru -------------------------
CREATE TABLE IF NOT EXISTS teacher_quizzes (
  id TEXT PRIMARY KEY,
  teacher_user_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  grade INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teacher_quizzes_teacher ON teacher_quizzes(teacher_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_teacher_quizzes_class ON teacher_quizzes(class_id, created_at);

CREATE TABLE IF NOT EXISTS teacher_quiz_items (
  quiz_id TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (quiz_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_quiz_items_quiz ON teacher_quiz_items(quiz_id, sort_order);

CREATE TABLE IF NOT EXISTS teacher_quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(quiz_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_quiz_attempts_quiz ON teacher_quiz_attempts(quiz_id, created_at);

-- ------------------------- Bagian B: Rekam Suara + Web Push -------------------------
-- voice_recordings: audio disimpan sebagai base64 di D1 (belum ada R2).
--   Batas: maks. 60 detik, maks. 500 KB — ditolak server (400/413).
-- push_sent_log: idempotensi cron (satu jadwal per hari per jam).
CREATE TABLE IF NOT EXISTS voice_recordings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  text_label TEXT NOT NULL,
  audio_base64 TEXT NOT NULL,
  mime TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 1 AND 60),
  stars INTEGER CHECK (stars BETWEEN 1 AND 5),
  rated_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_chapter ON voice_recordings(chapter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_voice_user ON voice_recordings(user_id, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  user_id TEXT NOT NULL,
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS study_schedules (
  id TEXT PRIMARY KEY,
  parent_user_id TEXT NOT NULL,
  child_user_id TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  time TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedules_due ON study_schedules(enabled, weekday, time);
CREATE INDEX IF NOT EXISTS idx_schedules_parent ON study_schedules(parent_user_id);

CREATE TABLE IF NOT EXISTS push_sent_log (
  schedule_id TEXT NOT NULL,
  day TEXT NOT NULL,
  time TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (schedule_id, day, time)
);

-- ------------------------- Bagian C: Simulasi ANBK Kelas 5 -------------------------
INSERT INTO simulations (id, product_id, subject, grade, paket, title, total_minutes, max_points, created_at)
SELECT 'anbk-literasi', 'k5', 'Literasi', 5, 'ANBK', 'Simulasi ANBK Literasi Kelas 5', 60, 34, '2026-11-15T12:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM simulations WHERE id = 'anbk-literasi');

INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10000, NULL, 'anbk-literasi', 'pg', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Di mana letak taman baca itu?', '["Di ujung Gang Melati","Di tengah pasar","Di dekat sekolah","Di tepi sungai"]', 'Di ujung Gang Melati', 'Teks menulis taman baca itu ada di ujung Gang Melati.', 'Literasi', 5, 1, 0);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10001, NULL, 'anbk-literasi', 'pg', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Buku apa saja yang ada di taman baca itu?', '["Buku cerita, buku gambar, dan buku pengetahuan","Buku pelajaran dan buku ujian","Buku resep dan buku lagu","Buku komik saja"]', 'Buku cerita, buku gambar, dan buku pengetahuan', 'Teks menyebut tiga jenis buku: buku cerita, buku gambar, dan buku pengetahuan.', 'Literasi', 5, 1, 1);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10002, NULL, 'anbk-literasi', 'pg', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Siapa yang membuat taman baca itu?', '["Warga","Kepala desa","Guru sekolah","Pedagang buku"]', 'Warga', 'Teks menulis taman baca itu dibuat oleh warga.', 'Literasi', 5, 1, 2);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10003, NULL, 'anbk-literasi', 'bs', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Rak buku di taman baca dibuat dari kayu baru yang dibeli di toko.', NULL, 'Salah', 'Salah. Rak itu dibuat dari kayu bekas, bukan kayu baru dari toko.', 'Literasi', 5, 1, 3);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10004, NULL, 'anbk-literasi', 'bs', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Buku di taman baca boleh dibaca gratis.', NULL, 'Benar', 'Benar. Teks menulis buku-buku di sana boleh dibaca gratis.', 'Literasi', 5, 1, 4);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10005, NULL, 'anbk-literasi', 'pg', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Mengapa rak buku itu hampir kosong suatu hari?', '["Banyak buku dipinjam dan belum kembali","Buku-buku rusak karena hujan","Rak buku pindah tempat","Buku-buku dibuang warga"]', 'Banyak buku dipinjam dan belum kembali', 'Teks menulis banyak buku dipinjam dan belum kembali, sehingga rak hampir kosong.', 'Literasi', 5, 1, 5);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10006, NULL, 'anbk-literasi', 'isian', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Buku boleh dipinjam paling lama ... minggu.', NULL, 'satu', 'Teks menulis buku boleh dipinjam paling lama satu minggu.', 'Literasi', 5, 1, 6);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10007, NULL, 'anbk-literasi', 'pg_kompleks', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Apa saja yang dilakukan anak-anak di taman baca itu? Boleh pilih lebih dari satu jawaban.', '["Membaca buku","Bercerita tentang buku yang dibaca","Membeli buku baru","Menjual buku bekas","Duduk di tikar sambil membaca"]', '["Membaca buku","Bercerita tentang buku yang dibaca","Duduk di tikar sambil membaca"]', 'Teks menulis anak-anak membaca, duduk di tikar, dan bercerita tentang buku yang dibaca. Tidak ada yang membeli atau menjual buku.', 'Literasi', 5, 2, 7);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10008, NULL, 'anbk-literasi', 'menjodohkan', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Pasangkan setiap kata di kiri dengan penjelasan yang tepat di kanan.', '{"left":["Rak buku","Tikar","Buku catatan","Kayu bekas","Satu minggu"],"right":["Bahan untuk membuat rak","Tempat menulis nama peminjam","Lama waktu meminjam buku","Tempat menyimpan buku","Alas untuk duduk membaca"]}', '{"0":"d","1":"e","2":"b","3":"a","4":"c"}', 'Rak buku menyimpan buku, tikar alas untuk duduk, buku catatan mencatat nama peminjam, kayu bekas bahan rak, dan satu minggu adalah lama waktu meminjam.', 'Literasi', 5, 5, 8);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10009, NULL, 'anbk-literasi', 'uraian', 'Bacalah teks berikut.

Di ujung Gang Melati ada sebuah rumah kecil. Rumah itu punya rak buku di teras. Setiap sore, rak itu dibuka untuk anak-anak. Buku-buku di sana boleh dibaca gratis. Ada buku cerita, buku gambar, dan buku pengetahuan. Taman baca itu dibuat oleh warga. Mereka mengumpulkan buku bekas yang masih bagus. Mereka juga membuat rak dari kayu bekas. Setiap minggu, ada yang datang membawa buku baru. Anak-anak datang dari berbagai gang. Mereka membaca sambil duduk di tikar. Kadang mereka membaca bersama. Kadang mereka bercerita tentang buku yang dibaca. Suasana di sana tenang dan ramah. Suatu hari, rak buku itu hampir kosong. Banyak buku dipinjam dan belum kembali. Warga lalu membuat aturan baru. Buku boleh dipinjam paling lama satu minggu. Nama peminjam ditulis di buku catatan. Sejak itu, buku-buku kembali tepat waktu. Setiap bulan, warga mengadakan acara membaca bersama. Mereka memilih satu buku cerita. Buku itu dibaca keras-keras secara bergiliran. Anak-anak mendengarkan dengan saksama. Setelah itu, mereka menggambar tokoh kesukaan mereka.

Mengapa warga membuat aturan meminjam buku? Jelaskan dengan bahasamu sendiri.', NULL, '["dipinjam","kembali","tepat waktu"]', 'Aturan dibuat karena banyak buku dipinjam dan belum kembali, sehingga rak hampir kosong. Dengan aturan, buku yang dipinjam kembali tepat waktu.', 'Literasi', 5, 5, 9);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10010, NULL, 'anbk-literasi', 'pg', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Dari mana warga Desa Sukamaju mengambil air setiap pagi?', '["Sumur umum","Sungai","Kolam ikan","Tangki air"]', 'Sumur umum', 'Teks menulis warga mengambil air di sumur umum.', 'Literasi', 5, 1, 10);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10011, NULL, 'anbk-literasi', 'pg', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Apa yang terjadi pada musim kemarau?', '["Air sumur mulai surut","Air sumur menjadi asin","Sumur tertutup lumpur","Sumur pindah tempat"]', 'Air sumur mulai surut', 'Teks menulis pada musim kemarau air sumur mulai surut.', 'Literasi', 5, 1, 11);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10012, NULL, 'anbk-literasi', 'bs', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Warga memakai air sumur untuk minum, memasak, dan mandi.', NULL, 'Benar', 'Benar. Teks menulis air itu dipakai untuk minum, memasak, dan mandi.', 'Literasi', 5, 1, 12);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10013, NULL, 'anbk-literasi', 'bs', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Air untuk menyiram tanaman didahulukan daripada air untuk minum.', NULL, 'Salah', 'Salah. Teks menulis air untuk minum didahulukan, sedangkan air untuk menyiram tanaman dibatasi.', 'Literasi', 5, 1, 13);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10014, NULL, 'anbk-literasi', 'isian', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Warga bekerja bersama selama ... minggu untuk membuat sumur baru.', NULL, 'dua', 'Teks menulis warga bekerja bersama selama dua minggu.', 'Literasi', 5, 1, 14);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10015, NULL, 'anbk-literasi', 'pg', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Apa yang disepakati warga saat berembuk?', '["Membuat dua sumur baru","Menutup sumur lama","Membeli air dari desa lain","Melarang warga mengambil air"]', 'Membuat dua sumur baru', 'Teks menulis warga sepakat membuat dua sumur baru.', 'Literasi', 5, 1, 15);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10016, NULL, 'anbk-literasi', 'pg_kompleks', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Manakah yang termasuk cara warga menjaga air tetap cukup? Boleh pilih lebih dari satu jawaban.', '["Membuat sumur baru","Mendahulukan air untuk minum","Membatasi air untuk menyiram tanaman","Mengambil air sebanyak-banyaknya","Membuang air yang tersisa"]', '["Membuat sumur baru","Mendahulukan air untuk minum","Membatasi air untuk menyiram tanaman"]', 'Teks menulis warga membuat dua sumur baru, mendahulukan air untuk minum, dan membatasi air untuk menyiram tanaman.', 'Literasi', 5, 2, 16);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10017, NULL, 'anbk-literasi', 'isian', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Setelah sumur baru selesai, air kembali ... untuk semua.', NULL, 'cukup', 'Teks menulis setelah sumur baru selesai, air kembali cukup untuk semua.', 'Literasi', 5, 1, 17);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10018, NULL, 'anbk-literasi', 'bs', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Warga membuat sumur baru sendirian tanpa bantuan kepala desa.', NULL, 'Salah', 'Salah. Kepala desa mengajak warga berembuk, lalu warga bekerja bersama membuat sumur baru.', 'Literasi', 5, 1, 18);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10019, NULL, 'anbk-literasi', 'uraian', 'Bacalah teks berikut.

Setiap pagi, warga Desa Sukamaju mengambil air di sumur umum. Sumur itu ada di tengah desa. Airnya jernih dan dingin. Warga memakai air itu untuk minum, memasak, dan mandi. Suatu musim kemarau, air sumur mulai surut. Warga harus antre lebih lama. Ada yang datang sebelum matahari terbit. Ada yang pulang dengan ember setengah penuh. Kepala desa mengajak warga berembuk. Mereka sepakat membuat dua sumur baru. Mereka juga membuat aturan. Air untuk minum didahulukan. Air untuk menyiram tanaman dibatasi. Warga bekerja bersama selama dua minggu. Mereka menggali tanah dan memasang pipa. Setelah sumur baru selesai, air kembali cukup untuk semua. Warga belajar satu hal. Air yang dijaga bersama akan cukup untuk bersama. Warga juga menanam pohon di sekitar sumur. Akar pohon menjaga tanah tetap lembap. Daun pohon memberi teduh saat antre. Setiap keluarga merawat satu pohon. Mereka menyiram pohon itu setiap sore. Pohon itu tumbuh tinggi dari tahun ke tahun. Warga senang melihatnya.

Apa pelajaran yang didapat warga dari pengalaman menjaga air sumur? Jelaskan dengan bahasamu sendiri.', NULL, '["dijaga","bersama","cukup"]', 'Warga belajar bahwa air yang dijaga bersama akan cukup untuk bersama.', 'Literasi', 5, 5, 19);

INSERT INTO simulations (id, product_id, subject, grade, paket, title, total_minutes, max_points, created_at)
SELECT 'anbk-numerasi', 'k5', 'Numerasi', 5, 'ANBK', 'Simulasi ANBK Numerasi Kelas 5', 60, 34, '2026-11-15T12:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM simulations WHERE id = 'anbk-numerasi');

INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10020, NULL, 'anbk-numerasi', 'pg', 'Sebuah toko menjual pensil Rp2.000,00 per buah. Berapa harga 5 pensil?', '["Rp8.000,00","Rp10.000,00","Rp12.000,00","Rp7.000,00"]', 'Rp10.000,00', '5 × Rp2.000,00 = Rp10.000,00.', 'Numerasi', 5, 1, 0);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10021, NULL, 'anbk-numerasi', 'pg', 'Jarak rumah ke sekolah 2 km. Jarak sekolah ke lapangan 1 km. Berapa jarak rumah ke lapangan lewat sekolah?', '["1 km","2 km","3 km","4 km"]', '3 km', '2 km + 1 km = 3 km.', 'Numerasi', 5, 1, 1);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10022, NULL, 'anbk-numerasi', 'pg', 'Sebuah bus berangkat pukul 07.00 dan tiba pukul 09.30. Berapa lama perjalanan bus itu?', '["1 jam 30 menit","2 jam","2 jam 30 menit","3 jam"]', '2 jam 30 menit', 'Dari 07.00 ke 09.30 adalah 2 jam 30 menit.', 'Numerasi', 5, 1, 2);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10023, NULL, 'anbk-numerasi', 'bs', '12 + 8 = 20.', NULL, 'Benar', 'Benar. 12 + 8 = 20.', 'Numerasi', 5, 1, 3);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10024, NULL, 'anbk-numerasi', 'bs', 'Setengah dari 50 adalah 20.', NULL, 'Salah', 'Salah. Setengah dari 50 adalah 25.', 'Numerasi', 5, 1, 4);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10025, NULL, 'anbk-numerasi', 'pg', 'Sebuah kantong berisi 24 kelereng. Kelereng itu dibagi sama rata ke 4 anak. Berapa kelereng yang diterima tiap anak?', '["4","6","8","12"]', '6', '24 : 4 = 6. Tiap anak menerima 6 kelereng.', 'Numerasi', 5, 1, 5);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10026, NULL, 'anbk-numerasi', 'isian', 'Harga sebuah buku Rp7.500,00. Uang yang dibayar Rp10.000,00. Kembaliannya ... rupiah.', NULL, '2500', 'Rp10.000,00 − Rp7.500,00 = Rp2.500,00. Kembaliannya 2500 rupiah.', 'Numerasi', 5, 1, 6);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10027, NULL, 'anbk-numerasi', 'pg_kompleks', 'Manakah bilangan yang habis dibagi 3? Boleh pilih lebih dari satu jawaban.', '["12","15","20","21","25"]', '["12","15","21"]', '12 : 3 = 4, 15 : 3 = 5, dan 21 : 3 = 7. Sedangkan 20 dan 25 tidak habis dibagi 3.', 'Numerasi', 5, 2, 7);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10028, NULL, 'anbk-numerasi', 'menjodohkan', 'Pasangkan setiap hitungan di kiri dengan hasil yang tepat di kanan.', '{"left":["6 × 7","72 : 8","15 + 9","30 − 14","5 × 9"],"right":["24","45","9","42","16"]}', '{"0":"d","1":"c","2":"a","3":"e","4":"b"}', '6 × 7 = 42, 72 : 8 = 9, 15 + 9 = 24, 30 − 14 = 16, dan 5 × 9 = 45.', 'Numerasi', 5, 5, 8);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10029, NULL, 'anbk-numerasi', 'uraian', 'Sebuah kelas punya 30 siswa. Setiap siswa membawa 2 buku. Berapa jumlah buku seluruhnya? Jelaskan caramu menghitung.', NULL, '["60","30","2"]', '30 × 2 = 60. Jumlah buku seluruhnya 60 buku.', 'Numerasi', 5, 5, 9);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10030, NULL, 'anbk-numerasi', 'pg', 'Jumlah pengunjung perpustakaan: Senin 20 orang, Selasa 25 orang, Rabu 15 orang, Kamis 30 orang. Pada hari apa pengunjung paling banyak?', '["Senin","Selasa","Rabu","Kamis"]', 'Kamis', 'Kamis paling banyak: 30 orang. Selasa 25, Senin 20, Rabu 15.', 'Numerasi', 5, 1, 10);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10031, NULL, 'anbk-numerasi', 'pg', 'Sebuah persegi panjang panjangnya 8 cm dan lebarnya 5 cm. Berapa kelilingnya?', '["13 cm","26 cm","40 cm","20 cm"]', '26 cm', 'Keliling = 2 × (8 + 5) = 2 × 13 = 26 cm.', 'Numerasi', 5, 1, 11);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10032, NULL, 'anbk-numerasi', 'bs', 'Segitiga punya 3 sisi.', NULL, 'Benar', 'Benar. Segitiga punya 3 sisi.', 'Numerasi', 5, 1, 12);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10033, NULL, 'anbk-numerasi', 'bs', '1 jam = 100 menit.', NULL, 'Salah', 'Salah. 1 jam = 60 menit.', 'Numerasi', 5, 1, 13);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10034, NULL, 'anbk-numerasi', 'isian', 'Bilangan setelah 199 adalah ....', NULL, '200', 'Setelah 199 adalah 200.', 'Numerasi', 5, 1, 14);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10035, NULL, 'anbk-numerasi', 'pg', 'Ibu membeli 3 kg gula. Setiap kg harganya Rp15.000,00. Berapa yang harus dibayar ibu?', '["Rp30.000,00","Rp45.000,00","Rp18.000,00","Rp50.000,00"]', 'Rp45.000,00', '3 × Rp15.000,00 = Rp45.000,00.', 'Numerasi', 5, 1, 15);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10036, NULL, 'anbk-numerasi', 'pg_kompleks', 'Manakah yang merupakan bangun datar dengan 4 sisi? Boleh pilih lebih dari satu jawaban.', '["Persegi","Persegi panjang","Segitiga","Jajar genjang","Lingkaran"]', '["Persegi","Persegi panjang","Jajar genjang"]', 'Persegi, persegi panjang, dan jajar genjang masing-masing punya 4 sisi. Segitiga punya 3 sisi, lingkaran tidak punya sisi lurus.', 'Numerasi', 5, 2, 16);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10037, NULL, 'anbk-numerasi', 'isian', '3 jam = ... menit.', NULL, '180', '1 jam = 60 menit, jadi 3 × 60 = 180 menit.', 'Numerasi', 5, 1, 17);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10038, NULL, 'anbk-numerasi', 'bs', 'Hasil dari 100 − 45 adalah 65.', NULL, 'Salah', 'Salah. 100 − 45 = 55.', 'Numerasi', 5, 1, 18);
INSERT OR IGNORE INTO questions (id, chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order) VALUES (10039, NULL, 'anbk-numerasi', 'uraian', 'Sebuah toko menjual 4 kotak pensil. Setiap kotak berisi 12 pensil. Berapa pensil seluruhnya? Jelaskan caramu menghitung.', NULL, '["48","12","4"]', '4 × 12 = 48. Pensil seluruhnya 48 pensil.', 'Numerasi', 5, 5, 19);

