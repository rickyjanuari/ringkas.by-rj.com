// whatsapp.ts — Laporan Mingguan Orang Tua via WhatsApp (FITUR KETERLIBATAN 6).
//
// Mengirim laporan mingguan yang SAMA seperti email (WeeklyReportVariables
// dari email.ts) lewat WhatsApp Cloud API (template message). Dipanggil
// dari cron mingguan (runWeeklyJob) SETELAH email terkirim — email tetap
// jalan walau WhatsApp gagal atau belum dikonfigurasi.
//
// Idempotensi lewat wa_sent_log (migrasi 0013): klaim (child_id,
// week_key) dulu (INSERT OR IGNORE), baru kirim; sukses -> isi
// message_id; gagal -> hapus klaim supaya percobaan berikut bisa
// mengirim lagi. TIDAK PERNAH melempar — semua kegagalan dikembalikan
// sebagai {sent: false, ...}.
//
// Template pesan TIDAK dibuat di sini (dibuat + disetujui pemilik di
// Meta for Developers — lihat README): nama bawaan 'laporan_mingguan',
// bahasa 'id', 6 parameter body berurutan: nama anak, periode minggu,
// bab selesai, streak hari, rata-rata simulasi, bab yang perlu diulang.
// Nomor orang tua diambil dari users.whatsapp dan harus format
// internasional Indonesia /^62\d{9,14}$/ (tanpa tanda +, tanpa spasi).

import { getEnv } from "./env.js";
import type { Database, User } from "./database.js";
import { nowIso } from "./database.js";
import type { WeeklyReportVariables } from "./email.js";

export interface SendWhatsAppResult {
  sent: boolean;
  messageId?: string;
  skipped?: "no-config" | "no-number" | "already-sent";
  error?: string;
}

/** Nomor WhatsApp harus format internasional Indonesia, tanpa + / spasi. */
export const WA_NUMBER_RE = /^62\d{9,14}$/;

export function isValidWaNumber(value: string | null | undefined): boolean {
  return typeof value === "string" && WA_NUMBER_RE.test(value.trim());
}

interface GraphResponse {
  messages?: { id: string }[];
  error?: { message?: string; code?: number };
}

/**
 * Kirim laporan mingguan satu anak ke orang tuanya lewat template
 * WhatsApp. Tidak pernah melempar.
 */
export async function sendWeeklyWhatsApp(
  db: Database,
  opts: {
    parent: User;
    child: User;
    report: WeeklyReportVariables;
    weekKey: string;
  }
): Promise<SendWhatsAppResult> {
  const { parent, child, report, weekKey } = opts;
  try {
    const env = getEnv();
    const token = (env.whatsappToken ?? "").trim();
    const phoneNumberId = (env.whatsappPhoneNumberId ?? "").trim();
    const templateName = (env.whatsappTemplateName ?? "").trim() || "laporan_mingguan";
    if (!token || !phoneNumberId) {
      console.log("[whatsapp] belum dikonfigurasi — dilewati");
      return { sent: false, skipped: "no-config" };
    }
    const to = (parent.whatsapp ?? "").trim();
    if (!isValidWaNumber(to)) {
      console.log(`[whatsapp] nomor orang tua anak ${child.id} kosong/tidak valid — dilewati`);
      return { sent: false, skipped: "no-number" };
    }
    // Klaim dulu (idempotensi per anak per minggu).
    let claimed = false;
    try {
      const r = await db.run(
        "INSERT OR IGNORE INTO wa_sent_log (child_id, week_key, message_id, sent_at) VALUES (?, ?, NULL, ?)",
        child.id,
        weekKey,
        nowIso()
      );
      claimed = r.changes > 0;
    } catch (err) {
      console.error("[whatsapp] gagal memeriksa wa_sent_log:", err);
      return { sent: false, error: "Tabel wa_sent_log belum tersedia." };
    }
    if (!claimed) {
      return { sent: false, skipped: "already-sent" };
    }
    let messageId = "";
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
              name: templateName,
              language: { code: "id" },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: child.name },
                    { type: "text", text: report.periode_minggu },
                    { type: "text", text: report.bab_selesai },
                    { type: "text", text: report.streak_hari },
                    { type: "text", text: report.rata_simulasi },
                    { type: "text", text: report.bab_lemah }
                  ]
                }
              ]
            }
          })
        }
      );
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          body &&
          typeof body === "object" &&
          (body as GraphResponse).error?.message
            ? (body as GraphResponse).error!.message!
            : `WhatsApp gagal (HTTP ${res.status})`;
        throw new Error(msg);
      }
      const parsed = body as GraphResponse | null;
      messageId = parsed?.messages?.[0]?.id ?? "";
      if (!messageId) throw new Error("WhatsApp tidak mengembalikan message id.");
    } catch (err) {
      // Kirim gagal -> hapus klaim supaya percobaan berikut bisa mengirim.
      await db
        .run("DELETE FROM wa_sent_log WHERE child_id = ? AND week_key = ?", child.id, weekKey)
        .catch(() => undefined);
      const msg = err instanceof Error ? err.message : "Gagal mengirim WhatsApp.";
      console.error(`[whatsapp] gagal mengirim laporan anak ${child.id}: ${msg}`);
      return { sent: false, error: msg };
    }
    await db
      .run(
        "UPDATE wa_sent_log SET message_id = ? WHERE child_id = ? AND week_key = ?",
        messageId,
        child.id,
        weekKey
      )
      .catch(() => undefined);
    console.log(`[whatsapp] terkirim laporan anak ${child.id} (message ${messageId})`);
    return { sent: true, messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengirim WhatsApp.";
    console.error("[whatsapp] gagal:", msg);
    return { sent: false, error: msg };
  }
}
