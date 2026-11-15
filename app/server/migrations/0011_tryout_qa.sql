-- 0011_tryout_qa.sql — Tryout Terjadwal + Papan Peringkat dan Tanya Jawab per Bab.
--
-- TRYOUT:
--   - tryouts: satu baris per tryout. question_ids = JSON daftar id soal
--     (dipilih SEKALI saat tryout dibuat, dari bank simulasi kelas itu)
--     sehingga semua peserta tryout yang sama mengerjakan soal yang sama.
--     Sengaja TANPA foreign key ke simulations/questions/products
--     (pola migrasi 0005): migrasi jalan SEBELUM seed di database baru.
--   - tryout_registrations: pendaftaran "Ikut Tryout" (satu baris per
--     peserta; peserta baru boleh daftar sampai ends_at, selama belum
--     submit).
--   - tryout_attempts: satu attempt per peserta per tryout
--     (UNIQUE(tryout_id, user_id)); answers = JSON jawaban mentah,
--     score/max_score hasil penilaian server-side.
--   - status: 'scheduled' | 'cancelled'. Tryout yang dibatalkan tidak
--     tampil di daftar publik.
--   - is_free: 1 = tryout gratis — semua akun login boleh ikut tanpa
--     membeli produk kelas itu. Kebijakan: tryout PERTAMA tiap kelas
--     dibuat gratis (is_free = 1); tryout berikutnya hanya untuk pemilik
--     produk kelas k1–k6 (cek kepemilikan seperti gating LUNAS).
--
-- TANYA JAWAB:
--   - chapter_questions: satu baris per pertanyaan. status:
--       pending   = menunggu moderasi admin (hanya penanya yang melihat)
--       approved  = tampil publik di halaman bab, menunggu jawaban
--       answered  = sudah dijawab admin (tampil publik + jawaban)
--       rejected  = ditolak admin (hanya penanya yang melihat statusnya)
--     Sengaja TANPA foreign key ke chapters/products (pola migrasi 0005).
CREATE TABLE IF NOT EXISTS tryouts (
  id TEXT PRIMARY KEY,
  grade INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 6),
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  question_count INTEGER NOT NULL DEFAULT 25,
  question_ids TEXT NOT NULL DEFAULT '[]',
  is_free INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tryouts_grade_starts ON tryouts(grade, starts_at);
CREATE INDEX IF NOT EXISTS idx_tryouts_starts ON tryouts(starts_at);

CREATE TABLE IF NOT EXISTS tryout_registrations (
  tryout_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  PRIMARY KEY (tryout_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tryout_registrations_user ON tryout_registrations(user_id);

CREATE TABLE IF NOT EXISTS tryout_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tryout_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL,
  UNIQUE(tryout_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tryout_attempts_tryout ON tryout_attempts(tryout_id, score DESC, duration_seconds ASC);

CREATE TABLE IF NOT EXISTS chapter_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'answered')),
  created_at TEXT NOT NULL,
  answered_at TEXT,
  answered_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_chapter_questions_chapter ON chapter_questions(product_id, chapter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chapter_questions_user ON chapter_questions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chapter_questions_status ON chapter_questions(status, created_at);
