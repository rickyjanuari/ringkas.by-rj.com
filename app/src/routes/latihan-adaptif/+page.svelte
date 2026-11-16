<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		getToken,
		type PublicQuestion,
		type StudyPack
	} from "$lib/api";

	interface AdaptiveQuestion {
		id: number;
		type: string;
		question: string;
		options: PublicQuestion["options"];
		subject: string;
		origin_kind: "quiz" | "simulation";
		origin_title: string;
	}

	interface AdaptiveQuestionResp {
		question: AdaptiveQuestion;
		level: number;
		level_label: string;
		requested_level: number;
	}

	interface AdaptiveAnswerResp {
		question_id: number;
		type: string;
		correct: boolean;
		earned: number;
		points: number;
		discussion: string;
	}

	interface SessionResult {
		question_id: number;
		question: string;
		correct: boolean;
		earned: number;
		points: number;
	}

	const PRODUCTS = ["k1", "k2", "k3", "k4", "k5", "k6"];
	const FALLBACK_SUBJECTS = [
		"Matematika",
		"B. Indonesia",
		"IPAS",
		"Pancasila",
		"B. Inggris",
		"PJOK",
		"PAI",
		"Seni Rupa"
	];
	const LEVEL_LABEL: Record<number, string> = { 1: "Mudah", 2: "Sedang", 3: "Sulit" };
	const SESSION_LEN = 10;

	let product = $state("k1");
	let subject = $state("Matematika");
	let subjects = $state<string[]>([...FALLBACK_SUBJECTS]);
	let subjectsLoading = $state(false);
	let subjectsError = $state("");

	let started = $state(false);
	let loadingQ = $state(false);
	let error = $state("");
	let current = $state<AdaptiveQuestion | null>(null);
	let currentLevel = $state(2);
	let idx = $state(0);
	let answer = $state<unknown>(undefined);
	let feedback = $state<AdaptiveAnswerResp | null>(null);
	let levelNote = $state("");
	let checking = $state(false);
	let level = $state(2);
	let streak = $state(0);
	let results = $state<SessionResult[]>([]);
	let finished = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let saveError = $state("");
	let savedScore = $state<{ score: number; max_score: number } | null>(null);

	let totalEarned = $derived(results.reduce((s, r) => s + r.earned, 0));
	let totalPoints = $derived(results.reduce((s, r) => s + r.points, 0));
	let correctCount = $derived(results.filter((r) => r.correct).length);

	onMount(() => {
		if (!getToken()) goto("/akun");
		void loadSubjects(product);
	});

	async function loadSubjects(p: string) {
		subjectsLoading = true;
		subjectsError = "";
		try {
			const pack = await api<StudyPack>(`/api/study/${p}`);
			const seen = new Set<string>();
			const list: string[] = [];
			for (const ch of pack.chapters) {
				if (!seen.has(ch.subject)) {
					seen.add(ch.subject);
					list.push(ch.subject);
				}
			}
			if (list.length > 0) {
				subjects = list;
				if (!list.includes(subject)) subject = list[0];
			}
		} catch {
			// Study pack gagal dimuat (mis. sesi habis ditangani api) —
			// pakai daftar mapel bawaan supaya latihan tetap bisa dipilih.
			subjects = [...FALLBACK_SUBJECTS];
			subjectsError = "Daftar mapel gagal dimuat, memakai daftar bawaan.";
		} finally {
			subjectsLoading = false;
		}
	}

	function pilihProduk(p: string) {
		if (started) return;
		product = p;
		void loadSubjects(p);
	}

	async function ambilSoal(lv: number) {
		loadingQ = true;
		error = "";
		try {
			const exclude = results.map((r) => r.question_id).join(",");
			const q = exclude
				? `&exclude=${encodeURIComponent(exclude)}`
				: "";
			const data = await api<AdaptiveQuestionResp>(
				`/api/adaptive/question?product=${product}&subject=${encodeURIComponent(subject)}&level=${lv}${q}`
			);
			current = data.question;
			currentLevel = data.level;
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat soal.";
		} finally {
			loadingQ = false;
		}
	}

	async function mulaiSesi() {
		started = true;
		finished = false;
		saved = false;
		savedScore = null;
		saveError = "";
		results = [];
		idx = 0;
		level = 2;
		streak = 0;
		answer = undefined;
		feedback = null;
		levelNote = "";
		await ambilSoal(2);
	}

	async function periksaJawaban() {
		if (!current || checking || feedback) return;
		checking = true;
		error = "";
		try {
			const res = await api<AdaptiveAnswerResp>("/api/adaptive/answer", {
				method: "POST",
				body: JSON.stringify({ question_id: current.id, answer: answer ?? null })
			});
			feedback = res;
			results = [
				...results,
				{
					question_id: current.id,
					question: current.question,
					correct: res.correct,
					earned: res.earned,
					points: res.points
				}
			];
			// Model adaptif (heuristik sederhana, bukan IRT):
			// 2 benar beruntun -> naik 1 level; 1 salah -> turun 1 level.
			if (res.correct) {
				streak += 1;
				if (streak >= 2 && level < 3) {
					level += 1;
					streak = 0;
					levelNote = `Naik ke level ${LEVEL_LABEL[level]} — dua jawaban benar beruntun!`;
				} else {
					levelNote = `Tetap di level ${LEVEL_LABEL[level]}. Satu benar lagi beruntun untuk naik.`;
				}
			} else {
				streak = 0;
				if (level > 1) {
					level -= 1;
					levelNote = `Turun ke level ${LEVEL_LABEL[level]} — tidak apa-apa, kita ulang dari yang lebih ringan.`;
				} else {
					levelNote = `Tetap di level ${LEVEL_LABEL[level]}.`;
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memeriksa jawaban.";
		} finally {
			checking = false;
		}
	}

	async function soalBerikutnya() {
		if (idx + 1 >= SESSION_LEN) {
			finished = true;
			return;
		}
		idx += 1;
		answer = undefined;
		feedback = null;
		levelNote = "";
		await ambilSoal(level);
	}

	async function simpanKeRiwayat() {
		if (saving || saved || results.length === 0) return;
		saving = true;
		saveError = "";
		try {
			const data = await api<{ attempt_id: number; score: number; max_score: number }>(
				"/api/adaptive/finish",
				{
					method: "POST",
					body: JSON.stringify({
						product,
						subject,
						results: results.map((r) => ({
							question_id: r.question_id,
							correct: r.correct,
							earned: r.earned,
							points: r.points
						}))
					})
				}
			);
			saved = true;
			savedScore = { score: data.score, max_score: data.max_score };
		} catch (e) {
			saveError = e instanceof Error ? e.message : "Gagal menyimpan ke riwayat.";
		} finally {
			saving = false;
		}
	}

	function sesiBaru() {
		started = false;
		finished = false;
		current = null;
		results = [];
		feedback = null;
		saved = false;
		savedScore = null;
	}

	function pilih(opt: unknown) {
		if (feedback) return;
		answer = opt;
	}

	function toggleKompleks(opt: string) {
		if (feedback) return;
		const cur = Array.isArray(answer) ? [...(answer as string[])] : [];
		const i = cur.indexOf(opt);
		if (i >= 0) cur.splice(i, 1);
		else cur.push(opt);
		answer = cur;
	}

	function pilihMatch(leftIdx: number, letter: string) {
		if (feedback) return;
		const cur =
			answer && typeof answer === "object" && !Array.isArray(answer)
				? { ...(answer as Record<string, string>) }
				: {};
		if (letter) cur[String(leftIdx)] = letter;
		else delete cur[String(leftIdx)];
		answer = cur;
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/")}>
	<Icon name="chevron-left" size={18} /> Kembali ke beranda
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-semibold leading-snug">
	<Icon name="target" size={18} class="shrink-0" /> Latihan adaptif
</h1>
<p class="text-sm text-[#5f6b62]">
	Soal menyesuaikan jawabanmu: dua benar beruntun, soal berikutnya lebih sulit. Satu salah, soal
	berikutnya lebih ringan. Ini heuristik sederhana, bukan tes IRT.
</p>

{#if !started}
	<div class="card mt-4 space-y-4 p-4">
		<div>
			<p class="text-sm font-semibold">Pilih kelas</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each PRODUCTS as p (p)}
					<button
						type="button"
						class="chip"
						class:active={product === p}
						onclick={() => pilihProduk(p)}
					>
						Kelas {p.slice(1)}
					</button>
				{/each}
			</div>
		</div>
		<div>
			<p class="text-sm font-semibold">Pilih mapel</p>
			{#if subjectsLoading}
				<p class="mt-2 text-xs text-[#5f6b62]">Memuat daftar mapel...</p>
			{/if}
			<div class="mt-2 flex flex-wrap gap-2">
				{#each subjects as s (s)}
					<button
						type="button"
						class="chip"
						class:active={subject === s}
						onclick={() => (subject = s)}
					>
						{s}
					</button>
				{/each}
			</div>
			{#if subjectsError}
				<p class="mt-2 text-xs text-[#5f6b62]">{subjectsError}</p>
			{/if}
		</div>
		<button type="button" class="btn btn-primary btn-block" onclick={mulaiSesi}>
			<Icon name="rocket" size={16} /> Mulai latihan (10 soal)
		</button>
		<p class="text-xs text-[#5f6b62]">
			Mulai dari level Sedang. Latihan ini gratis untuk semua akun yang sudah masuk. Skornya bisa
			disimpan ke riwayat belajarmu — tanpa mengubah Prediksi Nilai SAS.
		</p>
	</div>
{:else if !finished}
	<div class="card mt-4 border-[#177245] p-4">
		<div class="flex items-start justify-between gap-2">
			<div>
				<p class="text-sm font-semibold leading-snug">
					Latihan adaptif {subject} • Kelas {product.slice(1)}
				</p>
				<p class="mt-0.5 text-xs font-medium text-[#177245]">
					Level saat ini: {LEVEL_LABEL[currentLevel]} • Soal {Math.min(idx + 1, SESSION_LEN)} dari {SESSION_LEN}
				</p>
			</div>
			<span class="badge badge-brand shrink-0">{LEVEL_LABEL[currentLevel]}</span>
		</div>
		<div class="mt-2 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
			<div
				class="h-full w-full origin-left bg-[#177245] transition-transform duration-300 ease-signature" style="transform: scaleX({((idx + 1) / SESSION_LEN)})"
			></div>
		</div>

		{#if loadingQ}
			<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat soal...</p>
		{:else if error && !current}
			<p class="err mt-3">{error}</p>
			<button type="button" class="btn btn-outline btn-block mt-3" onclick={sesiBaru}>
				Pilih kelas/mapel lain
			</button>
		{:else if current}
			{#if current.origin_title}
				<p class="mt-3 text-xs text-[#5f6b62]">Dari: {current.origin_title}</p>
			{/if}
			<p class="mt-1 text-base font-semibold leading-snug">{current.question}</p>

			{#if current.type === "pg" && Array.isArray(current.options)}
				<div class="mt-3 space-y-2">
					{#each current.options as opt (opt)}
						<label
							class="card flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm {answer ===
							opt
								? '!border-[#177245] bg-[#ece9dc]'
								: ''}"
						>
							<input
								type="radio"
								name={`adaptif-${current.id}`}
								value={opt}
								checked={answer === opt}
								disabled={!!feedback}
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
						{@const picked = Array.isArray(answer) ? (answer as string[]) : []}
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
								disabled={!!feedback}
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
							class:active={answer === opt}
							disabled={!!feedback}
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
						{@const picked = answer && typeof answer === "object" && !Array.isArray(answer)
							? (answer as Record<string, string>)[String(li)] ?? ""
							: ""}
						<div class="flex items-center gap-2 text-sm">
							<span class="flex-1 font-medium">{li + 1}. {item}</span>
							<select
								class="input !w-40 !py-1.5 text-xs"
								value={picked}
								disabled={!!feedback}
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
					value={(answer as string) ?? ""}
					disabled={!!feedback}
					oninput={(e) => pilih(e.currentTarget.value)}
				></textarea>
			{:else}
				<input
					class="input mt-3"
					placeholder="Tulis jawabanmu..."
					value={(answer as string) ?? ""}
					disabled={!!feedback}
					oninput={(e) => pilih(e.currentTarget.value)}
				/>
			{/if}

			{#if feedback}
				<div
					class="mt-3 rounded-lg p-3 text-sm {feedback.correct
						? 'bg-[#ecfdf5] text-[#065f46]'
						: 'bg-[#fef2f2] text-[#991b1b]'}"
				>
					<p class="font-semibold">
						{#if feedback.correct}
							<Icon name="check-circle" size={16} class="tabular-nums inline-block align-[-2px]" /> Benar! (+{feedback.earned} dari {feedback.points} poin)
						{:else}
							<Icon name="x-circle" size={16} class="tabular-nums inline-block align-[-2px]" /> Belum tepat ({feedback.earned} dari {feedback.points} poin)
						{/if}
					</p>
					<p class="mt-1">{feedback.discussion}</p>
					{#if levelNote}
						<p class="mt-2 font-medium">
							<Icon name="zap" size={16} class="inline-block align-[-2px]" /> {levelNote}
						</p>
					{/if}
				</div>
				<button type="button" class="btn btn-primary btn-block mt-3" onclick={soalBerikutnya}>
					{#if idx + 1 >= SESSION_LEN}
						<Icon name="check" size={16} /> Lihat ringkasan
					{:else}
						Soal berikutnya <Icon name="chevron-right" size={16} />
					{/if}
				</button>
			{:else}
				<button
					type="button"
					class="btn btn-leaf btn-block mt-4"
					disabled={checking || answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0)}
					onclick={periksaJawaban}
				>
					{#if checking}Memeriksa...{:else}<Icon name="check" size={16} /> Periksa jawaban{/if}
				</button>
			{/if}
			{#if error}
				<p class="err mt-3">{error}</p>
			{/if}
		{/if}
	</div>
{:else}
	<div class="card mt-4 border-[#177245] p-4">
		<p class="text-center text-xl font-semibold">
			Skor: {totalEarned} / {totalPoints}
			{#if totalPoints > 0 && totalEarned === totalPoints}
				<span class="inline-flex items-center gap-1.5"><Icon name="party-popper" size={18} /> Nilai sempurna</span>
			{:else if totalPoints > 0 && totalEarned >= totalPoints * 0.7}
				<span class="inline-flex items-center gap-1.5"><Icon name="thumbs-up" size={18} /> Hebat</span>
			{:else}
				<span class="inline-flex items-center gap-1.5"><Icon name="zap" size={18} /> Terus berlatih ya</span>
			{/if}
		</p>
		<p class="mt-1 text-center text-sm text-[#5f6b62]">
			{correctCount} dari {results.length} jawaban benar • {subject} Kelas {product.slice(1)}
		</p>

		<div class="mt-3 space-y-2">
			{#each results as r, i (r.question_id)}
				<div class="card p-3 text-sm">
					<p class="font-medium">
						{#if r.correct}<Icon name="check-circle" size={16} class="inline-block align-[-2px] text-[#065f46]" /> Benar{:else}<Icon name="x-circle" size={16} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat{/if}
						— Soal {i + 1} ({r.earned}/{r.points} poin)
					</p>
					<p class="mt-1 text-[#3f4a42]">{r.question}</p>
				</div>
			{/each}
		</div>

		{#if saved && savedScore}
			<p class="tabular-nums ok-msg mt-3">
				Tersimpan ke riwayat — skor {savedScore.score} / {savedScore.max_score}.
			</p>
		{:else}
			<button
				type="button"
				class="btn btn-leaf btn-block mt-3"
				disabled={saving}
				onclick={simpanKeRiwayat}
			>
				{#if saving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan ke riwayat{/if}
			</button>
			{#if saveError}
				<p class="err mt-2">{saveError}</p>
			{/if}
		{/if}

		<div class="mt-3 flex gap-2">
			<button type="button" class="btn btn-outline flex-1" onclick={sesiBaru}>
				<Icon name="refresh" size={16} /> Latihan lagi
			</button>
			<a href={`/belajar/${product}`} class="btn btn-primary flex-1">
				<Icon name="book-open" size={16} /> Kembali ke Belajar
			</a>
		</div>
	</div>
{/if}
