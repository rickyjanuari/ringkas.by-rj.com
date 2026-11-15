<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";

	let q = $state("");
	let jenjang = $state("Semua");
	let mapel = $state("Semua");
	let sort = $state("termurah");
	let products = $state<ProductPublic[]>([]);
	let searchChapters = $state<{ id: string; product_id: string; title: string; subject: string }[]>([]);
	let loading = $state(true);
	let error = $state("");
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	let jenjangList = $derived(["Semua", ...new Set(products.map((p) => p.jenjang))]);
	let mapelList = $derived(["Semua", ...new Set(products.map((p) => p.mapel))]);

	let filtered = $derived.by(() => {
		let list = products.filter(
			(p) =>
				(jenjang === "Semua" || p.jenjang === jenjang) &&
				(mapel === "Semua" || p.mapel === mapel)
		);
		if (sort === "termurah") list = [...list].sort((a, b) => a.price - b.price);
		else if (sort === "termahal") list = [...list].sort((a, b) => b.price - a.price);
		else list = [...list].sort((a, b) => a.title.localeCompare(b.title, "id"));
		return list;
	});

	async function loadCatalog() {
		loading = true;
		error = "";
		try {
			const data = await api<{ products: ProductPublic[] }>("/api/catalog");
			products = data.products ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat katalog.";
		} finally {
			loading = false;
		}
	}

	async function doSearch(term: string) {
		if (!term.trim()) {
			searchChapters = [];
			await loadCatalog();
			return;
		}
		loading = true;
		try {
			const data = await api<{
				products: ProductPublic[];
				chapters: { id: string; product_id: string; title: string; subject: string }[];
			}>(`/api/search?q=${encodeURIComponent(term.trim())}`);
			products = data.products ?? [];
			searchChapters = data.chapters ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Pencarian gagal.";
		} finally {
			loading = false;
		}
	}

	function onSearchInput() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => doSearch(q), 350);
	}

	onMount(loadCatalog);
</script>

<h1 class="text-xl font-extrabold">Katalog 📚</h1>
<p class="text-sm text-[#64748b]">Cari rangkuman, bab, dan istilah belajar.</p>

<div class="mt-3 flex gap-2">
	<input
		class="input"
		type="search"
		placeholder="Cari produk atau bab..."
		bind:value={q}
		oninput={onSearchInput}
		aria-label="Cari"
	/>
</div>

<div class="mt-3 flex gap-2">
	<select class="input !w-auto flex-1" bind:value={jenjang} aria-label="Filter jenjang">
		{#each jenjangList as j (j)}
			<option value={j}>{j === "Semua" ? "Semua Jenjang" : j}</option>
		{/each}
	</select>
	<select class="input !w-auto flex-1" bind:value={mapel} aria-label="Filter mapel">
		{#each mapelList as m (m)}
			<option value={m}>{m === "Semua" ? "Semua Mapel" : m}</option>
		{/each}
	</select>
	<select class="input !w-auto flex-1" bind:value={sort} aria-label="Urutkan">
		<option value="termurah">Termurah</option>
		<option value="termahal">Termahal</option>
		<option value="nama">Nama A–Z</option>
	</select>
</div>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#64748b]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else}
	{#if q.trim() && searchChapters.length > 0}
		<h2 class="mt-5 text-sm font-extrabold text-[#475569]">Bab yang cocok</h2>
		<div class="mt-2 space-y-2">
			{#each searchChapters as c (c.id)}
				<button
					type="button"
					class="card flex w-full items-center gap-3 p-3 text-left"
					onclick={() => goto(`/produk/${c.product_id}`)}
				>
					<span class="text-xl">📖</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm font-bold">{c.title}</span>
						<span class="text-xs text-[#64748b]">{c.subject}</span>
					</span>
					<span class="text-[#94a3b8]">›</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if filtered.length === 0}
		<p class="mt-6 text-center text-sm text-[#64748b]">
			Tidak ada produk yang cocok. Coba kata kunci atau filter lain ya.
		</p>
	{:else}
		<div class="mt-4 space-y-3">
			{#each filtered as p (p.id)}
				<div
					class="card flex cursor-pointer gap-3 overflow-hidden"
					role="button"
					tabindex="0"
					onclick={() => goto(`/produk/${p.id}`)}
					onkeydown={(e) => e.key === "Enter" && goto(`/produk/${p.id}`)}
				>
					<div
						class="flex w-24 shrink-0 items-center justify-center px-2 text-center text-xs font-extrabold text-white"
						style="background: {p.cover_color}"
					>
						{p.cover_label}
					</div>
					<div class="min-w-0 flex-1 py-3 pr-3">
						{#if p.badge}
							<span class="badge badge-sun">{p.badge}</span>
						{/if}
						<h2 class="mt-0.5 line-clamp-2 text-sm font-bold leading-snug">{p.title}</h2>
						<p class="text-xs text-[#64748b]">{p.jenjang} • {p.mapel} • {p.pages} hlm</p>
						<div class="mt-2 flex items-center justify-between gap-2">
							<p class="text-sm font-extrabold text-[#2273d8]">
								{formatRupiah(p.price)}
								{#if p.strikethrough_price}
									<span class="ml-1 text-[11px] font-semibold text-[#94a3b8] line-through">
										{formatRupiah(p.strikethrough_price)}
									</span>
								{/if}
							</p>
							<button
								type="button"
								class="btn btn-ghost !px-2.5 !py-1.5 text-xs"
								onclick={(e) => {
									e.stopPropagation();
									cart.add(p.id);
								}}
							>
								+ Keranjang
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
{/if}
