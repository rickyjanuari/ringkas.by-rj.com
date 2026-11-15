-- 0006_mode_fokus.sql — simpan hitungan pindah tab/jendela saat Mode Ujian Fokus.
-- Diisi dari body `focus_switches` di POST /api/quiz/submit (kind = simulation).
ALTER TABLE quiz_attempts ADD COLUMN focus_switches INTEGER NOT NULL DEFAULT 0;
