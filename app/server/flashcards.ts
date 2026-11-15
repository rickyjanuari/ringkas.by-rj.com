// flashcards.ts — Flashcard Printable (PDF) per Bab (FITUR 5).
//
// Didaftarkan koordinator di server/app.ts lewat
// registerFlashcardRoutes(app, db) — mengikuti pola registerRoutes di
// actions.ts (file itu TIDAK diubah) dan pola modul qa.ts / tryout.ts.
//
// ENDPOINT:
//   GET /api/study/:product_id/:chapter_id/flashcards.pdf (login wajib)
//     - Bab harus ada (404 bila tidak).
//     - Gate SAMA PERSIS seperti worksheet di actions.ts: hanya pemilik
//       LUNAS produk itu (userHasPaidProduct, termasuk akses hadiah
//       gift_grants) yang boleh mengunduh; selain itu 403 dengan pesan
//       "Flashcard hanya untuk pemilik produk yang sudah lunas."
//     - Bab tanpa flashcard -> 400 dengan pesan jelas.
//     - PDF: A4 portrait, grid 2 kolom x 4 baris per halaman (8 kartu
//       per halaman), tiap kartu berkotak garis potong putus-putus.
//       Pola seperti worksheet: SEMUA kartu dulu, lalu SEMUA jawaban
//       (bukan kunci terpisah di akhir dalam arti lain — jawaban
//       memang di halaman-halaman setelah kartu, supaya setelah
//       dipotong, kartu dan jawabannya bisa dipasangkan lewat nomor
//       kartu yang sama).
//     - Halaman kartu: nama bab kecil di atas, istilah (front) besar +
//       tebal di tengah, "Kartu N" kecil di bawah.
//     - Halaman jawaban: "Jawaban kartu N" kecil di atas, arti (back)
//       di tengah, "Kartu N" kecil di bawah.
//     - Header tiap halaman pertama tiap seksi: "Ringkas" emerald +
//       garis marigold seperti rapor (pdf.ts: emeraldHeader); judul
//       PDF "Flashcard - <judul bab>".
//     - Footer tiap halaman: "Ringkas - Flashcard - <judul bab> -
//       Halaman X dari Y".
//
// CATATAN SINKRONISASI: sanitize di bawah adalah salinan sanitize dari
// pdf.ts (pdf.ts tidak mengekspornya). Bila pdf.ts mengubah pemetaan
// karakternya, salinan ini harus disinkronkan. PDF dibuat langsung
// dengan pdf-lib (pure JS, aman di Node maupun Cloudflare Workers),
// tanpa mengimpor pdf.ts.

import { Hono, type Context } from "hono";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Chapter, Database, Flashcard, User } from "./database.js";

// ---------------------------------------------------------------------------
// Helper kecil (duplikasi seperlunya dari actions.ts — berkas itu bukan
// milik fitur ini).
// ---------------------------------------------------------------------------

async function authUser(c: Context, db: Database): Promise<User | null> {
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const session = await db.get<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE token = ?",
    token
  );
  if (!session) return null;
  return (await db.get<User>("SELECT * FROM users WHERE id = ?", session.user_id)) ?? null;
}

interface OrderItem {
  product_id: string;
}

function parseItems(raw: string): OrderItem[] {
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (it): it is OrderItem =>
        !!it && typeof it === "object" && typeof (it as OrderItem).product_id === "string"
    );
  } catch {
    return [];
  }
}

/**
 * Gate LUNAS — SAMA PERSIS seperti userHasPaidProduct di actions.ts
 * (dipakai endpoint worksheet): order PAID berisi produk itu, ATAU
 * akses hadiah gift_grants (migrasi 0010). try/catch seputar
 * gift_grants: tabel belum ada (migrasi belum diterapkan) berarti
 * bukan pemilik lewat jalur itu.
 */
