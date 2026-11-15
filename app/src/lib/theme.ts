// src/lib/theme.ts — mode gelap anak.
// Pilihan tema disimpan di server (lihat src/lib/settings.ts);
// file ini hanya menghitung tema efektif dan memantau sistem.

/** Pilihan mode gelap anak: terang, gelap, atau ikut sistem perangkat. */
export type ThemePref = "light" | "dark" | "system";

/** Nilai theme yang sah; selain ini dianggap 'system' saat normalisasi. */
export const THEME_VALUES: readonly ThemePref[] = ["light", "dark", "system"];

export function isThemePref(v: unknown): v is ThemePref {
	return typeof v === "string" && (THEME_VALUES as readonly string[]).includes(v);
}

/** Apakah sistem perangkat sedang dalam mode gelap (aman di SSR). */
export function isSystemDark(): boolean {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	try {
		return window.matchMedia("(prefers-color-scheme: dark)").matches;
	} catch {
		return false;
	}
}

/** Tema efektif: 'dark'/'light' langsung dipakai; 'system' ikut perangkat. */
export function resolveTheme(pref: ThemePref): "light" | "dark" {
	if (pref === "dark") return "dark";
	if (pref === "light") return "light";
	return isSystemDark() ? "dark" : "light";
}

export type SystemThemeListener = () => void;

/**
 * Pantau perubahan mode gelap sistem (mis. pengguna mengganti tema
 * perangkat). Callback dipanggil setiap kali matchMedia berubah;
 * pemanggil (applySettings) yang memutuskan apakah perlu menerapkan
 * ulang — hanya bila pref pengguna = 'system'.
 * Mengembalikan fungsi berhenti memantau (untuk onDestroy).
 */
export function watchSystemTheme(cb: SystemThemeListener): () => void {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return () => {};
	}
	let mq: MediaQueryList;
	try {
		mq = window.matchMedia("(prefers-color-scheme: dark)");
	} catch {
		return () => {};
	}
	const handler = () => cb();
	if (typeof mq.addEventListener === "function") {
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}
	// Fallback Safari lama (addListener/removeListener).
	mq.addListener(handler);
	return () => mq.removeListener(handler);
}
