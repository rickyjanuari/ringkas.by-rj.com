<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import Mascot from "$lib/Mascot.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		getToken,
		type HardBankData,
		type HardBankItem,
		type HardBankPracticeResult
	} from "$lib/api";

	let bank = $state<HardBankData | null>(null);
	let loading = $state(true);
	let error = $state("");
	let notice = $state("");

	// ---- Mode latihan ----
	let practicing = $state(false);
	let questions = $state<HardBankItem[]>([]);
	let qIdx = $state(0);
	let answers = $state<Record<string, unknown>>({});
	let submitting = $state(false);
	let submitError = $state("");
	let result = $state<HardBankPracticeResult | null>(null);

	let bySubject = $derived.by(() => {
		if (!bank) return [] as [string, HardBankItem[]][];
		const map = new Map<string, HardBankItem[]>();
		for (const it of bank.items) {
			const key = `${it.subject} • Kelas ${it.grade}`;
			const arr = map.get(key) ?? [];
			arr.push(it);
			map.set(key, arr);
		}
		return [...map.entries()];
	});

	let current = $derived(questions[qIdx] as HardBankItem | undefined);
	let total = $derived(questions.length);

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		await muatBank();
	});

	async function muatBank() {
		loading = true;
		error = "";
		try {
			bank = await api<HardBankData>("/api/hard-bank");
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat Soal sulitku.";
		} finally {
			loading = false;
		}
	}

	function mulaiLatihan() {
		if (!bank || bank.items.length === 0) return;
		// Latihan maksimal 20 soal per sesi — yang paling baru salah dulu.
		questions = bank.items.slice(0, 20);
		qIdx = 0;
		answers = {};
		result = null;
		submitError = "";
		practicing = true;
	}

	function pilih(opt: unknown) {
		if (!current) return;
		answers = { ...answers, [String(current.question_id)]: opt };
	}

	function toggleKompleks(opt: string) {
		if (!current) return;
		const key = String(current.question_id);
		const cur = Array.isArray(answers[key]) ? [...(answers[key] as string[])] : [];
		const i = cur.indexOf(opt);
		if (i >= 0) cur.splice(i, 1);
		else cur.push(opt);
		answers = { ...answers, [key]: cur };
	}

	function pilihMatch(leftIdx: number, letter: string) {
		if (!current) return;
		const key = String(current.question_id);
		const cur =
			answers[key] && typeof answers[key] === "object" && !Array.isArray(answers[key])
				? { ...(answers[key] as Record<string, string>) }
				: {};
		if (letter) cur[String(leftIdx)] = letter;
		else delete cur[String(leftIdx)];
		answers = { ...answers, [key]: cur };
	}

	function qText(questionId: string): string {
		return questions.find((q) => String(q.question_id) === questionId)?.question ?? "";
	}

	async function kirimLatihan() {
		if (submitting || result) return;
		submitting = true;
		submitError = "";
		try {
			result = await api<HardBankPracticeResult>("/api/hard-bank/practice", {
				method: "POST",
				body: JSON.stringify({ answers })
			});
			await muatBank();
			notice =
				result.mastered.length > 0
					? `${result.mastered.length} soal sudah dikuasai dan keluar dari bank. Hebat`
					: "Belum ada yang dikuasai — soalnya tetap di bank, coba lagi ya.";
		} catch (e) {
			submitError = e instanceof Error ? e.message : "Gagal mengirim jawaban.";
		} finally {
			submitting = false;
		}
	}

	function tutupLatihan() {
		practicing = false;
		questions = [];
		result = null;
		answers = {};
		qIdx = 0;
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/akun")}>
	<Icon name="chevron-left" size={18} /> Kembali ke akun
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-semibold leading-snug">
	<Icon name="target" size={18} class="shrink-0" /> Soal sulitku
</h1>
<p class="text-sm text-[#5f6b62]">
	Soal yang pernah kamu jawab salah — di kuis bab dan simulasi — terkumpul di sini. Jawab benar,
	maka soal itu keluar dari bank.
</p>

{#if notice}
	<p class="tabular-nums ok-msg mt-3">{notice}</p>
{/if}

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if !practicing}
	{#if !bank || bank.total === 0}
		<div class="card mt-4 p-5 text-center">
			<p class="flex justify-center"><Mascot expression="senang" /></p>
			<p class="text-2xl font-semibold">Belum ada soal sulit</p>
			<p class="mt-1 text-sm text-[#5f6b62]">
				Soal yang kamu jawab salah akan muncul di sini. Terus kerjakan kuis dan simulasi, ya!
			</p>
			<a href="/katalog" class="btn btn-primary mt-4">Cari materi belajar</a>
		</div>
	{:else}
		<div class="card mt-4 flex items-center gap-3 p-4">
			<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="target" size={18} /></span>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">{bank.total} soal sulit menunggu</p>
				<p class="text-xs text-[#5f6b62]">Latihan 20 soal per sesi — yang paling baru salah dulu.</p>
			</div>
			<button type="button" class="btn btn-leaf shrink-0" onclick={mulaiLatihan}>
				<Icon name="refresh" size={16} /> Latihan sekarang
			</button>
		</div>

		{#each bySubject as [subject, list] (subject)}
			<h2 class="mt-5 text-sm font-semibold text-[#177245]">{subject} ({list.length})</h2>
			<div class="mt-2 space-y-2">
				{#each list as it (it.question_id)}
					<div class="card p-3">
						<p class="text-sm font-medium leading-snug">{it.question}</p>
						<p class="mt-1 text-xs text-[#5f6b62]">
							Dari: {it.origin_kind === "quiz" ? "Kuis bab" : "Simulasi"} • {it.origin_title}
						</p>
					</div>
				{/each}
			</div>
		{/each}
	{/if}
{:else}
	<div class="card mt-4 border-[#177245] p-4">
		<div class="flex items-start justify-between gap-2">
			<div>
				<p class="text-sm font-semibold leading-snug">Latihan soal sulitku</p>
				<p class="mt-0.5 text-xs font-medium text-[#177245]">
					{total} soal di sesi ini • Jawab benar supaya keluar dari bank
				</p>
			</div>
			<button type="button" class="btn btn-ghost shrink-0 !px-2 !py-1 text-xs" onclick={tutupLatihan}>
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
			<p class="mt-1 text-xs text-[#5f6b62]">
				Dari: {current.origin_kind === "quiz" ? "Kuis bab" : "Simulasi"} • {current.origin_title}
			</p>

			{#if current.type === "pg" && Array.isArray(current.options)}
				<div class="mt-3 space-y-2">
					{#each current.options as opt (opt)}
						<label
							class="card flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm {answers[
								String(current.question_id)
							] === opt
								? '!border-[#177245] bg-[#ece9dc]'
								: ''}"
						>
							<input
								type="radio"
								name={`sulit-${current.question_id}`}
								value={opt}
								checked={answers[String(current.question_id)] === opt}
								onchange={() => pilih(opt)}
							/>
							{opt}
						</label>
					{/each}
				</div>
			{:else if current.type === "pg_kompleks" && Array.isArray(current.options)}
				<p class="mt-2 text-xs font-medium text-[#5f6b62]">Boleh pilih lebih dari satu jawaban.</p>
				<div class="mt-2 space-y-2">
					{#each current.options as opt (opt)}
						{@const picked = Array.isArray(answers[String(current.question_id)])
							? (answers[String(current.question_id)] as string[])
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
							class:active={answers[String(current.question_id)] === opt}
							onclick={() => pilih(opt)}
						>
							{opt}
						</button>
					{/each}
				</div>
			{:else if current.type === "menjodohkan" && current.options && !Array.isArray(current.options)}
				{@const left = (current.options as { left: string[]; right: string[] }).left}
				{@const right = (current.options as { left: string[]; right: string[] }).right}
				{@const letters = ["a", "b", "c", "d", "e"]}
				<div class="mt-3 space-y-2">
					{#each left as item, li (li)}
						{@const picked = answers[String(current.question_id)] &&
						typeof answers[String(current.question_id)] === "object" &&
						!Array.isArray(answers[String(current.question_id)])
							? (answers[String(current.question_id)] as Record<string, string>)[String(li)] ?? ""
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
			{:else if current.type === "uraian"}
				<textarea
					class="input mt-3"
					rows="3"
					placeholder="Tulis jawabanmu dengan kalimatmu sendiri..."
					value={(answers[String(current.question_id)] as string) ?? ""}
					oninput={(e) => pilih(e.currentTarget.value)}
				></textarea>
			{:else}
				<input
					class="input mt-3"
					placeholder="Tulis jawabanmu..."
					value={(answers[String(current.question_id)] as string) ?? ""}
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
					<span class="inline-flex items-center gap-1.5"><Icon name="party-popper" size={18} /> Semua benar</span>
				{:else if result.score >= result.max_score * 0.7}
					<span class="inline-flex items-center gap-1.5"><Icon name="thumbs-up" size={18} /> Hebat</span>
				{:else}
					<span class="inline-flex items-center gap-1.5"><Icon name="zap" size={18} /> Terus berlatih ya</span>
				{/if}
			</p>
			<p class="mt-1 text-center text-sm text-[#5f6b62]">
				{result.mastered.length} soal dikuasai dan keluar dari bank • {result.remaining} soal sulit tersisa
			</p>
			<div class="mt-3 space-y-2">
				{#each result.review as r (r.questionId)}
					<div class="card p-3 text-sm">
						<p class="font-medium">
							{#if r.correct}<Icon name="check-circle" size={16} class="inline-block align-[-2px] text-[#065f46]" /> Benar — soal ini keluar dari bank{:else}<Icon name="x-circle" size={16} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat — soal ini tetap di bank{/if} — {qText(r.questionId)}
						</p>
						<p class="mt-1 text-[#3f4a42]">{r.discussion}</p>
					</div>
				{/each}
			</div>
			<div class="mt-3 flex gap-2">
				<button type="button" class="btn btn-outline flex-1" onclick={tutupLatihan}>
					<Icon name="chevron-left" size={16} /> Kembali ke daftar
				</button>
				{#if result.remaining > 0}
					<button type="button" class="btn btn-primary flex-1" onclick={mulaiLatihan}>
						<Icon name="refresh" size={16} /> Latihan lagi
					</button>
				{/if}
			</div>
		{/if}
	</div>
{/if}
