<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, getToken } from "$lib/api";

	type StorySummary = {
		id: string;
		grade: number;
		title: string;
		moral: string;
		questionCount: number;
	};

	let stories = $state<StorySummary[]>([]);
	let loading = $state(true);
	let error = $state("");

	let byGrade = $derived(
		[1, 2, 3, 4, 5, 6]
			.map((g) => ({ grade: g, items: stories.filter((s) => s.grade === g) }))
			.filter((g) => g.items.length > 0)
	);

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			const data = await api<{ stories: StorySummary[] }>("/api/stories");
			stories = data.stories ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat cerita.";
		} finally {
			loading = false;
		}
	});
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/")}>
	<Icon name="chevron-left" size={18} /> Kembali ke beranda
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-semibold leading-snug">
	<Icon name="book-open" size={18} class="shrink-0" /> Cerita edukasi
</h1>
<p class="text-sm text-[#5f6b62]">
	Baca cerita pendek, lalu jawab kuis pemahamannya. Cerita yang selesai dibaca dan dijawab dengan
	benar memberi XP — tanaman avatarmu ikut tumbuh.
</p>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat cerita...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if stories.length === 0}
	<p class="mt-6 text-center text-sm text-[#5f6b62]">Belum ada cerita. Cerita baru akan segera hadir.</p>
{:else}
	{#each byGrade as g (g.grade)}
		<h2 class="mt-6 text-base font-semibold">Kelas {g.grade}</h2>
		<div class="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each g.items as s (s.id)}
				<div class="card flex flex-col p-4">
					<span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]">
						<Icon name="book-open" size={18} />
					</span>
					<p class="mt-3 text-base font-semibold leading-snug">{s.title}</p>
					<p class="mt-1 flex-1 text-sm text-[#5f6b62]">Pesan moral: {s.moral}</p>
					<p class="mt-2 text-xs font-medium text-[#177245]">
						<Icon name="help-circle" size={16} class="inline-block align-[-2px]" /> {s.questionCount} soal pemahaman
					</p>
					<a href="/cerita/{s.id}" class="btn btn-primary btn-block mt-3">
						<Icon name="book-open" size={16} /> Baca
					</a>
				</div>
			{/each}
		</div>
	{/each}
{/if}
