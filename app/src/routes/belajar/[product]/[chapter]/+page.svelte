<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import {
		api,
		apiBlob,
		downloadBlob,
		getToken,
		type StudyPack,
		type FullChapter
	} from "$lib/api";

	let productId = $derived($page.params.product);
	let chapterId = $derived($page.params.chapter);
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
	let marking = $state(false);
	let downloadingWs = $state(false);

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

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			const pack = await api<StudyPack>(`/api/study/${productId}`);
			const found = pack.chapters.find((c) => c.id === chapterId);
			if (!found) throw new Error("Bab tidak ditemukan.");
			chapter = found;
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
				? "🎉 Bab selesai — kamu dapat 1 stiker baru!"
				: "✅ Bab ditandai selesai. Hebat!";
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
			noteMsg = note.trim() ? "✅ Catatan tersimpan." : "Catatan dihapus.";
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

<button type="button" class="btn btn-ghost" onclick={() => goto(`/belajar/${productId}`)}>
	← Kembali ke Ruang Belajar
</button>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#64748b]">Memuat...</p>
{:else if error || !chapter}
	<p class="err mt-6">{error || "Bab tidak ditemukan."}</p>
{:else}
	<h1 class="mt-3 text-xl font-extrabold leading-snug">{chapter.title}</h1>
	<p class="text-sm text-[#64748b]">
		{chapter.subject} • Kelas {chapter.grade} • Semester {chapter.semester}
	</p>

	{#if notice}
		<p class="ok-msg mt-3">{notice}</p>
	{/if}

	<div class="mt-3 flex flex-wrap gap-2">
		<button type="button" class="btn {bookmarked ? 'btn-sun' : 'btn-ghost'} text-xs" onclick={toggleBookmark}>
			{bookmarked ? "🔖 Dibookmark" : "🔖 Bookmark"}
		</button>
		<button
			type="button"
			class="btn btn-ghost text-xs"
			disabled={downloadingWs}
			onclick={unduhWorksheet}
		>
			{downloadingWs ? "Mengunduh..." : "🖨️ Worksheet Printable (PDF)"}
		</button>
		<button type="button" class="btn btn-leaf text-xs" disabled={marking} onclick={tandaiSelesai}>
			{marking ? "..." : "✅ Tandai Selesai"}
		</button>
	</div>

	<!-- Poin inti -->
	<div class="card mt-4 p-4">
		<h2 class="text-sm font-extrabold text-[#2273d8]">🎯 Poin Inti</h2>
		<ul class="mt-2 space-y-1.5">
			{#each chapter.points as p, i (i)}
				<li class="flex gap-2 text-sm leading-relaxed">
					<span class="text-[#159a68]">✓</span><span>{p}</span>
				</li>
			{/each}
		</ul>
	</div>

	<!-- Rangkuman kilat -->
	{#if chapter.summary}
		<div class="card mt-3 border-2 !border-[#ffc531] p-4">
			<h2 class="text-sm font-extrabold">⚡ Rangkuman Kilat</h2>
			<p class="mt-1 text-sm leading-relaxed">{chapter.summary}</p>
		</div>
	{/if}

	<!-- Teks fokus -->
	<div class="card mt-3 p-4">
		<div class="flex items-center justify-between gap-2">
			<h2 class="text-sm font-extrabold text-[#2273d8]">📖 Teks Fokus</h2>
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
				<span class="px-1 text-xs font-bold">A</span>
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
		<p class="mt-2 whitespace-pre-line {fontSizes[fontStep]}">{chapter.focus_text}</p>
	</div>

	<!-- Catatan pribadi -->
	<div class="card mt-3 p-4">
		<label class="lbl" for="catatan">📝 Catatan Pribadi</label>
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
				<span class="text-xs {noteMsg.startsWith('✅') ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{noteMsg}</span>
			{/if}
		</div>
	</div>

	<!-- Kuis -->
	<div class="card mt-4 p-4">
		<h2 class="text-base font-extrabold">🎮 Kuis Bab ({totalQ} soal)</h2>
		{#if !quizStarted}
			<p class="mt-1 text-sm text-[#64748b]">
				Jawab satu per satu. Nilai dan pembahasan muncul setelah kamu mengirim semua jawaban.
			</p>
			<button
				type="button"
				class="btn btn-primary btn-block mt-3"
				disabled={totalQ === 0}
				onclick={() => (quizStarted = true)}
			>
				{totalQ === 0 ? "Kuis belum tersedia" : "🚀 Mulai Kuis"}
			</button>
		{:else if !result && currentQ}
			<p class="mt-2 text-xs font-bold text-[#64748b]">Soal {qIndex + 1} dari {totalQ}</p>
			<div class="mt-1 h-2 overflow-hidden rounded-full bg-[#e6eefb]">
				<div
					class="h-full bg-[#2273d8] transition-all"
					style="width: {((qIndex + 1) / Math.max(totalQ, 1)) * 100}%"
				></div>
			</div>
			<p class="mt-3 text-base font-bold leading-snug">{currentQ.question}</p>
			{#if currentQ.type === "pg" && Array.isArray(currentQ.options)}
				<div class="mt-3 space-y-2">
					{#each currentQ.options as opt (opt)}
						<label
							class="card flex cursor-pointer items-center gap-2 !rounded-lg px-3 py-2.5 text-sm {answers[
								String(currentQ.id)
							] === opt
								? '!border-[#2273d8] bg-[#eef4fd]'
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
					← Sebelumnya
				</button>
				{#if qIndex < totalQ - 1}
					<button type="button" class="btn btn-primary flex-1" onclick={() => (qIndex += 1)}>
						Berikutnya →
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-leaf flex-1"
						disabled={submitting}
						onclick={kirimKuis}
					>
						{submitting ? "Memeriksa..." : "✅ Kirim Jawaban"}
					</button>
				{/if}
			</div>
			{#if quizError}
				<p class="err mt-3">{quizError}</p>
			{/if}
		{:else if result}
			<p class="mt-3 text-center text-xl font-extrabold">
				Skor: {result.score} / {result.max_score}
				{result.score === result.max_score ? "🎉 Nilai Sempurna!" : result.score >= result.max_score * 0.7 ? "👏 Hebat!" : "💪 Terus berlatih ya!"}
			</p>
			<div class="mt-3 space-y-2">
				{#each result.review as r (r.questionId)}
					<div class="card !rounded-lg p-3 text-sm">
						<p class="font-bold">
							{r.correct ? "✅ Benar" : "❌ Belum tepat"} — {qText(r.questionId)}
						</p>
						<p class="mt-1 text-[#475569]">{r.discussion}</p>
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
				🔄 Ulangi Kuis
			</button>
		{/if}
	</div>
{/if}
