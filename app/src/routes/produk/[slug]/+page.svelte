<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
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
	import { cart, auth } from "$lib/store";
	import Icon from "$lib/Icon.svelte";

	let slug = $derived($page.params.slug);
	let product = $state<ProductPublic | null>(null);
	let chapters = $state<ChapterMeta[]>([]);
	let bundleItems = $state<BundleItem[]>([]);
	let images = $state<{ id: number; url: string; kind: string }[]>([]);
	let loading = $state(true);
	let error = $state("");
	let owned = $state(false);
	let addedMsg = $state("");

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
		addedMsg = "Ditambahkan ke keranjang";
		setTimeout(() => (addedMsg = ""), 2000);
	}

	function beliSekarang() {
		if (!product || owned) return;
		cart.add(product.id);
		goto("/checkout");
	}
</script>

<!-- Bar atas layar dorong: kembali + judul di tengah -->
<div
	class="sticky top-0 z-30 -mx-4 flex items-center gap-2 border-b border-[#e7e2d2] bg-[#fffdf7]/95 px-2 py-2.5 backdrop-blur lg:top-14 lg:-mx-8 lg:px-4"
>
	<button
		type="button"
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#177245]"
		aria-label="Kembali"
		onclick={() => history.back()}
	>
		<Icon name="chevron-left" size={18} />
	</button>
	<h1 class="min-w-0 flex-1 truncate text-center text-base font-semibold">
		{#if loading}Detail produk{:else}<span class="u-pencil">{(product?.title ?? "Detail produk").split(" ")[0]}</span> {(product?.title ?? "Detail produk").split(" ").slice(1).join(" ")}{/if}
	</h1>
	<span class="h-9 w-9 shrink-0" aria-hidden="true"></span>
</div>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error || !product}
	<p class="err mt-6">{error || "Produk tidak ditemukan."}</p>
	<a href="/katalog" class="btn btn-primary mt-4">Lihat katalog</a>
{:else}
	<!-- Kolom tunggal sempit terpusat -->
	<div class="mx-auto w-full max-w-[560px]">
		<!-- Cover besar -->
		<div class="card mt-3 overflow-hidden">
			{#if coverImage}
				<img src={coverImage} alt={product.title} class="datasaver-hide h-56 w-full object-cover" />
			{:else}
				<div
					class="flex h-56 items-center justify-center px-6 text-center text-lg font-semibold text-white"
					style="background: {product.cover_color}"
				>
					{product.cover_label}
				</div>
			{/if}
		</div>

		<!-- Judul + badge -->
		<div class="mt-4">
			<h2 class="font-serif text-xl leading-snug font-semibold">{product.title}</h2>
			<div class="mt-2 flex flex-wrap gap-1.5">
				<span class="badge badge-brand">{product.jenjang}</span>
				<span class="badge badge-leaf">{product.mapel}</span>
				{#if product.badge}
					<span class="badge badge-sun">{product.badge}</span>
				{/if}
			</div>
		</div>

		<!-- Harga -->
		<div class="mt-3 flex flex-wrap items-baseline gap-2">
			<p class="text-3xl font-semibold tabular-nums text-[#177245]">{formatRupiah(product.price)}</p>
			{#if product.strikethrough_price}
				<p class="text-base font-semibold text-[#6e675c] line-through">
					{formatRupiah(product.strikethrough_price)}
				</p>
				{#if discountPct > 0}
					<span class="badge badge-sun">Hemat {discountPct}%</span>
				{/if}
			{/if}
		</div>
		{#if addedMsg}
			<p class="ok-msg mt-3 flex items-center gap-1.5">
				<Icon name="check-circle" size={16} /> {addedMsg}
			</p>
		{/if}

		<!-- Deskripsi pendek -->
		{#if product.description}
			<p class="mt-3 text-sm leading-relaxed">{product.description}</p>
		{/if}

		<!-- Yang kamu dapatkan -->
		<h2 class="mt-6 flex items-center gap-2 text-base font-semibold">
			<Icon name="check-circle" size={18} /> Yang kamu dapatkan
		</h2>
		<ul class="card mt-2 space-y-2 p-4 text-sm">
			{#if chapters.length > 0}
				<li class="flex items-start gap-2">
					<Icon name="check-circle" size={16} class="mt-0.5 shrink-0 text-[#177245]" />
					<span>{chapters.length} bab rangkuman</span>
				</li>
			{/if}
			{#if product.pages > 0}
				<li class="flex items-start gap-2">
					<Icon name="check-circle" size={16} class="mt-0.5 shrink-0 text-[#177245]" />
					<span>{product.pages} halaman materi</span>
				</li>
			{/if}
			{#if hasQuiz}
				<li class="flex items-start gap-2">
					<Icon name="check-circle" size={16} class="mt-0.5 shrink-0 text-[#177245]" />
					<span>Kuis per bab</span>
				</li>
			{/if}
			{#if hasFlashcards}
				<li class="flex items-start gap-2">
					<Icon name="check-circle" size={16} class="mt-0.5 shrink-0 text-[#177245]" />
					<span>Flashcard per bab</span>
				</li>
			{/if}
			{#if simCount > 0}
				<li class="flex items-start gap-2">
					<Icon name="check-circle" size={16} class="mt-0.5 shrink-0 text-[#177245]" />
					<span>{simCount} simulasi SAS</span>
				</li>
			{/if}
			<li class="flex items-start gap-2">
				<Icon name="check-circle" size={16} class="mt-0.5 shrink-0 text-[#177245]" />
				<span>Sekali bayar, tanpa langganan</span>
			</li>
		</ul>

		<!-- Cara membeli -->
		<h2 class="mt-6 flex items-center gap-2 text-base font-semibold">
			<Icon name="shopping-cart" size={18} /> Cara membeli
		</h2>
		<div class="mt-2 space-y-2">
			<details class="card overflow-hidden">
				<summary class="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold">
					<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#177245] text-xs font-semibold text-white">1</span>
					Pilih produk dan checkout
				</summary>
				<p class="px-4 pb-4 text-sm leading-relaxed text-[#5f6b62]">
					Tambahkan produk ke keranjang, lalu lanjut ke checkout dan isi data pemesan.
				</p>
			</details>
			<details class="card overflow-hidden">
				<summary class="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold">
					<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#177245] text-xs font-semibold text-white">2</span>
					Bayar lewat QRIS
				</summary>
				<p class="px-4 pb-4 text-sm leading-relaxed text-[#5f6b62]">
					Scan kode QR SumoPod yang muncul dengan aplikasi pembayaran apa saja.
				</p>
			</details>
			<details class="card overflow-hidden">
				<summary class="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold">
					<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#177245] text-xs font-semibold text-white">3</span>
					Pesanan lunas, akses di Ruang Belajar
				</summary>
				<p class="px-4 pb-4 text-sm leading-relaxed text-[#5f6b62]">
					Setelah pembayaran terkonfirmasi, pesanan berubah menjadi lunas dan materi bisa dibuka di Ruang Belajar.
				</p>
			</details>
		</div>

		<!-- Daftar isi -->
		<h2 class="mt-6 flex items-center gap-2 text-base font-semibold">
			<Icon name="book-open" size={18} /> Daftar isi
		</h2>
		{#if chapters.length === 0}
			<p class="mt-2 text-sm text-[#5f6b62]">Daftar bab akan segera hadir.</p>
		{:else}
			<div class="mt-2 space-y-2">
				{#each bySubject as [subject, list] (subject)}
					<details class="card overflow-hidden">
						<summary class="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-semibold">
							<span>{subject}</span>
							<span class="shrink-0 text-xs font-semibold text-[#5f6b62]">{list.length} bab</span>
						</summary>
						<div class="space-y-2 px-4 pb-4">
							{#each list as c (c.id)}
								<div class="flex items-center gap-3">
									<span
										class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#3f4a42]"
									>
										<Icon name="file-text" size={16} />
									</span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold">{c.title}</p>
										<p class="text-xs text-[#5f6b62]">
											Kelas {c.grade} • Semester {c.semester}
											{#if c.video_url}
												• <Icon name="video" size={16} class="inline-block align-[-2px]" /> Ada video
											{/if}
										</p>
									</div>
								</div>
							{/each}
						</div>
					</details>
				{/each}
			</div>
		{/if}

		<!-- Kartu Ruang Belajar bila sudah LUNAS -->
		{#if owned}
			<div class="card mt-4 border-2 !border-[#177245] p-4">
				<p class="flex items-center gap-1.5 text-sm font-semibold text-[#065f46]">
					<Icon name="party-popper" size={16} /> Produk ini sudah milikmu.
				</p>
				<p class="mt-0.5 text-sm text-[#3f4a42]">
					Materi unduhan dan latihan web sudah terbuka di akunmu.
				</p>
				<div class="mt-3 grid gap-2 sm:grid-cols-2">
					{#if materialUrl}
						<a href={materialUrl} target="_blank" rel="noopener noreferrer" class="btn btn-sun w-full">
							<Icon name="file-text" size={16} /> PDF & Word
						</a>
					{/if}
					<a href={`/belajar/${product.id}`} class="btn btn-leaf w-full">
						<Icon name="book-open" size={16} /> Latihan web
					</a>
				</div>
			</div>
		{/if}

		<!-- Isi bundel -->
		{#if bundleItems.length > 0}
			<h2 class="mt-6 flex items-center gap-2 text-base font-semibold">
				<Icon name="package" size={18} /> Isi bundel
			</h2>
			<p class="text-xs text-[#5f6b62]">Bundel ini berisi {bundleItems.length} produk:</p>
			<div class="mt-2 space-y-2">
				{#each bundleItems as item (item.product_id)}
					<div class="card flex items-center justify-between gap-2 p-3">
						<span class="min-w-0 flex-1 text-sm font-semibold leading-snug">{item.title}</span>
						<span class="shrink-0 text-sm font-semibold text-[#177245]">{formatRupiah(item.price)}</span>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Galeri -->
		{#if images.length > 1}
			<div class="mt-4 flex gap-2 overflow-x-auto pb-1">
				{#each images as img (img.id)}
					<img
						src={img.url}
						alt=""
						class="datasaver-hide h-20 w-28 shrink-0 rounded-xl border border-[#e7e2d2] object-cover"
					/>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Bar beli bawah (sticky, selebar kolom) -->
	<div
		class="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[560px] -translate-x-1/2 gap-2 border-t border-[#e7e2d2] bg-[#fffdf7] px-4 py-3 pb-[env(safe-area-inset-bottom)]"
	>
		{#if owned}
			<a href={`/belajar/${product.id}`} class="btn btn-leaf w-full">
				<Icon name="book-open" size={16} /> Buka ruang belajar
			</a>
		{:else}
			<button type="button" class="btn btn-outline flex-1" onclick={tambahKeranjang}>
				<Icon name="shopping-cart" size={16} /> Tambah ke keranjang
			</button>
			<button type="button" class="btn btn-primary flex-1" onclick={beliSekarang}>
				<Icon name="zap" size={16} /> Beli sekarang
			</button>
		{/if}
	</div>
	<div class="h-16"></div>
{/if}
