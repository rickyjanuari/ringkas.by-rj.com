// CLI seed: buka DB dari env DATABASE_PATH (default ./data/ringkas.db),
// jalankan migrasi, lalu seedDatabase, lalu exit.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../db.js";
import { seedDatabase } from "../seed/seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "..", "..");
const dbPath = process.env.DATABASE_PATH ?? join(appDir, "data", "ringkas.db");

const db = openDatabase(dbPath);
db.migrate(join(__dirname, "..", "migrations"));
await seedDatabase(db);
console.log(`[seed] selesai: ${dbPath}`);
