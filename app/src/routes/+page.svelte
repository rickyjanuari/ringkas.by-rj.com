<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";
	import Icon from "$lib/Icon.svelte";

	let products = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");
	let jenjang = $state("Semua");

	// ---- Carousel promo ----
	const slides = [
		{
			icon: "book-open",
			kicker: "Belajar jadi ringan",
			title: "Rangkuman Materi SD, SMP, SMA",
			text: "Teman belajar kamu: rangkuman kilat, kuis seru, dan simulasi SAS — semuanya ringkas dan mudah dipahami.",
			cta: "Cari Materi",
			ctaIcon: "search",
			href: "/katalog",
			bg: "linear-gradient(135deg, #177245, #115c39)"
		},
		{
			icon: "trophy",
			kicker: "Simulasi SAS per mapel",
			title: "Latihan SAS sesuai struktur baku",
			text: "Kelas 1–2: 25 soal • Kelas 3: 35 soal • Kelas 4: 38 soal • Kelas 5: 39 soal • Kelas 6: 40 soal. Ada pilihan ganda, benar/salah, menjodohkan, isian, dan uraian.",
			cta: "Coba Simulasi",
			ctaIcon: "target",
			href: "/katalog",
			bg: "linear-gradient(135deg, #115c39, #177245)"
		},
		{
			icon: "receipt",
			kicker: "Paket SAS Kelas 1–6",
			title: "Paket SAS Rp17–21 ribu",
			text: "Satu paket per kelas, beli sekali lewat KlikQRIS, langsung bisa dipakai latihan di Ruang Belajar.",
			cta: "Lihat Paket SAS",
			ctaIcon: "shopping-cart",
			href: "/katalog",
			bg: "linear-gradient(135deg, #177245, #f2b33d)"
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
				<div class="w-full shrink-0 px-5 py-6 text-white lg:px-10 lg:py-10" style="background: {s.bg}">
					<p class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#f2b33d]">
						<Icon name={s.icon} size={14} /> {s.kicker}
					</p>
					<h1 class="mt-1 text-2xl font-extrabold leading-snug lg:text-4xl">{s.title}</h1>
					<p class="mt-1 max-w-2xl text-sm text-white/90 lg:text-base">{s.text}</p>
					<a href={s.href} class="btn btn-sun mt-4"><Icon name={s.ctaIcon} size={16} /> {s.cta}</a>
				</div>
			{/each}
		</div>
		<button
			type="button"
			class="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-white"
			aria-label="Slide sebelumnya"
			onclick={() => {
				prevSlide();
				pauseAuto(8000);
			}}
		>
			<Icon name="chevron-left" size={18} />
		</button>
		<button
			type="button"
			class="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/25 text-white"
			aria-label="Slide berikutnya"
			onclick={() => {
				nextSlide();
				pauseAuto(8000);
			}}
		>
			<Icon name="chevron-right" size={18} />
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
	<div class="flex divide-x divide-[#e7e2d2] text-center text-xs font-bold text-[#3f4a42]">
		<div class="flex flex-1 items-center justify-center gap-1 px-2 py-3">
			<Icon name="check" size={14} class="text-[#177245]" /> Rangkuman kilat
		</div>
		<div class="flex flex-1 items-center justify-center gap-1 px-2 py-3">
			<Icon name="gamepad-2" size={14} class="text-[#177245]" /> Kuis interaktif
		</div>
		<div class="flex flex-1 items-center justify-center gap-1 px-2 py-3">
			<Icon name="trophy" size={14} class="text-[#177245]" /> Simulasi SAS
		</div>
	</div>
</section>

<!-- Peta Belajar -->
<section class="card mt-4 p-4 lg:p-5" aria-label="Peta Belajar">
	<div class="flex items-center gap-3">
		<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="map" size={24} /></span>
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-extrabold">Peta Belajar</h2>
			<p class="text-sm text-[#5f6b62]">Ikuti jalur bab per kelas — node terbuka saat bab selesai.</p>
		</div>
	</div>
	<div class="mt-3 flex flex-wrap gap-2">
		{#each [1, 2, 3, 4, 5, 6] as g (g)}
			<a href="/peta-belajar/k{g}" class="chip">Kelas {g}</a>
		{/each}
	</div>
</section>

<!-- Chip jenjang -->
<div class="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-6">
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

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if shown.length === 0}
	<p class="mt-6 text-center text-sm text-[#5f6b62]">Belum ada produk untuk jenjang ini.</p>
{:else}
	<div class="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:mt-4 lg:grid-cols-4 lg:gap-4">
		{#each shown as p (p.id)}
			<div
				class="card cursor-pointer overflow-hidden"
				onclick={() => buka(p.id)}
				onkeydown={(e) => e.key === "Enter" && buka(p.id)}
				role="button"
				tabindex="0"
			>
				<div
					class="flex h-24 items-center justify-center px-3 text-center text-sm font-extrabold text-white lg:h-36 lg:text-base"
					style="background: {p.cover_color}"
				>
					<span class="leading-tight">{p.cover_label}</span>
				</div>
				<div class="p-3">
					{#if p.badge}
						<span class="badge badge-sun">{p.badge}</span>
					{/if}
					<h2 class="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-snug">{p.title}</h2>
					<p class="mt-0.5 text-[11px] font-semibold text-[#5f6b62]">
						{p.jenjang} • {p.mapel} • {p.pages} hlm
					</p>
					<div class="mt-2 flex items-end justify-between gap-1">
						<div>
							{#if p.strikethrough_price}
								<p class="text-[11px] font-semibold text-[#9aa096] line-through">
									{formatRupiah(p.strikethrough_price)}
								</p>
							{/if}
							<p class="text-sm font-extrabold text-[#177245]">{formatRupiah(p.price)}</p>
						</div>
						<button
							type="button"
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#177245] text-white"
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
