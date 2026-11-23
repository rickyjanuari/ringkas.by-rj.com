<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { api, getToken, type PublicQuestion, type QuizResult } from "$lib/api";

	interface QuizDetail {
		id: string;
		class_id: string;
		class_name: string;
		product_id: string | null;
		title: string;
		subject: string;
		grade: number;
		question_count: number;
		submissions: number;
		created_at: string;
		is_teacher: boolean;
		submitted: boolean;
		my_score: number | null;
		my_max_score: number | null;
	}

	interface RecapStudent {
		id: string;
		name: string;
		submitted: boolean;
		score: number | null;
		max_score: number | null;
		percent: number | null;
		submitted_at: string | null;
	}

	interface Recap {
		quiz: { id: string; title: string; subject: string; grade: number; class_name: string; question_count: number; created_at: string };
		total_students: number;
		submitted_count: number;
		average_percent: number | null;
		students: RecapStudent[];
	}

	interface TeacherQuestion extends PublicQuestion {
		points: number;
		subject: string;
	}

	let quizId = $derived(page.params.id);
	let detail = $state<QuizDetail | null>(null);
	let loading = $state(true);
	let error = $state("");

	// Mode guru: rekap.
	let recap = $state<Recap | null>(null);
	let recapLoading = $state(false);
	let recapError = $state("");

	// Mode siswa: kerjakan kuis.
	let questions = $state<TeacherQuestion[]>([]);
	let started = $state(false);
	let qLoading = $state(false);
	let qIndex = $state(0);
	let answers = $state<Record<string, unknown>>({});
	let submitting = $state(false);
	let quizError = $state("");
	let result = $state<QuizResult | null>(null);

	let currentQ = $derived(questions[qIndex]);
	let totalQ = $derived(questions.length);

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			const data = await api<{ quiz: QuizDetail }>(`/api/teacher/quizzes/${quizId}`);
			detail = data.quiz;
			if (detail.is_teacher) {
				recapLoading = true;
				try {
					recap = await api<Recap>(`/api/teacher/quizzes/${quizId}/recap`);
				} catch (e) {
					recapError = e instanceof Error ? e.message : "Gagal memuat rekap.";
				} finally {
					recapLoading = false;
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat kuis.";
		} finally {
			loading = false;
		}
	});

	async function mulai() {
		qLoading = true;
		quizError = "";
		try {
			const data = await api<{ quiz: { id: string; title: string }; questions: TeacherQuestion[] }>(
				`/api/teacher/quizzes/${quizId}/questions`
			);
			questions = data.questions ?? [];
			if (questions.length === 0) throw new Error("Soal kuis belum tersedia.");
			started = true;
		} catch (e) {
			quizError = e instanceof Error ? e.message : "Gagal memuat soal.";
		} finally {
			qLoading = false;
		}
	}

	function pilih(value: unknown) {
		if (!currentQ) return;
		answers = { ...answers, [String(currentQ.id)]: value };
	}

	function toggleKompleks(opt: string) {
		if (!currentQ) return;
		const key = String(currentQ.id);
		const picked = Array.isArray(answers[key]) ? (answers[key] as string[]) : [];
		answers = {
			...answers,
			[key]: picked.includes(opt) ? picked.filter((x) => x !== opt) : [...picked, opt]
		};
	}

	function pilihMatch(li: number, value: string) {
		if (!currentQ) return;
		const key = String(currentQ.id);
		const cur =
			answers[key] && typeof answers[key] === "object" && !Array.isArray(answers[key])
				? { ...(answers[key] as Record<string, string>) }
				: {};
		if (value) cur[String(li)] = value;
		else delete cur[String(li)];
		answers = { ...answers, [key]: cur };
	}

	async function kirimKuis() {
		if (submitting || result) return;
		submitting = true;
		quizError = "";
		try {
			result = await api<QuizResult>(`/api/teacher/quizzes/${quizId}/submit`, {
				method: "POST",
				body: JSON.stringify({ answers })
			});
		} catch (e) {
			quizError = e instanceof Error ? e.message : "Gagal mengirim jawaban.";
		} finally {
			submitting = false;
		}
	}

	function qText(qid: string): string {
		return questions.find((q) => String(q.id) === String(qid))?.question ?? "";
	}
</script>

<a href="/kuis-guru" class="store-text-link product-back">
	<Icon name="chevron-left" size={18} /> Kembali ke kuis buatan guru
