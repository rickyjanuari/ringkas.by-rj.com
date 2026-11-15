<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, getToken } from "$lib/api";

	interface AnbkPackage {
		id: string;
		title: string;
		subject: string;
		grade: number;
		paket: string;
		total_questions: number;
		total_minutes: number;
		max_points: number;
		exists: boolean;
		max_points_db: number | null;
		locked: boolean;
		simLocked: boolean;
	}

	interface AnbkList {
		packages: AnbkPackage[];
		owned_k5: boolean;
		simLocked: boolean;
	}

	let data = $state<AnbkList | null>(null);
	let loading = $state(true);
	let error = $state("");

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			data = await api<AnbkList>("/api/anbk");
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat daftar simulasi ANBK.";
		} finally {
			loading = false;
		}
	});
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/")}>
	<Icon name="chevron-left" size={18} /> Kembali ke Beranda
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-extrabold leading-snug">
	<Icon name="school" size={22} class="shrink-0" /> Simulasi ANBK Kelas 5
</h1>
<p class="text-sm text-[#5f6b62]">
	Latihan seperti Asesmen Nasional: Literasi membaca dan Numerasi. Ada waktu, ada skor, ada
	pembahasan tiap soal. Soal-soalnya orisinal, dibuat untuk latihan.
</p>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error || !data}
	<p class="err mt-6">{error || "Daftar simulasi tidak ditemukan."}</p>
{:else}
	{#if data.simLocked}
		<p class="err mt-3">
			<Icon name="lock" size={15} class="inline-block align-[-2px]" /> Simulasi sedang dikunci oleh orang tuamu.
		</p>
	{/if}
	{#if !data.owned_k5}
		<div class="card mt-4 p-4">
			<p class="flex items-center gap-1.5 text-sm font-extrabold">
				<Icon name="lock" size={15} /> Simulasi ANBK bagian dari paket Kelas 5
			</p>
			<p class="mt-0.5 text-sm text-[#5f6b62]">
				Beli paket Rangkuman Materi Kelas 5 untuk membuka kedua simulasi ANBK ini.
			</p>
			<a href="/produk/k5" class="btn btn-sun btn-block mt-3">
				<Icon name="shopping-cart" size={16} /> Lihat Paket Kelas 5
			</a>
		</div>
	{/if}

	<div class="mt-4 space-y-3">
		{#each data.packages as p (p.id)}
			<div class="card p-4">
				<div class="flex items-start justify-between gap-2">
					<div>
						<p class="text-sm font-extrabold leading-snug">{p.title}</p>
						<p class="mt-0.5 text-xs text-[#5f6b62]">
							{p.subject} • Kelas {p.grade} • Paket {p.paket}
						</p>
					</div>
					<span class="flex shrink-0 flex-wrap justify-end gap-1">
						{#if !p.exists}<span class="badge badge-gray">Segera hadir</span>{/if}
						{#if p.exists && p.locked}<span class="badge badge-gray"><Icon name="lock" size={12} /> Terkunci</span>{/if}
						{#if p.exists && !p.locked}<span class="badge badge-leaf">Terbuka</span>{/if}
						<span class="badge badge-brand">ANBK</span>
					</span>
				</div>
				<div class="mt-3 flex gap-2 text-center text-xs font-bold">
					<span class="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#f7f5ef] px-2 py-2">
						<Icon name="timer" size={14} /> {p.total_minutes} menit
					</span>
					<span class="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#f7f5ef] px-2 py-2">
						<Icon name="file-text" size={14} /> {p.total_questions} soal
					</span>
					<span class="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#f7f5ef] px-2 py-2">
						<Icon name="star" size={14} /> {p.max_points} poin
					</span>
				</div>
				{#if p.subject === "Literasi"}
					<p class="mt-2 text-xs text-[#5f6b62]">
						2 teks bacaan tentang kehidupan sehari-hari, lalu soal-soal yang merujuk teks itu.
					</p>
				{:else}
					<p class="mt-2 text-xs text-[#5f6b62]">
						Soal hitung dari situasi nyata: belanja, jarak, waktu, dan data sederhana.
					</p>
				{/if}
				{#if !p.exists}
					<button type="button" class="btn btn-ghost btn-block mt-3" disabled>
						Segera hadir
					</button>
				{:else if p.locked}
					<a href="/produk/k5" class="btn btn-sun btn-block mt-3">
						<Icon name="lock" size={16} /> Beli untuk membuka
					</a>
				{:else}
					<button
						type="button"
						class="btn btn-primary btn-block mt-3"
						disabled={data.simLocked}
						onclick={() => goto(`/anbk/${p.id}`)}
					>
						{#if data.simLocked}<Icon name="lock" size={16} /> Dikunci Orang Tua{:else}<Icon name="rocket" size={16} /> Mulai Simulasi{/if}
					</button>
				{/if}
			</div>
		{/each}
	</div>

	<p class="mt-4 text-center text-xs text-[#5f6b62]">
		Sudah punya paket Kelas 5? Simulasi ini juga bisa dibuka dari
		<a href="/belajar/k5" class="font-bold text-[#177245]">Ruang Belajar Kelas 5</a>.
	</p>
{/if}
