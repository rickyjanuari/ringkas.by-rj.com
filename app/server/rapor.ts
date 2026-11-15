// rapor.ts — Rapor Digital Semester (PDF).
//
//   GET /api/rapor               → rapor PDF milik pengguna yang login.
//   GET /api/rapor?child_id=... → rapor PDF anak, HANYA bila ada baris
//                                 parent_links yang menghubungkan orang tua
//                                 ini dengan anak itu (redeemed = 1).
//                                 Tanpa hubungan itu → 403.
//
// Tanpa login → 401. Anak tidak ditemukan → 404.
//
// Data diambil dari quiz_attempts (kind = 'simulation', digabung dengan
// tabel simulations), tracker, dan study_days — sama seperti /api/tracker
// dan /api/prediction di actions.ts. Prediksi nilai SAS memakai rumus
// yang SAMA seperti /api/prediction (rata-rata BERBOBOT per mapel:
// simulasi lama berbobot 1, makin baru makin berat; simulasi terbaru
// paling menentukan). Rumusnya diduplikasi di sini, bukan diimpor dari
// actions.ts — actions.ts menarik bcryptjs, node:crypto, email, dan
// modul seed, yang tidak boleh ikut ter-bundle ke modul ini.
//
// Periode rapor dihitung dari tanggal unduh (zona Asia/Jakarta):
// Juli–Desember → Semester 1 tahun ajaran YYYY/YYYY+1;
// Januari–Juni  → Semester 2 tahun ajaran (YYYY-1)/YYYY.
// Kelas diturunkan dari data belajar: mapel simulasi yang paling sering
// dikerjakan; bila belum ada simulasi, dari bab yang sudah selesai;
// bila belum ada keduanya, rapor menampilkan "-" (bukan tebakan).
//
// Didaftarkan koordinator di server/app.ts lewat registerRaporRoutes(app, db).

import { Hono, type Context } from "hono";
import { type Database, type User } from "./database.js";
import { raporPdf, type RaporData, type RaporSubject } from "./pdf.js";

/** Helper auth — cerminan authUser di actions.ts (Bearer → sessions → users). */
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

/** Streak hari belajar — cerminan computeStreak di actions.ts. */
function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  let streak = 0;
  const d = new Date();
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (!set.has(iso)) break;
    streak += 1;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

