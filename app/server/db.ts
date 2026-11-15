// db.ts — implementasi Database lokal lewat node:sqlite (bawaan Node 22.5+).
//
// Dipakai HANYA di runtime Node (server/index.ts dan skrip CLI di
// server/scripts/). Entry Worker (server/worker.ts) memakai D1Database
// (server/d1.ts) dan TIDAK PERNAH mengimpor berkas ini — node:sqlite tidak
// ada di Workers, jadi impor itu akan menggagalkan bundling wrangler.
//
// Semua metode di sini async (sesuai antarmuka Database) meskipun
// node:sqlite sinkron: pembungkusnya ringan dan membuat handler di
// actions.ts identik di Node maupun Workers.
//
// migrate() tetap sinkron dan hanya dipakai saat startup lokal — migrasi
// di D1 diterapkan pemilik lewat `wrangler d1 migrations apply`.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Database, SQLInputValue } from "./database.js";

export type { Database, DB } from "./database.js";

export class NodeDatabase implements Database {
  private sql: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.sql = new DatabaseSync(path);
    this.sql.exec("PRAGMA foreign_keys = ON");
    this.sql.exec("PRAGMA journal_mode = WAL");
  }

  /** Jalankan semua berkas *.sql di folder migrasi, sekali saja, berurutan. */
  migrate(dir: string): void {
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    );
    const applied = new Set(
      (this.sql.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map(
        (r) => r.name
      )
    );
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".sql") || applied.has(file)) continue;
      const text = readFileSync(join(dir, file), "utf-8");
      this.sql.exec(text);
      this.sql
        .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
      console.log(`[db] migrasi diterapkan: ${file}`);
    }
  }

  async get<T>(sql: string, ...params: SQLInputValue[]): Promise<T | undefined> {
    return this.sql.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, ...params: SQLInputValue[]): Promise<T[]> {
    return this.sql.prepare(sql).all(...params) as T[];
  }

  async run(
    sql: string,
    ...params: SQLInputValue[]
  ): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
    const info = this.sql.prepare(sql).run(...params);
    return { changes: Number(info.changes), lastInsertRowid: info.lastInsertRowid };
  }

  async exec(sql: string): Promise<void> {
    this.sql.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // Dipakai hanya seed saat startup (belum ada request bersamaan).
    // Jangan dipakai di handler request: BEGIN...await...COMMIT di koneksi
    // yang sama bisa tercampur dengan statement request lain.
    this.sql.exec("BEGIN");
    try {
      const out = await fn();
      this.sql.exec("COMMIT");
      return out;
    } catch (err) {
      this.sql.exec("ROLLBACK");
      throw err;
    }
  }
}

export function openDatabase(path: string): NodeDatabase {
  return new NodeDatabase(path);
}
