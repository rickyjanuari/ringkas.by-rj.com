<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import BottomSheet from "$lib/BottomSheet.svelte";
	import Confetti from "$lib/Confetti.svelte";
	import { feedbackBenar } from "$lib/feedback";
	import NumberLine from "$lib/tools/NumberLine.svelte";
	import MultiplicationTable from "$lib/tools/MultiplicationTable.svelte";
	import FractionCalculator from "$lib/tools/FractionCalculator.svelte";
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import {
		api,
		apiBlob,
		downloadBlob,
		getToken,
		type StudyPack,
		type FullChapter
	} from "$lib/api";

	let productId = $derived(page.params.product);
	let chapterId = $derived(page.params.chapter);
	let chapter = $state<FullChapter | null>(null);
	let loading = $state(true);
	let error = $state("");
	let notice = $state("");

	// Teks fokus: 3 ukuran font.
	let fontStep = $state(1);
	const fontSizes = ["text-base leading-relaxed", "text-lg leading-relaxed", "text-xl leading-relaxed"];

	// Bookmark & catatan.
	let bookmarked = $state(false);
	let note = $state("");
	let noteSaving = $state(false);
	let noteMsg = $state("");
	let noteOk = $state(false);
	let marking = $state(false);
	let downloadingWs = $state(false);
	let downloadingFc = $state(false);

	// Kuis.
	let quizStarted = $state(false);
	let qIndex = $state(0);
	let answers = $state<Record<string, unknown>>({});
	let submitting = $state(false);
	let result = $state<{
		score: number;
		max_score: number;
		correct: Record<string, boolean>;
		review: { questionId: number | string; correct: boolean; discussion: string }[];
	} | null>(null);
	let quizError = $state("");

	let currentQ = $derived(chapter ? chapter.quiz[qIndex] : undefined);
	let totalQ = $derived(chapter ? chapter.quiz.length : 0);

	// Konfeti skor sempurna + umpan balik jawaban benar.
	let confettiFire = $state(false);
	// Bukan $state: penanda hasil kuis yang sudah diproses (sekali per submit).
	let hasilDiproses: { score: number; max_score: number } | null = null;
	$effect(() => {
		if (result) {
			if (hasilDiproses !== result) {
				hasilDiproses = result;
				const adaBenar = Object.values(result.correct ?? {}).some(Boolean);
				// Hanya jawaban benar yang berbunyi/bergetar; jawaban salah diam.
				if (adaBenar) feedbackBenar();
				// Konfeti hanya untuk skor sempurna, sekali per hasil.
				if (result.max_score > 0 && result.score === result.max_score) {
					confettiFire = true;
					window.setTimeout(() => {
						confettiFire = false;
					}, 600);
				}
			}
		} else {
			hasilDiproses = null;
		}
	});

	// Flashcard geser (swipe): ketuk membalik, geser kanan = sudah hafal,
	// geser kiri = lanjut tanpa menandai. Status hafal disimpan lokal per
	// perangkat (localStorage per produk+bab) — belum ada endpoint server
	// untuk menandai hafal, jadi belum tersimpan per akun di server.
	let fcIndex = $state(0);
	let fcFlipped = $state(false);
	let hafalSet = $state<Set<number>>(new Set());
	let fcDragX = $state(0);
	let fcDragging = $state(false);
	let fcKeluar: "kanan" | "kiri" | null = $state(null);
	let fcCardEl: HTMLDivElement | null = $state(null);
	let reducedMotion = $state(false);
	let dragAwal = { x: 0, y: 0, aktif: false, horizontal: false, bergerak: false };

	let fcTransform = $derived.by(() => {
		if (fcKeluar === "kanan") return "translateX(120%) rotate(8deg)";
		if (fcKeluar === "kiri") return "translateX(-120%) rotate(-8deg)";
		if (fcDragX === 0) return "none";
		return `translateX(${fcDragX}px) rotate(${fcDragX * 0.05}deg)`;
	});

	function hafalKey(): string {
		return `ringkas_hafal_${productId ?? ""}_${chapterId ?? ""}`;
	}

	function muatHafal(): void {
		try {
			const raw = localStorage.getItem(hafalKey());
			if (!raw) {
				hafalSet = new Set();
				return;
			}
			const arr = JSON.parse(raw) as unknown;
			hafalSet = new Set(
				(Array.isArray(arr) ? arr : []).filter((n): n is number => Number.isInteger(n))
			);
		} catch {
			hafalSet = new Set();
		}
	}

	function simpanHafal(): void {
		try {
			localStorage.setItem(hafalKey(), JSON.stringify([...hafalSet]));
		} catch {
			/* Abaikan. */
		}
	}

	// Reset state flashcard setiap kali bab berganti (komponen dipakai ulang
	// saat navigasi antar-bab), dan muat status hafal bab tersebut.
	let babTerakhir = "";
	$effect(() => {
		if (chapterId && chapterId !== babTerakhir) {
			babTerakhir = chapterId;
			fcIndex = 0;
			fcFlipped = false;
			fcDragX = 0;
			fcDragging = false;
			fcKeluar = null;
			muatHafal();
		}
	});

	function lanjutKartu(arah: "kanan" | "kiri"): void {
		if (!chapter || fcKeluar) return;
		const total = chapter.flashcards.length;
		if (total === 0) return;
		if (reducedMotion) {
			fcIndex = (fcIndex + 1) % total;
			fcFlipped = false;
			return;
		}
		fcKeluar = arah;
		window.setTimeout(() => {
			fcIndex = (fcIndex + 1) % total;
			fcFlipped = false;
			fcKeluar = null;
			fcDragX = 0;
			fcDragging = false;
		}, 200);
	}

	// Aksi hafal TUNGGAL: dipakai tombol "Sudah hafal" DAN geser kanan.
	function tandaiHafal(): void {
		if (!chapter || chapter.flashcards.length === 0 || fcKeluar) return;
		hafalSet = new Set(hafalSet).add(fcIndex);
		simpanHafal();
		lanjutKartu("kanan");
	}

	function resetHafal(): void {
		hafalSet = new Set();
		simpanHafal();
		fcIndex = 0;
		fcFlipped = false;
	}

	function fcPointerDown(e: PointerEvent): void {
		dragAwal = { x: e.clientX, y: e.clientY, aktif: true, horizontal: false, bergerak: false };
		if (reducedMotion) return; // Tanpa animasi geser; ketuk tetap dicatat untuk membalik.
		try {
			fcCardEl?.setPointerCapture(e.pointerId);
		} catch {
			/* Abaikan. */
		}
	}

	function fcPointerMove(e: PointerEvent): void {
		if (!dragAwal.aktif || reducedMotion) return;
		const dx = e.clientX - dragAwal.x;
		const dy = e.clientY - dragAwal.y;
		if (!dragAwal.horizontal) {
			if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
			// Hanya tangkap gerakan horizontal yang jelas; bila vertikal
			// lebih dominan, lepas supaya scroll halaman tetap jalan.
			if (Math.abs(dy) > Math.abs(dx)) {
				dragAwal.aktif = false;
				return;
			}
			dragAwal.horizontal = true;
		}
		dragAwal.bergerak = true;
		fcDragging = true;
		fcDragX = dx;
	}

	function fcPointerUp(): void {
		if (!dragAwal.aktif) {
			fcDragging = false;
			return;
		}
		dragAwal.aktif = false;
		if (reducedMotion) {
			// Tanpa animasi geser: ketuk biasa tetap membalik kartu.
			if (!dragAwal.bergerak) fcFlipped = !fcFlipped;
			fcDragX = 0;
			fcDragging = false;
			return;
		}
		const dx = fcDragX;
		const ambang = Math.max(80, (fcCardEl?.clientWidth ?? 320) * 0.25);
		fcDragging = false;
		if (dragAwal.horizontal && Math.abs(dx) >= ambang) {
			fcDragX = 0;
			if (dx > 0) tandaiHafal();
			else lanjutKartu("kiri");
			return;
		}
		// Ketuk biasa (tanpa geser) tetap membalik kartu; geser pendek
		// kembali ke tengah lewat transisi (fcDragX = 0).
		if (!dragAwal.bergerak) fcFlipped = !fcFlipped;
		fcDragX = 0;
	}

	function fcPointerCancel(): void {
		dragAwal.aktif = false;
		dragAwal.horizontal = false;
		dragAwal.bergerak = false;
		fcDragging = false;
		fcDragX = 0;
	}

	// Alat interaktif Matematika: garis bilangan (Kelas 1–2), tabel perkalian
	// (Kelas 3–4), kalkulator pecahan (Kelas 5–6). Mapel lain tidak menampilkan.
	let alatKind = $derived.by(() => {
		if (!chapter) return null;
		if (!chapter.subject.toLowerCase().includes("matematika")) return null;
		if (chapter.grade <= 2) return "garis" as const;
		if (chapter.grade <= 4) return "perkalian" as const;
		if (chapter.grade <= 6) return "pecahan" as const;
		return null;
	});

	// Tanya Jawab per bab (migrasi 0011).
	interface QaItem {
		id: number;
		asker_name: string;
		question: string;
		answer: string | null;
		status: string;
		status_label: string;
		created_at: string;
		answered_at: string | null;
		mine: boolean;
	}
	let qaList = $state<QaItem[]>([]);
	let qaLoading = $state(false);
	let qaText = $state("");
	let qaSending = $state(false);
	let qaMsg = $state("");
	let qaError = $state("");

	async function muatQa() {
		if (!chapter) return;
		qaLoading = true;
		qaError = "";
		try {
			const data = await api<{ questions: QaItem[] }>(
				`/api/qa/questions?product=${encodeURIComponent(productId ?? "")}&chapter=${encodeURIComponent(chapterId ?? "")}`
			);
			qaList = data.questions ?? [];
		} catch (e) {
			qaError = e instanceof Error ? e.message : "Gagal memuat tanya jawab.";
		} finally {
			qaLoading = false;
		}
	}

	async function kirimPertanyaan() {
		if (!chapter || qaSending) return;
		qaSending = true;
		qaMsg = "";
		try {
			const data = await api<{ question: QaItem }>(`/api/qa/questions`, {
				method: "POST",
				body: JSON.stringify({ product: productId, chapter: chapterId, question: qaText })
			});
			qaList = [data.question, ...qaList];
			qaText = "";
			qaMsg = "Pertanyaan terkirim — menunggu moderasi admin.";
		} catch (e) {
			qaMsg = e instanceof Error ? e.message : "Gagal mengirim pertanyaan.";
		} finally {
			qaSending = false;
		}
	}

	function qaBadge(status: string): string {
		if (status === "answered") return "badge badge-leaf";
		if (status === "pending") return "badge badge-sun";
		return "badge badge-gray";
	}

	// Glosarium: istilah di Teks fokus bisa diketuk untuk melihat artinya.
	interface GlossaryTerm {
		term: string;
		meaning: string;
	}
	let glossary = $state<GlossaryTerm[]>([]);
	let selectedTerm = $state<GlossaryTerm | null>(null);
	let glossaryOpen = $state(false);

	async function muatGlossary() {
		if (!chapter) return;
		try {
			const data = await api<{ terms: GlossaryTerm[] }>(
				`/api/study/${productId}/${chapterId}/glossary`
			);
			glossary = (data.terms ?? []).filter((t) => t.term?.trim() && t.meaning?.trim());
		} catch {
			// Best-effort: gagal memuat glosarium bukan error halaman.
			glossary = [];
		}
	}

	function bukaIstilah(t: GlossaryTerm) {
		selectedTerm = t;
		glossaryOpen = true;
	}

	// Bagi Teks fokus menjadi potongan teks biasa + kemunculan pertama tiap
	// istilah glosarium (cocok case-insensitive pada batas kata). Teks asli
	// tidak diubah selain penanda ini.
	type FocusSegment =
		| { kind: "text"; text: string }
		| { kind: "term"; text: string; term: GlossaryTerm };
	let focusSegments = $derived.by((): FocusSegment[] => {
		const text = chapter?.focus_text ?? "";
		if (!text || glossary.length === 0) return [{ kind: "text", text }];
		const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const sorted = [...glossary].sort((a, b) => b.term.length - a.term.length);
		const pattern = new RegExp(`\\b(${sorted.map((t) => escapeRe(t.term)).join("|")})\\b`, "gi");
		const byLower = new Map(sorted.map((t) => [t.term.toLowerCase(), t]));
		const seen = new Set<string>();
		const out: FocusSegment[] = [];
		let last = 0;
		for (const m of text.matchAll(pattern)) {
			const matched = m[0] ?? "";
			const idx = m.index ?? 0;
			const key = matched.toLowerCase();
			const term = byLower.get(key);
			if (!term || seen.has(key)) continue;
			seen.add(key);
			if (idx > last) out.push({ kind: "text", text: text.slice(last, idx) });
			out.push({ kind: "term", text: matched, term });
			last = idx + matched.length;
		}
		if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
		return out;
	});

	onMount(async () => {
		try {
			reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		} catch {
			reducedMotion = false;
		}
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			const pack = await api<StudyPack>(`/api/study/${productId}`);
			const found = pack.chapters.find((c) => c.id === chapterId);
			if (!found) throw new Error("Bab tidak ditemukan.");
			chapter = found;
			void muatQa();
			void muatGlossary();
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat bab.";
		} finally {
			loading = false;
		}
	});

	async function tandaiSelesai() {
		marking = true;
		notice = "";
		try {
			const data = await api<{ ok: boolean; sticker: boolean }>("/api/study/chapter-done", {
				method: "POST",
				body: JSON.stringify({ product_id: productId, chapter_id: chapterId })
			});
			notice = data.sticker
				? "Bab selesai — kamu dapat 1 stiker baru"
				: "Bab ditandai selesai, hebat";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menandai bab selesai.";
		} finally {
			marking = false;
		}
	}

	async function toggleBookmark() {
		const next = !bookmarked;
		bookmarked = next;
		try {
			await api("/api/bookmark", {
				method: "POST",
				body: JSON.stringify({ product_id: productId, chapter_id: chapterId, bookmarked: next })
			});
		} catch (e) {
			bookmarked = !next;
			notice = e instanceof Error ? e.message : "Gagal menyimpan bookmark.";
		}
	}

	async function simpanCatatan() {
		noteSaving = true;
		noteMsg = "";
		try {
			await api("/api/note", {
				method: "POST",
				body: JSON.stringify({ product_id: productId, chapter_id: chapterId, note })
			});
			noteMsg = note.trim() ? "Catatan tersimpan." : "Catatan dihapus.";
			noteOk = note.trim() !== "";
		} catch (e) {
			noteMsg = e instanceof Error ? e.message : "Gagal menyimpan catatan.";
		} finally {
			noteSaving = false;
		}
	}

	async function unduhWorksheet() {
		downloadingWs = true;
		notice = "";
		try {
			const { blob, filename } = await apiBlob(
				`/api/study/${productId}/${chapterId}/worksheet`
			);
			downloadBlob(blob, filename || `worksheet-${chapterId}.pdf`);
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunduh worksheet.";
		} finally {
			downloadingWs = false;
		}
	}

	async function unduhFlashcard() {
		downloadingFc = true;
		notice = "";
		try {
			const { blob, filename } = await apiBlob(
				`/api/study/${productId}/${chapterId}/flashcards.pdf`
			);
			downloadBlob(blob, filename || `flashcard-${chapterId}.pdf`);
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunduh flashcard.";
		} finally {
			downloadingFc = false;
		}
	}

	function pilihJawaban(value: unknown) {
		if (!currentQ) return;
		answers = { ...answers, [String(currentQ.id)]: value };
	}

	async function kirimKuis() {
		if (!chapter || submitting) return;
		submitting = true;
		quizError = "";
		try {
			const data = await api<{
				score: number;
				max_score: number;
				correct: Record<string, boolean>;
				review: { questionId: number | string; correct: boolean; discussion: string }[];
			}>("/api/quiz/submit", {
				method: "POST",
				body: JSON.stringify({ kind: "quiz", ref_id: chapter.id, answers })
			});
			result = data;
		} catch (e) {
			quizError = e instanceof Error ? e.message : "Gagal mengirim jawaban.";
		} finally {
			submitting = false;
		}
	}

	function qText(qid: number | string): string {
		return chapter?.quiz.find((q) => String(q.id) === String(qid))?.question ?? "";
	}
