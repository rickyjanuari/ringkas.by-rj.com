<script lang="ts">
	import { onMount } from "svelte";
	import { api, type ProductPublic } from "$lib/api";
	import { gradeLabel } from "$lib/gradeTheme";
	import { settingsStore } from "$lib/settings";
	import Icon from "$lib/Icon.svelte";
	import ProductCard from "$lib/ProductCard.svelte";

	const SAMPLE_URL = "/shorts/membilang-10.html";
	const GRADES = [1, 2, 3, 4, 5, 6];
	const PREVIEW_LIMIT = 4;
	const FEATURES = [
		{ icon: "book-open", title: "Rangkuman per bab", description: "Temukan inti materi dengan cepat." },
		{ icon: "target", title: "Kuis & latihan SAS", description: "Latih pemahaman sebelum ujian." },
		{ icon: "credit-card", title: "Sekali bayar", description: "Akses materi tanpa langganan." }
	];
	const FAQ = [
		{
			question: "Apa itu Ringkas?",
			answer: "Ringkas menyediakan rangkuman per bab, kuis, flashcard, dan latihan Sumatif Akhir Semester (SAS). Koleksi utama kami ditujukan untuk kelas 1–6 SD dan MI."
		},
		{
			question: "Bagaimana cara membeli paket?",
			answer: "Pilih paket di katalog dan tambahkan ke keranjang. Saat checkout, ikuti petunjuk pembayaran QRIS. Pesanan akan otomatis ditandai lunas setelah pembayaran terkonfirmasi."
		},
		{
			question: "Di mana saya bisa membuka materi yang sudah dibeli?",
			answer: "Buka Pesanan, lalu pilih pesanan yang sudah lunas. Materi bisa dibuka di Ruang Belajar atau diunduh sesuai isi paket."
		},
		{
			question: "Apakah progres belajar saya tersimpan?",
			answer: "Ya, saat kamu masuk dengan akun Ringkas. Bab yang selesai, streak, stiker, dan nilai kuis tersimpan di Tracker Belajar pada halaman Akun."
		}
	];

	let products = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");
	let grade = $state<number | null>(null);
	let announcement = $state("");
	let announcementClosed = $state(false);
	let matching = $derived(grade === null ? products : products.filter((p) => gradeLabel(p.id) === `Kelas ${grade}`));
	let preview = $derived(matching.slice(0, PREVIEW_LIMIT));

	async function loadProducts() {
		loading = true;
		error = "";
		try {
			const data = await api<{ products: ProductPublic[] }>("/api/catalog");
			products = (data.products ?? []).slice().sort((a, b) =>
				(gradeLabel(a.id) ?? "Umum").localeCompare(gradeLabel(b.id) ?? "Umum", "id")
			);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : "Gagal memuat katalog.";
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadProducts();
		api<{ announcement_text: string | null; announcement_enabled: number | boolean }>("/api/announcement")
			.then((data) => {
				if (data.announcement_enabled && data.announcement_text) announcement = data.announcement_text;
			})
			.catch(() => {});
	});
</script>

{#if announcement && !announcementClosed}
	<div class="home-announcement">
		<p role="status">{announcement}</p>
		<button type="button" aria-label="Tutup pengumuman" onclick={() => (announcementClosed = true)}>
			<Icon name="x" size={20} />
		</button>
	</div>
{/if}

<section class="home-hero" aria-labelledby="hero-title">
	<div class="hero-copy">
		<p class="eyebrow hero-eyebrow"><span></span> Materi SD & MI · Kelas 1–6</p>
		<h1 id="hero-title">Belajar jadi <em>lebih ringkas.</em></h1>
		<p class="hero-description">Pahami inti materi, uji dengan kuis, dan siapkan diri untuk SAS. Mulai dari bab atau kelas yang kamu butuhkan.</p>
		<div class="hero-actions">
			<a class="store-button store-button-accent" href="#katalog">Jelajahi materi <Icon name="arrow-right" size={20} /></a>
		</div>
	</div>
	<div class="hero-visual">
		{#if !$settingsStore.data_saver}
			<img src="/hero-scene.webp" alt="" width="2048" height="1152" fetchpriority="high" />
		{/if}
		<a href={SAMPLE_URL} data-sveltekit-reload class="hero-sample">
			<span>
				<span class="eyebrow">Video gratis · Kelas 1</span>
				<strong>Membilang sampai 10</strong>
			</span>
			<span class="sample-arrow"><Icon name="play" size={19} /></span>
		</a>
	</div>
</section>

<ul class="home-features">
	{#each FEATURES as feature (feature.title)}
		<li>
			<span class="feature-icon"><Icon name={feature.icon} size={22} /></span>
			<div><strong>{feature.title}</strong><p>{feature.description}</p></div>
		</li>
	{/each}
</ul>

<section id="katalog" class="home-catalog" aria-labelledby="home-catalog-title">
	<div class="section-heading">
		<h2 id="home-catalog-title" class="store-title">Mulai dari kelasmu.</h2>
		<a class="store-text-link" href={grade === null ? "/katalog" : `/katalog?kelas=${grade}`}>Lihat katalog <Icon name="arrow-right" size={19} /></a>
	</div>
	<div class="store-filters" role="group" aria-label="Pilih kelas">
		<button class="store-filter" type="button" aria-pressed={grade === null} onclick={() => (grade = null)}>Semua kelas</button>
		{#each GRADES as number (number)}
			<button class="store-filter" type="button" aria-pressed={grade === number} onclick={() => (grade = number)}>Kelas {number}</button>
		{/each}
	</div>
	{#if loading}
		<p class="store-state" role="status">Memuat katalog…</p>
	{:else if error}
		<div class="store-state">
			<p role="alert">{error}</p>
			<button class="store-button store-button-outline" type="button" onclick={loadProducts}>Coba lagi</button>
		</div>
	{:else if preview.length === 0}
		<p class="store-state" role="status">Belum ada materi untuk pilihan ini.</p>
	{:else}
		<p class="sr-only" role="status">Menampilkan {preview.length} dari {matching.length} produk.</p>
		<div class="product-grid">
			{#each preview as product (product.id)}
				<ProductCard {product} />
			{/each}
		</div>
	{/if}
</section>

<section class="home-faq" aria-labelledby="home-faq-title">
	<div>
		<h2 id="home-faq-title" class="store-title">Sering ditanyakan.</h2>
		<a class="store-text-link" href="/faq">Lihat semua pertanyaan <Icon name="arrow-right" size={19} /></a>
	</div>
	<div>
		{#each FAQ as item (item.question)}
			<details name="home-faq">
				<summary>{item.question}<Icon name="plus" size={20} /></summary>
				<p>{item.answer}</p>
			</details>
		{/each}
	</div>
</section>
