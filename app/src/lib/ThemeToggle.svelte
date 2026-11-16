<script lang="ts">
	// ThemeToggle.svelte — pilih mode gelap anak: Terang / Gelap / Ikut sistem.
	// Menyimpan ke server lewat POST /api/settings/me (saveSettings) dan
	// memperbarui settingsStore; tema langsung diterapkan oleh applySettings.
	// Komponen ini TIDAK dipasang ke halaman mana pun di sini — koordinator
	// yang memasangnya (rencana: halaman Akun).
	import Icon from "$lib/Icon.svelte";
	import { saveSettings, settingsStore, type ThemePref } from "$lib/settings";

	const OPSI: { value: ThemePref; label: string; desc: string; icon: string }[] = [
		{ value: "light", label: "Terang", desc: "Latar kertas seperti biasa", icon: "sun" },
		{ value: "dark", label: "Gelap", desc: "Latar hijau gelap yang lembut", icon: "moon" },
		{ value: "system", label: "Ikut sistem", desc: "Mengikuti tema perangkat", icon: "eye" }
	];

	let menyimpan = $state(false);
	let menyimpanNilai = $state<ThemePref | null>(null);
	let galat = $state("");

	async function pilih(value: ThemePref) {
		if (menyimpan || $settingsStore.theme === value) return;
		menyimpan = true;
		menyimpanNilai = value;
		galat = "";
		try {
			await saveSettings({ theme: value });
		} catch (e) {
			galat = e instanceof Error ? e.message : "Tema belum bisa disimpan. Coba lagi nanti.";
		} finally {
			menyimpan = false;
			menyimpanNilai = null;
		}
	}
</script>

<div role="radiogroup" aria-label="Mode tampilan" class="flex flex-col gap-2">
	{#each OPSI as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={$settingsStore.theme === o.value}
			disabled={menyimpan}
			class="card flex w-full items-center gap-3 !rounded-xl p-3 text-left"
			class:!border-[#177245]={$settingsStore.theme === o.value}
			onclick={() => pilih(o.value)}
		>
			<span
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full {$settingsStore.theme ===
				o.value
					? 'bg-[#177245] text-white'
					: 'bg-[#ece9dc] text-[#3f4a42]'}"
			>
				<Icon name={o.icon} size={18} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-sm font-semibold">{o.label}</span>
				<span class="block text-xs text-[#5f6b62]">{o.desc}</span>
			</span>
			{#if menyimpanNilai === o.value}
				<span class="text-xs font-medium text-[#5f6b62]">Menyimpan...</span>
			{/if}
		</button>
	{/each}
</div>
{#if galat}
	<p class="err mt-2">{galat}</p>
{/if}
