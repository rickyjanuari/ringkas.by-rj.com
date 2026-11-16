<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";
	import Icon from "$lib/Icon.svelte";
	import { gradeLabel, gradeOfProduct, gradeTheme } from "$lib/gradeTheme";

	let products = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");
	let jenjang = $state("Semua");

	// ---- Pengumuman (dari /api/announcement, gagal diam-diam) ----
	let announcementText = $state("");
	let announcementShown = $state(false);
	let bannerClosed = $state(false);

	// ---- Sampul fitur SAS (gambar asli di app/static/) ----
	const SAS_COVER: Record<string, string> = {
		"sas-k1-s1": "/feature-sas-kelas-1.png",
		"sas-k2": "/feature-sas-kelas-2.png",
		"sas-k3": "/feature-sas-kelas-3.png",
		"sas-k4": "/feature-sas-kelas-4.png",
		"sas-k5": "/feature-sas-kelas-5.png",
		"sas-k6": "/feature-sas-kelas-6.png"
	};

	// ---- Tumpukan sampul hero: 6 sampul mengipas ----
	const FAN_COVERS = [1, 2, 3, 4, 5, 6];
	const FAN_SPREAD = [
		{ x: -38, r: -10, y: 0 },
		{ x: -23, r: -6, y: 6 },
		{ x: -8, r: -2, y: 10 },
		{ x: 8, r: 2, y: 10 },
		{ x: 23, r: 6, y: 6 },
		{ x: 38, r: 10, y: 0 }
	];
	function fanStyle(i: number): string {
		const f = FAN_SPREAD[i];
		return `left: 50%; transform: translateX(-50%) translateX(${f.x}%) translateY(${f.y}px) rotate(${f.r}deg); z-index: ${i + 1};`;
	}

	// ---- FAQ (teks persis FaqContent.svelte) ----
	const FAQ = [
		{
			q: "Apa itu Ringkas?",
			a: "Ringkas adalah teman belajar untuk anak SD: rangkuman materi per bab yang ringkas, kuis per bab, flashcard, dan simulasi SAS per mata pelajaran. Tagline kami: Rangkuman Materi SD, SMP, SMA — saat ini fokus ke SD dulu."
		},
		{
			q: "Bagaimana cara membeli produk?",
			a: "Pilih produk di Katalog, masukkan ke Keranjang, lalu checkout. Pembayaran hanya lewat KlikQRIS: scan kode QR yang muncul, dan pesananmu berubah menjadi LUNAS setelah pembayaran terkonfirmasi. Satu produk dibeli sekali, tanpa langganan."
		},
		{
			q: "Di mana materi saya setelah membayar?",
			a: "Buka tab Pesanan — pesanan LUNAS punya tombol Belajar dan unduhan PDF. Ada juga link produk eksternal (misalnya Google Drive) bila tersedia untuk produk itu."
		},
		{
			q: "Apa itu simulasi SAS?",
			a: "Simulasi Sumatif Akhir Semester per mata pelajaran, dengan jumlah soal dan waktu sesuai struktur baku per kelas: Kelas 1–2 sebanyak 25 soal (60 menit), Kelas 3 sebanyak 35 soal (70 menit), Kelas 4 sebanyak 38 soal (80 menit), Kelas 5 sebanyak 39 soal (90 menit), dan Kelas 6 sebanyak 40 soal (90 menit)."
		},
		{
			q: "Apakah progres belajar saya tersimpan?",
			a: "Ya, bila kamu masuk dengan akun. Bab yang selesai, streak harian, stiker, dan nilai kuis tersimpan di Akun, bagian Tracker Belajar. Catatan dan bookmark yang kamu buat juga tersimpan di akunmu."
		},
		{
			q: "Bagaimana cara menghubungi admin?",
			a: "Lewat tombol WhatsApp di halaman produk atau di Pesanan saya. Pesan WhatsApp terbuka dengan teks siap kirim — bukan pengiriman otomatis dari server."
		}
	];
	let faqOpen = $state<number | null>(0);

	let jenjangList = $derived(["Semua", ...new Set(products.map((p) => p.jenjang))]);
	let shown = $derived(
		jenjang === "Semua" ? products : products.filter((p) => p.jenjang === jenjang)
	);

	onMount(async () => {
		// Pengumuman tidak boleh memperlambat katalog: muat paralel, gagal diam-diam.
		api<{
			announcement_text: string | null;
			announcement_enabled: number | boolean;
		}>("/api/announcement")
			.then((d) => {
				if (d.announcement_enabled && d.announcement_text) {
					announcementText = d.announcement_text;
					announcementShown = true;
				}
			})
			.catch(() => {
				/* banner diam-diam tidak tampil */
			});
		try {
			const data = await api<{ products: ProductPublic[] }>("/api/catalog");
			products = data.products ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat katalog.";
		} finally {
			loading = false;
		}
	});

	function tambah(id: string, ev: MouseEvent) {
		ev.stopPropagation();
		cart.add(id);
	}

	function buka(id: string) {
		goto(`/produk/${id}`);
	}
