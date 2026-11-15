// feedback.ts — umpan balik lembut untuk jawaban benar: bunyi chime via
// WebAudio (tanpa file audio) + getar singkat. Semua fungsi aman dipanggil
// berulang dan tidak pernah throw.
//
// Pengaturan suara: key `sound_enabled` (0/1, default 1) di cache
// localStorage `ringkas_settings` (kontrak migrasi 0015; key ini ditulis
// oleh SoundToggle dan — setelah migrasi — oleh settings.ts). Bila settings
// belum termuat / key belum ada, suara dianggap AKTIF.

const CACHE_KEY = "ringkas_settings";

/** True bila suara aktif; default AKTIF bila settings belum termuat. */
export function isSoundEnabled(): boolean {
	try {
		if (typeof localStorage === "undefined") return true;
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return true;
		const parsed = JSON.parse(raw) as { sound_enabled?: unknown };
		if (parsed.sound_enabled === undefined || parsed.sound_enabled === null) return true;
		return parsed.sound_enabled === 1 || parsed.sound_enabled === true;
	} catch {
		return true;
	}
}

let audioCtx: AudioContext | null = null;

function dapatkanAudioContext(): AudioContext | null {
	try {
		if (typeof window === "undefined") return null;
		const AC =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) return null;
		if (!audioCtx) audioCtx = new AC();
		if (audioCtx.state === "suspended") void audioCtx.resume();
		return audioCtx;
	} catch {
		return null;
	}
}

function nada(
	ctx: AudioContext,
	frekuensi: number,
	mulaiPada: number,
	durasi: number,
	volume: number
): void {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = "sine";
	osc.frequency.value = frekuensi;
	// Fade-in/out singkat supaya tidak berbunyi "klik".
	gain.gain.setValueAtTime(0, mulaiPada);
	gain.gain.linearRampToValueAtTime(volume, mulaiPada + 0.02);
	gain.gain.exponentialRampToValueAtTime(0.0001, mulaiPada + durasi);
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.start(mulaiPada);
	osc.stop(mulaiPada + durasi + 0.05);
}

/**
 * Bunyi lembut dua nada sinus: E5 (659,25 Hz) lalu A5 (880 Hz),
 * volume kecil (~0,05), durasi total < 0,5 detik.
 * Tidak memeriksa pengaturan suara — pemanggil yang memutuskan
 * (lihat feedbackBenar). Tidak pernah throw.
 */
export function playCorrectChime(): void {
	try {
		const ctx = dapatkanAudioContext();
		if (!ctx) return;
		const t0 = ctx.currentTime + 0.01;
		nada(ctx, 659.25, t0, 0.18, 0.05);
		nada(ctx, 880.0, t0 + 0.14, 0.22, 0.05);
	} catch {
		/* Suara gagal tidak boleh merusak halaman. */
	}
}

/**
 * Getar dengan pola tertentu bila perangkat mendukung navigator.vibrate.
 * Tanpa error bila tidak didukung. Tidak pernah throw.
 */
export function vibrate(pattern: number | number[]): void {
	try {
		if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
		navigator.vibrate(pattern);
	} catch {
		/* Abaikan. */
	}
}

/**
 * Umpan balik untuk jawaban benar: bila suara AKTIF (key `sound_enabled`,
 * default AKTIF bila settings belum termuat) → mainkan chime + getar
 * singkat [15]. Bila suara MATI → tidak ada bunyi maupun getar.
 * Aman dipanggil berulang; tidak pernah throw.
 */
export function feedbackBenar(): void {
	try {
		if (!isSoundEnabled()) return;
		playCorrectChime();
		vibrate(15);
	} catch {
		/* Abaikan. */
	}
}
