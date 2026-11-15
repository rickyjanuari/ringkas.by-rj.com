// audit.ts — jejak audit untuk semua aksi admin yang bermutasi.
//
// JANGAN PERNAH throw: bila tabel admin_audit_log belum ada (migrasi
// 0009 belum diterapkan) atau INSERT gagal, kesalahan dicatat di log
// dan aksi admin tetap jalan — audit tidak boleh memblokir operasi.
// Detail TIDAK PERNAH berisi kata sandi / secret / token.

import type { Database, User } from "./database.js";
import { nowIso } from "./database.js";

export async function logAdminAction(
  db: Database,
  admin: User,
  action: string,
  target?: string,
  detail?: string
): Promise<void> {
  try {
    await db.run(
      "INSERT INTO admin_audit_log (admin_id, admin_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      admin.id,
      admin.email,
      action,
      target ?? null,
      detail ?? null,
      nowIso()
    );
  } catch (err) {
    console.error("[audit] gagal mencatat aksi admin:", err);
  }
}
