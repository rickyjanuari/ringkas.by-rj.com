<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";
	import { gradeLabel, gradeOfProduct, gradeTheme } from "$lib/gradeTheme";
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

	// Dukungan ?q= dari pencarian header desktop: kata kunci awal dibaca dari URL,
	// dan perubahan query saat sudah di halaman ini ikut diterapkan.
	let lastAppliedQ = "";

	$effect(() => {
		const v = $page.url.searchParams.get("q") ?? "";
		if (v !== lastAppliedQ) {
			lastAppliedQ = v;
			q = v;
			if (v) void doSearch(v);
			else void loadCatalog();
		}
	});

	onMount(async () => {
		const initial = $page.url.searchParams.get("q");
		if (initial) {
			lastAppliedQ = initial;
			q = initial;
			await doSearch(initial);
		} else {
			await loadCatalog();
		}
	});
</script>

<h1 class="flex items-center gap-2 text-xl font-semibold"><Icon name="library" size={18} /> <span class="u-pencil">Katalog</span></h1>
<p class="text-sm text-[#5f6b62]">Cari rangkuman, bab, dan istilah belajar.</p>

<div class="lg:mt-4 lg:flex lg:gap-6">
	<!-- Sidebar filter (desktop saja; di mobile filter ada di bar lengket di bawah) -->
	<aside class="hidden w-64 shrink-0 lg:sticky lg:top-[72px] lg:block lg:self-start">
		<div class="card p-4">
			<p class="text-sm font-semibold">Jenjang</p>
			<div class="mt-2 flex flex-col items-start gap-2">
				{#each jenjangList as j (j)}
					<button type="button" class="chip" class:active={jenjang === j} onclick={() => (jenjang = j)}>
						{#if j === "Semua"}
							<Icon name="sparkles" size={16} /> Semua
						{:else}
							<Icon name="backpack" size={16} /> {j}
						{/if}
					</button>
				{/each}
			</div>
			<label class="lbl mt-4" for="filter-mapel">Mapel</label>
			<select id="filter-mapel" class="input" bind:value={mapel} aria-label="Filter mapel">
				{#each mapelList as m (m)}
					<option value={m}>{m === "Semua" ? "Semua mapel" : m}</option>
				{/each}
			</select>
			<label class="lbl mt-4" for="filter-urut">Urutkan</label>
			<select id="filter-urut" class="input" bind:value={sort} aria-label="Urutkan">
				<option value="termurah">Termurah</option>
				<option value="termahal">Termahal</option>
				<option value="nama">Nama A–Z</option>
			</select>
		</div>
	</aside>

	<div class="min-w-0 flex-1">
<!-- Search pill lengket + chip + sortir -->
<div
	class="sticky top-12 z-30 -mx-4 mt-3 border-b border-[#e7e2d2] bg-[#f7f5ef]/95 px-4 pb-3 pt-2 backdrop-blur lg:static lg:mx-0 lg:mt-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none"
>
	<div class="relative">
		<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6b62]">
			<Icon name="search" size={16} />
		</span>
		<input
			class="input !rounded-full !pl-10"
			type="search"
			placeholder="Cari produk atau bab"
			bind:value={q}
			oninput={onSearchInput}
			aria-label="Cari"
		/>
	</div>

	<div class="mt-2 flex gap-2 overflow-x-auto pb-1 lg:hidden">
		{#each jenjangList as j (j)}
			<button type="button" class="chip" class:active={jenjang === j} onclick={() => (jenjang = j)}>
				{#if j === "Semua"}
					<Icon name="sparkles" size={16} /> Semua
				{:else}
					<Icon name="backpack" size={16} /> {j}
				{/if}
			</button>
		{/each}
	</div>

	<div class="mt-2 flex gap-2 lg:hidden">
		<select class="input !w-auto flex-1" bind:value={mapel} aria-label="Filter mapel">
			{#each mapelList as m (m)}
				<option value={m}>{m === "Semua" ? "Semua mapel" : m}</option>
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
		<h2 class="mt-5 text-sm font-semibold text-[#3f4a42]">Bab yang cocok</h2>
		<div class="mt-2 space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
			{#each searchChapters as c (c.id)}
				<button
					type="button"
					class="card flex w-full items-center gap-3 p-3 text-left"
					onclick={() => goto(`/produk/${c.product_id}`)}
				>
					<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#3f4a42]">
						<Icon name="book-open" size={18} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block truncate text-sm font-semibold">{c.title}</span>
						<span class="text-xs text-[#5f6b62]">{c.subject}</span>
					</span>
					<Icon name="chevron-right" size={18} class="shrink-0 text-[#6e675c]" />
				</button>
			{/each}
		</div>
	{/if}

	{#if filtered.length === 0}
		<p class="mt-6 text-center text-sm text-[#5f6b62]">
			Tidak ada produk yang cocok. Coba kata kunci atau filter lain ya.
		</p>
	{:else}
		<div class="mt-4 space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
			{#each filtered as p (p.id)}
				{@const gt = gradeTheme(gradeOfProduct(p.id))}
				<div
					class="card flex cursor-pointer gap-3 overflow-hidden lg:flex-col lg:gap-0"
					style="border-left: 4px solid {gt.accent}"
					role="button"
					tabindex="0"
					onclick={() => goto(`/produk/${p.id}`)}
					onkeydown={(e) => e.key === "Enter" && goto(`/produk/${p.id}`)}
				>
					<div
						class="flex w-24 shrink-0 items-center justify-center px-2 text-center text-xs font-semibold text-white lg:h-28 lg:w-full lg:px-3 lg:text-sm"
						style="background: {p.cover_color}"
					>
						{p.cover_label}
					</div>
					<div class="min-w-0 flex-1 py-3 pr-3 lg:p-3">
						{#if p.badge || gradeLabel(p.id)}
							<p class="flex flex-wrap items-center gap-1.5">
								{#if p.badge}
									<span class="badge badge-sun">{p.badge}</span>
								{/if}
								{#if gradeLabel(p.id)}
									<span class="badge" style="background: {gt.soft}; color: {gt.text}">
										{gradeLabel(p.id)}
									</span>
								{/if}
							</p>
						{/if}
						<h2 class="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug lg:min-h-10">{p.title}</h2>
						<p class="text-xs text-[#5f6b62]">{p.jenjang} • {p.mapel} • {p.pages} hlm</p>
						<div class="mt-2 flex items-center justify-between gap-2">
							<p class="text-sm font-semibold tabular-nums text-[#177245]">
								{formatRupiah(p.price)}
								{#if p.strikethrough_price}
									<span class="ml-1 text-[11px] font-semibold text-[#6e675c] line-through">
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
								<Icon name="plus" size={16} /> Keranjang
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
{/if}
	</div>
</div>
