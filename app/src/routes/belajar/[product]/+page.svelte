<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import Confetti from "$lib/Confetti.svelte";
	import { gradeLabel, gradeOfProduct, gradeTheme } from "$lib/gradeTheme";
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import {
		api,
		apiBlob,
		downloadBlob,
		formatRupiah,
		getToken,
		type PublicQuestion,
		type QuizResult,
		type SimulationMeta,
		type SimulationPack,
		type StudyPack,
		type FullChapter
	} from "$lib/api";

	let productId = $derived(page.params.product);
	let pack = $state<StudyPack | null>(null);
	let doneSet = $state<Set<string>>(new Set());
	let loading = $state(true);
	let error = $state("");
	let notice = $state("");
	let markingId = $state<string | null>(null);
	let playingVideo = $state<string | null>(null);
	let playingShort = $state<string | null>(null);
	let openFlash = $state<string | null>(null);
	let flipped = $state<Record<string, boolean>>({});
	let simNotice = $state("");
	let activeSim = $state<SimulationMeta | null>(null);
	let simQuestions = $state<PublicQuestion[]>([]);
	let simIdx = $state(0);
	let simAnswers = $state<Record<string, unknown>>({});
	let simResult = $state<QuizResult | null>(null);
	let simLoading = $state(false);
	let simSubmitting = $state(false);
	let simError = $state("");
	let simTimeLeft = $state(0);
	let certLoading = $state(false);
	let certError = $state("");
	// ---- Mode ujian fokus ----
	let focusOn = $state(false);
	let focusSwitches = $state(0);
	let focusUsed = $state(false);
	let simFocusSwitches = $state(0);
	let focusWarn = $state("");
	let focusNotice = $state("");
	let focusFullscreen = $state(false);
	let focusWarnTimer: ReturnType<typeof setTimeout> | null = null;

	let simCurrent = $derived(simQuestions[simIdx]);
	let simTotal = $derived(simQuestions.length);

	function simClock(seconds: number): string {
		const m = Math.max(0, Math.floor(seconds / 60));
		const s = Math.max(0, seconds % 60);
		return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	// Hitung mundur selama simulasi berjalan; waktu habis, jawaban dikirim otomatis.
	$effect(() => {
		if (!activeSim || simResult || simQuestions.length === 0) return;
		const t = setInterval(() => {
			if (simTimeLeft <= 1) {
				clearInterval(t);
				simTimeLeft = 0;
				void kirimSimulasi();
			} else {
				simTimeLeft -= 1;
			}
		}, 1000);
		return () => clearInterval(t);
	});

	// Mode ujian fokus: hitung setiap kali anak pindah tab/jendela.
	// Satu episode "pergi" dihitung sekali (flag away mencegah dobel
	// dari visibilitychange + blur yang datang berbarengan). Tidak ada
	// auto-submit dan tidak ada kunci navigasi — hanya peringatan.
	$effect(() => {
		if (!focusOn || !activeSim || simResult) return;
		let away = false;
		function markAway() {
			if (away) return;
			away = true;
			focusSwitches += 1;
			focusWarn = `Kamu pindah tab/jendela. Tetap fokus, ya (pindah ${focusSwitches}×)`;
			if (focusWarnTimer) clearTimeout(focusWarnTimer);
			focusWarnTimer = setTimeout(() => {
				focusWarn = "";
			}, 5000);
		}
		function markBack() {
			away = false;
		}
		function onVis() {
			if (document.hidden) markAway();
			else markBack();
		}
		function onFsChange() {
			focusFullscreen = !!document.fullscreenElement;
			// Keluar layar penuh (mis. tombol Esc) tidak mematikan mode
			// fokus — hanya beri tahu anak.
			if (focusOn && !document.fullscreenElement) {
				focusNotice =
					"Layar penuh dimatikan — mode fokus tetap aktif, peringatan pindah tab masih jalan.";
			}
		}
		document.addEventListener("visibilitychange", onVis);
		window.addEventListener("blur", markAway);
		window.addEventListener("focus", markBack);
		document.addEventListener("fullscreenchange", onFsChange);
		return () => {
			document.removeEventListener("visibilitychange", onVis);
			window.removeEventListener("blur", markAway);
			window.removeEventListener("focus", markBack);
			document.removeEventListener("fullscreenchange", onFsChange);
			if (focusWarnTimer) clearTimeout(focusWarnTimer);
		};
	});

	/** Matikan mode fokus (dan layar penuh bila masih aktif). */
	async function keluarModeFokus() {
		focusOn = false;
		focusWarn = "";
		if (typeof document !== "undefined" && document.fullscreenElement) {
			try {
				await document.exitFullscreen();
			} catch {
				/* abaikan */
			}
		}
		focusFullscreen = false;
	}

	// Jumlah soal per simulasi mengikuti tabel baku di API_CONTRACT.md.
	function simQuestionCount(sim: SimulationMeta): number {
		if (productId === "sas-k1-s1") return 30;
		if (productId === "mtk-sd") return 25;
		const table: Record<number, number> = { 1: 25, 2: 25, 3: 35, 4: 38, 5: 39, 6: 40 };
		return table[sim.grade] ?? 25;
	}

	let chaptersBySubject = $derived.by(() => {
		if (!pack) return [] as [string, FullChapter[]][];
		const map = new Map<string, FullChapter[]>();
		for (const c of pack.chapters) {
			const arr = map.get(c.subject) ?? [];
			arr.push(c);
			map.set(c.subject, arr);
		}
		return [...map.entries()];
	});

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			pack = await api<StudyPack>(`/api/study/${productId}`);
			// Bab yang sudah selesai (dari tracker).
			try {
				const t = await api<{ doneChapters: { chapter_id: string }[] }>("/api/tracker");
				doneSet = new Set((t.doneChapters ?? []).map((d) => d.chapter_id));
			} catch {
				/* tracker opsional */
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat Ruang belajar.";
		} finally {
			loading = false;
		}
	});

	// Video pendek: tombol "Lanjut ke kuis" di dalam iframe mengirim
	// postMessage ringkas:lanjut-kuis — arahkan ke kuis bab itu.
	onMount(() => {
		function onMsg(e: MessageEvent) {
			if (e.data?.type !== "ringkas:lanjut-kuis") return;
			if (!playingShort) return;
			const chapterId = playingShort;
			playingShort = null;
			goto(`/belajar/${productId}/${chapterId}`);
		}
		window.addEventListener("message", onMsg);
		return () => window.removeEventListener("message", onMsg);
	});

	async function tandaiSelesai(chapterId: string) {
		markingId = chapterId;
		notice = "";
		try {
			const data = await api<{ ok: boolean; sticker: boolean }>("/api/study/chapter-done", {
				method: "POST",
				body: JSON.stringify({ product_id: productId, chapter_id: chapterId })
			});
			doneSet = new Set([...doneSet, chapterId]);
			notice = data.sticker
				? "Bab selesai — kamu dapat 1 stiker baru"
				: "Bab ditandai selesai, hebat";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menandai bab selesai.";
		} finally {
			markingId = null;
		}
	}

	async function mulaiSimulasi(sim: SimulationMeta, useFocus = false) {
		simNotice = "";
		simError = "";
		simResult = null;
		simAnswers = {};
		simIdx = 0;
		simLoading = true;
		focusOn = useFocus;
		focusSwitches = 0;
		focusUsed = false;
		simFocusSwitches = 0;
		focusWarn = "";
		focusNotice = "";
		focusFullscreen = false;
		// Layar penuh: dicoba dari gestur klik ini; bila perangkat tidak
		// mendukung (mis. sebagian HP), mode fokus tetap jalan sebagai
		// pemantau pindah tab — bukan kegagalan.
		if (useFocus && typeof document !== "undefined") {
			try {
				if (document.fullscreenEnabled && !document.fullscreenElement) {
					await document.documentElement.requestFullscreen();
					focusFullscreen = true;
				} else if (!document.fullscreenEnabled) {
					focusNotice =
						"Perangkat ini tidak mendukung layar penuh — mode fokus tetap jalan dengan peringatan pindah tab.";
				}
			} catch {
				focusNotice =
					"Layar penuh tidak bisa dibuka — mode fokus tetap jalan dengan peringatan pindah tab.";
			}
		}
		try {
			const data = await api<SimulationPack>(`/api/simulations/${sim.id}/questions`);
			simQuestions = data.questions;
			activeSim = data.simulation;
			simTimeLeft = data.simulation.total_minutes * 60;
		} catch (e) {
			simNotice = e instanceof Error ? e.message : "Soal simulasi gagal dimuat.";
			await keluarModeFokus();
		} finally {
			simLoading = false;
		}
	}

	function tutupSimulasi() {
		void keluarModeFokus();
		activeSim = null;
		simQuestions = [];
		simResult = null;
		simAnswers = {};
		simIdx = 0;
		focusUsed = false;
		simFocusSwitches = 0;
	}

	function pilihSim(opt: unknown) {
		if (!simCurrent) return;
		simAnswers = { ...simAnswers, [String(simCurrent.id)]: opt };
	}

	function toggleSimKompleks(opt: string) {
		if (!simCurrent) return;
		const key = String(simCurrent.id);
		const cur = Array.isArray(simAnswers[key]) ? [...(simAnswers[key] as string[])] : [];
		const i = cur.indexOf(opt);
		if (i >= 0) cur.splice(i, 1);
		else cur.push(opt);
		simAnswers = { ...simAnswers, [key]: cur };
	}

	function pilihSimMatch(leftIdx: number, letter: string) {
		if (!simCurrent) return;
		const key = String(simCurrent.id);
		const cur =
			simAnswers[key] && typeof simAnswers[key] === "object" && !Array.isArray(simAnswers[key])
				? { ...(simAnswers[key] as Record<string, string>) }
				: {};
		if (letter) cur[String(leftIdx)] = letter;
		else delete cur[String(leftIdx)];
		simAnswers = { ...simAnswers, [key]: cur };
	}

	function qTextSim(questionId: string): string {
		return simQuestions.find((q) => String(q.id) === String(questionId))?.question ?? "";
	}

	async function kirimSimulasi() {
		if (!activeSim || simSubmitting || simResult) return;
		simSubmitting = true;
		simError = "";
		// Catat hitungan pindah tab SEBELUM mode fokus dimatikan.
		focusUsed = focusOn;
		simFocusSwitches = focusOn ? focusSwitches : 0;
		try {
			simResult = await api<QuizResult>("/api/quiz/submit", {
				method: "POST",
				body: JSON.stringify({
					kind: "simulation",
					ref_id: activeSim.id,
					answers: simAnswers,
					focus_switches: simFocusSwitches
				})
			});
			// Server juga mengembalikan angka yang tersimpan; pakai itu
			// bila ada agar tampilan hasil konsisten dengan database.
			if (typeof simResult.focus_switches === "number") {
				simFocusSwitches = simResult.focus_switches;
			}
		} catch (e) {
			simError = e instanceof Error ? e.message : "Gagal mengirim jawaban simulasi.";
		} finally {
			simSubmitting = false;
			await keluarModeFokus();
		}
	}

	/** Unduh sertifikat PDF untuk simulasi yang lulus (passed + attempt_id). */
	async function unduhSertifikat() {
		const id = simResult?.attempt_id;
		if (!id || certLoading) return;
		certLoading = true;
		certError = "";
		try {
			const { blob } = await apiBlob(`/api/certificate/${id}`);
			downloadBlob(blob, `sertifikat-${id}.pdf`);
		} catch (e) {
			certError = e instanceof Error ? e.message : "Gagal mengunduh sertifikat.";
		} finally {
			certLoading = false;
		}
	}
