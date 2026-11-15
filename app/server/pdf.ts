// pdf.ts — struk, worksheet, dan rangkuman produk (PDF A4).
//
// Dibangun dengan pdf-lib (pure JavaScript, tanpa API Node) supaya SATU
// kode yang sama jalan di server Node lokal DAN di Cloudflare Workers.
// Dependensi sebelumnya (pdfkit) tidak bisa jalan di Workers: modul
// font-nya memakai `__dirname` (CommonJS) yang tidak ada di runtime
// Workers, sehingga semua endpoint PDF mengembalikan 500.
//
// Font: Helvetica / Helvetica-Bold standar PDF (tanpa embedding).
// Karakter di luar WinAnsi dipetakan ke ASCII (lihat sanitize) agar
// kata seperti "->" tidak membuat pdf-lib melempar error.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Chapter, Order, Product, QuestionRow } from "./database.js";

export interface ReceiptOrder extends Order {
  buyer_name?: string;
  buyer_email?: string;
  expired_at?: string | null;
}

export interface ReceiptItem {
  product_id: string;
  title: string;
  price: number;
}

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

const BLUE = rgb(0.133, 0.451, 0.847); // #2273d8
const GRAY = rgb(0.333, 0.333, 0.333); // #555555
const BLACK = rgb(0.067, 0.067, 0.067); // #111111

const CHAR_MAP: Record<string, string> = {
  "→": "->",
  "•": "-",
  "–": "-",
  "—": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "≤": "<=",
  "≥": ">=",
  "−": "-"
};

/** WinAnsi (Latin-1 + beberapa) — sisanya dipetakan/diganti '?' agar aman. */
function sanitize(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0xff) {
      out += ch;
    } else if (CHAR_MAP[ch]) {
      out += CHAR_MAP[ch];
    } else {
      out += "?";
    }
  }
  return out;
}

class Doc {
  private doc!: PDFDocument;
  private regular!: PDFFont;
  private bold!: PDFFont;
  private page!: PDFPage;
  private y = 0;

  static async create(): Promise<Doc> {
    const d = new Doc();
    d.doc = await PDFDocument.create();
    d.regular = await d.doc.embedFont(StandardFonts.Helvetica);
    d.bold = await d.doc.embedFont(StandardFonts.HelveticaBold);
    d.newPage();
    return d;
  }

  private newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = MARGIN;
  }

  private ensureSpace(height: number): void {
    if (this.y + height > PAGE_H - MARGIN) this.newPage();
  }

  private drawLine(font: PDFFont, size: number, text: string, color = BLACK): void {
    this.ensureSpace(size * 1.5);
    this.page.drawText(sanitize(text), {
      x: MARGIN,
      y: PAGE_H - this.y - size,
      size,
      font,
      color
    });
    this.y += size * 1.5;
  }

  private wrap(text: string, font: PDFFont, size: number): string[] {
    const lines: string[] = [];
    for (const raw of sanitize(text).split("\n")) {
      let current = "";
      for (const word of raw.split(/\s+/).filter(Boolean)) {
        const trial = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(trial, size) <= CONTENT_W) {
          current = trial;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
    }
    return lines.length > 0 ? lines : [""];
  }

  text(text: string, size = 11, color = BLACK, font?: PDFFont): void {
    const f = font ?? this.regular;
    for (const line of this.wrap(text, f, size)) this.drawLine(f, size, line, color);
  }

  boldText(text: string, size = 11, color = BLACK): void {
    this.text(text, size, color, this.bold);
  }

  /** Satu baris "Kunci: nilai" — kunci tebal, nilai biasa, tanpa wrap. */
  keyValue(key: string, value: string): void {
    const size = 11;
    this.ensureSpace(size * 1.5);
    const k = sanitize(key) + "  ";
    this.page.drawText(k, { x: MARGIN, y: PAGE_H - this.y - size, size, font: this.bold, color: BLACK });
    const vx = MARGIN + this.bold.widthOfTextAtSize(k, size);
    this.page.drawText(sanitize(value), { x: vx, y: PAGE_H - this.y - size, size, font: this.regular, color: BLACK });
    this.y += size * 1.5;
  }

  /** Baris dengan teks kiri + teks kanan (untuk total/harga). */
  leftRight(left: string, right: string, size = 11, boldLine = false): void {
    const font = boldLine ? this.bold : this.regular;
    this.ensureSpace(size * 1.5);
    this.page.drawText(sanitize(left), { x: MARGIN, y: PAGE_H - this.y - size, size, font, color: BLACK });
    const rw = font.widthOfTextAtSize(sanitize(right), size);
    this.page.drawText(sanitize(right), {
      x: PAGE_W - MARGIN - rw,
      y: PAGE_H - this.y - size,
      size,
      font,
      color: BLACK
    });
    this.y += size * 1.5;
  }

  moveDown(n = 1): void {
    this.y += 11 * 1.5 * n;
  }

  header(title: string): void {
    this.boldText("Ringkas", 22, BLUE);
    this.text("Rangkuman Materi SD, SMP, SMA", 10, GRAY);
    this.moveDown(0.5);
    this.boldText(title, 16);
    this.moveDown(0.25);
    this.page.drawLine({
      start: { x: MARGIN, y: PAGE_H - this.y },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - this.y },
      thickness: 1,
      color: BLUE
    });
    this.moveDown(1);
  }

  addPage(): void {
    this.newPage();
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

function rupiah(n: number): string {
  return `Rp${n.toLocaleString("id-ID")}`;
}

function formatTanggal(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" });
}

/** Struk A4 dari data order asli. */
export async function receiptPdf(order: ReceiptOrder, items: ReceiptItem[]): Promise<Uint8Array> {
  const doc = await Doc.create();
  doc.header("Struk Pembayaran");
  doc.keyValue("No. Order:", order.id);
  doc.keyValue("Tanggal dibuat:", formatTanggal(order.created_at));
  doc.keyValue("Tanggal bayar:", formatTanggal(order.paid_at));
  doc.keyValue("Pembeli:", `${order.buyer_name ?? "-"} (${order.buyer_email ?? "-"})`);
  doc.keyValue("Metode:", "KlikQRIS");
  doc.keyValue("Status:", "LUNAS");
  doc.moveDown(0.5);
  doc.boldText("Produk", 11);
  doc.moveDown(0.25);
  for (const it of items) {
    doc.leftRight(it.title, rupiah(it.price));
    doc.moveDown(0.25);
  }
  doc.moveDown(0.5);
  const totalAmount = order.total_amount ?? order.total;
  const kodeUnik = totalAmount - order.total;
  doc.keyValue("Total produk:", rupiah(order.total));
  doc.keyValue("Kode unik:", rupiah(kodeUnik));
  doc.boldText(`Total bayar:  ${rupiah(totalAmount)}`, 12);
  doc.moveDown(1);
  doc.text("Terima kasih sudah belajar bersama Ringkas.", 10, GRAY);
  return doc.bytes();
}

function renderOptions(doc: Doc, q: QuestionRow): void {
  if (!q.options) return;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(q.options);
  } catch {
    return;
  }
  if (Array.isArray(parsed)) {
    const letters = ["A", "B", "C", "D", "E"];
    parsed.forEach((opt, i) => {
      if (typeof opt === "string") {
        doc.text(`${letters[i] ?? String(i + 1)}. ${opt}`);
      }
    });
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as { left?: unknown; right?: unknown };
    if (Array.isArray(obj.left) && Array.isArray(obj.right)) {
      const letters = ["a", "b", "c", "d", "e"];
      doc.text("Kolom kiri:");
      obj.left.forEach((item, i) => {
        if (typeof item === "string") doc.text(`  ${i + 1}. ${item}`);
      });
      doc.text("Kolom kanan:");
      obj.right.forEach((item, i) => {
        if (typeof item === "string") doc.text(`  ${letters[i] ?? String(i + 1)}. ${item}`);
      });
    }
  }
}

