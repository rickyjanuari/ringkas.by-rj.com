<script lang="ts">
	import { page } from "$app/state";
	import { api, type ProductPublic } from "$lib/api";
	import { gradeLabel } from "$lib/gradeTheme";
	import Icon from "$lib/Icon.svelte";
	import ProductCard from "$lib/ProductCard.svelte";

	type ChapterResult = { id: string; product_id: string; title: string; subject: string };

	const GRADES = [1, 2, 3, 4, 5, 6];

	let q = $state("");
	let query = $state("");
	let grade = $state("");
	let jenjang = $state("");
	let mapel = $state("");
	let sort = $state("termurah");
	let products = $state<ProductPublic[]>([]);
	let chapters = $state<ChapterResult[]>([]);
	let loading = $state(true);
	let error = $state("");
	let retry = $state(0);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	let jenjangList = $derived([...new Set([...products.map((p) => p.jenjang), jenjang].filter(Boolean))]);
	let mapelList = $derived([...new Set([...products.map((p) => p.mapel), mapel].filter(Boolean))]);
	let filtered = $derived(
		products.filter((product) =>
			(!grade || gradeLabel(product.id) === `Kelas ${grade}`) &&
			(!jenjang || product.jenjang === jenjang) &&
			(!mapel || product.mapel === mapel)
		).sort((a, b) => {
			if (sort === "nama") return a.title.localeCompare(b.title, "id");
			if (sort === "termahal") return b.price - a.price;
			return a.price - b.price;
		})
	);

	async function loadResults(term: string, signal: AbortSignal) {
		loading = true;
		error = "";
		try {
			const path = term ? `/api/search?q=${encodeURIComponent(term)}` : "/api/catalog";
			const data = await api<{ products: ProductPublic[]; chapters?: ChapterResult[] }>(path, { signal });
			if (signal.aborted) return;
			products = data.products ?? [];
			chapters = data.chapters ?? [];
		} catch (cause) {
			if (signal.aborted) return;
			error = cause instanceof Error ? cause.message : "Gagal memuat katalog.";
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	$effect(() => {
		const urlQuery = page.url.searchParams.get("q") ?? "";
		clearTimeout(searchTimer);
		q = urlQuery;
		query = urlQuery.trim();
		return () => clearTimeout(searchTimer);
	});

	$effect(() => {
		const urlGrade = page.url.searchParams.get("kelas") ?? "";
		grade = GRADES.some((number) => String(number) === urlGrade) ? urlGrade : "";
	});

	$effect(() => {
		const controller = new AbortController();
		retry;
		void loadResults(query, controller.signal);
		return () => controller.abort();
	});

	function scheduleSearch(value: string) {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => (query = value.trim()), 300);
	}

	function submitSearch(event: SubmitEvent) {
		event.preventDefault();
		clearTimeout(searchTimer);
		query = q.trim();
	}

	function resetFilters() {
		grade = "";
		jenjang = "";
		mapel = "";
	}
</script>

<section aria-labelledby="catalog-title">
	<div class="catalog-intro">
		<div>
			<h1 id="catalog-title" class="store-title">Katalog Ringkas.</h1>
			<p>Cari rangkuman, paket SAS, atau bab tertentu.</p>
		</div>
		<form class="catalog-search" role="search" aria-label="Pencarian katalog" onsubmit={submitSearch}>
			<Icon name="search" size={21} />
			<input type="search" placeholder="Cari produk atau bab" bind:value={q} oninput={(event) => scheduleSearch(event.currentTarget.value)} aria-label="Cari produk atau bab" />
			<button class="store-button store-button-dark" type="submit">Cari</button>
		</form>
	</div>

	<div class="catalog-controls">
		<div>
			<label for="catalog-grade">Kelas</label>
			<select id="catalog-grade" bind:value={grade}>
				<option value="">Semua kelas</option>
				{#each GRADES as number (number)}<option value={String(number)}>Kelas {number}</option>{/each}
			</select>
		</div>
		<div>
			<label for="catalog-jenjang">Jenjang</label>
			<select id="catalog-jenjang" bind:value={jenjang}>
				<option value="">Semua jenjang</option>
				{#each jenjangList as value (value)}<option {value}>{value}</option>{/each}
			</select>
		</div>
		<div>
			<label for="catalog-mapel">Mata pelajaran</label>
			<select id="catalog-mapel" bind:value={mapel}>
				<option value="">Semua mapel</option>
				{#each mapelList as value (value)}<option {value}>{value}</option>{/each}
			</select>
		</div>
		<div>
			<label for="catalog-sort">Urutkan</label>
			<select id="catalog-sort" bind:value={sort}>
				<option value="termurah">Harga terendah</option>
				<option value="termahal">Harga tertinggi</option>
				<option value="nama">Nama A–Z</option>
			</select>
		</div>
	</div>

	{#if loading}
		<p class="store-state" role="status">Memuat katalog…</p>
	{:else if error}
		<div class="store-state">
			<p role="alert">{error}</p>
			<button class="store-button store-button-outline" type="button" onclick={() => (retry += 1)}>Coba lagi</button>
		</div>
	{:else}
		{#if query && chapters.length > 0}
			<div class="catalog-chapters">
				<h2>Bab yang cocok</h2>
				<ul>
					{#each chapters as chapter (chapter.id)}
						<li><a href="/produk/{encodeURIComponent(chapter.product_id)}">
							<Icon name="book-open" size={20} />
							<span><strong>{chapter.title}</strong><small>{chapter.subject}</small></span>
							<Icon name="arrow-right" size={17} />
						</a></li>
					{/each}
				</ul>
			</div>
		{/if}
		<div class="catalog-results">
			<h2 aria-live="polite">{filtered.length} produk{query ? ` untuk “${query}”` : ""}</h2>
			{#if grade || jenjang || mapel}
				<button class="store-text-link" type="button" onclick={resetFilters}>Hapus filter</button>
			{/if}
		</div>
		{#if filtered.length === 0}
			<p class="store-state">Belum ada produk yang cocok. Coba kata kunci atau filter lain.</p>
		{:else}
			<div class="product-grid">
				{#each filtered as product (product.id)}
					<ProductCard {product} />
				{/each}
			</div>
		{/if}
	{/if}
</section>
