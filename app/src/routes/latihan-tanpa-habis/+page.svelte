<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, getToken } from "$lib/api";

	interface EndlessQuestion {
		id: number | string;
		question: string;
		options: string[];
		points: number;
	}

	interface EndlessPack {
		set_id: string;
		grade: number;
		questions: EndlessQuestion[];
	}

	interface EndlessReview {
		id: number | string;
		question: string;
		correct: boolean;
		/** Kunci jawaban yang benar. */
		answer: string;
		/** Jawaban yang diberikan. */
		given: string | null;
		discussion: string;
	}

	interface EndlessResult {
		score: number;
		max: number;
		reviews: EndlessReview[];
	}

	let grade = $state(1);
	let pack = $state<EndlessPack | null>(null);
	let loading = $state(false);
	let error = $state("");
	let answers = $state<Record<string, string>>({});
	let submitting = $state(false);
	let submitError = $state("");
	let result = $state<EndlessResult | null>(null);

	let total = $derived(pack?.questions.length ?? 0);
	let answeredCount = $derived(Object.keys(answers).length);
	let allAnswered = $derived(pack !== null && answeredCount >= total && total > 0);

	onMount(() => {
		if (!getToken()) goto("/akun");
	});

	async function ambilSoalBaru() {
		loading = true;
		error = "";
		submitError = "";
		result = null;
		answers = {};
		try {
			pack = await api<EndlessPack>(`/api/endless/${grade}`);
			if (pack.questions.length === 0) error = "Soal untuk kelas ini belum tersedia.";
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat soal.";
		} finally {
			loading = false;
		}
	}

	function pilih(id: number | string, opt: string) {
		if (result) return;
		answers = { ...answers, [String(id)]: opt };
	}

	async function kirimJawaban() {
		if (!pack || submitting || result || !allAnswered) return;
		submitting = true;
		submitError = "";
		try {
			result = await api<EndlessResult>(`/api/endless/${grade}/submit`, {
				method: "POST",
				body: JSON.stringify({ set_id: pack.set_id, answers })
			});
		} catch (e) {
			submitError = e instanceof Error ? e.message : "Gagal mengirim jawaban.";
		} finally {
			submitting = false;
		}
	}

	function pilihKelasLain() {
		pack = null;
		result = null;
		answers = {};
		error = "";
	}
</script>

<a href="/" class="store-text-link product-back">
	<Icon name="chevron-left" size={18} /> Kembali ke beranda
</a>

<header class="page-heading page-heading-practice">
	<h1>
		<Icon name="refresh" size={18} class="shrink-0" /> Latihan tanpa habis
	</h1>
	<p class="text-sm text-[#5f6b62]">
		Soal hitung baru setiap kali kamu minta — tidak ada habisnya. Jawab semua soal, periksa
		jawabanmu, lalu minta soal baru lagi sesukamu.
	</p>
</header>

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
		<button type="button" class="btn btn-primary btn-block" disabled={loading} onclick={ambilSoalBaru}>
			{#if loading}Memuat soal...{:else}<Icon name="rocket" size={16} /> Soal baru (5 soal){/if}
		</button>
		{#if error}
			<p class="err">{error}</p>
		{/if}
		<p class="text-xs text-[#5f6b62]">
			Latihan ini gratis untuk semua akun yang sudah masuk. Setiap set berisi 5 soal hitung baru.
		</p>
	</div>
{:else}
	<div class="card mt-4 border-[#177245] p-4">
		<div class="flex items-start justify-between gap-2">
			<div>
				<p class="text-sm font-semibold leading-snug">Latihan tanpa habis • Kelas {pack.grade}</p>
				<p class="mt-0.5 text-xs font-medium text-[#177245]">
					{total} soal • {answeredCount} dari {total} sudah dijawab
				</p>
			</div>
			<button type="button" class="btn btn-ghost shrink-0 !px-2 !py-1 text-xs" onclick={pilihKelasLain}>
				<Icon name="x" size={16} /> Tutup
			</button>
		</div>

		{#if !result}
			<div class="mt-3 space-y-4">
				{#each pack.questions as q, i (q.id)}
					<div class="card p-3">
						<p class="text-base font-semibold leading-snug">
							<span class="text-[#177245]">{i + 1}.</span>
							{q.question}
						</p>
						<div class="mt-2 space-y-2">
							{#each q.options as opt (opt)}
								<label
									class="card flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm {answers[
										String(q.id)
									] === opt
										? '!border-[#177245] bg-[#ece9dc]'
										: ''}"
								>
									<input
										type="radio"
										name={`endless-${q.id}`}
										value={opt}
										checked={answers[String(q.id)] === opt}
										onchange={() => pilih(q.id, opt)}
									/>
									{opt}
								</label>
							{/each}
						</div>
					</div>
				{/each}
			</div>
			<button
				type="button"
				class="btn btn-leaf btn-block mt-4"
				disabled={submitting || !allAnswered}
				onclick={kirimJawaban}
			>
				{#if submitting}Memeriksa...{:else}<Icon name="check" size={16} /> Periksa jawaban{/if}
			</button>
			{#if !allAnswered}
				<p class="mt-2 text-center text-xs text-[#5f6b62]">
					Jawab semua {total} soal dulu ya, baru bisa diperiksa.
				</p>
			{/if}
			{#if submitError}
				<p class="err mt-3">{submitError}</p>
			{/if}
		{:else}
			<p class="mt-3 text-center text-xl font-semibold">
				Skor: {result.score} / {result.max}
				{#if result.score === result.max}
					<span class="inline-flex items-center gap-1.5"><Icon name="party-popper" size={18} /> Nilai sempurna</span>
				{:else if result.max > 0 && result.score >= result.max * 0.7}
					<span class="inline-flex items-center gap-1.5"><Icon name="thumbs-up" size={18} /> Hebat</span>
				{:else}
					<span class="inline-flex items-center gap-1.5"><Icon name="zap" size={18} /> Terus berlatih ya</span>
				{/if}
			</p>
			<div class="mt-3 space-y-2">
				{#each result.reviews as r, i (r.id)}
					<div class="card p-3 text-sm">
						<p class="font-medium">
							{#if r.correct}<Icon name="check-circle" size={16} class="inline-block align-[-2px] text-[#065f46]" /> Benar{:else}<Icon name="x-circle" size={16} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat{/if} — {r.question}
						</p>
						<p class="mt-1 text-[#3f4a42]">
							Jawabanmu: <span class="font-medium">{r.given ?? "—"}</span>
							{#if !r.correct} • Kunci: <span class="font-medium text-[#065f46]">{r.answer}</span>{/if}
						</p>
						<p class="mt-1 text-[#3f4a42]">{r.discussion}</p>
					</div>
				{/each}
			</div>
			<div class="mt-3 flex gap-2">
				<button type="button" class="btn btn-outline flex-1" onclick={pilihKelasLain}>
					<Icon name="refresh" size={16} /> Pilih kelas lain
				</button>
				<button type="button" class="btn btn-primary flex-1" disabled={loading} onclick={ambilSoalBaru}>
					{#if loading}Memuat...{:else}<Icon name="refresh" size={16} /> Soal baru lagi{/if}
				</button>
			</div>
			{#if error}
				<p class="err mt-3">{error}</p>
			{/if}
		{/if}
	</div>
{/if}