function renderAnswer(q: QuestionRow): string {
  try {
    const parsed: unknown = JSON.parse(q.answer);
    if (Array.isArray(parsed)) return parsed.map(String).join(", ");
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>)
        .map(([k, v]) => `${Number(k) + 1} -> ${String(v)}`)
        .join("; ");
    }
  } catch {
    // bukan JSON — pakai apa adanya
  }
  return q.answer;
}

/** Worksheet bab: soal + kunci jawaban di halaman terakhir. */
export async function worksheetPdf(chapter: Chapter, questions: QuestionRow[]): Promise<Uint8Array> {
  const doc = await Doc.create();
  doc.header(`Worksheet - ${chapter.title}`);
  if (chapter.summary) doc.text(chapter.summary);
  doc.moveDown(1);
  questions.forEach((q, i) => {
    doc.boldText(`${i + 1}. ${q.question}`);
    doc.moveDown(0.25);
    renderOptions(doc, q);
    doc.moveDown(0.75);
  });

  doc.addPage();
  doc.boldText("Kunci Jawaban", 16);
  doc.moveDown(1);
  questions.forEach((q, i) => {
    doc.boldText(`${i + 1}. ${renderAnswer(q)}`);
    if (q.discussion) {
      doc.text(`   ${q.discussion}`, 10, GRAY);
    }
    doc.moveDown(0.5);
  });
  return doc.bytes();
}

/** PDF rangkuman produk: deskripsi + bab beserta poin intinya. */
export async function productPdf(product: Product, chapters: Chapter[]): Promise<Uint8Array> {
  const doc = await Doc.create();
  doc.header(product.title);
  doc.keyValue("Jenjang:", product.jenjang);
  doc.keyValue("Mata pelajaran:", product.mapel);
  if (product.pages > 0) doc.keyValue("Halaman:", String(product.pages));
  doc.keyValue("Harga:", rupiah(product.price));
  doc.moveDown(0.5);
  if (product.description) {
    doc.text(product.description);
    doc.moveDown(1);
  }
  for (const ch of chapters) {
    doc.boldText(ch.title, 13);
    doc.moveDown(0.25);
    if (ch.summary) {
      doc.text(ch.summary);
      doc.moveDown(0.25);
    }
    let points: string[] = [];
    try {
      const parsed: unknown = JSON.parse(ch.points);
      if (Array.isArray(parsed)) points = parsed.filter((p): p is string => typeof p === "string");
    } catch {
      points = [];
    }
    for (const p of points) {
      doc.text(`-  ${p}`);
    }
    doc.moveDown(0.75);
  }
  return doc.bytes();
}