export async function canDownloadFlashcards(
  db: Database,
  userId: string,
  productId: string
): Promise<boolean> {
  const orders = await db.all<{ items: string }>(
    "SELECT items FROM orders WHERE user_id = ? AND status = 'PAID'",
    userId
  );
  if (orders.some((o) => parseItems(o.items).some((it) => it.product_id === productId))) {
    return true;
  }
  try {
    const grant = await db.get<{ x: number }>(
      "SELECT 1 AS x FROM gift_grants WHERE user_id = ? AND product_id = ? LIMIT 1",
      userId,
      productId
    );
    return !!grant;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// sanitize — salinan sanitize dari pdf.ts (tidak diekspor di sana).
// WinAnsi (Latin-1 + beberapa) — sisanya dipetakan/diganti '?' agar aman
// untuk font Helvetica standar pdf-lib.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Builder PDF flashcard (self-contained, pdf-lib langsung).
// ---------------------------------------------------------------------------

export interface FlashcardItem {
  front: string;
  back: string;
}

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 36;
const GAP = 12;
const COLS = 2;
const ROWS = 4;
const PER_PAGE = COLS * ROWS; // 8 kartu per halaman

const EMERALD = rgb(0.09, 0.45, 0.27); // #177245
const MARIGOLD = rgb(0.95, 0.7, 0.24); // #f2b33d
const INK = rgb(0.13, 0.19, 0.16); // #22302a
const GRAY = rgb(0.37, 0.42, 0.38); // #5f6b62
const CUT = rgb(0.55, 0.55, 0.5); // garis potong putus-putus

/** Bungkus teks ke lebar tertentu; bila terlalu panjang, kecilkan font. */
function fitLines(
  text: string,
  font: PDFFont,
  startSize: number,
  minSize: number,
  maxWidth: number,
  maxLines: number
): { lines: string[]; size: number } {
  const clean = sanitize(text).trim() || "-";
  for (let size = startSize; size >= minSize; size -= 1) {
    const lines: string[] = [];
    for (const raw of clean.split("\n")) {
      let current = "";
      for (const word of raw.split(/\s+/).filter(Boolean)) {
        const trial = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
          current = trial;
        } else {
          if (current) lines.push(current);
          // Satu kata yang lebih lebar dari kartu: potong per karakter.
          if (font.widthOfTextAtSize(word, size) > maxWidth) {
            let chunk = "";
            for (const ch of word) {
              if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) chunk += ch;
              else {
                lines.push(chunk);
                chunk = ch;
              }
            }
            current = chunk;
          } else {
            current = word;
          }
        }
      }
      if (current) lines.push(current);
    }
    if (lines.length <= maxLines) return { lines: lines.length > 0 ? lines : [""], size };
  }
  // Mentok di ukuran terkecil: potong kelebihan baris.
  const lines: string[] = [];
  let size = minSize;
  for (const raw of clean.split("\n")) {
    let current = "";
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) current = trial;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (lines.length >= maxLines) break;
  }
  return { lines: lines.slice(0, maxLines), size };
}

/** Garis potong putus-putus di sekeliling kotak (koordinat dari atas). */
function drawDashedRect(
  page: ReturnType<PDFDocument["addPage"]>,
  x: number,
  yTop: number,
  w: number,
  h: number
): void {
  const dash = 6;
  const gapLen = 4;
  const step = dash + gapLen;
  const drawH = (yy: number) => {
    for (let xx = x; xx < x + w; xx += step) {
      const len = Math.min(dash, x + w - xx);
      page.drawLine({
        start: { x: xx, y: PAGE_H - yy },
        end: { x: xx + len, y: PAGE_H - yy },
        thickness: 0.75,
        color: CUT
      });
    }
  };
  const drawV = (xx: number) => {
    for (let yy = yTop; yy < yTop + h; yy += step) {
      const len = Math.min(dash, yTop + h - yy);
      page.drawLine({
        start: { x: xx, y: PAGE_H - yy },
        end: { x: xx, y: PAGE_H - (yy + len) },
        thickness: 0.75,
        color: CUT
      });
    }
  };
  drawH(yTop);
  drawH(yTop + h);
  drawV(x);
  drawV(x + w);
}

/** Teks di tengah (koordinat dari atas halaman). */
function drawCentered(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  yTop: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
): void {
  const clean = sanitize(text);
  const w = font.widthOfTextAtSize(clean, size);
  page.drawText(clean, { x: (PAGE_W - w) / 2, y: PAGE_H - yTop - size, size, font, color });
}

/**
 * Bangun PDF flashcard: semua kartu dulu (halaman kartu), lalu semua
 * jawaban (halaman jawaban). Nomor kartu sama di kedua sisi, supaya
 * setelah dipotong kartu dan jawabannya bisa dipasangkan.
 */
