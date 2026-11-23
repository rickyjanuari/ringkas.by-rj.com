<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import {
		api,
		formatRupiah,
		getToken,
		type ProductPublic,
		type ChapterMeta,
		type BundleItem,
		type StudyPack
	} from "$lib/api";
	import { cart } from "$lib/store";
	import { gradeLabel, gradeOfProduct, gradeStyle } from "$lib/gradeTheme";
	import { settingsStore } from "$lib/settings";
	import Icon from "$lib/Icon.svelte";

	let slug = $derived(page.params.slug);
	let product = $state<ProductPublic | null>(null);
	let chapters = $state<ChapterMeta[]>([]);
	let bundleItems = $state<BundleItem[]>([]);
	let images = $state<{ id: number; url: string; kind: string }[]>([]);
	let loading = $state(true);
	let error = $state("");
	let owned = $state(false);
	let imageFailed = $state(false);

	// Jumlah simulasi + ketersediaan kuis/flashcard, diambil best-effort dari
	// GET /api/study/:slug. Bila gagal (401/locked/tanpa login), gagal diam-diam
	// dan klaim-klaim itu tidak ditampilkan.
	let simCount = $state(0);
	let hasQuiz = $state(false);
	let hasFlashcards = $state(false);
	let materialUrl = $state<string | null>(null);

	// Gambar fitur SAS per kelas (dipakai bila produk tidak punya gambar fitur admin).
	const sasFeature: Record<string, string> = {
		"sas-k1-s1": "/feature-sas-kelas-1.png",
		"sas-k2": "/feature-sas-kelas-2.png",
		"sas-k3": "/feature-sas-kelas-3.png",
		"sas-k4": "/feature-sas-kelas-4.png",
		"sas-k5": "/feature-sas-kelas-5.png",
		"sas-k6": "/feature-sas-kelas-6.png"
	};

	let featureImage = $derived(images.find((i) => i.kind === "feature")?.url ?? images[0]?.url);
	let coverImage = $derived(
		featureImage ?? (product ? (sasFeature[product.id] ?? null) : null)
	);
	let discountPct = $derived(
		product?.strikethrough_price
			? Math.round((1 - product.price / product.strikethrough_price) * 100)
			: 0
	);
	let bySubject = $derived.by(() => {
		const map = new Map<string, ChapterMeta[]>();
		for (const c of chapters) {
			const arr = map.get(c.subject) ?? [];
			arr.push(c);
			map.set(c.subject, arr);
		}
		return [...map.entries()];
	});

	onMount(async () => {
		try {
			const data = await api<{
				product: ProductPublic;
				chapters: ChapterMeta[];
				images: { id: number; url: string; kind: string }[];
				bundleItems?: BundleItem[];
			}>(`/api/products/${slug}`);
			product = data.product;
			chapters = data.chapters ?? [];
			bundleItems = data.bundleItems ?? [];
			images = data.images ?? [];
			// Cek kepemilikan (order PAID) untuk kartu Ruang Belajar.
			if (getToken()) {
				try {
					const { orders } = await api<{
						orders: { status: string; items: { product_id: string }[] }[];
					}>("/api/orders");
					owned = orders.some(
						(o) => o.status === "PAID" && o.items.some((it) => it.product_id === slug)
					);
				} catch {
					/* bukan pemilik / belum login — abaikan */
				}
			}
			// Best-effort: jumlah simulasi + ada/tidaknya kuis dan flashcard.
			try {
				const pack = await api<StudyPack>(`/api/study/${slug}`);
				simCount = pack.simulations?.length ?? 0;
				materialUrl = pack.externalUrl ?? null;
				hasQuiz = (pack.chapters ?? []).some((c) => (c.quiz?.length ?? 0) > 0);
				hasFlashcards = (pack.chapters ?? []).some((c) => (c.flashcards?.length ?? 0) > 0);
			} catch {
				/* gagal diam-diam — klaim simulasi/kuis/flashcard tidak ditampilkan */
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Produk tidak ditemukan.";
		} finally {
			loading = false;
		}
	});

	function tambahKeranjang() {
		if (!product || owned) return;
		cart.add(product.id);
	}

	function beliSekarang() {
		if (!product || owned) return;
		cart.add(product.id);
		goto("/checkout");
	}
</script>

<div class="product-detail">
	<a href="/katalog" class="store-text-link product-back"><Icon name="arrow-left" size={18} /> Kembali ke katalog</a>

	{#if loading}
		<h1 class="store-title">Detail produk.</h1>
		<p class="store-state mt-4" role="status">Memuat produk…</p>
	{:else if error || !product}
		<h1 class="store-title">Detail produk.</h1>
		<p class="store-state mt-4" role="alert">{error || "Produk tidak ditemukan."}</p>
	{:else}
		{@const grade = gradeLabel(product.id)}
		{@const added = $cart.includes(product.id)}
		<div class="detail-intro">
			<div class="detail-media" style={gradeStyle(grade ? gradeOfProduct(product.id) : 0)}>
				{#if coverImage && !imageFailed && !$settingsStore.data_saver}
					<img src={coverImage} alt="Sampul {product.title}" fetchpriority="high" onerror={() => (imageFailed = true)} />
				{:else}
					<div class="detail-book" aria-hidden="true">
						<span><Icon name="book-open" size={24} /> Ringkas</span>
						<strong>{product.cover_label || product.mapel}</strong>
						<small>{product.jenjang}{grade ? ' · ' + grade : ''}</small>
					</div>
				{/if}
			</div>
			<div class="detail-summary">
				<p class="product-meta">
					<span>{product.jenjang}{grade ? ' · ' + grade : ''} · {product.mapel}</span>
					{#if product.badge}<span class="badge badge-brand">{product.badge}</span>{/if}
				</p>
				<h1 class="store-title">{product.title}</h1>
				{#if product.description}<p class="detail-description">{product.description}</p>{/if}

				<div class="detail-purchase">
					<div class="detail-price">
						<strong>{formatRupiah(product.price)}</strong>
						{#if product.strikethrough_price}<s>{formatRupiah(product.strikethrough_price)}</s>{/if}
						{#if discountPct > 0}<span class="badge badge-brand">Hemat {discountPct}%</span>{/if}
					</div>
					{#if owned}
						<p class="detail-purchase-note"><Icon name="check-circle" size={17} /> Produk ini sudah milikmu.</p>
					{:else}
						<p class="detail-purchase-note">Sekali bayar, tanpa langganan.</p>
					{/if}
					<div class="detail-actions">
						{#if owned}
							{#if materialUrl}
								<a href={materialUrl} target="_blank" rel="noopener noreferrer" class="store-button store-button-outline"><Icon name="file-text" size={18} /> PDF & Word</a>
							{/if}
							<a href="/belajar/{encodeURIComponent(product.id)}" class="store-button store-button-dark"><Icon name="book-open" size={18} /> {materialUrl ? "Latihan web" : "Buka ruang belajar"}</a>
						{:else}
							<button type="button" class="store-button store-button-outline" onclick={() => added ? goto("/keranjang") : tambahKeranjang()}>
								<Icon name={added ? "check" : "shopping-cart"} size={18} /> {added ? "Lihat keranjang" : "Tambah ke keranjang"}
							</button>
							<button type="button" class="store-button store-button-dark" onclick={beliSekarang}>
								Beli sekarang <Icon name="arrow-right" size={18} />
							</button>
						{/if}
					</div>
					<p class="sr-only" role="status">{added ? "Produk ada di keranjang." : ""}</p>
				</div>
			</div>
		</div>

		<div class="detail-information">
			<div>
				{#if chapters.length || product.pages > 0 || hasQuiz || hasFlashcards || simCount > 0}
					<section class="detail-section">
						<h2>Yang kamu dapatkan.</h2>
						<ul class="detail-included">
							{#each [
								chapters.length ? `${chapters.length} bab rangkuman` : "",
								product.pages > 0 ? `${product.pages} halaman materi` : "",
								hasQuiz ? "Kuis per bab" : "",
								hasFlashcards ? "Flashcard per bab" : "",
								simCount > 0 ? `${simCount} simulasi SAS` : ""
							].filter(Boolean) as item (item)}
								<li><Icon name="check-circle" size={18} /> {item}</li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if chapters.length > 0}
					<section class="detail-section">
						<h2>Daftar isi.</h2>
						{#each bySubject as [subject, list] (subject)}
							<details>
								<summary><span>{subject}</span><small>{list.length} bab</small><Icon name="chevron-down" size={18} /></summary>
								<ul class="detail-chapters">
									{#each list as chapter (chapter.id)}
										<li>
											<Icon name="file-text" size={19} />
											<div>
												<strong>{chapter.title}</strong>
												<small>Kelas {chapter.grade} · Semester {chapter.semester}{chapter.video_url ? ' · Ada video' : ''}</small>
											</div>
										</li>
									{/each}
								</ul>
							</details>
						{/each}
					</section>
				{/if}

				{#if bundleItems.length > 0}
					<section class="detail-section">
						<h2>Isi bundel.</h2>
						<ul class="detail-bundle">
							{#each bundleItems as item (item.product_id)}
								<li><span>{item.title}</span><strong>{formatRupiah(item.price)}</strong></li>
							{/each}
						</ul>
					</section>
				{/if}

				{#if images.length > 1 && !$settingsStore.data_saver}
					<section class="detail-section">
						<h2>Galeri paket.</h2>
						<div class="detail-gallery">
							{#each images as image, i (image.id)}
								<img src={image.url} alt="Gambar {i + 1} paket {product.title}" loading="lazy" />
							{/each}
						</div>
					</section>
				{/if}
			</div>

			<section class="detail-section detail-guide">
				<h2>Cara membeli.</h2>
				<ol>
					<li>Pilih produk dan isi data pemesan saat checkout.</li>
					<li>Ikuti petunjuk pembayaran QRIS.</li>
					<li>Buka materi dari halaman <a href="/pesanan">Pesanan</a> setelah pembayaran terkonfirmasi.</li>
				</ol>
			</section>
		</div>
	{/if}
</div>
