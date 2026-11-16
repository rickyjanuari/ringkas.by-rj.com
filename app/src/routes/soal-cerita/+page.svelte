<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		getToken,
		type PublicQuestion,
		type QuizResult,
		type StoryPack
	} from "$lib/api";

	let grade = $state(1);
	let subject = $state<"Matematika" | "B. Indonesia">("Matematika");
	let pack = $state<StoryPack | null>(null);
	let loading = $state(false);
	let error = $state("");
	let qIdx = $state(0);
	let answers = $state<Record<string, unknown>>({});
	let submitting = $state(false);
	let submitError = $state("");
	let result = $state<QuizResult | null>(null);

	let current = $derived(pack?.questions[qIdx]);
	let total = $derived(pack?.questions.length ?? 0);

	onMount(() => {
		if (!getToken()) goto("/akun");
	});

	async function mulaiLatihan() {
		loading = true;
		error = "";
		result = null;
		answers = {};
		qIdx = 0;
		try {
			const slug = subject === "Matematika" ? "matematika" : "bahasa-indonesia";
			pack = await api<StoryPack>(`/api/story/${grade}/${slug}`);
			if (pack.questions.length === 0) error = "Soal cerita untuk pilihan ini belum tersedia.";
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat soal cerita.";
		} finally {
			loading = false;
		}
	}

	function pilih(opt: unknown) {
		if (!current) return;
		answers = { ...answers, [String(current.id)]: opt };
	}

	function qText(questionId: string): string {
		return pack?.questions.find((q) => String(q.id) === questionId)?.question ?? "";
	}

	async function kirimLatihan() {
		if (!pack || submitting || result) return;
		submitting = true;
		submitError = "";
		try {
			result = await api<QuizResult>("/api/quiz/submit", {
				method: "POST",
				body: JSON.stringify({ kind: "story", ref_id: pack.ref_id, answers })
			});
		} catch (e) {
			submitError = e instanceof Error ? e.message : "Gagal mengirim jawaban.";
		} finally {
			submitting = false;
		}
	}

	function latihanBaru() {
		pack = null;
		result = null;
		answers = {};
		qIdx = 0;
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/")}>
	<Icon name="chevron-left" size={18} /> Kembali ke beranda
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-semibold leading-snug">
	<Icon name="message" size={18} class="shrink-0" /> Soal cerita sehari-hari
</h1>
<p class="text-sm text-[#5f6b62]">
	Soal Matematika dan Bahasa Indonesia dari situasi nyata: belanja di warung, berbagi kue, antrean,
	dan banyak lagi. Bukan angka kosong — ceritanya dekat dengan harimu.
</p>

{#if !pack}
	<div class="card mt-4 space-y-4 p-4">
		<div>
			<p class="text-sm font-semibold">Pilih kelas</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each [1, 2, 3, 4, 5, 6] as g (g)}
					<button
						type="button"
						class="chip"
						class:active={grade === g}
						onclick={() => (grade = g)}
					>
						Kelas {g}
					</button>
				{/each}
			</div>
		</div>
		<div>
			<p class="text-sm font-semibold">Pilih mapel</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each ["Matematika", "B. Indonesia"] as s (s)}
					<button
						type="button"
						class="chip"
						class:active={subject === s}
						onclick={() => (subject = s as "Matematika" | "B. Indonesia")}
					>
						{s}
					</button>
				{/each}
			</div>
		</div>
		<button type="button" class="btn btn-primary btn-block" disabled={loading} onclick={mulaiLatihan}>
			{#if loading}Memuat soal...{:else}<Icon name="rocket" size={16} /> Mulai latihan (10 soal){/if}
		</button>
		{#if error}
			<p class="err">{error}</p>
		{/if}
		<p class="text-xs text-[#5f6b62]">
			Latihan ini gratis untuk semua akun yang sudah masuk. Nilainya tercatat di tracker kamu.
		</p>
	</div>
{:else}
	<div class="card mt-4 border-[#177245] p-4">
		<div class="flex items-start justify-between gap-2">
			<div>
				<p class="text-sm font-semibold leading-snug">
					Soal Cerita {pack.subject} • Kelas {pack.grade}
				</p>
				<p class="mt-0.5 text-xs font-medium text-[#177245]">{total} soal • 1 poin per soal</p>
			</div>
			<button type="button" class="btn btn-ghost shrink-0 !px-2 !py-1 text-xs" onclick={latihanBaru}>
				<Icon name="x" size={16} /> Tutup
			</button>
		</div>

		{#if !result && current}
			<p class="tabular-nums mt-3 text-xs font-medium text-[#5f6b62]">Soal {qIdx + 1} dari {total}</p>
			<div class="mt-1 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
				<div
					class="h-full w-full origin-left bg-[#177245] transition-transform duration-300 ease-signature" style="transform: scaleX({((qIdx + 1) / Math.max(total, 1))})"
				></div>
			</div>
			<p class="mt-3 text-base font-semibold leading-snug">{current.question}</p>

			{#if current.type === "pg" && Array.isArray(current.options)}
				<div class="mt-3 space-y-2">
					{#each current.options as opt (opt)}
						<label
							class="card flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm {answers[
								String(current.id)
							] === opt
								? '!border-[#177245] bg-[#ece9dc]'
								: ''}"
						>
							<input
								type="radio"
								name={`cerita-${current.id}`}
								value={opt}
								checked={answers[String(current.id)] === opt}
								onchange={() => pilih(opt)}
							/>
							{opt}
						</label>
					{/each}
				</div>
			{:else if current.type === "bs"}
				<div class="mt-3 flex gap-2">
					{#each ["Benar", "Salah"] as opt (opt)}
						<button
							type="button"
							class="chip flex-1 justify-center !py-2.5"
							class:active={answers[String(current.id)] === opt}
							onclick={() => pilih(opt)}
						>
							{opt}
						</button>
					{/each}
				</div>
			{:else}
				<input
					class="input mt-3"
					placeholder="Tulis jawabanmu..."
					value={(answers[String(current.id)] as string) ?? ""}
					oninput={(e) => pilih(e.currentTarget.value)}
				/>
			{/if}

			<div class="mt-4 flex gap-2">
				<button
					type="button"
					class="btn btn-ghost flex-1"
					disabled={qIdx === 0}
					onclick={() => (qIdx -= 1)}
				>
					<Icon name="chevron-left" size={16} /> Sebelumnya
				</button>
				{#if qIdx < total - 1}
					<button type="button" class="btn btn-primary flex-1" onclick={() => (qIdx += 1)}>
						Berikutnya <Icon name="chevron-right" size={16} />
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-leaf flex-1"
						disabled={submitting}
						onclick={kirimLatihan}
					>
						{#if submitting}Memeriksa...{:else}<Icon name="check" size={16} /> Kirim jawaban{/if}
					</button>
				{/if}
			</div>
			{#if submitError}
				<p class="err mt-3">{submitError}</p>
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
			<div class="mt-3 flex gap-2">
				<button type="button" class="btn btn-outline flex-1" onclick={latihanBaru}>
					<Icon name="refresh" size={16} /> Pilih kelas/mapel lain
				</button>
				<button type="button" class="btn btn-primary flex-1" onclick={mulaiLatihan}>
					<Icon name="refresh" size={16} /> Ulangi latihan ini
				</button>
			</div>
		{/if}
	</div>
{/if}
