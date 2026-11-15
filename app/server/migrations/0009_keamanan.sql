-- 0009_keamanan.sql — keamanan login & admin: lockout, rate limit IP,
-- audit log admin, TOTP 2FA (admin) + kode pemulihan.
--
-- AUTH_LOCKOUTS:
--   - Satu baris per pengguna: hitungan gagal login beruntun + batas
--     waktu terkunci. Login sukses mereset keduanya (lihat actions.ts).
--   - Lockout 5 gagal -> terkunci 15 menit.
-- IP_RATE_LIMITS:
--   - Satu baris per (kind + IP): hitungan dalam satu jendela waktu.
--     kind = 'register' | 'checkout'. Baris lama dihapus saat jendela
--     berganti (logika di actions.ts: checkIpLimit).
-- ADMIN_AUDIT_LOG:
--   - Jejak semua aksi admin yang bermutasi (lihat server/audit.ts).
--     detail TIDAK PERNAH berisi kata sandi / secret / token.
-- TOTP_CHALLENGES:
--   - Challenge login 2FA sekali pakai, kedaluwarsa 5 menit; dihapus
--     setelah verifikasi sukses.
-- RECOVERY_CODES:
--   - Hash SHA-256 kode pemulihan 2FA (kode aslinya TIDAK disimpan).
--     used = 1 setelah dipakai sekali.
-- USERS:
--   - totp_secret: secret base32 2FA (NULL bila belum setup).
--   - totp_enabled: 1 bila 2FA aktif (login admin menuntut kode TOTP).
CREATE TABLE IF NOT EXISTS auth_lockouts (
  user_id TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS ip_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS totp_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
