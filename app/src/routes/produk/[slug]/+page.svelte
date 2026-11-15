<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, getToken, type ProductPublic, type ChapterMeta, type BundleItem } from "$lib/api";
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

	let featureImage = $derived(images.find((i) => i.kind === "feature")?.url ?? images[0]?.url);
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
		} catch (e) {
			error = e instanceof Error ? e.message : "Produk tidak ditemukan.";
		} finally {
			loading = false;
		}
	});

	function tambahKeranjang() {
		if (!product) return;
		cart.add(product.id);
		addedMsg = "Ditambahkan ke keranjang";
		setTimeout(() => (addedMsg = ""), 2000);
	}

	function beliSekarang() {
		if (!product) return;
		cart.add(product.id);
		goto("/checkout");
	}
</script>

<!-- Bar atas layar dorong: kembali + judul di tengah -->
<div
	class="sticky top-0 z-30 -mx-4 flex items-center gap-2 border-b border-[#e7e2d2] bg-[#fffdf7]/95 px-2 py-2.5 backdrop-blur"
>
	<button
		type="button"
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#177245]"
		aria-label="Kembali"
		onclick={() => history.back()}
	>
		<Icon name="chevron-left" size={24} />
	</button>
	<h1 class="min-w-0 flex-1 truncate text-center text-base font-bold">
		{loading ? "Detail Produk" : (product?.title ?? "Detail Produk")}
	</h1>
	<span class="h-9 w-9 shrink-0" aria-hidden="true"></span>
</div>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error || !product}
	<p class="err mt-6">{error || "Produk tidak ditemukan."}</p>
	<a href="/katalog" class="btn btn-primary mt-4">Lihat Katalog</a>
{:else}
	<!-- Cover besar -->
	<div class="card mt-3 overflow-hidden">
		{#if featureImage}
			<img src={featureImage} alt={product.title} class="h-44 w-full object-cover" />
		{:else}
			<div
				class="flex h-44 items-center justify-center px-6 text-center text-lg font-extrabold text-white"
				style="background: {product.cover_color}"
			>
				{product.cover_label}
			</div>
		{/if}
		<div class="p-4">
			<div class="flex flex-wrap gap-1.5">
				<span class="badge badge-brand">{product.jenjang}</span>
				<span class="badge badge-leaf">{product.mapel}</span>
				{#if product.badge}
					<span class="badge badge-sun">{product.badge}</span>
				{/if}
			</div>
			<p class="mt-2 text-sm text-[#5f6b62]">{product.pages} halaman • {product.category}</p>
			{#if product.description}
				<p class="mt-2 text-sm leading-relaxed">{product.description}</p>
			{/if}
			<div class="mt-3 flex items-baseline gap-2">
				<p class="text-2xl font-extrabold text-[#177245]">{formatRupiah(product.price)}</p>
				{#if product.strikethrough_price}
					<p class="text-sm font-semibold text-[#9aa096] line-through">
						{formatRupiah(product.strikethrough_price)}
					</p>
				{/if}
			</div>
			{#if addedMsg}
				<p class="ok-msg mt-3 flex items-center gap-1.5">
					<Icon name="check-circle" size={16} /> {addedMsg}
				</p>
			{/if}
		</div>
	</div>

	<!-- Galeri -->
	{#if images.length > 1}
		<div class="mt-3 flex gap-2 overflow-x-auto pb-1">
			{#each images as img (img.id)}
				<img
					src={img.url}
					alt=""
					class="h-20 w-28 shrink-0 rounded-xl border border-[#e7e2d2] object-cover"
				/>
			{/each}
		</div>
	{/if}

	<!-- Kartu Ruang Belajar bila sudah LUNAS -->
	{#if owned}
		<div class="card mt-4 border-2 !border-[#177245] p-4">
			<p class="flex items-center gap-1.5 text-sm font-extrabold text-[#065f46]">
				<Icon name="party-popper" size={16} /> Produk ini sudah milikmu!
			</p>
			<p class="mt-0.5 text-sm text-[#3f4a42]">
				Lanjutkan belajar, kerjakan kuis, dan coba simulasi SAS-nya.
			</p>
			<a href={`/belajar/${product.id}`} class="btn btn-leaf mt-3 w-full">
				<Icon name="book-open" size={16} /> Buka Ruang Belajar
			</a>
		</div>
	{/if}

	<!-- Isi Bundel -->
	{#if bundleItems.length > 0}
		<h2 class="mt-6 flex items-center gap-2 text-base font-extrabold">
			<Icon name="package" size={18} /> Isi Bundel
		</h2>
		<p class="text-xs text-[#5f6b62]">Bundel ini berisi {bundleItems.length} produk:</p>
		<div class="mt-2 space-y-2">
			{#each bundleItems as item (item.product_id)}
				<div class="card flex items-center justify-between gap-2 p-3">
					<span class="min-w-0 flex-1 text-sm font-bold leading-snug">{item.title}</span>
					<span class="shrink-0 text-sm font-extrabold text-[#177245]">{formatRupiah(item.price)}</span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Isi Materi -->
	<h2 class="mt-6 flex items-center gap-2 text-base font-extrabold">
		<Icon name="book-open" size={18} /> Isi Materi
	</h2>
	{#if chapters.length === 0}
		<p class="mt-2 text-sm text-[#5f6b62]">Daftar bab akan segera hadir.</p>
	{:else}
		{#each bySubject as [subject, list] (subject)}
			<h3 class="mt-4 text-sm font-extrabold text-[#177245]">{subject}</h3>
			<div class="mt-2 space-y-2">
				{#each list as c (c.id)}
					<div class="card flex items-center gap-3 p-3">
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#177245]"
						>
							<Icon name="file-text" size={17} />
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-bold">{c.title}</p>
							<p class="text-xs text-[#5f6b62]">
								Kelas {c.grade} • Semester {c.semester}
								{#if c.video_url}
									• <Icon name="video" size={13} class="inline-block align-[-2px]" /> Ada video
								{/if}
							</p>
						</div>
					</div>
				{/each}
			</div>
		{/each}
	{/if}

	<!-- Bar beli bawah -->
	<div
		class="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[430px] -translate-x-1/2 gap-2 border-t border-[#e7e2d2] bg-[#fffdf7] px-4 py-3 pb-[env(safe-area-inset-bottom)]"
	>
		<button type="button" class="btn btn-outline flex-1" onclick={tambahKeranjang}>
			<Icon name="shopping-cart" size={16} /> Tambah ke Keranjang
		</button>
		<button type="button" class="btn btn-primary flex-1" onclick={beliSekarang}>
			<Icon name="zap" size={16} /> Beli Sekarang
		</button>
	</div>
	<div class="h-16"></div>
{/if}