/** "15 Nov 2026" — label tanggal pendek untuk daftar nilai. */
function formatHariPendek(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/** "15 November 2026" — label tanggal pembuatan rapor. */
function formatHariPanjang(d: Date): string {
  return d.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

/**
 * Periode semester dari tanggal unduh (Asia/Jakarta).
 * Jul–Des → "Semester 1 - Tahun Ajaran 2026/2027";
 * Jan–Jun → "Semester 2 - Tahun Ajaran 2025/2026".
 */
function semesterPeriod(now: Date): string {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "numeric"
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? now.getFullYear());
  const month = Number(parts.find((p) => p.type === "month")?.value ?? now.getMonth() + 1);
  if (month >= 7) {
    return `Semester 1 - Tahun Ajaran ${year}/${year + 1}`;
  }
  return `Semester 2 - Tahun Ajaran ${year - 1}/${year}`;
}

interface SimAttempt {
  ref_id: string;
  score: number;
  max_score: number;
  created_at: string;
  subject: string;
  grade: number;
  product_id: string | null;
  title: string;
}

/** Susun seluruh isi rapor untuk satu pengguna. */
async function buildRaporData(db: Database, target: User): Promise<RaporData> {
  const days = (
    await db.all<{ date: string }>(
      "SELECT date FROM study_days WHERE user_id = ? ORDER BY date DESC",
      target.id
    )
  ).map((r) => r.date);
  const doneRows = await db.all<{ chapter_id: string }>(
    "SELECT chapter_id FROM tracker WHERE user_id = ?",
    target.id
  );
  const done = new Set(doneRows.map((r) => r.chapter_id));

  const attempts = await db.all<SimAttempt>(
    `SELECT qa.ref_id, qa.score, qa.max_score, qa.created_at,
            s.subject, s.grade, s.product_id, s.title
     FROM quiz_attempts qa JOIN simulations s ON s.id = qa.ref_id
     WHERE qa.user_id = ? AND qa.kind = 'simulation'
     ORDER BY qa.created_at ASC, qa.id ASC`,
    target.id
  );

  // Kelas: grade yang paling sering muncul di simulasi; bila belum ada
  // simulasi, grade bab yang paling sering diselesaikan.
  let grade: number | null = null;
  if (attempts.length > 0) {
    const counts = new Map<number, number>();
    for (const a of attempts) counts.set(a.grade, (counts.get(a.grade) ?? 0) + 1);
    grade = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } else if (done.size > 0) {
    const rows = await db.all<{ grade: number }>(
      `SELECT grade FROM chapters WHERE id IN (${[...done].map(() => "?").join(", ")})`,
      ...[...done]
    );
    if (rows.length > 0) {
      const counts = new Map<number, number>();
      for (const r of rows) counts.set(r.grade, (counts.get(r.grade) ?? 0) + 1);
      grade = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  // Nilai per mapel — rumus prediksi SAMA seperti /api/prediction.
  const groups = new Map<string, SimAttempt[]>();
  for (const a of attempts) {
    const key = `${a.subject}|||${a.grade}`;
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }
  const subjects: RaporSubject[] = [...groups.values()]
    .map((arr) => {
      const last = arr[arr.length - 1];
      let weighted = 0;
      let weightSum = 0;
      let simpleSum = 0;
      for (let i = 0; i < arr.length; i++) {
        const pct = arr[i].max_score > 0 ? (arr[i].score / arr[i].max_score) * 100 : 0;
        const w = i + 1;
        weighted += pct * w;
        weightSum += w;
        simpleSum += pct;
      }
      return {
        subject: last.subject,
        grade: last.grade,
        product_id: last.product_id,
        prediction: Math.round(weighted / weightSum),
        average: Math.round(simpleSum / arr.length),
        attempts: arr.length,
        latestPercent: last.max_score > 0 ? Math.round((last.score / last.max_score) * 100) : 0,
        latestAt: last.created_at,
        scores: arr.map((a) => ({
          title: a.title,
          percent: a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : 0,
          dateLabel: formatHariPendek(a.created_at)
        }))
      };
    })
    .sort((a, b) => a.prediction - b.prediction || a.subject.localeCompare(b.subject));
  const overallPrediction =
    subjects.length > 0
      ? Math.round(subjects.reduce((sum, s) => sum + (s.prediction ?? 0), 0) / subjects.length)
      : null;

  // Bab yang perlu diulang: dari 2 mapel terlemah, utamakan bab yang
  // belum selesai; bila semua sudah selesai, sarankan ulang bab awal.
  // Logika yang sama seperti /api/prediction.
  const weakChapters: RaporData["weakChapters"] = [];
  for (const s of subjects.slice(0, 2)) {
    if (weakChapters.length >= 3) break;
    let chs = s.product_id
      ? await db.all<{ id: string; product_id: string; title: string; subject: string; grade: number }>(
          "SELECT id, product_id, title, subject, grade FROM chapters WHERE product_id = ? AND subject = ? AND grade = ? ORDER BY sort_order, id",
          s.product_id,
          s.subject,
          s.grade
        )
      : [];
    if (chs.length === 0) {
      chs = await db.all<{ id: string; product_id: string; title: string; subject: string; grade: number }>(
        "SELECT id, product_id, title, subject, grade FROM chapters WHERE subject = ? AND grade = ? ORDER BY sort_order, id",
        s.subject,
        s.grade
      );
    }
    const notDone = chs.filter((ch) => !done.has(ch.id));
    const picks = (notDone.length > 0 ? notDone : chs).slice(0, 3 - weakChapters.length);
    for (const ch of picks) {
      weakChapters.push({
        title: ch.title,
        subject: ch.subject,
        grade: ch.grade,
        reason:
          notDone.length > 0
            ? `${s.subject} Kelas ${s.grade} masih ${s.prediction}% — pelajari bab ini, yuk!`
            : `${s.subject} Kelas ${s.grade} masih ${s.prediction}% — ulang lagi bab ini!`
      });
    }
  }

  const now = new Date();
  return {
    studentName: target.name,
    grade,
    period: semesterPeriod(now),
    generatedLabel: formatHariPanjang(now),
    streak: computeStreak(days),
    studyDaysCount: days.length,
    doneChapters: done.size,
    totalSimulations: attempts.length,
    overallPrediction,
    subjects,
    weakChapters
  };
}

export function registerRaporRoutes(app: Hono, db: Database): void {
  app.get("/api/rapor", async (c) => {
    const user = await authUser(c, db);
    if (!user) return c.json({ error: "Silakan login terlebih dahulu." }, 401);

    // Target rapor: diri sendiri, atau anak yang terhubung.
    const childId = (c.req.query("child_id") ?? "").trim();
    let target = user;
    if (childId && childId !== user.id) {
      const link = await db.get<{ id: string }>(
        "SELECT id FROM parent_links WHERE parent_user_id = ? AND child_user_id = ? AND redeemed = 1",
        user.id,
        childId
      );
      if (!link) {
        return c.json({ error: "Rapor anak ini tidak terhubung denganmu." }, 403);
      }
      const child = await db.get<User>("SELECT * FROM users WHERE id = ?", childId);
      if (!child) return c.json({ error: "Anak tidak ditemukan." }, 404);
      target = child;
    }

    const data = await buildRaporData(db, target);
    const pdf = await raporPdf(data);
    return c.body(Uint8Array.from(pdf), 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rapor-semester-${target.id}.pdf"`
    });
  });
}
