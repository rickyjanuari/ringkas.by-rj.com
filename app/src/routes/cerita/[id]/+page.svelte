<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { api, getToken } from "$lib/api";

	type StoryQuestion = {
		index: number;
		type: string;
		question: string;
		options: string[];
	};

	type StoryDetail = {
		id: string;
		grade: number;
		title: string;
		moral: string;
		paragraphs: string[];
		questions: StoryQuestion[];
	};

	type StoryResult = {
		score: number;
		max_score: number;
		correct: Record<string, boolean>;
		review: { index: number; correct: boolean; discussion: string }[];
		attempt_id: number;
		xpEarned: number;
	};

	let id = $derived($page.params.id ?? "");
	let story = $state<StoryDetail | null>(null);
	let loading = $state(true);
	let error = $state("");
	let started = $state(false);
	let qIdx = $state(0);
	let answers = $state<Record<string, string>>({});
	let submitting = $state(false);
	let submitError = $state("");
	let result = $state<StoryResult | null>(null);

	let current = $derived(story?.questions[qIdx]);
	let total = $derived(story?.questions.length ?? 0);

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			story = await api<StoryDetail>(`/api/stories/${encodeURIComponent(id)}`);
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat cerita.";
		} finally {
			loading = false;
		}
	});

	function pilih(opt: string) {
		if (!current) return;
		answers = { ...answers, [String(current.index)]: opt };
	}

	function qText(index: number): string {
		return story?.questions.find((q) => q.index === index)?.question ?? "";
	}

	async function kirimJawaban() {
		if (!story || submitting || result) return;
		submitting = true;
		submitError = "";
		try {
			result = await api<StoryResult>(`/api/stories/${encodeURIComponent(story.id)}/submit`, {
				method: "POST",
				body: JSON.stringify({ answers })
			});
		} catch (e) {
			submitError = e instanceof Error ? e.message : "Gagal mengirim jawaban.";
		} finally {
			submitting = false;
		}
	}

	function bacaLagi() {
		started = false;
		result = null;
		answers = {};
		qIdx = 0;
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/cerita")}>
	<Icon name="chevron-left" size={18} /> Kembali ke daftar cerita
</button>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat cerita...</p>
{:else if error || !story}
	<p class="err mt-6">{error || "Cerita tidak ditemukan."}</p>
{:else}
	<h1 class="mt-3 flex items-center gap-2 text-xl font-semibold leading-snug">
		<Icon name="book-open" size={18} class="shrink-0" /> {story.title}
	</h1>
	<p class="text-sm text-[#5f6b62]">
		Kelas {story.grade} • {total} soal pemahaman
	</p>

	{#if !started}
		<div class="card mt-4 space-y-3 p-4 lg:p-5">
			{#each story.paragraphs as p (p.slice(0, 40))}
				<p class="text-base leading-relaxed">{p}</p>
			{/each}
			<p class="rounded-lg bg-[#fbeecd] p-3 text-sm font-medium text-[#92400e]">
				Pesan moral: {story.moral}
			</p>
			<button type="button" class="btn btn-primary btn-block" onclick={() => (started = true)}>
				<Icon name="help-circle" size={16} /> Mulai kuis pemahaman ({total} soal)
			</button>
		</div>
	{:else}
		<div class="card mt-4 border-[#177245] p-4">
			<div class="flex items-start justify-between gap-2">
				<div>
					<p class="text-sm font-semibold leading-snug">Kuis Pemahaman — {story.title}</p>
					<p class="mt-0.5 text-xs font-medium text-[#177245]">{total} soal • 1 poin per soal</p>
				</div>
				<button type="button" class="btn btn-ghost shrink-0 !px-2 !py-1 text-xs" onclick={bacaLagi}>
					<Icon name="book-open" size={16} /> Baca lagi
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
									String(current.index)
								] === opt
									? '!border-[#177245] bg-[#ece9dc]'
									: ''}"
							>
								<input
									type="radio"
									name={`cerita-${current.index}`}
									value={opt}
									checked={answers[String(current.index)] === opt}
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
								class:active={answers[String(current.index)] === opt}
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
						value={answers[String(current.index)] ?? ""}
						oninput={(e) => {
							if (!current) return;
							answers = { ...answers, [String(current.index)]: e.currentTarget.value };
						}}
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
							onclick={kirimJawaban}
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
				{#if result.xpEarned > 0}
					<p class="tabular-nums ok-msg mt-3 text-center font-semibold">
						Kamu mendapat +{result.xpEarned} XP
					</p>
				{/if}
				<div class="mt-3 space-y-2">
					{#each result.review as r (r.index)}
						<div class="card p-3 text-sm">
							<p class="font-medium">
								{#if r.correct}<Icon name="check-circle" size={16} class="inline-block align-[-2px] text-[#065f46]" /> Benar{:else}<Icon name="x-circle" size={16} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat{/if} — {qText(r.index)}
							</p>
							<p class="mt-1 text-[#3f4a42]">{r.discussion}</p>
						</div>
					{/each}
				</div>
				<div class="mt-3 flex gap-2">
					<button type="button" class="btn btn-outline flex-1" onclick={bacaLagi}>
						<Icon name="book-open" size={16} /> Baca lagi
					</button>
					<button type="button" class="btn btn-primary flex-1" onclick={() => goto("/cerita")}>
						<Icon name="chevron-right" size={16} /> Baca cerita lain
					</button>
				</div>
			{/if}
		</div>
	{/if}
{/if}
