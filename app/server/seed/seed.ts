// seed.ts — mengisi database kosong dengan produk, bab, kartu, kuis bab,
// dan simulasi SAS dari ./products.ts dan ./study.ts.
//
// Idempotent: tidak berbuat apa-apa bila tabel products sudah berisi baris.
import { nowIso } from "../database.js";
import type { DB } from "../database.js";
import { PRODUCTS } from "./products.js";
import {
  CHAPTERS,
  SIM_MINUTES,
  SIM_SUBJECTS,
  SUBJECT_SLUG,
  buildMtkSdQuestions,
  buildSasK1S1Questions,
  buildSimulationQuestions,
} from "./study.js";
import type { GeneratedQuestion } from "./study.js";

async function insertQuestion(
  db: DB,
  q: GeneratedQuestion,
  sortOrder: number,
  chapterId: string | null,
  simulationId: string | null,
  subject: string,
  grade: number
): Promise<void> {
  await db.run(
    `INSERT INTO questions
       (chapter_id, simulation_id, type, question, options, answer, discussion, subject, grade, points, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    chapterId,
    simulationId,
    q.type,
    q.question,
    q.options === null ? null : JSON.stringify(q.options),
    typeof q.answer === "string" ? q.answer : JSON.stringify(q.answer),
    q.discussion,
    subject,
    grade,
    q.points,
    sortOrder
  );
}

async function insertSimulation(
  db: DB,
  id: string,
  productId: string | null,
  subject: string,
  grade: number,
  paket: string,
  title: string,
  totalMinutes: number,
  questions: GeneratedQuestion[],
  now: string
): Promise<void> {
  const maxPoints = questions.reduce((sum, q) => sum + q.points, 0);
  await db.run(
    `INSERT INTO simulations
       (id, product_id, subject, grade, paket, title, total_minutes, max_points, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    productId,
    subject,
    grade,
    paket,
    title,
    totalMinutes,
    maxPoints,
    now
  );
  for (let i = 0; i < questions.length; i++) {
    await insertQuestion(db, questions[i], i, null, id, subject, grade);
  }
}

export async function seedDatabase(db: DB): Promise<void> {
  const existing = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM products");
  if (existing && existing.n > 0) return;

  const now = nowIso();
  await db.transaction(async () => {
    // ---- Produk -----------------------------------------------------------
    for (const p of PRODUCTS) {
      await db.run(
        `INSERT INTO products
           (id, title, jenjang, mapel, price, strikethrough_price, pages,
            cover_label, cover_color, badge, active, category, description,
            external_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.title,
        p.jenjang,
        p.mapel,
        p.price,
        p.strikethrough_price,
        p.pages,
        p.cover_label,
        p.cover_color,
        p.badge,
        p.active,
        p.category,
        p.description,
        p.external_url,
        now
      );
    }

    // ---- Bab + kartu + kuis bab -------------------------------------------
    for (const ch of CHAPTERS) {
      await db.run(
        `INSERT INTO chapters
           (id, product_id, title, subject, grade, semester, summary, points,
            focus_text, video_url, video_duration, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ch.id,
        ch.product_id,
        ch.title,
        ch.subject,
        ch.grade,
        ch.semester,
        ch.summary,
        JSON.stringify(ch.points),
        ch.focus_text,
        null,
        null,
        ch.sort_order
      );
      for (const fc of ch.flashcards) {
        await db.run(
          "INSERT INTO flashcards (chapter_id, front, back) VALUES (?, ?, ?)",
          ch.id,
          fc.front,
          fc.back
        );
      }
      for (let i = 0; i < ch.quiz.length; i++) {
        await insertQuestion(db, ch.quiz[i], i, ch.id, null, ch.subject, ch.grade);
      }
    }

    // ---- Simulasi SAS produk k1–k6 (Paket A saja) -------------------------
    for (let grade = 1; grade <= 6; grade++) {
      const productId = `k${grade}`;
      for (const subject of SIM_SUBJECTS[grade]) {
        const simId = `sim-${productId}-${SUBJECT_SLUG[subject]}-a`;
        await insertSimulation(
          db,
          simId,
          productId,
          subject,
          grade,
          "A",
          `Simulasi SAS ${subject} Kelas ${grade}`,
          SIM_MINUTES[grade],
          buildSimulationQuestions(subject, grade, "A"),
          now
        );
      }
    }

    // ---- Simulasi sas-k1-s1 (5 mapel × Paket A/B, @30 soal, maks 100) -----
    for (const subject of ["Matematika", "B. Indonesia", "Pancasila", "B. Inggris", "PJOK"]) {
      for (const paket of ["A", "B"] as const) {
        const simId = `sim-sas-k1-s1-${SUBJECT_SLUG[subject]}-${paket.toLowerCase()}`;
        await insertSimulation(
          db,
          simId,
          "sas-k1-s1",
          subject,
          1,
          paket,
          `Simulasi SAS ${subject} Kelas 1 — Paket ${paket}`,
          60,
          buildSasK1S1Questions(subject, paket),
          now
        );
      }
    }

    // ---- Simulasi mtk-sd (1 simulasi campuran Kelas 1–6) ------------------
    // grade 0 = campuran semua kelas SD (bukan satu kelas tertentu).
    await insertSimulation(
      db,
      "sim-mtk-sd-a",
      "mtk-sd",
      "Matematika",
      0,
      "A",
      "Simulasi SAS Matematika SD",
      60,
      buildMtkSdQuestions(),
      now
    );
  });
}