export async function buildFlashcardPdf(
  chapterTitle: string,
  cards: FlashcardItem[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const title = `Flashcard - ${chapterTitle}`;
  const cardPages = Math.ceil(cards.length / PER_PAGE);
  const answerPages = cardPages; // jumlah kartu sama, jadi halaman sama
  const totalPages = cardPages + answerPages;
  let pageNo = 0;

  const cardW = (PAGE_W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
  const innerPad = 14; // ruang teks dari tepi kartu

  /** Header gaya rapor di halaman pertama tiap seksi; kembalikan yTop grid. */
  function sectionHeader(page: ReturnType<PDFDocument["addPage"]>, isFirst: boolean): number {
    let y = MARGIN;
    if (!isFirst) return y;
    const ringkas = "Ringkas";
    page.drawText(ringkas, {
      x: MARGIN,
      y: PAGE_H - y - 20,
      size: 20,
      font: bold,
      color: EMERALD
    });
    y += 26;
    page.drawText("Rangkuman Materi SD, SMP, SMA", {
      x: MARGIN,
      y: PAGE_H - y - 10,
      size: 10,
      font: regular,
      color: GRAY
    });
    y += 16;
    const t = sanitize(title);
    page.drawText(t, { x: MARGIN, y: PAGE_H - y - 15, size: 15, font: bold, color: INK });
    y += 22;
    page.drawLine({
      start: { x: MARGIN, y: PAGE_H - y },
      end: { x: PAGE_W - MARGIN, y: PAGE_H - y },
      thickness: 2,
      color: MARIGOLD
    });
    y += 14;
    return y;
  }

  function footer(page: ReturnType<PDFDocument["addPage"]>): void {
    pageNo += 1;
    drawCentered(
      page,
      `Ringkas - ${title} - Halaman ${pageNo} dari ${totalPages}`,
      PAGE_H - 22,
      8,
      regular,
      GRAY
    );
  }

  /** Satu halaman grid (8 kartu): isAnswer = halaman jawaban. */
  function gridPage(pageCards: { card: FlashcardItem; n: number }[], isAnswer: boolean): void {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const top = sectionHeader(page, pageNo === 0 || (isAnswer && pageNo === cardPages));
    const gridH = PAGE_H - top - MARGIN - 14; // sisakan ruang footer
    const cardH = (gridH - GAP * (ROWS - 1)) / ROWS;
    pageCards.forEach((entry, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * (cardW + GAP);
      const yTop = top + row * (cardH + GAP);
      drawDashedRect(page, x, yTop, cardW, cardH);
      const cx = x + cardW / 2;
      const textW = cardW - innerPad * 2;
      // Label atas kartu.
      const label = isAnswer ? `Jawaban kartu ${entry.n}` : sanitize(chapterTitle);
      const labelLines = fitLines(label, isAnswer ? bold : regular, 9, 8, textW, 2);
      labelLines.lines.forEach((ln, li) => {
        const w = (isAnswer ? bold : regular).widthOfTextAtSize(ln, labelLines.size);
        page.drawText(ln, {
          x: cx - w / 2,
          y: PAGE_H - (yTop + 18 + li * 12) - labelLines.size,
          size: labelLines.size,
          font: isAnswer ? bold : regular,
          color: isAnswer ? EMERALD : GRAY
        });
      });
      // Isi tengah kartu (istilah besar + tebal, atau arti).
      const body = isAnswer ? entry.card.back : entry.card.front;
      const fitted = isAnswer
        ? fitLines(body, regular, 14, 10, textW, 6)
        : fitLines(body, bold, 20, 13, textW, 4);
      const blockH = fitted.lines.length * fitted.size * 1.35;
      const bodyTop = yTop + (cardH - blockH) / 2 + 6;
      fitted.lines.forEach((ln, li) => {
        const w = fitted.size
          ? (isAnswer ? regular : bold).widthOfTextAtSize(ln, fitted.size)
          : 0;
        page.drawText(ln, {
          x: cx - w / 2,
          y: PAGE_H - (bodyTop + li * fitted.size * 1.35) - fitted.size,
          size: fitted.size,
          font: isAnswer ? regular : bold,
          color: INK
        });
      });
      // Nomor kartu kecil di bawah (penanda pasangan kartu-jawaban).
      const num = `Kartu ${entry.n}`;
      const nw = regular.widthOfTextAtSize(num, 9);
      page.drawText(num, {
        x: cx - nw / 2,
        y: PAGE_H - (yTop + cardH - 14) - 9,
        size: 9,
        font: regular,
        color: GRAY
      });
    });
    footer(page);
  }

  const numbered = cards.map((card, i) => ({ card, n: i + 1 }));
  for (let p = 0; p < cardPages; p++) {
    gridPage(numbered.slice(p * PER_PAGE, (p + 1) * PER_PAGE), false);
  }
  for (let p = 0; p < answerPages; p++) {
    gridPage(numbered.slice(p * PER_PAGE, (p + 1) * PER_PAGE), true);
  }
  return doc.save();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerFlashcardRoutes(app: Hono, db: Database): void {
  app.get("/api/study/:product_id/:chapter_id/flashcards.pdf", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);
    const productId = c.req.param("product_id");
    const chapterId = c.req.param("chapter_id");
    const chapter = await db.get<Chapter>(
      "SELECT * FROM chapters WHERE id = ? AND product_id = ?",
      chapterId,
      productId
    );
    if (!chapter) return c.json({ error: "Bab tidak ditemukan." }, 404);
    // Gate SAMA PERSIS seperti worksheet: hanya pemilik LUNAS.
    if (!(await canDownloadFlashcards(db, user.id, productId))) {
      return c.json(
        { error: "Flashcard hanya untuk pemilik produk yang sudah lunas." },
        403
      );
    }
    const cards = await db.all<Flashcard>(
      "SELECT * FROM flashcards WHERE chapter_id = ? ORDER BY id",
      chapterId
    );
    if (cards.length === 0) {
      return c.json({ error: "Bab ini belum punya flashcard untuk dicetak." }, 400);
    }
    const pdf = await buildFlashcardPdf(
      chapter.title,
      cards.map((f) => ({ front: f.front, back: f.back }))
    );
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="flashcard-${chapter.id}.pdf"`
    });
  });
}
