<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import {
		api,
		apiBlob,
		downloadBlob,
		getToken,
		type PublicQuestion,
		type QuizResult,
		type SimulationPack
	} from "$lib/api";

	let simId = $derived($page.params.paket);
	let pack = $state<SimulationPack | null>(null);
	let loading = $state(true);
	let error = $state("");
	let idx = $state(0);
	let answers = $state<Record<string, unknown>>({});
	let result = $state<QuizResult | null>(null);
	let submitting = $state(false);
	let submitError = $state("");
	let timeLeft = $state(0);
	let certLoading = $state(false);
	let certError = $state("");

	let current = $derived(pack?.questions[idx]);
	let total = $derived(pack?.questions.length ?? 0);

	function clock(seconds: number): string {
		const m = Math.max(0, Math.floor(seconds / 60));
		const s = Math.max(0, seconds % 60);
		return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	// Hitung mundur selama simulasi berjalan; waktu habis, jawaban dikirim otomatis.
	$effect(() => {
		if (!pack || result || pack.questions.length === 0) return;
		const t = setInterval(() => {
			if (timeLeft <= 1) {
				clearInterval(t);
				timeLeft = 0;
				void kirimJawaban();
			} else {
				timeLeft -= 1;
			}
		}, 1000);
		return () => clearInterval(t);
	});

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			pack = await api<SimulationPack>(`/api/simulations/${simId}/questions`);
			timeLeft = pack.simulation.total_minutes * 60;
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat soal simulasi.";
		} finally {
			loading = false;
		}
	});

	function pilih(opt: unknown) {
		if (!current) return;
		answers = { ...answers, [String(current.id)]: opt };
	}

	function toggleKompleks(opt: string) {
		if (!current) return;
		const key = String(current.id);
		const cur = Array.isArray(answers[key]) ? [...(answers[key] as string[])] : [];
		const i = cur.indexOf(opt);
		if (i >= 0) cur.splice(i, 1);
		else cur.push(opt);
		answers = { ...answers, [key]: cur };
	}

	function pilihMatch(leftIdx: number, letter: string) {
		if (!current) return;
		const key = String(current.id);
		const cur =
			answers[key] && typeof answers[key] === "object" && !Array.isArray(answers[key])
				? { ...(answers[key] as Record<string, string>) }
				: {};
		if (letter) cur[String(leftIdx)] = letter;
		else delete cur[String(leftIdx)];
		answers = { ...answers, [key]: cur };
	}

	function qText(questionId: string): string {
		return pack?.questions.find((q) => String(q.id) === String(questionId))?.question ?? "";
	}

	async function kirimJawaban() {
		if (!pack || submitting || result) return;
		submitting = true;
		submitError = "";
		try {
			result = await api<QuizResult>("/api/quiz/submit", {
				method: "POST",
				body: JSON.stringify({ kind: "simulation", ref_id: pack.simulation.id, answers })
			});
		} catch (e) {
			submitError = e instanceof Error ? e.message : "Gagal mengirim jawaban simulasi.";
		} finally {
			submitting = false;
		}
	}

	async function unduhSertifikat() {
		const id = result?.attempt_id;
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

<button type="button" class="btn btn-ghost" onclick={() => goto("/anbk")}>
	<Icon name="chevron-left" size={18} /> Kembali ke Simulasi ANBK
</button>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat soal simulasi...</p>
{:else if error || !pack}
	<p class="err mt-6">{error || "Simulasi tidak ditemukan."}</p>
	{#if error.includes("pemilik produk")}
		<a href="/produk/k5" class="btn btn-sun btn-block mt-3">
			<Icon name="lock" size={16} /> Beli Paket Kelas 5 untuk membuka
		</a>
	{/if}
{:else}
	<div class="card mt-3 border-[#177245] p-4">
		<div class="flex items-start justify-between gap-2">
			<div>
				<p class="text-sm font-extrabold leading-snug">{pack.simulation.title}</p>
				<p class="mt-0.5 text-xs font-bold text-[#177245]">
					<Icon name="timer" size={14} class="inline-block align-[-2px]" /> Sisa waktu: {clock(timeLeft)} • {pack.simulation.total_minutes} menit • {total} soal
				</p>
			</div>
			<span class="badge badge-brand shrink-0">ANBK</span>
		</div>

		{#if !result && current}
			<p class="mt-3 text-xs font-bold text-[#5f6b62]">Soal {idx + 1} dari {total}</p>
			<div class="mt-1 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
				<div
					class="h-full bg-[#177245] transition-all"
					style="width: {((idx + 1) / Math.max(total, 1)) * 100}%"
				></div>
			</div>
			<p class="mt-3 whitespace-pre-line text-base font-bold leading-snug">{current.question}</p>

			{#if current.type === "pg" && Array.isArray(current.options)}
				<div class="mt-3 space-y-2">
					{#each current.options as opt (opt)}
						<label
							class="card flex cursor-pointer items-center gap-2 !rounded-lg px-3 py-2.5 text-sm {answers[
								String(current.id)
							] === opt
								? '!border-[#177245] bg-[#ece9dc]'
								: ''}"
						>
							<input
								type="radio"
								name={`anbk-${current.id}`}
								value={opt}
								checked={answers[String(current.id)] === opt}
								onchange={() => pilih(opt)}
							/>
							{opt}
						</label>
					{/each}
				</div>
			{:else if current.type === "pg_kompleks" && Array.isArray(current.options)}
				<p class="mt-2 text-xs font-bold text-[#5f6b62]">Boleh pilih lebih dari satu jawaban.</p>
				<div class="mt-2 space-y-2">
					{#each current.options as opt (opt)}
						{@const picked = Array.isArray(answers[String(current.id)])
							? (answers[String(current.id)] as string[])
							: []}
						<label
							class="card flex cursor-pointer items-center gap-2 !rounded-lg px-3 py-2.5 text-sm {picked.includes(
								opt
							)
								? '!border-[#177245] bg-[#ece9dc]'
								: ''}"
						>
							<input
								type="checkbox"
								checked={picked.includes(opt)}
								onchange={() => toggleKompleks(opt)}
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
			{:else if current.type === "menjodohkan" && current.options && !Array.isArray(current.options)}
				{@const left = current.options.left}
				{@const right = current.options.right}
				{@const letters = ["a", "b", "c", "d", "e"]}
				<div class="mt-3 space-y-2">
					{#each left as item, li (li)}
						{@const picked = answers[String(current.id)] && typeof answers[String(current.id)] === "object" && !Array.isArray(answers[String(current.id)])
							? (answers[String(current.id)] as Record<string, string>)[String(li)] ?? ""
							: ""}
						<div class="flex items-center gap-2 text-sm">
							<span class="flex-1 font-bold">{li + 1}. {item}</span>
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
			{:else if current.type === "uraian"}
				<textarea
					class="input mt-3"
					rows="3"
					placeholder="Tulis jawabanmu dengan kalimatmu sendiri..."
					value={(answers[String(current.id)] as string) ?? ""}
					oninput={(e) => pilih(e.currentTarget.value)}
				></textarea>
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
					disabled={idx === 0}
					onclick={() => (idx -= 1)}
				>
					<Icon name="chevron-left" size={16} /> Sebelumnya
				</button>
				{#if idx < total - 1}
					<button type="button" class="btn btn-primary flex-1" onclick={() => (idx += 1)}>
						Berikutnya <Icon name="chevron-right" size={16} />
					</button>
				{:else}
					<button
						type="button"
						class="btn btn-leaf flex-1"
						disabled={submitting}
						onclick={kirimJawaban}
					>
						{#if submitting}Memeriksa...{:else}<Icon name="check" size={16} /> Kirim Jawaban{/if}
					</button>
				{/if}
			</div>
			{#if submitError}
				<p class="err mt-3">{submitError}</p>
			{/if}
		{:else if result}
			<p class="mt-3 text-center text-xl font-extrabold">
				Skor: {result.score} / {result.max_score}
				{#if result.score === result.max_score}
					<span class="inline-flex items-center gap-1.5"><Icon name="party-popper" size={20} /> Nilai Sempurna!</span>
				{:else if result.score >= result.max_score * 0.7}
					<span class="inline-flex items-center gap-1.5"><Icon name="thumbs-up" size={20} /> Hebat!</span>
				{:else}
					<span class="inline-flex items-center gap-1.5"><Icon name="zap" size={20} /> Terus berlatih ya!</span>
				{/if}
			</p>
			{#if result.passed && result.attempt_id}
				<button
					type="button"
					class="btn btn-sun btn-block mt-3"
					disabled={certLoading}
					onclick={unduhSertifikat}
				>
					{#if certLoading}Mengunduh...{:else}<Icon name="award" size={16} /> Unduh Sertifikat{/if}
				</button>
				{#if certError}
					<p class="err mt-2">{certError}</p>
				{/if}
			{/if}
			<div class="mt-3 space-y-2">
				{#each result.review as r (r.questionId)}
					<div class="card !rounded-lg p-3 text-sm">
						<p class="font-bold">
							{#if r.correct}<Icon name="check-circle" size={15} class="inline-block align-[-2px] text-[#065f46]" /> Benar{:else}<Icon name="x-circle" size={15} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat{/if} — {qText(r.questionId)}
						</p>
						<p class="mt-1 text-[#3f4a42]">{r.discussion}</p>
					</div>
				{/each}
			</div>
			<div class="mt-3 flex gap-2">
				<button
					type="button"
					class="btn btn-outline flex-1"
					onclick={() => goto("/anbk")}
				>
					<Icon name="chevron-left" size={16} /> Daftar ANBK
				</button>
				<button
					type="button"
					class="btn btn-primary flex-1"
					onclick={() => {
						result = null;
						answers = {};
						idx = 0;
						timeLeft = (pack?.simulation.total_minutes ?? 0) * 60;
					}}
				>
					<Icon name="refresh" size={16} /> Ulangi Simulasi
				</button>
			</div>
		{/if}
	</div>
{/if}
