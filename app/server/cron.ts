// cron.ts — pekerjaan terjadwal email Ringkas (dipanggil dari scheduled
// handler Cloudflare Worker di server/worker.ts, dan dari endpoint admin
// manual POST /api/admin/cron/run untuk pengujian).
//
//   daily  (00:00 UTC = 07:00 WIB): pengingat bila anak 3 hari tidak
//     belajar + ucapan milestone streak 7/14/21/28 hari.
//   weekly (Minggu 11:00 UTC = 18:00 WIB): laporan mingguan orang tua.
//
// Idempotensi lewat kolom period di sent_emails (migrasi 0005): kunci
// periode gabungan per anak, mis. 'reminder:usr-XXX:2026-11-15' atau
// 'weekly:usr-XXX:2026-W46'. Satu (orang tua, template, periode) hanya
// terkirim sekali; jalan kedua di periode yang sama menjadi no-op.
// Semua pengiriman mengikuti pola email.ts: tanpa RESEND_API_KEY maka
// dilewati + log (skipped), tidak pernah melempar.
import type { DB, User } from "./database.js";
import {
  formatTanggal,
  sendReminderEmail,
  sendStreakEmail,
  sendWeeklyReportEmail,
  type WeeklyReportVariables
} from "./email.js";
import { sendWeeklyWhatsApp } from "./whatsapp.js";

export interface CronRunResult {
  job: string;
  sent: number;
  skipped: number;
  errors: string[];
}

const STREAK_MILESTONES = [7, 14, 21, 28];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function computeStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  let streak = 0;
  const d = new Date(`${today}T12:00:00Z`);
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (!set.has(iso)) break;
    streak += 1;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

/** Kunci minggu ISO "2026-W46" untuk tanggal tertentu (UTC). */
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Senin = 0
  date.setUTCDate(date.getUTCDate() - day + 3); // Kamis minggu itu
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function mondayOfWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

const BULAN_SINGKAT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

