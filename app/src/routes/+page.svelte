<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";

	let products = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");
	let jenjang = $state("Semua");

	// ---- Carousel promo ----
	const slides = [
		{
			kicker: "📘 Belajar jadi ringan",
			title: "Rangkuman Materi SD, SMP, SMA",
			text: "Teman belajar kamu: rangkuman kilat, kuis seru, dan simulasi SAS — semuanya ringkas dan mudah dipahami.",
			cta: "🔍 Cari Materi",
			href: "/katalog",
			bg: "linear-gradient(135deg, #2273d8, #159a68)"
		},
		{
			kicker: "🏅 Simulasi SAS per mapel",
			title: "Latihan SAS sesuai struktur baku",
			text: "Kelas 1–2: 25 soal • Kelas 3: 35 soal • Kelas 4: 38 soal • Kelas 5: 39 soal • Kelas 6: 40 soal. Ada pilihan ganda, benar/salah, menjodohkan, isian, dan uraian.",
			cta: "🎯 Coba Simulasi",
			href: "/katalog",
			bg: "linear-gradient(135deg, #1a5cb0, #2273d8)"
		},
		{
			kicker: "🧾 Paket SAS Kelas 1–6",
			title: "Paket SAS Rp17–21 ribu",
			text: "Satu paket per kelas, beli sekali lewat KlikQRIS, langsung bisa dipakai latihan di Ruang Belajar.",
			cta: "🛒 Lihat Paket SAS",
			href: "/katalog",
			bg: "linear-gradient(135deg, #159a68, #2273d8)"
		}
	];
	let slideIdx = $state(0);
	let paused = $state(false);
	let timer: ReturnType<typeof setInterval> | undefined;
	let touchX: number | null = null;

	function nextSlide() {
		slideIdx = (slideIdx + 1) % slides.length;
	}
	function prevSlide() {
		slideIdx = (slideIdx - 1 + slides.length) % slides.length;
	}
	function pauseAuto(ms: number) {
		paused = true;
		setTimeout(() => {
			paused = false;
		}, ms);
	}
	function onTouchStart(e: TouchEvent) {
		pauseAuto(4000);
		touchX = e.touches[0].clientX;
	}
	function onTouchEnd(e: TouchEvent) {
		if (touchX === null) return;
		const dx = e.changedTouches[0].clientX - touchX;
		if (Math.abs(dx) > 40) {
			if (dx < 0) nextSlide();
			else prevSlide();
		}
		touchX = null;
	}

	onMount(() => {
		timer = setInterval(() => {
			if (!paused) nextSlide();
		}, 5000);
		return () => clearInterval(timer);
	});

	let jenjangList = $derived(["Semua", ...new Set(products.map((p) => p.jenjang))]);
	let shown = $derived(
		jenjang === "Semua" ? products : products.filter((p) => p.jenjang === jenjang)
	);

	onMount(async () => {
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

<!-- Carousel promo -->
<section class="card overflow-hidden" aria-label="Promo Ringkas">
	<div
		class="relative overflow-hidden"
		role="region"
		aria-label="Carousel promo"
		ontouchstart={onTouchStart}
		ontouchend={onTouchEnd}
		onmouseenter={() => (paused = true)}
		onmouseleave={() => (paused = false)}
	>
		<div
			class="flex transition-transform duration-500 ease-in-out"
			style="transform: translateX(-{slideIdx * 100}%)"
		>
			{#each slides as s (s.title)}
				<div class="w-full shrink-0 px-5 py-6 text-white" style="background: {s.bg}">
					<p class="text-xs font-bold uppercase tracking-widest text-[#ffc531]">{s.kicker}</p>
					<h1 class="mt-1 text-2xl font-extrabold leading-snug">{s.title}</h1>
					<p class="mt-1 text-sm text-white/90">{s.text}</p>
					<a href={s.href} class="btn btn-sun mt-4">{s.cta}</a>
				</div>
			{/each}
		</div>
		<button
			type="button"
			class="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-lg font-extrabold text-white"
			aria-label="Slide sebelumnya"
			onclick={() => {
				prevSlide();
				pauseAuto(8000);
			}}
		>
			‹
		</button>
		<button
			type="button"
			class="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-lg font-extrabold text-white"
			aria-label="Slide berikutnya"
			onclick={() => {
				nextSlide();
				pauseAuto(8000);
			}}
		>
			›
		</button>
		<div class="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
			{#each slides as _, i (i)}
				<button
					type="button"
					class="h-2 rounded-full transition-all {i === slideIdx ? 'w-5 bg-white' : 'w-2 bg-white/50'}"
					aria-label="Ke slide {i + 1}"
					onclick={() => {
						slideIdx = i;
						pauseAuto(8000);
					}}
				></button>
			{/each}
		</div>
	</div>
	<div class="flex divide-x divide-[#e6eefb] text-center text-xs font-bold text-[#475569]">
		<div class="flex-1 px-2 py-3">✅ Rangkuman kilat</div>
		<div class="flex-1 px-2 py-3">🎮 Kuis interaktif</div>
		<div class="flex-1 px-2 py-3">🏅 Simulasi SAS</div>
	</div>
</section>

<!-- Chip jenjang -->
<div class="mt-5 flex gap-2 overflow-x-auto pb-1">
	{#each jenjangList as j (j)}
		<button type="button" class="chip" class:active={jenjang === j} onclick={() => (jenjang = j)}>
			{j === "Semua" ? "✨ Semua" : `🎒 ${j}`}
		</button>
	{/each}
</div>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#64748b]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if shown.length === 0}
	<p class="mt-6 text-center text-sm text-[#64748b]">Belum ada produk untuk jenjang ini.</p>
{:else}
	<div class="mt-3 grid grid-cols-2 gap-3">
		{#each shown as p (p.id)}
			<div
				class="card cursor-pointer overflow-hidden"
				onclick={() => buka(p.id)}
				onkeydown={(e) => e.key === "Enter" && buka(p.id)}
				role="button"
				tabindex="0"
			>
				<div
					class="flex h-24 items-center justify-center px-3 text-center text-sm font-extrabold text-white"
					style="background: {p.cover_color}"
				>
					<span class="leading-tight">{p.cover_label}</span>
				</div>
				<div class="p-3">
					{#if p.badge}
						<span class="badge badge-sun">{p.badge}</span>
					{/if}
					<h2 class="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-snug">{p.title}</h2>
					<p class="mt-0.5 text-[11px] font-semibold text-[#64748b]">
						{p.jenjang} • {p.mapel} • {p.pages} hlm
					</p>
					<div class="mt-2 flex items-end justify-between gap-1">
						<div>
							{#if p.strikethrough_price}
								<p class="text-[11px] font-semibold text-[#94a3b8] line-through">
									{formatRupiah(p.strikethrough_price)}
								</p>
							{/if}
							<p class="text-sm font-extrabold text-[#2273d8]">{formatRupiah(p.price)}</p>
						</div>
						<button
							type="button"
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2273d8] text-base font-extrabold text-white"
							aria-label="Tambah {p.title} ke keranjang"
							onclick={(e) => tambah(p.id, e)}
						>
							+
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
