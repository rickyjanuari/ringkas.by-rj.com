import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../db.js";

// CLI: npm run make-admin -- email@contoh.id
// Mengubah role pengguna menjadi 'admin'. Gagal (exit 1) bila email tidak ada.

const email = process.argv[2]?.trim();
if (!email) {
  console.error("Penggunaan: npm run make-admin -- email@contoh.id");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "..", "..");
const dbPath = process.env.DATABASE_PATH ?? join(appDir, "data", "ringkas.db");

const db = openDatabase(dbPath);
db.migrate(join(__dirname, "..", "migrations"));

const result = await db.run("UPDATE users SET role = 'admin' WHERE email = ?", email);
if (result.changes === 0) {
  console.error(`Pengguna dengan email ${email} tidak ditemukan.`);
  process.exit(1);
}
console.log(`Berhasil: ${email} kini menjadi admin.`);
