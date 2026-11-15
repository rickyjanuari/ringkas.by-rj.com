// d1.ts — implementasi Database di atas binding D1 Cloudflare.
//
// Dipakai hanya oleh server/worker.ts. Tipe binding ditulis minimal di sini
// (bukan @cloudflare/workers-types) supaya tsconfig server tetap memakai
// @types/node tanpa konflik, dan supaya `npm run build` tidak butuh login
// Cloudflare untuk men-generate tipe.
//
// Catatan D1 yang memengaruhi kode ini:
//   - D1 API bersifat async (prepare/bind/first/all/run) — itu sebabnya
//     seluruh server memakai antarmuka database async (server/database.ts).
//   - D1 menegakkan foreign key (seperti node:sqlite lokal dengan
//     PRAGMA foreign_keys = ON), jadi urutan INSERT saat seed harus
//     menghormati relasi — lihat server/scripts/dump-seed-sql.ts.
//   - Nilai BigInt tidak didukung bind D1; lastInsertRowid di sini selalu
//     number (id AUTOINCREMENT kita kecil), jadi aman.

import type { Database, SQLInputValue } from "./database.js";

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<{
    success: boolean;
    meta: { changes: number; last_row_id: number | null; duration: number };
  }>;
}

export interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<{ count: number; duration: number }>;
  batch<T = unknown>(
    statements: D1PreparedStatement[]
  ): Promise<
    Array<{
      results?: T[];
      success: boolean;
      meta: { changes: number; last_row_id: number | null };
    }>
  >;
}

export class D1Database implements Database {
  constructor(private binding: D1DatabaseBinding) {}

  async get<T>(sql: string, ...params: SQLInputValue[]): Promise<T | undefined> {
    const row = await this.binding
      .prepare(sql)
      .bind(...(params as unknown[]))
      .first<T>();
    return row ?? undefined;
  }

  async all<T>(sql: string, ...params: SQLInputValue[]): Promise<T[]> {
    const { results } = await this.binding
      .prepare(sql)
      .bind(...(params as unknown[]))
      .all<T>();
    return results ?? [];
  }

  async run(
    sql: string,
    ...params: SQLInputValue[]
  ): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
    const r = await this.binding
      .prepare(sql)
      .bind(...(params as unknown[]))
      .run();
    return {
      changes: r.meta.changes,
      lastInsertRowid: r.meta.last_row_id ?? 0
    };
  }

  async exec(sql: string): Promise<void> {
    await this.binding.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // D1 tidak punya blok transaksi arbitrer lewat API ini. Batch() hanya
    // untuk statement yang sudah disiapkan sebelumnya. Di kode ini
    // transaction() hanya dipakai seed saat startup lokal — di Worker tidak
    // ada pemakaian transaction() di handler request.
    return fn();
  }
}

export function openD1Database(binding: D1DatabaseBinding): D1Database {
  return new D1Database(binding);
}
