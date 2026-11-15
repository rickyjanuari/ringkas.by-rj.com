import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Lapisan database: SQLite lewat node:sqlite (bawaan Node 22.5+, stabil di
// Node 24). Tidak ada dependensi native, tidak ada file .db di repo.
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  whatsapp: string | null;
  role: string;
  created_at: string;
}

export interface Product {
  id: string;
  title: string;
  jenjang: string;
  mapel: string;
  price: number;
  strikethrough_price: number | null;
  pages: number;
  cover_label: string;
  cover_color: string;
  badge: string | null;
  active: number;
  category: string;
  description: string;
  external_url: string | null;
  created_at: string;
}

export interface ProductImage {
  id: number;
  product_id: string;
  url: string;
  kind: string;
  created_at: string;
}

export interface Chapter {
  id: string;
  product_id: string;
  title: string;
  subject: string;
  grade: number;
  semester: number;
  summary: string;
  points: string; // JSON string[]
  focus_text: string;
  video_url: string | null;
  video_duration: string | null;
  sort_order: number;
}

export interface Flashcard {
  id: number;
  chapter_id: string;
  front: string;
  back: string;
}

export interface Simulation {
  id: string;
  product_id: string | null;
  subject: string;
  grade: number;
  paket: string;
  title: string;
  total_minutes: number;
  max_points: number;
  created_at: string;
}

export interface QuestionRow {
  id: number;
  chapter_id: string | null;
  simulation_id: string | null;
  type: string; // pg | pg_kompleks | bs | menjodohkan | isian | uraian
  question: string;
  options: string | null; // JSON
  answer: string; // lihat API_CONTRACT.md untuk arti per tipe
  discussion: string;
  subject: string;
  grade: number;
  points: number;
  sort_order: number;
}

export interface Order {
  id: string;
  user_id: string;
  items: string; // JSON [{product_id, title, price}]
  total: number;
  status: string; // PENDING | PAID | EXPIRED
  klikqris_order_id: string | null;
  qris_url: string | null;
  direct_url: string | null;
  total_amount: number | null;
  signature: string | null;
  whatsapp: string | null;
  idempotency_key: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface Session {
  token: string;
  user_id: string;
  created_at: string;
}

export class DB {
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

  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.sql.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.sql.prepare(sql).all(...params) as T[];
  }

  run(
    sql: string,
    ...params: SQLInputValue[]
  ): { changes: number; lastInsertRowid: number | bigint } {
    const info = this.sql.prepare(sql).run(...params);
    return { changes: Number(info.changes), lastInsertRowid: info.lastInsertRowid };
  }

  exec(sql: string): void {
    this.sql.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    this.sql.exec("BEGIN");
    try {
      const out = fn();
      this.sql.exec("COMMIT");
      return out;
    } catch (err) {
      this.sql.exec("ROLLBACK");
      throw err;
    }
  }
}

export function openDatabase(path: string): DB {
  return new DB(path);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  const time = Date.now().toString(36).toUpperCase();
  return `${prefix}-${time}${rand}`;
}