/** "10 Nov 2026 – 16 Nov 2026" (Senin–Minggu minggu berjalan). */
export function weekRangeLabel(now: Date): string {
  const mon = mondayOfWeek(now);
  const sun = new Date(mon);
  sun.setUTCDate(sun.getUTCDate() + 6);
  const f = (x: Date) => `${x.getUTCDate()} ${BULAN_SINGKAT[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
  return `${f(mon)} – ${f(sun)}`;
}

/** "Senin, 10 November 2026" dari tanggal 'YYYY-MM-DD' (tanpa jam). */
function formatHari(isoDay: string): string {
  return formatTanggal(`${isoDay}T00:00:00`).replace(/, \d{2}:\d{2} WIB$/, "");
}

interface LinkedChild {
  parent: User;
  child: User;
  daily_target: number;
}

async function linkedChildren(db: DB): Promise<LinkedChild[]> {
  const links = await db.all<{
    parent_user_id: string;
    child_user_id: string;
    daily_target: number;
  }>(
    "SELECT parent_user_id, child_user_id, daily_target FROM parent_links WHERE redeemed = 1 AND child_user_id IS NOT NULL"
  );
  const out: LinkedChild[] = [];
  for (const l of links) {
    const [parent, child] = await Promise.all([
      db.get<User>("SELECT * FROM users WHERE id = ?", l.parent_user_id),
      db.get<User>("SELECT * FROM users WHERE id = ?", l.child_user_id)
    ]);
    if (parent && child) out.push({ parent, child, daily_target: l.daily_target });
  }
  return out;
}

async function studyDates(db: DB, userId: string): Promise<string[]> {
  return (
    await db.all<{ date: string }>(
      "SELECT date FROM study_days WHERE user_id = ? ORDER BY date DESC",
      userId
    )
  ).map((r) => r.date);
}

/** Pekerjaan harian: pengingat + ucapan milestone streak. */
export async function runDailyJob(db: DB, now: Date = new Date()): Promise<CronRunResult> {
  const today = isoDate(now);
  const result: CronRunResult = { job: "daily", sent: 0, skipped: 0, errors: [] };
  for (const { parent, child } of await linkedChildren(db)) {
    try {
      const dates = await studyDates(db, child.id);
      const last = dates[0] ?? null;
      const daysSince = last
        ? daysBetween(last, today)
        : daysBetween(child.created_at.slice(0, 10), today);
      if (daysSince >= 3) {
        const r = await sendReminderEmail(db, {
          parent,
          child,
          daysSince,
          lastStudyLabel: last ? formatHari(last) : "belum pernah belajar",
          period: `reminder:${child.id}:${today}`
        });
        if (r.sent) result.sent += 1;
        else result.skipped += 1;
      }
      const streak = computeStreak(dates, today);
      if (STREAK_MILESTONES.includes(streak)) {
        const r = await sendStreakEmail(db, {
          parent,
          child,
          streak,
          period: `streak:${child.id}:${streak}:${today}`
        });
        if (r.sent) result.sent += 1;
        else result.skipped += 1;
      }
    } catch (err) {
      result.errors.push(`${child.id}: ${err instanceof Error ? err.message : "gagal"}`);
    }
  }
  return result;
}

export async function buildWeeklyReport(
  db: DB,
  childId: string,
  dailyTarget: number,
  weekStart: string,
  weekEnd: string,
  now: Date
): Promise<WeeklyReportVariables> {
  const doneThisWeek = (
    await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM tracker WHERE user_id = ? AND substr(done_at, 1, 10) BETWEEN ? AND ?",
      childId,
      weekStart,
      weekEnd
    )
  )?.n ?? 0;

  const simAttempts = await db.all<{
    ref_id: string;
    score: number;
    max_score: number;
    title: string | null;
    subject: string | null;
  }>(
    `SELECT a.ref_id, a.score, a.max_score, s.title, s.subject
     FROM quiz_attempts a LEFT JOIN simulations s ON s.id = a.ref_id
     WHERE a.user_id = ? AND a.kind = 'simulation'
       AND substr(a.created_at, 1, 10) BETWEEN ? AND ?
     ORDER BY a.created_at DESC`,
    childId,
    weekStart,
    weekEnd
  );
  const pcts = simAttempts
    .filter((a) => a.max_score > 0)
    .map((a) => Math.round((a.score / a.max_score) * 100));
  const rataSimulasi = pcts.length > 0 ? String(Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)) : "0";

  const bySubject = new Map<string, { sum: number; n: number }>();
  for (const a of simAttempts) {
    if (a.max_score <= 0 || !a.subject) continue;
    const cur = bySubject.get(a.subject) ?? { sum: 0, n: 0 };
    cur.sum += (a.score / a.max_score) * 100;
    cur.n += 1;
    bySubject.set(a.subject, cur);
  }
  let babLemah = "Belum ada simulasi minggu ini";
  let worst = Infinity;
  for (const [subject, v] of bySubject) {
    const avg = v.sum / v.n;
    if (avg < worst) {
      worst = avg;
      babLemah = `${subject} (rata-rata ${Math.round(avg)}%)`;
    }
  }

  const best = simAttempts.length > 0 ? Math.max(...pcts) : null;
  const bestTitle = simAttempts.find(
    (a) => a.max_score > 0 && Math.round((a.score / a.max_score) * 100) === best
  )?.title;
  const pencapaian1 =
    best !== null
      ? `Skor tertinggi ${best}%${bestTitle ? ` di ${bestTitle}` : ""}`
      : doneThisWeek > 0
        ? `Menyelesaikan ${doneThisWeek} bab minggu ini`
        : "Mulai langkah pertamanya minggu ini";
  const streak = computeStreak(await studyDates(db, childId), isoDate(now));
  const pencapaian2 =
    doneThisWeek > 0
      ? `Menyelesaikan ${doneThisWeek} bab minggu ini`
      : streak > 0
        ? `Streak belajar ${streak} hari`
        : "Belum ada aktivitas minggu ini — ayo mulai lagi";

  return {
    bab_selesai: String(doneThisWeek),
    streak_hari: String(streak),
    rata_simulasi: rataSimulasi,
    pencapaian_1: pencapaian1,
    pencapaian_2: pencapaian2,
    bab_lemah: babLemah,
    target_harian: dailyTarget > 0 ? `${dailyTarget} soal per hari` : "Belum diatur",
    periode_minggu: weekRangeLabel(now)
  };
}

/** Pekerjaan mingguan: laporan belajar tiap anak tertaut ke orang tuanya. */
export async function runWeeklyJob(db: DB, now: Date = new Date()): Promise<CronRunResult> {
  const result: CronRunResult = { job: "weekly", sent: 0, skipped: 0, errors: [] };
  const weekKey = isoWeekKey(now);
  const mon = mondayOfWeek(now);
  const sun = new Date(mon);
  sun.setUTCDate(sun.getUTCDate() + 6);
  const weekStart = isoDate(mon);
  const weekEnd = isoDate(sun);
  for (const { parent, child, daily_target } of await linkedChildren(db)) {
    try {
      const report = await buildWeeklyReport(db, child.id, daily_target, weekStart, weekEnd, now);
      const r = await sendWeeklyReportEmail(db, {
        parent,
        child,
        report,
        period: `weekly:${child.id}:${weekKey}`
      });
      if (r.sent) result.sent += 1;
      else result.skipped += 1;
      // Laporan WhatsApp: isi yang sama, setelah email — email tetap
      // jalan walau WhatsApp belum dikonfigurasi / gagal.
      const w = await sendWeeklyWhatsApp(db, { parent, child, report, weekKey });
      if (w.sent) result.sent += 1;
      else result.skipped += 1;
    } catch (err) {
      result.errors.push(`${child.id}: ${err instanceof Error ? err.message : "gagal"}`);
    }
  }
  return result;
}

/**
 * Tanggal uji untuk endpoint admin manual: 'YYYY-MM-DD' → tengah hari UTC
 * hari itu (menghindari tepi zona waktu); tanpa tanggal → sekarang.
 */
export function jobDate(dateStr?: string): Date {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T12:00:00Z`);
  }
  return new Date();
}
