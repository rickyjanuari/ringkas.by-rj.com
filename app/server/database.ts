// database.ts — antarmuka database ASYNC yang dipakai seluruh server.
//
// Ada dua implementasi, dipilih di entry point (bukan di kode handler):
//   - NodeDatabase (server/db.ts): node:sqlite lokal — untuk `npm run dev`
//     dan `npm start`.
//   - D1Database (server/d1.ts): binding D1 Cloudflare — untuk Worker
//     (server/worker.ts).
// Handler di actions.ts hanya mengenal antarmuka ini, jadi satu kode jalan
// di dua runtime. Berkas ini TIDAK mengimpor modul Node apa pun, supaya
// aman di-bundle wrangler untuk Workers.
//
// Catatan: D1 tidak menyediakan blok transaksi arbitrer lewat API-nya
// (hanya batch()). `transaction()` di D1 hanya menjalankan fn() tanpa
// jaminan atomik — di kode saat ini transaction() hanya dipakai seed saat
// startup lokal, bukan di handler request.

/** Nilai parameter SQL (subset yang didukung node:sqlite maupun D1). */
export type SQLInputValue = string | number | bigint | Uint8Array | null;

export interface Database {
  get<T>(sql: string, ...params: SQLInputValue[]): Promise<T | undefined>;
  all<T>(sql: string, ...params: SQLInputValue[]): Promise<T[]>;
  run(
    sql: string,
    ...params: SQLInputValue[]
  ): Promise<{ changes: number; lastInsertRowid: number | bigint }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** Alias lama — dipakai sebagai `type DB` di actions/email/seed. */
export type DB = Database;

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

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  const time = Date.now().toString(36).toUpperCase();
  return `${prefix}-${time}${rand}`;
}
