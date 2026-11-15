// src/lib/onboarding.ts — status selesai onboarding 3 langkah.
// Disimpan di server (GET/POST /api/settings/me, key `onboarding_done`,
// kolom dibuat lewat migrasi 0015) dengan fallback localStorage bila
// server gagal, supaya halaman tidak pernah berputar tanpa ujung.
// Pilihan avatar tahap awal hanya preferensi tampilan lokal dan TIDAK
// dikirim ke server.
import { api, getToken } from "./api";

export const ONBOARDING_STORAGE_KEY = "ringkas_onboarding_done";
export const AVATAR_STAGE_KEY = "ringkas_avatar_stage";

function bacaCache(): boolean {
	try {
		return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
	} catch {
		return false;
	}
}

function simpanCache(): void {
	try {
		localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
	} catch {
		/* abaikan */
	}
}

/** Sudah pernah menyelesaikan (atau melewati) onboarding? */
export async function getOnboardingDone(): Promise<boolean> {
	if (bacaCache()) return true;
	if (!getToken()) return false;
	try {
		const data = await api<{ settings: { onboarding_done?: number | boolean } }>(
			"/api/settings/me"
		);
		const done =
			data.settings?.onboarding_done === 1 || data.settings?.onboarding_done === true;
		if (done) simpanCache();
		return done;
	} catch {
		return false;
	}
}

/**
 * Tandai onboarding selesai. Bila POST ke server gagal (mis. jaringan),
 * tetap simpan ke localStorage dan lanjut — pemanggil tidak perlu
 * menunggu atau menampilkan error.
 */
export async function setOnboardingDone(): Promise<void> {
	try {
		await api("/api/settings/me", {
			method: "POST",
			body: JSON.stringify({ onboarding_done: 1 })
		});
	} catch {
		/* fallback ke localStorage di bawah */
	}
	simpanCache();
}

/** Tahap avatar tanaman awal yang dipilih di onboarding (lokal saja). */
export function getAvatarStage(): number {
	try {
		const v = Number(localStorage.getItem(AVATAR_STAGE_KEY));
		if (v >= 1 && v <= 4) return v;
	} catch {
		/* abaikan */
	}
	return 2;
}

export function saveAvatarStage(stage: number): void {
	try {
		localStorage.setItem(AVATAR_STAGE_KEY, String(Math.max(1, Math.min(4, stage))));
	} catch {
		/* abaikan */
	}
}
