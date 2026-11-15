import PDFDocument from "pdfkit";
import type { Chapter, Order, Product, QuestionRow } from "./db.js";

// ---------------------------------------------------------------------------
// PDF: struk, worksheet, dan rangkuman produk. Font standar Helvetica.
// Semua fungsi mengembalikan Promise<Buffer> (pdfkit bekerja lewat stream).
// ---------------------------------------------------------------------------

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

function rupiah(n: number): string {
  return `Rp${n.toLocaleString("id-ID")}`;
}

function formatTanggal(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short" });
}

function toBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      build(doc);
    } catch (err) {
      reject(err);
      return;
    }
    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, title: string): void {
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#2273d8").text("Ringkas", { align: "left" });
  doc.font("Helvetica").fontSize(10).fillColor("#555555").text("Rangkuman Materi SD, SMP, SMA", { align: "left" });
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111").text(title);
  doc.moveDown(0.5);
  doc.strokeColor("#2273d8").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);
}

function keyValue(doc: PDFKit.PDFDocument, key: string, value: string): void {
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text(key, { continued: true });
  doc.font("Helvetica").fontSize(11).text(`  ${value}`);
  doc.moveDown(0.25);
}

/** Struk A4 dari data order asli. */
export function receiptPdf(order: ReceiptOrder, items: ReceiptItem[]): Promise<Buffer> {
  return toBuffer((doc) => {
    header(doc, "Struk Pembayaran");
    keyValue(doc, "No. Order:", order.id);
    keyValue(doc, "Tanggal dibuat:", formatTanggal(order.created_at));
    keyValue(doc, "Tanggal bayar:", formatTanggal(order.paid_at));
    keyValue(doc, "Pembeli:", `${order.buyer_name ?? "-"} (${order.buyer_email ?? "-"})`);
    keyValue(doc, "Metode:", "KlikQRIS");
    keyValue(doc, "Status:", "LUNAS");
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111").text("Produk");
    doc.moveDown(0.25);
    for (const it of items) {
      doc.font("Helvetica").fontSize(11).text(it.title, { continued: true });
      doc.font("Helvetica").fontSize(11).text(rupiah(it.price), { align: "right" });
      doc.moveDown(0.25);
    }
    doc.moveDown(0.5);
    const totalAmount = order.total_amount ?? order.total;
    const kodeUnik = totalAmount - order.total;
    keyValue(doc, "Total produk:", rupiah(order.total));
    keyValue(doc, "Kode unik:", rupiah(kodeUnik));
    doc.font("Helvetica-Bold").fontSize(12).text(`Total bayar:  ${rupiah(totalAmount)}`);
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(10).fillColor("#555555").text("Terima kasih sudah belajar bersama Ringkas.");
  });
}

function renderOptions(doc: PDFKit.PDFDocument, q: QuestionRow): void {
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
        doc.font("Helvetica").fontSize(11).text(`${letters[i] ?? String(i + 1)}. ${opt}`);
      }
    });
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as { left?: unknown; right?: unknown };
    if (Array.isArray(obj.left) && Array.isArray(obj.right)) {
      const letters = ["a", "b", "c", "d", "e"];
      doc.font("Helvetica").fontSize(11).text("Kolom kiri:");
      obj.left.forEach((item, i) => {
        if (typeof item === "string") doc.font("Helvetica").fontSize(11).text(`  ${i + 1}. ${item}`);
      });
      doc.font("Helvetica").fontSize(11).text("Kolom kanan:");
      obj.right.forEach((item, i) => {
        if (typeof item === "string") doc.font("Helvetica").fontSize(11).text(`  ${letters[i] ?? String(i + 1)}. ${item}`);
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
        .map(([k, v]) => `${Number(k) + 1} → ${String(v)}`)
        .join("; ");
    }
  } catch {
    // bukan JSON — pakai apa adanya
  }
  return q.answer;
}

/** Worksheet bab: soal + kunci jawaban di halaman terakhir. */
export function worksheetPdf(chapter: Chapter, questions: QuestionRow[]): Promise<Buffer> {
  return toBuffer((doc) => {
    header(doc, `Worksheet — ${chapter.title}`);
    doc.font("Helvetica").fontSize(11).fillColor("#111111").text(chapter.summary || "");
    doc.moveDown(1);
    questions.forEach((q, i) => {
      doc.font("Helvetica-Bold").fontSize(11).text(`${i + 1}. ${q.question}`);
      doc.moveDown(0.25);
      renderOptions(doc, q);
      doc.moveDown(0.75);
    });

    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111").text("Kunci Jawaban");
    doc.moveDown(1);
    questions.forEach((q, i) => {
      doc.font("Helvetica-Bold").fontSize(11).text(`${i + 1}. ${renderAnswer(q)}`);
      if (q.discussion) {
        doc.font("Helvetica").fontSize(10).fillColor("#555555").text(`   ${q.discussion}`);
      }
      doc.moveDown(0.5);
    });
  });
}

/** PDF rangkuman produk: deskripsi + bab beserta poin intinya. */
export function productPdf(product: Product, chapters: Chapter[]): Promise<Buffer> {
  return toBuffer((doc) => {
    header(doc, product.title);
    keyValue(doc, "Jenjang:", product.jenjang);
    keyValue(doc, "Mata pelajaran:", product.mapel);
    if (product.pages > 0) keyValue(doc, "Halaman:", String(product.pages));
    keyValue(doc, "Harga:", rupiah(product.price));
    doc.moveDown(0.5);
    if (product.description) {
      doc.font("Helvetica").fontSize(11).fillColor("#111111").text(product.description);
      doc.moveDown(1);
    }
    for (const ch of chapters) {
      doc.font("Helvetica-Bold").fontSize(13).text(ch.title);
      doc.moveDown(0.25);
      if (ch.summary) {
        doc.font("Helvetica").fontSize(11).text(ch.summary);
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
        doc.font("Helvetica").fontSize(11).text(`•  ${p}`);
      }
      doc.moveDown(0.75);
    }
  });
}