</script>

<a href={`/belajar/${productId}`} class="store-text-link product-back">
	<Icon name="chevron-left" size={18} /> Kembali ke ruang belajar
</a>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error || !chapter}
	<p class="err mt-6">{error || "Bab tidak ditemukan."}</p>
{:else}
	<Confetti fire={confettiFire} />
	<header class="page-heading page-heading-reading">
		<h1>{chapter.title}</h1>
		<p class="text-sm text-[#5f6b62]">
			{chapter.subject} • Kelas {chapter.grade} • Semester {chapter.semester}
		</p>
	</header>

	{#if notice}
		<p class="tabular-nums ok-msg mt-3">{notice}</p>
	{/if}

	<div class="study-links">
		<button type="button" class="btn {bookmarked ? 'btn-sun' : 'btn-ghost'} text-xs" onclick={toggleBookmark}>
			{#if bookmarked}<Icon name="bookmark" size={16} /> Dibookmark{:else}<Icon name="bookmark" size={16} /> Bookmark{/if}
		</button>
		<button
			type="button"
			class="btn btn-ghost text-xs"
			disabled={downloadingWs}
			onclick={unduhWorksheet}
		>
			{#if downloadingWs}Mengunduh...{:else}<Icon name="printer" size={16} /> Worksheet printable (PDF){/if}
		</button>
		<button
			type="button"
			class="btn btn-ghost text-xs"
			disabled={downloadingFc}
			onclick={unduhFlashcard}
		>
			{#if downloadingFc}Mengunduh...{:else}<Icon name="layers" size={16} /> Unduh flashcard (PDF){/if}
		</button>
		<a href="/rekam-suara?product={productId}&chapter={chapterId}" class="btn btn-ghost text-xs">
			<Icon name="play" size={16} /> Rekam suara baca nyaring
		</a>
		<button type="button" class="btn btn-leaf text-xs" disabled={marking} onclick={tandaiSelesai}>
			{#if marking}...{:else}<Icon name="check" size={16} /> Tandai selesai{/if}
		</button>
	</div>

	<!-- Desktop: dua kolom — materi kiri, kuis kanan -->
	<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
		<div class="min-w-0">
	<!-- Poin inti -->
	<div class="card study-keypoints mt-4 p-4">
		<h2><Icon name="target" size={20} /> Poin inti</h2>
		<ul class="mt-2 space-y-1.5">
			{#each chapter.points as p, i (i)}
				<li class="flex gap-2 text-sm leading-relaxed">
					<Icon name="check" size={16} class="mt-0.5 shrink-0 text-[#177245]" /><span>{p}</span>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Rangkuman kilat -->
	{#if chapter.summary}
		<div class="card mt-3 border-2 !border-[#f2b33d] p-4">
			<h2 class="flex items-center gap-1.5 text-sm font-semibold"><Icon name="zap" size={16} /> Rangkuman kilat</h2>
			<p class="mt-1 text-sm leading-relaxed">{chapter.summary}</p>
		</div>
	{/if}

	<!-- Teks fokus -->
	<div class="card mt-3 p-4">
		<div class="flex items-center justify-between gap-2">
			<h2 class="flex items-center gap-1.5 text-sm font-semibold text-[#177245]"><Icon name="book-open" size={16} /> Teks fokus</h2>
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="btn btn-ghost !px-2.5 !py-1 text-xs"
					disabled={fontStep === 0}
					onclick={() => (fontStep = Math.max(0, fontStep - 1))}
					aria-label="Perkecil huruf"
				>
					A−
				</button>
				<span class="px-1 text-xs font-medium">A</span>
				<button
					type="button"
					class="btn btn-ghost !px-2.5 !py-1 text-xs"
					disabled={fontStep === 2}
					onclick={() => (fontStep = Math.min(2, fontStep + 1))}
					aria-label="Perbesar huruf"
				>
					A+
				</button>
			</div>
		</div>
		<p class="mt-2 whitespace-pre-line {fontSizes[fontStep]}">{#each focusSegments as seg, i (i)}{#if seg.kind === "term"}<button type="button" class="glossary-term" onclick={() => bukaIstilah(seg.term)}>{seg.text}</button>{:else}{seg.text}{/if}{/each}</p>
	</div>

	<!-- Catatan pribadi -->
	<div class="card mt-3 p-4">
		<label class="lbl flex items-center gap-1.5" for="catatan"><Icon name="file-text" size={16} /> Catatan pribadi</label>
		<textarea
			id="catatan"
			class="input"
			rows="3"
			placeholder="Tulis hal penting dari bab ini dengan bahasamu sendiri..."
			bind:value={note}
		></textarea>
		<div class="mt-2 flex items-center gap-2">
			<button type="button" class="btn btn-outline text-xs" disabled={noteSaving} onclick={simpanCatatan}>
				{noteSaving ? "Menyimpan..." : "Simpan Catatan"}
			</button>
			{#if noteMsg}
				<span class="text-xs {noteOk ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{noteMsg}</span>
			{/if}
		</div>
	</div>

	<!-- Flashcard: ketuk untuk membalik, geser untuk menandai -->
	{#if chapter.flashcards.length > 0}
		<div class="card mt-3 p-4">
			<h2 class="flex items-center gap-1.5 text-sm font-semibold text-[#177245]"><Icon name="layers" size={16} /> Flashcard</h2>
			<p class="mt-1 text-xs text-[#5f6b62]">
				Ketuk kartu untuk membalik. Geser ke kanan bila sudah hafal, geser ke kiri untuk lanjut tanpa menandai.
			</p>
			<p class="mt-2 text-xs font-medium text-[#5f6b62]">
				Kartu {fcIndex + 1} dari {chapter.flashcards.length} • {hafalSet.size} sudah hafal
			</p>
			<div class="fc-wrap">
				<div
					bind:this={fcCardEl}
					class="fc-card"
					class:fc-flipped={fcFlipped}
					class:fc-dragging={fcDragging}
					role="button"
					tabindex="0"
					aria-label="Flashcard {fcIndex + 1} dari {chapter.flashcards.length}. {fcFlipped
						? 'Jawaban'
						: 'Pertanyaan'} — ketuk untuk membalik."
					style="transform: {fcTransform}; opacity: {fcKeluar ? 0 : 1};"
					onpointerdown={fcPointerDown}
					onpointermove={fcPointerMove}
					onpointerup={fcPointerUp}
					onpointercancel={fcPointerCancel}
					onkeydown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							fcFlipped = !fcFlipped;
						}
					}}
				>
					{#if fcDragging}
						<span
							class="fc-label fc-label-kanan"
							style="opacity: {Math.min(1, Math.max(0, fcDragX) / 80)}">Hafal</span
						>
						<span
							class="fc-label fc-label-kiri"
							style="opacity: {Math.min(1, Math.max(0, -fcDragX) / 80)}">Belum</span
						>
					{/if}
					<span class="fc-teks"
						>{fcFlipped ? chapter.flashcards[fcIndex].back : chapter.flashcards[fcIndex].front}</span
					>
					<span class="fc-petunjuk"
						>{fcFlipped ? "Jawaban — ketuk untuk membalik" : "Ketuk untuk membalik"}</span
					>
				</div>
			</div>
			<div class="mt-3 flex gap-2">
				<button type="button" class="btn btn-leaf flex-1 text-xs" onclick={tandaiHafal}>
					<Icon name="check" size={16} /> Sudah hafal
				</button>
				<button
					type="button"
					class="btn btn-outline flex-1 text-xs"
					onclick={() => lanjutKartu("kiri")}
				>
					Belum hafal <Icon name="arrow-right" size={16} />
				</button>
			</div>
			{#if hafalSet.size === chapter.flashcards.length}
				<p class="mt-2 text-center text-xs font-semibold text-[#065f46]">
					Semua kartu sudah hafal — hebat
				</p>
				<button type="button" class="btn btn-ghost btn-block mt-2 text-xs" onclick={resetHafal}>
					<Icon name="refresh" size={16} /> Ulangi dari awal
				</button>
			{/if}
		</div>
	{/if}
		</div>

		<div class="min-w-0">
	<!-- Kuis -->
	<div class="card mt-4 p-4">
		<h2 class="flex items-center gap-2 text-base font-semibold"><Icon name="gamepad-2" size={18} /> Kuis bab ({totalQ} soal)</h2>
		{#if !quizStarted}
			<p class="mt-1 text-sm text-[#5f6b62]">
				Jawab satu per satu. Nilai dan pembahasan muncul setelah kamu mengirim semua jawaban.
			</p>
			<button
				type="button"
				class="btn btn-primary btn-block mt-3"
				disabled={totalQ === 0}
				onclick={() => (quizStarted = true)}
			>
				{#if totalQ === 0}Kuis belum tersedia{:else}<Icon name="rocket" size={16} /> Mulai Kuis{/if}
			</button>
		{:else if !result && currentQ}
			<p class="tabular-nums mt-2 text-xs font-medium text-[#5f6b62]">Soal {qIndex + 1} dari {totalQ}</p>
			<div class="mt-1 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
				<div
					class="h-full w-full origin-left bg-[#177245] transition-transform duration-300 ease-signature" style="transform: scaleX({((qIndex + 1) / Math.max(totalQ, 1))})"
				></div>
			</div>
			<p class="mt-3 text-base font-semibold leading-snug">{currentQ.question}</p>
			{#if currentQ.type === "pg" && Array.isArray(currentQ.options)}
				<div class="mt-3 space-y-2">
					{#each currentQ.options as opt (opt)}
						<label
							class="card flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm {answers[
								String(currentQ.id)
							] === opt
								? '!border-[#177245] bg-[#ece9dc]'
								: ''}"
						>
							<input
								type="radio"
								name={`quiz-${currentQ.id}`}
								value={opt}
								checked={answers[String(currentQ.id)] === opt}
								onchange={() => pilihJawaban(opt)}
							/>
							{opt}
						</label>
					{/each}
				</div>
			{:else if currentQ.type === "bs"}
				<div class="mt-3 flex gap-2">
					{#each ["Benar", "Salah"] as opt (opt)}
						<button
							type="button"
							class="chip flex-1 justify-center !py-2.5"
							class:active={answers[String(currentQ.id)] === opt}
							onclick={() => pilihJawaban(opt)}
						>
							{opt}
						</button>
					{/each}
				</div>
			{:else}
				<input
					class="input mt-3"
					placeholder="Tulis jawabanmu..."
					value={(answers[String(currentQ.id)] as string) ?? ""}
					oninput={(e) => pilihJawaban(e.currentTarget.value)}
				/>
			{/if}
			<div class="mt-4 flex gap-2">
				<button
					type="button"
					class="btn btn-ghost flex-1"
					disabled={qIndex === 0}
					onclick={() => (qIndex -= 1)}
				>
					<Icon name="chevron-left" size={16} /> Sebelumnya
				</button>
				{#if qIndex < totalQ - 1}
					<button type="button" class="btn btn-primary flex-1" onclick={() => (qIndex += 1)}>
						Berikutnya <Icon name="chevron-right" size={16} />
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-leaf flex-1"
						disabled={submitting}
						onclick={kirimKuis}
					>
						{#if submitting}Memeriksa...{:else}<Icon name="check" size={16} /> Kirim jawaban{/if}
					</button>
				{/if}
			</div>
			{#if quizError}
				<p class="err mt-3">{quizError}</p>
			{/if}
		{:else if result}
			<p class="mt-3 text-center text-xl font-semibold">
				Skor: {result.score} / {result.max_score}
				{#if result.score === result.max_score}
					<span class="inline-flex items-center gap-1.5"><Icon name="party-popper" size={18} /> Nilai sempurna</span>
				{:else if result.score >= result.max_score * 0.7}
					<span class="inline-flex items-center gap-1.5"><Icon name="thumbs-up" size={18} /> Hebat</span>
				{:else}
					<span class="inline-flex items-center gap-1.5"><Icon name="zap" size={18} /> Terus berlatih ya</span>
				{/if}
			</p>
			<div class="mt-3 space-y-2">
				{#each result.review as r (r.questionId)}
					<div class="card p-3 text-sm">
						<p class="font-medium">
							{#if r.correct}<Icon name="check-circle" size={16} class="inline-block align-[-2px] text-[#065f46]" /> Benar{:else}<Icon name="x-circle" size={16} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat{/if} — {qText(r.questionId)}
						</p>
						<p class="mt-1 text-[#3f4a42]">{r.discussion}</p>
					</div>
				{/each}
			</div>
			<button
				type="button"
				class="btn btn-outline btn-block mt-3"
				onclick={() => {
					result = null;
					answers = {};
					qIndex = 0;
				}}
			>
				<Icon name="refresh" size={16} /> Ulangi kuis
			</button>
		{/if}
	</div>
		</div>
	</div>

	<!-- Alat interaktif (hanya bab Matematika Kelas 1–6) -->
	{#if alatKind}
		<div class="mt-4">
			<h2 class="flex items-center gap-1.5 text-base font-semibold">
				<Icon name="zap" size={18} /> Alat interaktif
			</h2>
			<p class="mt-1 text-sm text-[#5f6b62]">
				Main sebentar dengan alat ini sebelum lanjut ke kuis — semua berjalan langsung di perangkatmu.
			</p>
			<div class="mt-3">
				{#if alatKind === "garis"}
					<NumberLine />
				{:else if alatKind === "perkalian"}
					<MultiplicationTable />
				{:else}
					<FractionCalculator />
				{/if}
			</div>
			<p class="mt-2 text-sm">
				<a class="font-medium text-[#177245] underline" href="/alat">Lihat semua alat interaktif</a>
			</p>
		</div>
	{/if}

	<!-- Tanya Jawab per Bab -->
	<div class="card mt-4 p-4">
		<h2 class="flex items-center gap-2 text-base font-semibold"><Icon name="message" size={18} /> Tanya tentang bab ini</h2>
		<p class="mt-1 text-xs text-[#5f6b62]">
			Ada yang belum paham dari bab ini? Tanyakan di sini — pertanyaan yang disetujui admin tampil untuk semua pembaca bab ini.
		</p>
		{#if chapter.locked}
			<p class="mt-3 rounded-lg bg-[#ece9dc] px-3 py-2 text-sm font-medium text-[#3f4a42]">
				<Icon name="lock" size={16} class="inline-block align-[-2px]" /> Beli produk untuk bisa bertanya tentang bab ini.
			</p>
		{:else}
			<form
				class="mt-3"
				onsubmit={(e) => {
					e.preventDefault();
					kirimPertanyaan();
				}}
			>
				<label class="lbl" for="qa-text">Pertanyaanmu (maks. 300 karakter)</label>
				<textarea
					id="qa-text"
					class="input"
					rows="2"
					maxlength="300"
					bind:value={qaText}
					placeholder="Contoh: Kenapa 7 + 5 sama dengan 12?"
					required
				></textarea>
				<div class="mt-2 flex items-center gap-2">
					<button type="submit" class="btn btn-primary text-xs" disabled={qaSending || !qaText.trim()}>
						{#if qaSending}Mengirim...{:else}<Icon name="message" size={16} /> Kirim pertanyaan{/if}
					</button>
					<span class="text-xs text-[#5f6b62]">{qaText.length}/300 karakter</span>
					{#if qaMsg}
						<span class="text-xs font-medium {qaMsg.startsWith('Pertanyaan terkirim') ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{qaMsg}</span>
					{/if}
				</div>
			</form>
		{/if}
		{#if qaLoading}
			<p class="mt-3 text-center text-sm font-semibold text-[#5f6b62]">Memuat pertanyaan...</p>
		{:else if qaError}
			<p class="err mt-3">{qaError}</p>
		{:else if qaList.length === 0}
			<p class="mt-3 text-sm text-[#5f6b62]">Belum ada pertanyaan untuk bab ini. Jadilah yang pertama bertanya</p>
		{:else}
			<div class="mt-3 space-y-3">
				{#each qaList as q (q.id)}
					<div class="card p-3 text-sm">
						<p class="flex flex-wrap items-center gap-1.5">
							<span class="font-semibold">{q.asker_name}</span>
							{#if q.mine}<span class={qaBadge(q.status)}>{q.status_label}</span>{/if}
						</p>
						<p class="mt-1 leading-relaxed">{q.question}</p>
						{#if q.answer}
							<div class="mt-2 rounded-lg bg-[#ecfdf5] px-3 py-2">
								<p class="text-xs font-semibold text-[#065f46]">
									<Icon name="check-circle" size={16} class="inline-block align-[-2px]" /> Jawaban Admin
								</p>
								<p class="mt-0.5 leading-relaxed">{q.answer}</p>
							</div>
						{:else if q.status === "approved"}
							<p class="mt-2 text-xs font-medium text-[#5f6b62]">Menunggu jawaban admin.</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Glosarium: arti istilah yang diketuk di Teks fokus -->
	<BottomSheet
		open={glossaryOpen}
		title={selectedTerm?.term ?? "Istilah"}
		onClose={() => (glossaryOpen = false)}
	>
		{#if selectedTerm}
			<p class="text-sm leading-relaxed">{selectedTerm.meaning}</p>
		{/if}
	</BottomSheet>
{/if}

<style>
	/* Flashcard geser: kartu mengikuti jari, label muncul sesuai jarak. */
	.fc-wrap {
		margin-top: 0.75rem;
		overflow: hidden;
		padding: 0.25rem;
	}
	.fc-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 11rem;
		padding: 1rem;
		border-radius: 1rem;
		border: 2px solid #e7e2d2;
		background: #ffffff;
		color: #22302a;
		text-align: center;
		cursor: grab;
		user-select: none;
		-webkit-user-select: none;
		/* Izinkan scroll vertikal halaman; gerakan horizontal ditangani pointer. */
		touch-action: pan-y;
		transition:
			transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1),
			background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1),
			border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1);
		will-change: transform;
	}
	.fc-card.fc-dragging {
		transition: none;
		cursor: grabbing;
	}
	.fc-card.fc-flipped {
		border-color: #177245;
		background: #ecfdf5;
		color: #065f46;
	}
	.fc-teks {
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.5;
	}
	.fc-petunjuk {
		font-size: 0.75rem;
		font-weight: 500;
		color: #6e675c;
	}
	.fc-label {
		position: absolute;
		top: 0.75rem;
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		pointer-events: none;
	}
	.fc-label-kanan {
		right: 0.75rem;
		background: #177245;
		color: #ffffff;
	}
	.fc-label-kiri {
		left: 0.75rem;
		background: #22302a;
		color: #f7f5ef;
	}

	@media (prefers-reduced-motion: reduce) {
		.fc-card {
			transition: none;
		}
	}
</style>