</a>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error || !detail}
	<p class="err mt-6">{error || "Kuis tidak ditemukan."}</p>
{:else}
	<header class="page-heading page-heading-practice">
		<h1>{detail.title}</h1>
		<p class="text-sm text-[#5f6b62]">
			{detail.class_name} • {detail.subject} • Kelas {detail.grade} • {detail.question_count} soal
		</p>
	</header>

	<!-- ======================= MODE GURU: REKAP ======================= -->
	{#if detail.is_teacher}
		<div class="card mt-4 p-4">
			<h2 class="flex items-center gap-1.5 text-sm font-semibold text-[#177245]"><Icon name="chart" size={16} /> Rekap kelas</h2>
			{#if recapLoading}
				<p class="mt-3 text-center text-sm font-semibold text-[#5f6b62]">Memuat rekap...</p>
			{:else if recapError}
				<p class="err mt-3">{recapError}</p>
			{:else if recap}
				<div class="mt-3 flex flex-wrap gap-2">
					<span class="tabular-nums badge badge-leaf">{recap.submitted_count} dari {recap.total_students} siswa sudah mengerjakan</span>
					<span class="badge badge-sun">
						Rata-rata kelas: {recap.average_percent === null ? "-" : `${recap.average_percent}%`}
					</span>
				</div>
				{#if recap.students.length === 0}
					<p class="mt-3 text-sm text-[#5f6b62]">Belum ada siswa di kelas ini.</p>
				{:else}
					<div class="mt-3 space-y-2">
						{#each recap.students as s (s.id)}
							<div class="card flex items-center justify-between gap-2 p-3">
								<div class="min-w-0">
									<p class="text-sm font-semibold">{s.name}</p>
									<p class="text-xs text-[#5f6b62]">
										{#if s.submitted}
											Sudah mengerjakan
										{:else}
											Belum mengerjakan
										{/if}
									</p>
								</div>
								{#if s.submitted && s.score !== null && s.max_score !== null}
									<span class="badge badge-leaf shrink-0">{s.score} / {s.max_score} ({s.percent}%)</span>
								{:else}
									<span class="badge badge-gray shrink-0">Belum ada nilai</span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>

	<!-- ======================= MODE SISWA ======================= -->
	{:else if detail.submitted}
		<div class="card mt-4 border-[#177245] p-4">
			<p class="flex items-center gap-1.5 text-sm font-semibold text-[#177245]">
				<Icon name="check-circle" size={16} /> Kamu sudah mengerjakan kuis ini
			</p>
			{#if detail.my_score !== null && detail.my_max_score !== null}
				<p class="tabular-nums mt-2 text-center text-xl font-semibold">Skormu: {detail.my_score} / {detail.my_max_score}</p>
			{/if}
			<p class="mt-1 text-center text-sm text-[#5f6b62]">Setiap kuis guru hanya bisa dikerjakan satu kali.</p>
		</div>
	{:else if !started}
		<div class="card mt-4 p-4">
			<p class="text-sm leading-relaxed">Kuis ini dibuat oleh gurumu untuk kelas <b>{detail.class_name}</b>. Ada {detail.question_count} soal — kerjakan dengan tenang, jawaban hanya bisa dikirim satu kali.</p>
			<button type="button" class="btn btn-primary mt-3" disabled={qLoading} onclick={mulai}>
				{#if qLoading}Memuat soal...{:else}<Icon name="play" size={16} /> Mulai mengerjakan{/if}
			</button>
			{#if quizError}<p class="err mt-3">{quizError}</p>{/if}
		</div>
	{:else if !result && currentQ}
		<div class="card mt-4 border-[#177245] p-4">
			<p class="tabular-nums text-xs font-medium text-[#5f6b62]">Soal {qIndex + 1} dari {totalQ} • {currentQ.points} poin</p>
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
								name={`tq-${currentQ.id}`}
								value={opt}
								checked={answers[String(currentQ.id)] === opt}
								onchange={() => pilih(opt)}
							/>
							{opt}
						</label>
					{/each}
				</div>
			{:else if currentQ.type === "pg_kompleks" && Array.isArray(currentQ.options)}
				<p class="mt-2 text-xs font-medium text-[#5f6b62]">Boleh pilih lebih dari satu jawaban.</p>
				<div class="mt-2 space-y-2">
					{#each currentQ.options as opt (opt)}
						{@const picked = Array.isArray(answers[String(currentQ.id)])
							? (answers[String(currentQ.id)] as string[])
							: []}
						<label
							class="card flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm {picked.includes(
								opt
							)
								? '!border-[#177245] bg-[#ece9dc]'
								: ''}"
						>
							<input type="checkbox" checked={picked.includes(opt)} onchange={() => toggleKompleks(opt)} />
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
							onclick={() => pilih(opt)}
						>
							{opt}
						</button>
					{/each}
				</div>
			{:else if currentQ.type === "menjodohkan" && currentQ.options && !Array.isArray(currentQ.options)}
				{@const left = currentQ.options.left}
				{@const right = currentQ.options.right}
				{@const letters = ["a", "b", "c", "d", "e"]}
				<div class="mt-3 space-y-2">
					{#each left as item, li (li)}
						{@const picked = answers[String(currentQ.id)] && typeof answers[String(currentQ.id)] === "object" && !Array.isArray(answers[String(currentQ.id)])
							? (answers[String(currentQ.id)] as Record<string, string>)[String(li)] ?? ""
							: ""}
						<div class="flex items-center gap-2 text-sm">
							<span class="flex-1 font-medium">{li + 1}. {item}</span>
							<select
								class="input !w-40 !py-1.5 text-xs"
								value={picked}
								onchange={(e) => pilihMatch(li, e.currentTarget.value)}
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
			{:else if currentQ.type === "uraian"}
				<textarea
					class="input mt-3"
					rows="3"
					placeholder="Tulis jawabanmu dengan kalimatmu sendiri..."
					value={(answers[String(currentQ.id)] as string) ?? ""}
					oninput={(e) => pilih(e.currentTarget.value)}
				></textarea>
			{:else}
				<input
					class="input mt-3"
					placeholder="Tulis jawabanmu..."
					value={(answers[String(currentQ.id)] as string) ?? ""}
					oninput={(e) => pilih(e.currentTarget.value)}
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
			{#if quizError}<p class="err mt-3">{quizError}</p>{/if}
		</div>
	{:else if result}
		<div class="card mt-4 border-[#177245] p-4">
			<p class="text-center text-xl font-semibold">
				Skormu: {result.score} / {result.max_score}
				{#if result.score === result.max_score}
					<span class="inline-flex items-center gap-1.5"><Icon name="trophy" size={18} /> Nilai sempurna</span>
				{:else if result.score >= result.max_score * 0.7}
					<span class="inline-flex items-center gap-1.5"><Icon name="check-circle" size={18} /> Hebat</span>
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
		</div>
	{/if}
{/if}