</script>

<!-- Banner pengumuman -->
{#if announcementShown && !bannerClosed}
	<div class="mb-3 flex items-start gap-2 rounded-xl bg-[#177245] px-3 py-2.5 text-sm font-semibold text-white" role="status">
		<Icon name="sparkles" size={18} class="mt-0.5 shrink-0" />
		<p class="flex-1">{announcementText}</p>
		<button
			type="button"
			aria-label="Tutup pengumuman"
			class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"
			onclick={() => (bannerClosed = true)}
		>
			<Icon name="x" size={16} />
		</button>
	</div>
{/if}

<!-- Hero -->
<section class="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-10" aria-label="Tentang Ringkas">
	<div>
		<p class="flex flex-wrap gap-1.5">
			<span class="badge badge-leaf">Sekali bayar</span>
			<span class="badge badge-sun">Simulasi SAS</span>
			<span class="badge badge-leaf">Kelas 1–6 SD</span>
		</p>
		<h1 class="mt-3 text-3xl font-semibold leading-tight lg:text-[2.75rem] lg:leading-[1.15]">
			Rangkuman <span class="u-pencil">materi</span> SD kelas 1–6
		</h1>
		<p class="mt-2 max-w-xl text-sm text-[#5f6b62] lg:text-base">
			Teman belajar kamu: rangkuman kilat, kuis seru, dan simulasi SAS — semuanya ringkas dan mudah
			dipahami.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-2">
			<a href="#katalog" class="btn btn-primary"><Icon name="search" size={16} /> Lihat katalog</a>
			<a href="/belajar/k1" class="btn btn-outline"><Icon name="play" size={16} /> Coba gratis</a>
		</div>
		<p class="mt-2 text-xs font-medium text-[#5f6b62]">
			Bab 1 Kelas 1 gratis untuk akun yang sudah masuk.
		</p>
		<ul class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
			<li class="flex items-start gap-1.5 text-sm font-medium text-[#3f4a42]">
				<Icon name="check" size={18} class="mt-0.5 shrink-0 text-[#177245]" />
				Sekali bayar, tanpa langganan
			</li>
			<li class="flex items-start gap-1.5 text-sm font-medium text-[#3f4a42]">
				<Icon name="check" size={18} class="mt-0.5 shrink-0 text-[#177245]" />
				Simulasi SAS sesuai struktur baku
			</li>
			<li class="flex items-start gap-1.5 text-sm font-medium text-[#3f4a42]">
				<Icon name="check" size={18} class="mt-0.5 shrink-0 text-[#177245]" />
				Rangkuman per bab + kuis
			</li>
			<li class="flex items-start gap-1.5 text-sm font-medium text-[#3f4a42]">
				<Icon name="check" size={18} class="mt-0.5 shrink-0 text-[#177245]" />
				Progres tersimpan di akun
			</li>
		</ul>
	</div>

	<!-- Tumpukan sampul produk mengipas -->
	<div
		class="relative mx-auto h-[240px] w-full max-w-[440px] sm:h-[280px] lg:h-[320px]"
		aria-label="Sampul Paket SAS kelas 1 sampai 6"
	>
		{#each FAN_COVERS as g, i (g)}
			<img
				src="/feature-sas-kelas-{g}.png"
				alt="Sampul Paket SAS Kelas {g}"
				width="1080"
				height="1080"
				loading="lazy"
				class="absolute top-0 w-[46%] rounded-xl border border-[#e7e2d2] bg-[#fffdf7] shadow-[0_10px_24px_rgb(0_0_0/0.18)]"
				style={fanStyle(i)}
			/>
		{/each}
		<p
			class="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#22302a] px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
		>
			Paket SAS Rp17–21 ribu
		</p>
	</div>
</section>

<!-- Katalog -->
<section id="katalog" class="mt-12 scroll-mt-20 lg:mt-14" aria-label="Katalog">
	<p class="home-kicker">Katalog</p>
	<h2 class="home-h2 mt-1">Materi dan paket SAS</h2>
	<div class="mt-4 flex gap-2 overflow-x-auto pb-1">
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

	{#if loading}
		<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
	{:else if error}
		<p class="err mt-6">{error}</p>
	{:else if shown.length === 0}
		<p class="mt-6 text-center text-sm text-[#5f6b62]">Belum ada produk untuk jenjang ini.</p>
	{:else}
		<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:mt-4 lg:grid-cols-4 lg:gap-4">
			{#each shown as p (p.id)}
				{@const gt = gradeTheme(gradeOfProduct(p.id))}
				<div
					class="card home-product cursor-pointer overflow-hidden"
					onclick={() => buka(p.id)}
					onkeydown={(e) => e.key === "Enter" && buka(p.id)}
					role="button"
					tabindex="0"
				>
					<div class="h-1.5 shrink-0" style="background: {gt.accent}" aria-hidden="true"></div>
					{#if SAS_COVER[p.id]}
						<img
							src={SAS_COVER[p.id]}
							alt="Sampul {p.title}"
							width="1080"
							height="1080"
							loading="lazy"
							class="h-24 w-full object-cover object-top lg:h-36"
						/>
					{:else}
						<div
							class="flex h-24 items-center justify-center px-3 text-center text-sm font-semibold text-white shadow-[inset_0_-12px_20px_-12px_rgb(0_0_0/0.35)] lg:h-36 lg:text-base"
							style="background: {p.cover_color}"
						>
							<span class="leading-tight">{p.cover_label}</span>
						</div>
					{/if}
					<div class="p-3">
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
						<h2 class="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-snug">{p.title}</h2>
						<p class="mt-0.5 text-[11px] font-semibold text-[#5f6b62]">
							{p.jenjang} • {p.mapel} • {p.pages} hlm
						</p>
						<div class="mt-2 flex items-end justify-between gap-1">
							<div>
								{#if p.strikethrough_price}
									<p class="text-[11px] font-semibold text-[#6e675c] line-through">
										{formatRupiah(p.strikethrough_price)}
									</p>
								{/if}
								<p class="text-sm font-semibold tabular-nums text-[#177245]">{formatRupiah(p.price)}</p>
							</div>
							<button
								type="button"
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#177245] text-white"
								aria-label="Tambah {p.title} ke keranjang"
								onclick={(e) => tambah(p.id, e)}
							>
								<Icon name="plus" size={18} />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>

<!-- FAQ -->
<section class="mt-12 lg:mt-14" aria-label="Pertanyaan umum">
	<p class="home-kicker">Pertanyaan umum</p>
	<h2 class="home-h2 mt-1">Yang sering ditanyakan</h2>
	<div class="mt-4 space-y-3">
		{#each FAQ as item, i (item.q)}
			<div class="card p-4">
				<button
					type="button"
					class="flex w-full items-center justify-between gap-3 text-left font-semibold"
					aria-expanded={faqOpen === i}
					onclick={() => (faqOpen = faqOpen === i ? null : i)}
				>
					<span>{item.q}</span>
					<Icon
						name="chevron-down"
						size={18}
						class="shrink-0 text-[#177245] transition-transform duration-300 ease-signature {faqOpen === i
							? 'rotate-180'
							: ''}"
					/>
				</button>
				{#if faqOpen === i}
					<p class="mt-1 text-sm text-[#3f4a42]">{item.a}</p>
				{/if}
			</div>
		{/each}
	</div>
</section>