</script>

<button type="button" class="btn btn-ghost product-back" onclick={() => goto(`/produk/${productId}`)}>
	<Icon name="chevron-left" size={18} /> Kembali ke produk
</button>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error || !pack}
	<p class="err mt-6">{error || "Ruang belajar tidak ditemukan."}</p>
{:else}
	{@const gtBelajar = gradeTheme(gradeOfProduct(productId))}
	<header class="page-heading page-heading-study study-intro">
		<div>
			<p class="eyebrow">Ruang belajar</p>
			<h1>{pack.product.title}</h1>
			<p>{pack.product.jenjang} · {pack.product.mapel} · {pack.chapters.length} bab</p>
			{#if gradeLabel(productId)}
				<span class="badge" style="background: {gtBelajar.soft}; color: {gtBelajar.text}">{gradeLabel(productId)}</span>
			{/if}
		</div>
		<nav aria-label="Bagian ruang belajar">
			<a href="#daftar-bab"><Icon name="book-open" size={19} /> Daftar bab</a>
			{#if pack.simulations.length > 0}
				<a href="#simulasi-sas"><Icon name="trophy" size={19} /> Simulasi SAS</a>
			{/if}
			<a href="/peta-belajar/{productId}"><Icon name="map" size={19} /> Peta belajar</a>
		</nav>
	</header>
	<div class="study-links">
		<a href="/soal-cerita" class="btn btn-outline">
			<Icon name="message" size={16} /> Latihan soal cerita
		</a>
		<a href="/soal-sulitku" class="btn btn-outline">
			<Icon name="target" size={16} /> Soal sulitku
		</a>
		<a href="/latihan-adaptif" class="btn btn-outline">
			<Icon name="zap" size={16} /> Latihan adaptif
		</a>
		<a href="/latihan-tanpa-habis" class="btn btn-outline">
			<Icon name="refresh" size={16} /> Latihan tanpa habis
		</a>
		<a href="/kuis-guru" class="btn btn-outline">
			<Icon name="school" size={16} /> Kuis buatan guru
		</a>
		<a href="/rekam-suara?product={productId}" class="btn btn-outline">
			<Icon name="play" size={16} /> Rekam Suara
		</a>
		{#if productId === "k5"}
			<a href="/anbk" class="btn btn-outline">
				<Icon name="graduation-cap" size={16} /> Simulasi ANBK kelas 5
			</a>
		{/if}
		<a href="/rapor" class="btn btn-outline">
			<Icon name="graduation-cap" size={16} /> Unduh Rapor semester
		</a>
	</div>

	{#if pack.externalUrl}
		<div class="card mt-3 p-4">
			<p class="flex items-center gap-1.5 text-sm font-semibold"><Icon name="link" size={16} /> Produk eksternal</p>
			<p class="mt-0.5 text-sm text-[#5f6b62]">Produk ini juga tersedia sebagai tautan eksternal.</p>
			<a href={pack.externalUrl} target="_blank" rel="noopener noreferrer" class="btn btn-sun mt-2 w-full">
				Buka Produk
			</a>
		</div>
	{/if}

	{#if pack.simLocked}
		<p class="err mt-3">
			<Icon name="lock" size={16} class="inline-block align-[-2px]" /> Simulasi SAS sedang dikunci oleh orang tuamu. Bab dan kuis tetap bisa dibuka.
		</p>
	{/if}

	{#if notice}
		<p class="tabular-nums ok-msg mt-3">{notice}</p>
	{/if}

	<!-- Desktop: dua kolom — Daftar bab kiri, Simulasi SAS kanan -->
	<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
		<div class="min-w-0">
	<!-- Daftar bab -->
	<h2 id="daftar-bab" class="study-section-title">Daftar bab</h2>
	{#if pack.chapters.length === 0}
		<p class="mt-2 text-sm text-[#5f6b62]">Bab untuk produk ini akan segera hadir.</p>
	{:else}
		{#each chaptersBySubject as [subject, list] (subject)}
			<h3 class="mt-4 text-sm font-semibold text-[#177245]">{subject}</h3>
			<div class="mt-2 space-y-3">
				{#each list as ch (ch.id)}
					<div class="card p-3">
						<div class="flex items-start gap-3">
							<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#177245]"><Icon name="file-text" size={18} /></span>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium leading-snug">{ch.title}</p>
								<p class="mt-1 flex flex-wrap gap-1">
									{#if ch.free}<span class="badge badge-leaf">Gratis</span>{/if}
									{#if ch.locked}<span class="badge badge-gray"><Icon name="lock" size={16} /> Terkunci</span>{/if}
								</p>
								<p class="text-xs text-[#5f6b62]">
									Kelas {ch.grade} • Semester {ch.semester}
									{#if doneSet.has(ch.id)}• <Icon name="check" size={16} class="inline-block align-[-2px]" /> Selesai{/if}
								</p>
							</div>
							<button
								type="button"
								class="btn {doneSet.has(ch.id) ? 'btn-leaf' : 'btn-ghost'} shrink-0 !px-2.5 !py-1.5 text-xs"
								disabled={markingId === ch.id || ch.locked}
								onclick={() => tandaiSelesai(ch.id)}
							>
								{#if doneSet.has(ch.id)}<Icon name="check" size={16} /> Selesai{:else}Tandai selesai{/if}
							</button>
						</div>

						<!-- Kartu video bila bab punya video -->
						{#if ch.video_url}
							<div class="mt-3 rounded-xl border border-[#e7e2d2] bg-[#f7f5ef] p-3">
								{#if playingVideo === ch.id}
									<div class="overflow-hidden rounded-lg">
										<iframe
											src={ch.video_url}
											title="Video pembelajaran {ch.title}"
											class="aspect-video w-full"
											allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
											allowfullscreen
										></iframe>
									</div>
									<div class="mt-2 flex gap-2">
										<a
											href={`/belajar/${productId}/${ch.id}`}
											class="btn btn-primary flex-1 text-xs"
										>
											<Icon name="file-text" size={16} /> Lanjut ke kuis
										</a>
										<button
											type="button"
											class="btn btn-outline text-xs"
											onclick={() => (playingVideo = null)}
										>
											Tutup video
										</button>
									</div>
								{:else}
									<button
										type="button"
										class="btn btn-sun w-full text-xs"
										onclick={() => (playingVideo = ch.id)}
									>
										<Icon name="play" size={16} /> Tonton video pembelajaran
										{ch.video_duration ? `(${ch.video_duration})` : ""}
									</button>
								{/if}
							</div>
						{/if}

						<!-- Kartu video pendek vertikal (9:16) -->
						{#if ch.short_url}
							<div class="mt-3 rounded-xl border border-[#e7e2d2] bg-[#f7f5ef] p-3">
								{#if playingShort === ch.id}
									<div class="mx-auto max-w-[300px] overflow-hidden rounded-lg border border-[#e7e2d2] bg-white">
										<iframe
											src={ch.short_url}
											title="Video pendek {ch.title}"
											class="aspect-[9/16] w-full"
											allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
											allowfullscreen
										></iframe>
									</div>
									<div class="mt-2 flex gap-2">
										<a
											href={`/belajar/${productId}/${ch.id}`}
											class="btn btn-primary flex-1 text-xs"
										>
											<Icon name="file-text" size={16} /> Lanjut ke kuis
										</a>
										<button
											type="button"
											class="btn btn-outline text-xs"
											onclick={() => (playingShort = null)}
										>
											Tutup video
										</button>
									</div>
								{:else}
									<button
										type="button"
										class="btn btn-sun w-full text-xs"
										onclick={() => (playingShort = ch.id)}
									>
										<Icon name="play" size={16} /> Tonton video pendek (60 detik)
										{ch.short_duration ? `(${ch.short_duration})` : ""}
									</button>
								{/if}
							</div>
						{/if}

						<!-- Flashcard bab ini -->
						{#if ch.flashcards.length > 0}
							<button
								type="button"
								class="mt-2 w-full text-left text-xs font-medium text-[#177245]"
								onclick={() => (openFlash = openFlash === ch.id ? null : ch.id)}
							>
								<Icon name="layers" size={16} class="inline-block align-[-2px]" /> Kartu flashcard ({ch.flashcards.length}) <Icon name={openFlash === ch.id ? "chevron-down" : "chevron-right"} size={16} class="inline-block align-[-2px]" />
							</button>
							{#if openFlash === ch.id}
								<div class="mt-2 grid grid-cols-2 gap-2">
									{#each ch.flashcards as fc, i (`${ch.id}-${i}`)}
										{@const key = `${ch.id}-${i}`}
										<button
											type="button"
											class="min-h-20 rounded-xl border p-2 text-center text-xs font-medium {flipped[key]
												? 'border-[#177245] bg-[#ecfdf5] text-[#065f46]'
												: 'border-[#e7e2d2] bg-[#fffdf7] text-[#22302a]'}"
											onclick={() => (flipped = { ...flipped, [key]: !flipped[key] })}
										>
											{flipped[key] ? fc.back : fc.front}
											<span class="mt-1 block text-xs font-semibold text-[#6e675c]">
												{flipped[key] ? "Jawaban — ketuk untuk membalik" : "Ketuk untuk membalik"}
											</span>
										</button>
									{/each}
								</div>
							{/if}
						{/if}

						{#if ch.locked}
							<a href={`/produk/${productId}`} class="btn btn-sun btn-block mt-3 text-xs">
								<Icon name="lock" size={16} /> Beli untuk membuka
							</a>
						{:else}
							<a
								href={`/belajar/${productId}/${ch.id}`}
								class="btn btn-outline btn-block mt-3 text-xs"
							>
								<Icon name="book-open" size={16} /> Baca bab & kerjakan kuis
							</a>
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	{/if}
		</div>

		<div class="min-w-0">
	<!-- Simulasi SAS -->
	{#if pack.simulations.length > 0}
		<h2 id="simulasi-sas" class="study-section-title">Simulasi SAS</h2>
		<p class="text-xs text-[#5f6b62]">Latihan seperti ujian sebenarnya — ada waktu dan skor.</p>
		{#if simNotice}
			<p class="err mt-3">{simNotice}</p>
		{/if}
		{#if simLoading}
			<p class="mt-3 text-center text-sm font-semibold text-[#5f6b62]">Memuat soal simulasi...</p>
		{/if}

		{#if activeSim && simQuestions.length > 0}
			<div class="card mt-3 border-[#177245] p-4">
				<div class="flex items-start justify-between gap-2">
					<div>
						<p class="text-sm font-semibold leading-snug">{activeSim.title}</p>
						<p class="mt-0.5 text-xs font-medium text-[#177245]">
							<Icon name="timer" size={16} class="tabular-nums inline-block align-[-2px]" /> Sisa waktu: {simClock(simTimeLeft)} • {activeSim.total_minutes} menit • {simTotal} soal
						</p>
					</div>
					<button type="button" class="btn btn-ghost shrink-0 !px-2 !py-1 text-xs" onclick={tutupSimulasi}>
						<Icon name="x" size={16} /> Tutup
					</button>
				</div>

				{#if focusOn}
					<div class="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#ecfdf5] px-3 py-2 text-xs font-medium text-[#065f46]">
						<Icon name="eye" size={16} /> Mode ujian fokus aktif
						<span class="tabular-nums rounded-full bg-[#fffdf7] px-2 py-0.5">Pindah tab: {focusSwitches}×</span>
						<button type="button" class="ml-auto underline" onclick={keluarModeFokus}>
							<Icon name="minimize" size={16} class="inline-block align-[-2px]" /> Keluar dari mode fokus
						</button>
					</div>
				{/if}
				{#if focusWarn}
					<p class="mt-2 rounded-lg bg-[#fef3c7] px-3 py-2 text-xs font-medium text-[#92400e]">
						<Icon name="alert" size={16} class="inline-block align-[-2px]" /> {focusWarn}
					</p>
				{/if}
				{#if focusNotice}
					<p class="mt-2 text-xs text-[#5f6b62]">{focusNotice}</p>
				{/if}

				{#if !simResult && simCurrent}
					<p class="tabular-nums mt-3 text-xs font-medium text-[#5f6b62]">Soal {simIdx + 1} dari {simTotal}</p>
					<div class="mt-1 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
						<div
							class="h-full w-full origin-left bg-[#177245] transition-transform duration-300 ease-signature" style="transform: scaleX({((simIdx + 1) / Math.max(simTotal, 1))})"
						></div>
					</div>
					<p class="mt-3 text-base font-semibold leading-snug">{simCurrent.question}</p>
					{#if simCurrent.images?.length}
						<div class="mt-3 grid gap-2 sm:grid-cols-2">
							{#each simCurrent.images as image (image)}
								<img
									src={image}
									alt={`Ilustrasi untuk soal ${simIdx + 1}`}
									class="max-h-72 w-full rounded-xl border border-[#e7e2d2] bg-white object-contain p-2"
								/>
							{/each}
						</div>
					{/if}

					{#if simCurrent.type === "pg" && Array.isArray(simCurrent.options)}
						<div class="mt-3 space-y-2">
							{#each simCurrent.options as opt (opt)}
								<label
									class="card flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm {simAnswers[
										String(simCurrent.id)
									] === opt
										? '!border-[#177245] bg-[#ece9dc]'
										: ''}"
								>
									<input
										type="radio"
										name={`sim-${simCurrent.id}`}
										value={opt}
										checked={simAnswers[String(simCurrent.id)] === opt}
										onchange={() => pilihSim(opt)}
									/>
									{opt}
								</label>
							{/each}
						</div>
					{:else if simCurrent.type === "pg_kompleks" && Array.isArray(simCurrent.options)}
						<p class="mt-2 text-xs font-medium text-[#5f6b62]">Boleh pilih lebih dari satu jawaban.</p>
						<div class="mt-2 space-y-2">
							{#each simCurrent.options as opt (opt)}
								{@const picked = Array.isArray(simAnswers[String(simCurrent.id)])
									? (simAnswers[String(simCurrent.id)] as string[])
									: []}
								<label
									class="card flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm {picked.includes(
										opt
									)
										? '!border-[#177245] bg-[#ece9dc]'
										: ''}"
								>
									<input
										type="checkbox"
										checked={picked.includes(opt)}
										onchange={() => toggleSimKompleks(opt)}
									/>
									{opt}
								</label>
							{/each}
						</div>
					{:else if simCurrent.type === "bs"}
						<div class="mt-3 flex gap-2">
							{#each ["Benar", "Salah"] as opt (opt)}
								<button
									type="button"
									class="chip flex-1 justify-center !py-2.5"
									class:active={simAnswers[String(simCurrent.id)] === opt}
									onclick={() => pilihSim(opt)}
								>
									{opt}
								</button>
							{/each}
						</div>
					{:else if simCurrent.type === "menjodohkan" && simCurrent.options && !Array.isArray(simCurrent.options)}
						{@const left = simCurrent.options.left}
						{@const right = simCurrent.options.right}
						{@const letters = ["a", "b", "c", "d", "e"]}
						<div class="mt-3 space-y-2">
							{#each left as item, li (li)}
								{@const picked = simAnswers[String(simCurrent.id)] && typeof simAnswers[String(simCurrent.id)] === "object" && !Array.isArray(simAnswers[String(simCurrent.id)])
									? (simAnswers[String(simCurrent.id)] as Record<string, string>)[String(li)] ?? ""
									: ""}
								<div class="flex items-center gap-2 text-sm">
									<span class="flex-1 font-medium">{li + 1}. {item}</span>
									<select
										class="input !w-40 !py-1.5 text-xs"
										value={picked}
										onchange={(e) => pilihSimMatch(li, e.currentTarget.value)}
									>
										<option value="">— Pilih —</option>
										{#each right as r, ri (ri)}
											<option value={letters[ri]}>{letters[ri].toUpperCase()}. {r}</option>
										{/each}
									</select>
								</div>
							{/each}
							<p class="text-xs text-[#5f6b62]">Pasangan kanan: {right.map((r, i) => `${letters[i].toUpperCase()}. ${r}`).join(" • ")}</p>
						</div>
					{:else if simCurrent.type === "uraian"}
						<textarea
							class="input mt-3"
							rows="3"
							placeholder="Tulis jawabanmu dengan kalimatmu sendiri..."
							value={(simAnswers[String(simCurrent.id)] as string) ?? ""}
							oninput={(e) => pilihSim(e.currentTarget.value)}
						></textarea>
					{:else}
						<input
							class="input mt-3"
							placeholder="Tulis jawabanmu..."
							value={(simAnswers[String(simCurrent.id)] as string) ?? ""}
							oninput={(e) => pilihSim(e.currentTarget.value)}
						/>
					{/if}

					<div class="mt-4 flex gap-2">
						<button
							type="button"
							class="btn btn-ghost flex-1"
							disabled={simIdx === 0}
							onclick={() => (simIdx -= 1)}
						>
							<Icon name="chevron-left" size={16} /> Sebelumnya
						</button>
						{#if simIdx < simTotal - 1}
							<button type="button" class="btn btn-primary flex-1" onclick={() => (simIdx += 1)}>
								Berikutnya <Icon name="chevron-right" size={16} />
							</button>
						{:else}
							<button
								type="button"
								class="btn btn-leaf flex-1"
								disabled={simSubmitting}
								onclick={kirimSimulasi}
							>
								{#if simSubmitting}Memeriksa...{:else}<Icon name="check" size={16} /> Kirim jawaban{/if}
							</button>
						{/if}
					</div>
					{#if simError}
						<p class="err mt-3">{simError}</p>
					{/if}
				{:else if simResult}
					{#if simResult.score === simResult.max_score && simResult.max_score > 0}
						<Confetti fire={true} />
					{/if}
					<p class="mt-3 text-center text-xl font-semibold">
						Skor: {simResult.score} / {simResult.max_score}
						{#if simResult.score === simResult.max_score}
							<span class="inline-flex items-center gap-1.5"><Icon name="party-popper" size={18} /> Nilai sempurna</span>
						{:else if simResult.score >= simResult.max_score * 0.7}
							<span class="inline-flex items-center gap-1.5"><Icon name="thumbs-up" size={18} /> Hebat</span>
						{:else}
							<span class="inline-flex items-center gap-1.5"><Icon name="zap" size={18} /> Terus berlatih ya</span>
						{/if}
					</p>
					{#if simResult.passed && simResult.attempt_id}
						<button
							type="button"
							class="btn btn-sun btn-block mt-3"
							disabled={certLoading}
							onclick={unduhSertifikat}
						>
							{#if certLoading}Mengunduh...{:else}<Icon name="award" size={16} /> Unduh sertifikat{/if}
						</button>
						{#if certError}
							<p class="err mt-2">{certError}</p>
						{/if}
					{/if}
					{#if focusUsed}
						<div class="mt-3 rounded-lg bg-[#f7f5ef] p-3 text-sm">
							<p class="font-medium">
								<Icon name="eye" size={16} class="inline-block align-[-2px]" /> Mode ujian fokus
							</p>
							<p class="mt-0.5 text-[#3f4a42]">
								Kamu pindah tab {simFocusSwitches}× selama simulasi ini.
							</p>
							<a
								href="/akun"
								class="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[#177245]"
							>
								<Icon name="chart" size={16} /> Lihat prediksi nilai SAS
							</a>
						</div>
					{/if}
					<div class="mt-3 space-y-2">
						{#each simResult.review as r (r.questionId)}
							<div class="card p-3 text-sm">
								<p class="font-medium">
									{#if r.correct}<Icon name="check-circle" size={16} class="inline-block align-[-2px] text-[#065f46]" /> Benar{:else}<Icon name="x-circle" size={16} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat{/if} — {qTextSim(r.questionId)}
								</p>
								<p class="mt-1 text-[#3f4a42]">{r.discussion}</p>
							</div>
						{/each}
					</div>
					<button
						type="button"
						class="btn btn-outline btn-block mt-3"
						onclick={() => {
							simResult = null;
							simAnswers = {};
							simIdx = 0;
							simTimeLeft = (activeSim?.total_minutes ?? 0) * 60;
						}}
					>
						<Icon name="refresh" size={16} /> Ulangi simulasi
					</button>
				{/if}
			</div>
		{/if}
		<div class="mt-3 space-y-3">
			{#each pack.simulations as sim (sim.id)}
				<div class="card p-4">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="text-sm font-semibold leading-snug">{sim.title}</p>
							<p class="mt-0.5 text-xs text-[#5f6b62]">
								{sim.subject} • Kelas {sim.grade} • Paket {sim.paket}
							</p>
						</div>
						<span class="flex shrink-0 flex-wrap justify-end gap-1">
							{#if sim.free}<span class="badge badge-leaf">Gratis</span>{/if}
							{#if sim.locked}<span class="badge badge-gray"><Icon name="lock" size={16} /> Terkunci</span>{/if}
							<span class="badge badge-brand">SAS</span>
						</span>
					</div>
					<div class="mt-3 flex gap-2 text-center text-xs font-medium">
						<span class="tabular-nums flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#f7f5ef] px-2 py-2"><Icon name="timer" size={16} /> {sim.total_minutes} menit</span>
						<span class="tabular-nums flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#f7f5ef] px-2 py-2"><Icon name="file-text" size={16} /> {simQuestionCount(sim)} soal</span>
						<span class="tabular-nums flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#f7f5ef] px-2 py-2"><Icon name="star" size={16} /> {sim.max_points} poin</span>
					</div>
					{#if sim.locked}
						<a href={`/produk/${productId}`} class="btn btn-sun btn-block mt-3">
							<Icon name="lock" size={16} /> Beli untuk membuka
						</a>
					{:else}
						<button
							type="button"
							class="btn btn-primary btn-block mt-3"
							disabled={pack.simLocked}
							onclick={() => mulaiSimulasi(sim)}
						>
							{#if pack.simLocked}<Icon name="lock" size={16} /> Dikunci orang tua{:else}<Icon name="rocket" size={16} /> Mulai simulasi{/if}
						</button>
						<button
							type="button"
							class="btn btn-outline btn-block mt-2"
							disabled={pack.simLocked}
							onclick={() => mulaiSimulasi(sim, true)}
						>
							<Icon name="maximize" size={16} /> Mulai dengan mode fokus
						</button>
						<p class="mt-1 text-center text-xs text-[#5f6b62]">
							Mode Fokus: layar penuh + peringatan kalau pindah tab.
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
		</div>
	</div>

	<p class="mt-6 text-center text-xs text-[#6e675c]">
		Harga produk: {formatRupiah(pack.product.price)} • Semangat belajarnya
	</p>
{/if}
