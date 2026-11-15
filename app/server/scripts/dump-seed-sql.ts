// dump-seed-sql.ts — hasilkan server/seed/seed.sql dari seed lokal.
//
// Dipakai untuk mengisi D1 (Cloudflare tidak bisa menjalankan seed TS):
//   1. Buat database SQLite sementara, jalankan migrasi + seedDatabase.
//   2. Dump semua baris seed sebagai INSERT (urutan menghormati foreign
//      key — D1 menegakkan FK — jadi: products → chapters → flashcards →
//      simulations → questions).
//   3. Tulis ke server/seed/seed.sql, lalu pemilik menjalankan:
//        wrangler d1 execute ringkas-db --remote --file=server/seed/seed.sql
//
// Jalankan ulang setiap kali isi seed berubah (`npm run seed:dump`).
// Berkas hasil tidak berisi secret atau data pengguna — hanya katalog dan
// konten belajar seed, jadi aman di-commit.
import { rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../db.js";
import { seedDatabase } from "../seed/seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "..", "..");
const outPath = join(__dirname, "..", "seed", "seed.sql");
const tmpPath = join(appDir, "data", ".seed-dump.tmp.db");

function esc(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString("hex")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

rmSync(tmpPath, { force: true });
// Hapus juga -wal/-shm: bila proses crash di tengah dump, SQLite bisa
// memulihkan state lama dari -wal walau berkas .db sudah dihapus.
rmSync(`${tmpPath}-wal`, { force: true });
rmSync(`${tmpPath}-shm`, { force: true });
const db = openDatabase(tmpPath);
db.migrate(join(__dirname, "..", "migrations"));
await seedDatabase(db);

const raw = new DatabaseSync(tmpPath, { readOnly: true });
// Urutan tabel menghormati foreign key (products → chapters → ...).
// bundle_members setelah products (FK ke products).
const order = ["products", "bundle_members", "chapters", "flashcards", "simulations", "questions"];
const lines: string[] = [
  "-- seed.sql — dibuat otomatis oleh `npm run seed:dump`.",
  "-- JANGAN edit manual: ubah server/seed/* lalu jalankan ulang dump.",
  "-- Terapkan ke D1: wrangler d1 execute ringkas-db --remote --file=server/seed/seed.sql",
  "-- (lokal: wrangler d1 execute ringkas-db --local --file=server/seed/seed.sql)",
  ""
];
for (const table of order) {
  const cols = raw
    .prepare(`SELECT name FROM pragma_table_info(?) ORDER BY cid`)
    .all(table) as { name: string }[];
  if (cols.length === 0) continue;
  const colNames = cols.map((c) => `"${c.name}"`).join(", ");
  const rows = raw.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
  for (const row of rows) {
    const values = cols.map((c) => esc(row[c.name])).join(", ");
    // INSERT OR IGNORE: migrasi 0005 sudah meng-insert 6 produk bundel
    // sebelum seed jalan di database baru — seed ulang tidak boleh gagal
    // karenanya (dan seed.sql jadi aman dijalankan ulang).
    lines.push(`INSERT OR IGNORE INTO "${table}" (${colNames}) VALUES (${values});`);
  }
  lines.push(`-- ${table}: ${rows.length} baris`);
}
lines.push("");

writeFileSync(outPath, lines.join("\n"), "utf-8");
const total = lines.filter((l) => l.startsWith("INSERT ")).length;
console.log(`[seed:dump] ${total} INSERT ditulis ke ${outPath}`);
rmSync(tmpPath, { force: true });
