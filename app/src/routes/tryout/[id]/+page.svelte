<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { api, formatTanggal, getToken, type PublicQuestion } from "$lib/api";

	interface TryoutDetail {
		id: string;
		grade: number;
		title: string;
		starts_at: string;
		ends_at: string;
		duration_minutes: number;
		question_count: number;
		is_free: number;
		status: string;
		phase: "upcoming" | "live" | "ended";
		participants: number;
		submissions: number;
		registered: boolean;
		submitted: boolean;
		my_score?: number;
		my_max_score?: number;
		can_join: boolean;
	}

	interface BoardRow {
		rank: number;
		name: string;
		score: number;
		max_score: number;
		duration_seconds: number;
		submitted_at: string;
	}

	interface TryoutResult {
		score: number;
		max_score: number;
		correct: Record<string, boolean>;
		review: { questionId: string; correct: boolean; discussion: string }[];
	}

	let id = $derived($page.params.id);
	let detail = $state<TryoutDetail | null>(null);
	let leaderboard = $state<BoardRow[] | null>(null);
	let loading = $state(true);
	let error = $state("");
	let notice = $state("");
	let loggedIn = $state(false);

	// Mengerjakan tryout.
	let questions = $state<PublicQuestion[]>([]);
	let started = $state(false);
	let qIndex = $state(0);
	let answers = $state<Record<string, unknown>>({});
	let timeLeft = $state(0);
	let startedAtMs = $state(0);
	let qLoading = $state(false);
	let submitting = $state(false);
	let result = $state<TryoutResult | null>(null);
	let quizError = $state("");
	let registering = $state(false);

	let currentQ = $derived(questions[qIndex]);
	let totalQ = $derived(questions.length);

	function clock(seconds: number): string {
		const m = Math.max(0, Math.floor(seconds / 60));
		const s = Math.max(0, seconds % 60);
		return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	}

	function durasiDetik(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		if (m === 0) return `${s} dtk`;
		return `${m} mnt ${s} dtk`;
	}

	// Hitung mundur selama mengerjakan; waktu habis, jawaban dikirim otomatis.
	$effect(() => {
		if (!started || result || questions.length === 0) return;
		const t = setInterval(() => {
			if (timeLeft <= 1) {
				clearInterval(t);
				timeLeft = 0;
				void kirimTryout();
			} else {
				timeLeft -= 1;
			}
		}, 1000);
		return () => clearInterval(t);
	});

	onMount(() => {
		loggedIn = !!getToken();
		void muat();
	});

	async function muat() {
		loading = true;
		error = "";
		try {
			const data = await api<{ tryout: TryoutDetail; leaderboard: BoardRow[] | null }>(
				`/api/tryouts/${id}`
			);
			detail = data.tryout;
			leaderboard = data.leaderboard;
		} catch (e) {
			// Token basi: api() sudah menghapusnya — coba sekali lagi tanpa token.
			if (e instanceof Error && e.message.startsWith("Sesi habis")) {
				try {
					const data = await api<{ tryout: TryoutDetail; leaderboard: BoardRow[] | null }>(
						`/api/tryouts/${id}`
					);
					detail = data.tryout;
					leaderboard = data.leaderboard;
					loading = false;
					return;
				} catch {
					/* jatuh ke error di bawah */
				}
			}
			error = e instanceof Error ? e.message : "Gagal memuat tryout.";
		} finally {
			loading = false;
		}
	}

	async function daftar() {
		if (!detail || registering) return;
		if (!loggedIn) {
			goto("/akun");
			return;
		}
		registering = true;
		notice = "";
		try {
			await api(`/api/tryouts/${id}/register`, { method: "POST", body: JSON.stringify({}) });
			notice = "Kamu terdaftar! Kembali ke halaman ini saat tryout dimulai ya.";
			await muat();
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mendaftar.";
		} finally {
			registering = false;
		}
	}

	async function mulai() {
		if (!detail) return;
		qLoading = true;
		quizError = "";
		try {
			const data = await api<{
				remaining_seconds: number;
				questions: PublicQuestion[];
			}>(`/api/tryouts/${id}/questions`);
			questions = data.questions ?? [];
			if (questions.length === 0) throw new Error("Soal tryout belum tersedia.");
			timeLeft = data.remaining_seconds;
			startedAtMs = Date.now();
			qIndex = 0;
			answers = {};
			result = null;
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
		const cur = Array.isArray(answers[key]) ? [...(answers[key] as string[])] : [];
		const i = cur.indexOf(opt);
		if (i >= 0) cur.splice(i, 1);
		else cur.push(opt);
		answers = { ...answers, [key]: cur };
	}

	function pilihMatch(leftIdx: number, letter: string) {
		if (!currentQ) return;
		const key = String(currentQ.id);
		const cur =
			answers[key] && typeof answers[key] === "object" && !Array.isArray(answers[key])
				? { ...(answers[key] as Record<string, string>) }
				: {};
		if (letter) cur[String(leftIdx)] = letter;
		else delete cur[String(leftIdx)];
		answers = { ...answers, [key]: cur };
	}

	async function kirimTryout() {
		if (!detail || submitting || result) return;
		submitting = true;
		quizError = "";
		try {
			const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
			const data = await api<TryoutResult>(`/api/tryouts/${id}/submit`, {
				method: "POST",
				body: JSON.stringify({ answers, duration_seconds: durationSeconds })
			});
			result = data;
			await muat();
		} catch (e) {
			quizError = e instanceof Error ? e.message : "Gagal mengirim jawaban.";
		} finally {
			submitting = false;
		}
	}

	function qText(qid: string): string {
		return questions.find((q) => String(q.id) === qid)?.question ?? "";
	}

	function faseBadge(t: TryoutDetail): string {
		if (t.phase === "live") return "badge badge-leaf";
		if (t.phase === "upcoming") return "badge badge-sun";
		return "badge badge-gray";
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/tryout")}>
	<Icon name="chevron-left" size={18} /> Semua Tryout
</button>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat tryout...</p>
{:else if error || !detail}
	<p class="err mt-6">{error || "Tryout tidak ditemukan."}</p>
{:else}
	<h1 class="mt-3 text-xl font-extrabold leading-snug">{detail.title}</h1>
	<p class="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
		<span class={faseBadge(detail)}>
			{detail.phase === "live" ? "Berlangsung" : detail.phase === "upcoming" ? "Mendatang" : "Selesai"}
		</span>
		<span class="badge {detail.is_free ? 'badge-leaf' : 'badge-gray'}">
			{detail.is_free ? "Gratis — semua akun bisa ikut" : `Khusus pemilik produk Kelas ${detail.grade}`}
		</span>
	</p>
	<p class="mt-2 text-sm text-[#5f6b62]">
		Kelas {detail.grade} • {detail.question_count} soal • {detail.duration_minutes} menit
	</p>
	<p class="mt-0.5 text-sm text-[#5f6b62]">
		<Icon name="calendar" size={14} class="inline-block align-[-2px]" /> Mulai: {formatTanggal(detail.starts_at)}
		<br />
		<Icon name="clock" size={14} class="inline-block align-[-2px]" /> Berakhir: {formatTanggal(detail.ends_at)}
	</p>
	<p class="mt-1 text-xs font-bold text-[#3f4a42]">
		<Icon name="users" size={14} class="inline-block align-[-2px]" /> {detail.participants} peserta terdaftar • {detail.submissions} sudah mengerjakan
	</p>

	{#if notice}
		<p class="ok-msg mt-3">{notice}</p>
	{/if}

	<!-- Pendaftaran / status peserta -->
	{#if detail.phase !== "ended" && !detail.submitted}
		<div class="card mt-4 p-4">
			{#if !loggedIn}
				<p class="text-sm">Masuk dulu untuk ikut tryout ini.</p>
				<a href="/akun" class="btn btn-primary mt-3">Masuk / Daftar Akun</a>
			{:else if !detail.can_join}
				<p class="text-sm">
					Tryout ini khusus pemilik produk Kelas {detail.grade}. Beli produknya di katalog untuk bisa ikut.
				</p>
				<a href="/katalog" class="btn btn-outline mt-3">Lihat Katalog</a>
			{:else if !detail.registered}
				<p class="text-sm">
					{detail.phase === "live"
						? "Tryout sedang berlangsung — daftar sekarang, lalu kerjakan sebelum waktu berakhir."
						: "Amankan kursimu — daftar sekarang, kerjakan saat tryout dimulai."}
				</p>
				<button type="button" class="btn btn-primary mt-3" disabled={registering} onclick={daftar}>
					{#if registering}Mendaftar...{:else}<Icon name="check" size={16} /> Ikut Tryout{/if}
				</button>
			{:else if detail.phase === "upcoming"}
				<p class="text-sm font-bold text-[#065f46]">
					<Icon name="check-circle" size={15} class="inline-block align-[-2px]" /> Kamu sudah terdaftar. Kembali ke halaman ini saat tryout dimulai ya.
				</p>
			{:else}
				<p class="text-sm font-bold text-[#065f46]">
					<Icon name="check-circle" size={15} class="inline-block align-[-2px]" /> Kamu sudah terdaftar — waktunya mengerjakan!
				</p>
				{#if !started}
					<button type="button" class="btn btn-primary mt-3" disabled={qLoading} onclick={mulai}>
						{#if qLoading}Memuat soal...{:else}<Icon name="play" size={16} /> Mulai Mengerjakan{/if}
					</button>
				{/if}
			{/if}
			{#if quizError}
				<p class="err mt-3">{quizError}</p>
			{/if}
		</div>
	{/if}

	<!-- Mengerjakan -->
	{#if started && !result && currentQ}
		<div class="card mt-4 border-[#177245] p-4">
			<div class="flex items-start justify-between gap-2">
				<div>
					<p class="text-sm font-extrabold leading-snug">{detail.title}</p>
					<p class="mt-0.5 text-xs font-bold text-[#177245]">
						<Icon name="timer" size={14} class="inline-block align-[-2px]" /> Sisa waktu: {clock(timeLeft)} • {totalQ} soal
					</p>
				</div>
			</div>
			<p class="mt-3 text-xs font-bold text-[#5f6b62]">Soal {qIndex + 1} dari {totalQ}</p>
			<div class="mt-1 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
				<div
					class="h-full bg-[#177245] transition-all"
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
								? '!border-[#177245] bg-[#ece9dc]'
								: ''}"
						>
							<input
								type="radio"
								name={`tryout-${currentQ.id}`}
								value={opt}
								checked={answers[String(currentQ.id)] === opt}
								onchange={() => pilih(opt)}
							/>
							{opt}
						</label>
					{/each}
				</div>
			{:else if currentQ.type === "pg_kompleks" && Array.isArray(currentQ.options)}
				<p class="mt-2 text-xs font-bold text-[#5f6b62]">Boleh pilih lebih dari satu jawaban.</p>
				<div class="mt-2 space-y-2">
					{#each currentQ.options as opt (opt)}
						{@const picked = Array.isArray(answers[String(currentQ.id)])
							? (answers[String(currentQ.id)] as string[])
							: []}
						<label
							class="card flex cursor-pointer items-center gap-2 !rounded-lg px-3 py-2.5 text-sm {picked.includes(
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
						onclick={kirimTryout}
					>
						{#if submitting}Memeriksa...{:else}<Icon name="check" size={16} /> Kirim Jawaban{/if}
					</button>
				{/if}
			</div>
			{#if quizError}
				<p class="err mt-3">{quizError}</p>
			{/if}
		</div>
	{/if}

	<!-- Hasil sendiri -->
	{#if result}
		<div class="card mt-4 border-[#177245] p-4">
			<p class="text-center text-xl font-extrabold">
				Skormu: {result.score} / {result.max_score}
				{#if result.score === result.max_score}
					<span class="inline-flex items-center gap-1.5"><Icon name="trophy" size={20} /> Nilai Sempurna!</span>
				{:else if result.score >= result.max_score * 0.7}
					<span class="inline-flex items-center gap-1.5"><Icon name="thumbs-up" size={20} /> Hebat!</span>
				{:else}
					<span class="inline-flex items-center gap-1.5"><Icon name="zap" size={20} /> Terus berlatih ya!</span>
				{/if}
			</p>
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
		</div>
	{:else if detail.submitted && detail.my_score !== undefined}
		<div class="card mt-4 p-4 text-center">
			<p class="text-base font-extrabold">Skormu: {detail.my_score} / {detail.my_max_score}</p>
			<p class="mt-1 text-sm text-[#5f6b62]">Kamu sudah mengerjakan tryout ini. Satu tryout hanya bisa dikerjakan sekali.</p>
		</div>
	{/if}

	<!-- Papan peringkat -->
	{#if leaderboard}
		<div class="card mt-4 p-4">
			<h2 class="flex items-center gap-2 text-base font-extrabold"><Icon name="trophy" size={18} /> Papan Peringkat</h2>
			{#if leaderboard.length === 0}
				<p class="mt-2 text-sm text-[#5f6b62]">Belum ada yang mengerjakan tryout ini.</p>
			{:else}
				<p class="mt-1 text-xs text-[#5f6b62]">Seri skor dimenangkan waktu pengerjaan yang lebih cepat.</p>
				<ol class="mt-3 space-y-2">
					{#each leaderboard as row (row.rank + row.name + row.submitted_at)}
						<li class="flex items-center gap-3 rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm">
							<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold {row.rank === 1 ? 'bg-[#f2b33d] text-[#22302a]' : row.rank <= 3 ? 'bg-[#177245] text-white' : 'bg-[#ece9dc] text-[#3f4a42]'}">
								{row.rank}
							</span>
							<span class="min-w-0 flex-1 truncate font-bold">{row.name}</span>
							<span class="shrink-0 text-xs font-bold text-[#5f6b62]">{durasiDetik(row.duration_seconds)}</span>
							<span class="shrink-0 font-extrabold text-[#177245]">{row.score} / {row.max_score}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	{:else if detail.phase === "live" && !detail.submitted}
		<p class="mt-4 text-sm text-[#5f6b62]">
			<Icon name="trophy" size={15} class="inline-block align-[-2px]" /> Papan peringkat tampil setelah tryout berakhir — atau setelah kamu mengirim jawaban.
		</p>
	{/if}
{/if}
