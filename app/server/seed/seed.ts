// seed.ts — mengisi database kosong dengan produk, bab, kartu, kuis bab,
// dan simulasi SAS dari ./products.ts dan ./study.ts.
//
// Idempotent: tidak berbuat apa-apa bila tabel products sudah berisi baris.
import { nowIso } from "../database.js";
import type { DB } from "../database.js";
import { BUNDLES, PRODUCTS } from "./products.js";
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
import { ANBK_SIMULATIONS } from "./anbk.js";

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
  // Guard: jangan seed ulang bila produk inti sudah ada. (Jangan pakai
  // COUNT(*) — migrasi 0005 meng-insert 6 produk bundel SEBELUM seed
  // jalan di database baru, jadi COUNT > 0 padahal seed belum jalan.)
  const existing = await db.get<{ id: string }>("SELECT id FROM products WHERE id = 'k1'");
  if (existing) return;

  const now = nowIso();
  await db.transaction(async () => {
    // ---- Produk -----------------------------------------------------------
    // INSERT OR IGNORE: 6 produk bundel sudah di-insert oleh migrasi 0005
    // (yang jalan sebelum seed di database baru) — jangan gagal karenanya.
    for (const p of PRODUCTS) {
      await db.run(
        `INSERT OR IGNORE INTO products
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

    // ---- Anggota bundel (bundle_members) ----------------------------------
    for (const b of BUNDLES) {
      for (const memberId of b.members) {
        await db.run(
          "INSERT OR IGNORE INTO bundle_members (bundle_product_id, product_id) VALUES (?, ?)",
          b.bundleId,
          memberId
        );
      }
    }

    // ---- Bab + kartu + kuis bab -------------------------------------------
    for (const ch of CHAPTERS) {
      await db.run(
        `INSERT INTO chapters
           (id, product_id, title, subject, grade, semester, summary, points,
            focus_text, video_url, video_duration, short_url, short_duration, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ch.short_url ?? null,
        ch.short_duration ?? null,
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

    // ---- Simulasi ANBK Kelas 5 (Literasi + Numerasi) ------------------
    // Hanya jalan di DB baru (guard k1 di atas); DB yang sudah ter-seed
    // memakai migrasi 0012 (id soal eksplisit 10000+ di sana).
    // PENTING: migrasi 0012 juga jalan SEBELUM seed di database baru
    // (dump-seed-sql menjalankan migrate() dulu), jadi lewati simulasi
    // yang sudah ada — kalau tidak, INSERT menabrak UNIQUE simulations.id
    // dan soal ANBK masuk dua kali (id migrasi 10000+ vs id auto seed).
    for (const sim of ANBK_SIMULATIONS) {
      const already = await db.get<{ id: string }>(
        "SELECT id FROM simulations WHERE id = ?",
        sim.id
      );
      if (already) continue;
      await insertSimulation(
        db,
        sim.id,
        sim.product_id,
        sim.subject,
        sim.grade,
        sim.paket,
        sim.title,
        sim.total_minutes,
        sim.questions,
        now
      );
    }
  });
}
