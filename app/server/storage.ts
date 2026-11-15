// storage.ts — penyimpanan berkas gambar produk.
//
// Lokal (Node): berkas ditulis ke app/uploads/<product_id>/ dan disajikan
// lewat /uploads/* oleh server/index.ts.
// Worker (Cloudflare): TIDAK ada filesystem yang persisten — instance
// Worker stateless dan /uploads lokal tidak ikut ter-deploy. Simpan gambar
// gagal dengan pesan yang jelas (HTTP 501 di endpoint upload). Perbaikan
// yang disarankan: R2 (lihat README bagian "Deploy ke Cloudflare").
//
// Handler di actions.ts hanya mengenal antarmuka ini, jadi satu kode
// jalan di dua runtime.

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ImageStorage {
  /** Simpan gambar (base64); kembalikan URL publik (/uploads/...). */
  save(productId: string, filename: string, base64: string): Promise<string>;
  /** Hapus berkas untuk URL internal; false bila tidak ada/tidak didukung. */
  delete(url: string): Promise<boolean>;
}

export class LocalImageStorage implements ImageStorage {
  constructor(private dir: string) {}

  async save(productId: string, filename: string, base64: string): Promise<string> {
    const dir = join(this.dir, productId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), Buffer.from(base64, "base64"));
    return `/uploads/${productId}/${filename}`;
  }

  async delete(url: string): Promise<boolean> {
    if (!url.startsWith("/uploads/")) return false;
    const filePath = resolve(this.dir, url.slice("/uploads/".length));
    if (!filePath.startsWith(resolve(this.dir)) || !existsSync(filePath)) return false;
    try {
      unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export class UnavailableImageStorage implements ImageStorage {
  async save(): Promise<string> {
    throw new Error(
      "Upload gambar tidak tersedia di deployment Cloudflare — berkas tidak persisten di Workers. Pasang R2 (lihat README)."
    );
  }

  async delete(): Promise<boolean> {
    return false;
  }
}
