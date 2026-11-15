<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, getToken, type ProductPublic } from "$lib/api";
	import { auth, cart } from "$lib/store";
	import {
		applyCachedSettings,
		loadSettings,
		saveSettings,
		type UserSettings
	} from "$lib/settings";
	import Avatar from "$lib/Avatar.svelte";
	import Icon from "$lib/Icon.svelte";
	import { gradeLabel, gradeOfProduct, gradeTheme } from "$lib/gradeTheme";

	let products = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");
	let jenjang = $state("Semua");

	// ---- Saklar cepat aksesibilitas & hemat data (hanya bila login) ----
	let homeSettings = $state<UserSettings | null>(null);
	let togglingKey = $state<keyof UserSettings | null>(null);

	async function togglePengaturan(key: keyof UserSettings) {
		if (!homeSettings || togglingKey) return;
		const lama = homeSettings[key];
		const baru = (lama === 1 ? 0 : 1) as 0 | 1;
		homeSettings = { ...homeSettings, [key]: baru };
		togglingKey = key;
		try {
			homeSettings = await saveSettings({ [key]: baru });
		} catch {
			homeSettings = { ...homeSettings, [key]: lama };
		} finally {
			togglingKey = null;
		}
	}

	// ---- Tryout mendatang (dari /api/tryouts, gagal diam-diam) ----
	interface TryoutRingkas {
		id: string;
		grade: number;
		title: string;
		starts_at: string;
		ends_at: string;
		duration_minutes: number;
		question_count: number;
		is_free: number;
		phase: "upcoming" | "live" | "ended";
		participants: number;
		registered?: boolean;
	}
	let tryouts = $state<TryoutRingkas[]>([]);
	let nowMs = $state(Date.now());

	function hitungMundurTryout(t: TryoutRingkas): string {
		const start = new Date(t.starts_at).getTime();
		const end = new Date(t.ends_at).getTime();
		if (nowMs >= start && nowMs <= end) return "Sedang berlangsung";
		const sisa = start - nowMs;
		if (sisa <= 0) return "Sudah berakhir";
		const h = Math.floor(sisa / 3600000);
		const d = Math.floor(h / 24);
		const m = Math.floor((sisa % 3600000) / 60000);
		if (d > 0) return `Mulai dalam ${d} hari ${h % 24} jam`;
		if (h > 0) return `Mulai dalam ${h} jam ${m} mnt`;
		return `Mulai dalam ${m} mnt`;
	}

	/** Tryout berikutnya per kelas (mendatang/berlangsung), maks. 6 kartu. */
	let tryoutBerikut = $derived(
		[1, 2, 3, 4, 5, 6]
			.map((g) => tryouts.filter((t) => t.grade === g && t.phase !== "ended").sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0])
			.filter((t): t is TryoutRingkas => !!t)
	);

	// ---- Level & XP + Hitung Mundur SAS (gagal diam-diam) ----
	type XpMini = {
		totalXp: number;
		level: number;
		xpIntoLevel: number;
		xpForNextLevel: number;
		stage: number;
		stageName: string;
	};
	type ExamDateHome = { grade: number; date: string | null; label: string; daysLeft: number | null };
	let homeXp = $state<XpMini | null>(null);
	let homeExam = $state<ExamDateHome[] | null>(null);
	let homeExamFailed = $state(false);

	/** Tanggal ISO (YYYY-MM-DD) ke format Indonesia, tanpa geser zona waktu. */
	function formatTanggalId(iso: string): string {
		const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
	}

	/** Tanggal SAS terdekat yang sudah diatur (paling sedikit hari lagi, belum lewat). */
	let homeExamNext = $derived(
		(homeExam ?? [])
			.filter((d) => d.date !== null && d.daysLeft !== null && (d.daysLeft as number) >= 0)
			.sort((a, b) => (a.daysLeft as number) - (b.daysLeft as number))[0] ?? null
	);

	function homeExamLabel(d: ExamDateHome): string {
		if (d.daysLeft === 0) return `SAS Kelas ${d.grade} — Hari ini (${formatTanggalId(d.date as string)})`;
		if (d.daysLeft === 1) return `SAS Kelas ${d.grade} — Besok (${formatTanggalId(d.date as string)})`;
		return `SAS Kelas ${d.grade} — ${d.daysLeft} hari lagi (${formatTanggalId(d.date as string)})`;
	}

	// ---- Pengumuman & promo (dari /api/announcement, gagal diam-diam) ----
	let announcementText = $state("");
	let announcementShown = $state(false);
	let bannerClosed = $state(false);
	let promoText = $state("");

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
		// Saklar cepat: baca cache dulu, lalu sinkronkan dari server.
		if (getToken()) {
			homeSettings = applyCachedSettings();
			loadSettings()
				.then((s) => {
					homeSettings = s;
				})
				.catch(() => {
					/* tetap pakai cache */
				});
		}
		timer = setInterval(() => {
			if (!paused) nextSlide();
			nowMs = Date.now();
		}, 5000);
		return () => clearInterval(timer);
	});

	let jenjangList = $derived(["Semua", ...new Set(products.map((p) => p.jenjang))]);
	let shown = $derived(
		jenjang === "Semua" ? products : products.filter((p) => p.jenjang === jenjang)
	);

	onMount(async () => {
		// XP mini + tanggal SAS: gagal diam-diam, tidak boleh memperlambat katalog.
		if (getToken()) {
			api<XpMini>("/api/xp")
				.then((d) => {
					homeXp = d;
				})
				.catch(() => {
					/* kartu XP diam-diam tidak tampil */
				});
		}
		api<{ dates: ExamDateHome[] }>("/api/exam-dates")
			.then((d) => {
				homeExam = d.dates ?? [];
			})
			.catch(() => {
				homeExamFailed = true;
			});
		// Tryout mendatang: gagal diam-diam, tidak boleh memperlambat katalog.
		api<{ tryouts: TryoutRingkas[] }>("/api/tryouts")
			.then((d) => {
				tryouts = d.tryouts ?? [];
			})
			.catch(() => {
				/* kartu tryout diam-diam tidak tampil */
			});
		// Pengumuman tidak boleh memperlambat katalog: muat paralel, gagal diam-diam.
		api<{
			announcement_text: string | null;
			announcement_enabled: number | boolean;
			promo_text: string | null;
			promo_enabled: number | boolean;
		}>("/api/announcement")
			.then((d) => {
				if (d.announcement_enabled && d.announcement_text) {
					announcementText = d.announcement_text;
					announcementShown = true;
				}
				if (d.promo_enabled && d.promo_text) promoText = d.promo_text;
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
	<div class="mb-3 flex items-start gap-2 rounded-xl bg-[#177245] px-3 py-2.5 text-sm font-bold text-white" role="status">
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
			{#each slides as s, i (s.title)}
				<div class="w-full shrink-0 px-5 py-6 text-white lg:px-10 lg:py-10" style="background: {s.bg}">
					<p class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#f2b33d]">
						<Icon name={s.icon} size={14} /> {s.kicker}
					</p>
					<h1 class="mt-1 text-2xl font-extrabold leading-snug lg:text-4xl">{s.title}</h1>
					<p class="mt-1 max-w-2xl text-sm text-white/90 lg:text-base">{i === 2 && promoText ? promoText : s.text}</p>
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
			{@const gtChip = gradeTheme(g)}
			<a
				href="/peta-belajar/k{g}"
				class="chip"
				style="background: {gtChip.soft}; border-color: {gtChip.accent}; color: {gtChip.text}"
			>
				Kelas {g}
			</a>
		{/each}
	</div>
</section>

<!-- Soal Cerita Sehari-hari -->
<section class="card mt-4 p-4 lg:p-5" aria-label="Soal Cerita Sehari-hari">
	<div class="flex items-center gap-3">
		<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="message" size={24} /></span>
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-extrabold">Soal Cerita Sehari-hari</h2>
			<p class="text-sm text-[#5f6b62]">Soal Matematika dan Bahasa Indonesia dari situasi nyata — belanja di warung, berbagi kue, antrean.</p>
		</div>
		<a href="/soal-cerita" class="btn btn-leaf shrink-0">Mulai Latihan</a>
	</div>
</section>

<!-- Simulasi ANBK Kelas 5 -->
<section class="card mt-4 p-4 lg:p-5" aria-label="Simulasi ANBK Kelas 5">
	<div class="flex items-center gap-3">
		<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="graduation-cap" size={24} /></span>
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-extrabold">Simulasi ANBK Kelas 5</h2>
			<p class="text-sm text-[#5f6b62]">Latihan Asesmen Nasional: Literasi dan Numerasi, 20 soal tiap paket, 60 menit.</p>
		</div>
		<a href="/anbk" class="btn btn-leaf shrink-0">Lihat ANBK</a>
	</div>
</section>

<!-- Latihan Adaptif -->
<section class="card mt-4 p-4 lg:p-5" aria-label="Latihan Adaptif">
	<div class="flex items-center gap-3">
		<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="target" size={24} /></span>
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-extrabold">Latihan Adaptif</h2>
			<p class="text-sm text-[#5f6b62]">Soal menyesuaikan jawabanmu — benar jadi lebih sulit, salah jadi lebih mudah dulu.</p>
		</div>
		<a href="/latihan-adaptif" class="btn btn-leaf shrink-0">Mulai Latihan</a>
	</div>
</section>

<!-- Latihan Tanpa Habis -->
<section class="card mt-4 p-4 lg:p-5" aria-label="Latihan Tanpa Habis">
	<div class="flex items-center gap-3">
		<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="refresh" size={24} /></span>
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-extrabold">Latihan Tanpa Habis</h2>
			<p class="text-sm text-[#5f6b62]">Soal hitung dengan angka yang selalu baru — tidak pernah habis, kapan pun kamu mau latihan.</p>
		</div>
		<a href="/latihan-tanpa-habis" class="btn btn-leaf shrink-0">Mulai Latihan</a>
	</div>
</section>

<!-- Portofolioku (hanya bila login) -->
{#if $auth.user}
	<section class="card mt-4 p-4 lg:p-5" aria-label="Portofolioku">
		<div class="flex items-center gap-3">
			<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="pen" size={24} /></span>
			<div class="min-w-0 flex-1">
				<h2 class="text-base font-extrabold">Portofolioku</h2>
				<p class="text-sm text-[#5f6b62]">Pamerkan karyamu — orang tua dan gurumu bisa memberi bintang dan komentar.</p>
			</div>
			<a href="/portofolio" class="btn btn-leaf shrink-0">Lihat Karya</a>
		</div>
	</section>

	<!-- Saklar cepat aksesibilitas & hemat data -->
	{#if homeSettings}
		<section class="card mt-4 p-4 lg:p-5" aria-label="Aksesibilitas dan Hemat Data">
			<div class="flex items-center gap-3">
				<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="eye" size={24} /></span>
				<div class="min-w-0 flex-1">
					<h2 class="text-base font-extrabold">Aksesibilitas &amp; Hemat Data</h2>
					<p class="text-sm text-[#5f6b62]">Atur tampilan supaya lebih nyaman dibaca dan lebih ringan.</p>
				</div>
				<a href="/akun" class="btn btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Semua Pengaturan</a>
			</div>
			<div class="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					class="chip"
					class:active={homeSettings.readable_font === 1}
					disabled={togglingKey !== null}
					onclick={() => togglePengaturan("readable_font")}
				>
					<Icon name="book-open" size={14} /> Font ramah baca
				</button>
				<button
					type="button"
					class="chip"
					class:active={homeSettings.data_saver === 1}
					disabled={togglingKey !== null}
					onclick={() => togglePengaturan("data_saver")}
				>
					<Icon name="zap" size={14} /> Mode hemat data
				</button>
			</div>
		</section>
	{/if}
{/if}

<!-- Level & XP mini (hanya bila login) -->
{#if $auth.user}
	<section class="card mt-4 p-4 lg:p-5" aria-label="Level dan XP">
		<div class="flex items-center gap-3">
			{#if homeXp}
				<Avatar stage={homeXp.stage} size={48} />
			{:else}
				<span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="sprout" size={24} /></span>
			{/if}
			<div class="min-w-0 flex-1">
				<h2 class="text-base font-extrabold">Level &amp; XP</h2>
				{#if homeXp}
					<p class="text-sm text-[#5f6b62]">Level {homeXp.level} • {homeXp.totalXp} XP • {homeXp.stageName}</p>
					<div class="mt-1.5 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
						<div
							class="h-full bg-[#177245] transition-all"
							style="width: {homeXp.xpForNextLevel > 0
								? Math.min(100, Math.round((homeXp.xpIntoLevel / homeXp.xpForNextLevel) * 100))
								: 100}%"
						></div>
					</div>
				{:else}
					<p class="text-sm text-[#5f6b62]">Kumpulkan XP dari bab, kuis, dan cerita.</p>
				{/if}
			</div>
			<a href="/akun" class="btn btn-leaf shrink-0">Lihat Akun</a>
		</div>
	</section>
{/if}

<!-- Hitung Mundur SAS -->
<section class="card mt-4 p-4 lg:p-5" aria-label="Hitung Mundur SAS">
	<div class="flex items-center gap-3">
		<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="calendar" size={24} /></span>
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-extrabold">Hitung Mundur SAS</h2>
			{#if homeExamFailed}
				<p class="text-sm text-[#5f6b62]">Tanggal SAS belum bisa dimuat.</p>
			{:else if homeExam === null}
				<p class="text-sm text-[#5f6b62]">Memuat tanggal SAS...</p>
			{:else if homeExamNext}
				<p class="text-sm text-[#5f6b62]">{homeExamLabel(homeExamNext)}</p>
			{:else}
				<p class="text-sm text-[#5f6b62]">Tanggal SAS belum diatur.</p>
			{/if}
		</div>
		<a href="/akun" class="btn btn-leaf shrink-0">Detail</a>
	</div>
</section>

<!-- Cerita Edukasi -->
<section class="card mt-4 p-4 lg:p-5" aria-label="Cerita Edukasi">
	<div class="flex items-center gap-3">
		<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="book-open" size={24} /></span>
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-extrabold">Cerita Edukasi</h2>
			<p class="text-sm text-[#5f6b62]">Baca cerita pendek, lalu jawab kuis pemahamannya dan kumpulkan XP.</p>
		</div>
		<a href="/cerita" class="btn btn-leaf shrink-0">Baca Cerita</a>
	</div>
</section>

<!-- Tryout Mendatang -->
{#if tryoutBerikut.length > 0}
	<section class="card mt-4 p-4 lg:p-5" aria-label="Tryout Mendatang">
		<div class="flex items-center gap-3">
			<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="trophy" size={24} /></span>
			<div class="min-w-0 flex-1">
				<h2 class="text-base font-extrabold">Tryout Mendatang</h2>
				<p class="text-sm text-[#5f6b62]">Ujian bersama per kelas — daftar, kerjakan saat waktunya tiba, dan lihat peringkatmu.</p>
			</div>
			<a href="/tryout" class="btn btn-outline shrink-0 text-xs">Semua Tryout</a>
		</div>
		<div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{#each tryoutBerikut as t (t.id)}
				<a href="/tryout/{t.id}" class="card !rounded-lg p-3">
					<p class="flex flex-wrap items-center gap-1.5">
						<span class="badge {t.phase === 'live' ? 'badge-leaf' : 'badge-sun'}">
							{t.phase === "live" ? "Berlangsung" : "Mendatang"}
						</span>
						{#if t.is_free}<span class="badge badge-leaf">Gratis</span>{/if}
					</p>
					<p class="mt-1.5 text-sm font-extrabold leading-snug">{t.title}</p>
					<p class="mt-0.5 text-xs font-bold text-[#5f6b62]">
						Kelas {t.grade} • {t.question_count} soal • {t.duration_minutes} menit • {t.participants} peserta
					</p>
					<p class="mt-1 text-xs font-bold text-[#177245]">
						<Icon name="clock" size={13} class="inline-block align-[-2px]" /> {hitungMundurTryout(t)}
					</p>
				</a>
			{/each}
		</div>
	</section>
{/if}

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
			{@const gt = gradeTheme(gradeOfProduct(p.id))}
			<div
				class="card cursor-pointer overflow-hidden"
				onclick={() => buka(p.id)}
				onkeydown={(e) => e.key === "Enter" && buka(p.id)}
				role="button"
				tabindex="0"
			>
				<div class="h-1.5 shrink-0" style="background: {gt.accent}" aria-hidden="true"></div>
				<div
					class="flex h-24 items-center justify-center px-3 text-center text-sm font-extrabold text-white lg:h-36 lg:text-base"
					style="background: {p.cover_color}"
				>
					<span class="leading-tight">{p.cover_label}</span>
				</div>
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
