<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";
	import Icon from "$lib/Icon.svelte";

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

<h1 class="flex items-center gap-2 text-xl font-extrabold"><Icon name="library" size={22} /> Katalog</h1>
<p class="text-sm text-[#5f6b62]">Cari rangkuman, bab, dan istilah belajar.</p>

<!-- Search pill lengket + chip + sortir -->
<div
	class="sticky top-[49px] z-30 -mx-4 mt-3 border-b border-[#e7e2d2] bg-[#f7f5ef]/95 px-4 pb-3 pt-2 backdrop-blur"
>
	<div class="relative">
		<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6b62]">
			<Icon name="search" size={17} />
		</span>
		<input
			class="input !rounded-full !pl-10"
			type="search"
			placeholder="Cari produk atau bab..."
			bind:value={q}
			oninput={onSearchInput}
			aria-label="Cari"
		/>
	</div>

	<div class="mt-2 flex gap-2 overflow-x-auto pb-1">
		{#each jenjangList as j (j)}
			<button type="button" class="chip" class:active={jenjang === j} onclick={() => (jenjang = j)}>
				{#if j === "Semua"}
					<Icon name="sparkles" size={14} /> Semua
				{:else}
					<Icon name="backpack" size={14} /> {j}
				{/if}
			</button>
		{/each}
	</div>

	<div class="mt-2 flex gap-2">
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
</div>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else}
	{#if q.trim() && searchChapters.length > 0}
		<h2 class="mt-5 text-sm font-extrabold text-[#3f4a42]">Bab yang cocok</h2>
		<div class="mt-2 space-y-2">
			{#each searchChapters as c (c.id)}
				<button
					type="button"
					class="card flex w-full items-center gap-3 p-3 text-left"
					onclick={() => goto(`/produk/${c.product_id}`)}
				>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#177245]">
						<Icon name="book-open" size={18} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm font-bold">{c.title}</span>
						<span class="text-xs text-[#5f6b62]">{c.subject}</span>
					</span>
					<Icon name="chevron-right" size={18} class="shrink-0 text-[#9aa096]" />
				</button>
			{/each}
		</div>
	{/if}

	{#if filtered.length === 0}
		<p class="mt-6 text-center text-sm text-[#5f6b62]">
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
						<p class="text-xs text-[#5f6b62]">{p.jenjang} • {p.mapel} • {p.pages} hlm</p>
						<div class="mt-2 flex items-center justify-between gap-2">
							<p class="text-sm font-extrabold text-[#177245]">
								{formatRupiah(p.price)}
								{#if p.strikethrough_price}
									<span class="ml-1 text-[11px] font-semibold text-[#9aa096] line-through">
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
								<Icon name="plus" size={14} /> Keranjang
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
{/if}
