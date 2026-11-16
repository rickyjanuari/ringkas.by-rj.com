<script lang="ts">
	// SoundToggle.svelte — saklar Suara AKTIF/MATI.
	// Membaca/menyimpan key `sound_enabled` (0/1, default 1) lewat
	// GET/POST /api/settings/me, mengikuti pola pemakaian settings di
	// src/lib/settings.ts. Nilai juga dicerminkan ke cache localStorage
	// `ringkas_settings` supaya feedback.ts langsung melihat perubahan.
	// Catatan: settings.ts belum mengenal key ini (migrasi 0015 dibuat
	// worker lain), jadi komponen ini memanggil API + cache sendiri dan
	// TIDAK memakai saveSettings() yang akan membuang key tak dikenal.
	// Ikon speaker dari Icon.svelte (volume-2 / volume-x, gaya Lucide).
	import { onMount } from "svelte";
	import Icon from "$lib/Icon.svelte";
	import { api, getToken } from "./api";

	const CACHE_KEY = "ringkas_settings";

	let enabled = $state(true);
	let memuat = $state(true);
	let menyimpan = $state(false);
	let pesanError = $state("");

	function bacaCache(): boolean {
		try {
			const raw = localStorage.getItem(CACHE_KEY);
			if (!raw) return true;
			const parsed = JSON.parse(raw) as { sound_enabled?: unknown };
			if (parsed.sound_enabled === undefined || parsed.sound_enabled === null) return true;
			return parsed.sound_enabled === 1 || parsed.sound_enabled === true;
		} catch {
			return true;
		}
	}

	function tulisCache(nilai: boolean): void {
		try {
			const raw = localStorage.getItem(CACHE_KEY);
			const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
			parsed.sound_enabled = nilai ? 1 : 0;
			localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));
		} catch {
			/* Abaikan. */
		}
	}

	onMount(async () => {
		// Terapkan cache dulu supaya saklar tidak berkedip; lalu sinkronkan
		// dengan server bila sudah masuk.
		enabled = bacaCache();
		if (!getToken()) {
			memuat = false;
			return;
		}
		try {
			const data = await api<{ settings: Record<string, unknown> }>("/api/settings/me");
			const nilai = data.settings?.sound_enabled;
			if (nilai !== undefined && nilai !== null) {
				enabled = nilai === 1 || nilai === true;
				tulisCache(enabled);
			}
		} catch {
			// Server belum punya key ini (pra-migrasi 0015) atau gagal:
			// tetap pakai nilai cache/default, jangan blokir halaman.
		} finally {
			memuat = false;
		}
	});

	async function toggleSuara(): Promise<void> {
		if (menyimpan || memuat) return;
		const next = !enabled;
		const prev = enabled;
		enabled = next;
		tulisCache(next);
		pesanError = "";
		if (!getToken()) return; // Tamu: cukup simpan lokal.
		menyimpan = true;
		try {
			await api("/api/settings/me", {
				method: "POST",
				body: JSON.stringify({ sound_enabled: next ? 1 : 0 })
			});
		} catch (e) {
			enabled = prev;
			tulisCache(prev);
			pesanError = e instanceof Error ? e.message : "Gagal menyimpan pengaturan suara";
		} finally {
			menyimpan = false;
		}
	}
</script>

<div class="sound-toggle">
	<span class="sound-toggle-label" id="sound-toggle-label">Suara</span>
	<button
		type="button"
		role="switch"
		aria-checked={enabled}
		aria-labelledby="sound-toggle-label"
		class="sound-switch"
		class:on={enabled}
		disabled={memuat || menyimpan}
		onclick={toggleSuara}
	>
		<span class="sound-knob" aria-hidden="true">
			<Icon name={enabled ? "volume-2" : "volume-x"} size={16} />
		</span>
		<span class="sound-state">{enabled ? "Aktif" : "Mati"}</span>
	</button>
	{#if pesanError}
		<p class="sound-error" role="alert">{pesanError}</p>
	{/if}
</div>

<style>
	.sound-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.sound-toggle-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #22302a;
	}
	.sound-switch {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0.25rem 0.75rem 0.25rem 0.25rem;
		border-radius: 999px;
		border: 2px solid #e7e2d2;
		background: #ffffff;
		color: #5f6b62;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.18s var(--ease-signature), border-color 0.18s var(--ease-signature), color 0.18s var(--ease-signature);
	}
	.sound-switch.on {
		background: #177245;
		border-color: #177245;
		color: #ffffff;
	}
	.sound-switch:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.sound-knob {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 999px;
		background: #f7f5ef;
		color: #22302a;
	}
	.sound-switch.on .sound-knob {
		background: #f2b33d;
		color: #22302a;
	}
	.sound-state {
		padding-right: 0.25rem;
	}
	.sound-error {
		width: 100%;
		margin: 0;
		font-size: 0.75rem;
		font-weight: 600;
		color: #b91c1c;
	}

	@media (prefers-reduced-motion: reduce) {
		.sound-switch {
			transition: none;
		}
	}
</style>
