// src/lib/settings.ts — pengaturan aksesibilitas & hemat data akun.
// Disimpan di server (GET/POST /api/settings/me) dan dicerminkan ke
// localStorage `ringkas_settings` supaya bisa diterapkan instan sebelum fetch.
import { writable } from "svelte/store";
import { api, getToken } from "./api";

export interface UserSettings {
	readable_font: 0 | 1;
	high_contrast: 0 | 1;
	large_text: 0 | 1;
	data_saver: 0 | 1;
}

export const DEFAULT_SETTINGS: UserSettings = {
	readable_font: 0,
	high_contrast: 0,
	large_text: 0,
	data_saver: 0
};

/** Store reaktif agar label header ikut berubah tanpa reload penuh. */
export const settingsStore = writable<UserSettings>({ ...DEFAULT_SETTINGS });

const STORAGE_KEY = "ringkas_settings";

function normalisasi(raw: Partial<UserSettings> | null | undefined): UserSettings {
	return {
		readable_font: raw?.readable_font ? 1 : 0,
		high_contrast: raw?.high_contrast ? 1 : 0,
		large_text: raw?.large_text ? 1 : 0,
		data_saver: raw?.data_saver ? 1 : 0
	};
}

function simpanCache(s: UserSettings): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
	} catch {
		/* abaikan */
	}
}

function bacaCache(): UserSettings {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_SETTINGS };
		return normalisasi(JSON.parse(raw) as Partial<UserSettings>);
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

/**
 * Terapkan pengaturan ke <html>: atribut data-a11y-font / data-a11y-contrast /
 * data-a11y-large / data-saver (nilai "1" bila aktif, dihapus bila 0).
 * Juga simpan ke localStorage agar diterapkan instan sebelum fetch.
 */
export function applySettings(s: UserSettings): void {
	const settings = normalisasi(s);
	if (typeof document === "undefined") return;
	const el = document.documentElement;
	const pasang = (attr: string, aktif: boolean) => {
		if (aktif) el.setAttribute(attr, "1");
		else el.removeAttribute(attr);
	};
	pasang("data-a11y-font", settings.readable_font === 1);
	pasang("data-a11y-contrast", settings.high_contrast === 1);
	pasang("data-a11y-large", settings.large_text === 1);
	pasang("data-saver", settings.data_saver === 1);
	simpanCache(settings);
	settingsStore.set(settings);
}

/** Baca pengaturan tersimpan di localStorage lalu terapkan segera. */
export function applyCachedSettings(): UserSettings {
	const settings = bacaCache();
	applySettings(settings);
	return settings;
}

/**
 * Ambil pengaturan dari server bila sudah masuk; bila belum masuk atau
 * gagal, kembalikan default (semua 0). Hasil server juga disimpan ke cache.
 */
export async function loadSettings(): Promise<UserSettings> {
	if (!getToken()) return { ...DEFAULT_SETTINGS };
	try {
		const data = await api<{ settings: UserSettings }>("/api/settings/me");
		const settings = normalisasi(data.settings);
		simpanCache(settings);
		return settings;
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

/** Simpan perubahan ke server, lalu terapkan + simpan ke localStorage. */
export async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
	const data = await api<{ settings: UserSettings }>("/api/settings/me", {
		method: "POST",
		body: JSON.stringify(patch)
	});
	const settings = normalisasi(data.settings);
	applySettings(settings);
	return settings;
}
