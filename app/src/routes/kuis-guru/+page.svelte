<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, getToken, type PublicQuestion } from "$lib/api";

	interface TeacherClass {
		id: string;
		code: string;
		name: string;
		product_id: string;
		product_title: string;
		member_count: number;
		created_at: string;
	}

	interface BankQuestion extends PublicQuestion {
		points: number;
		subject: string;
		grade: number;
		origin: string;
		answer: string;
		answer_label: string;
	}

	interface MyQuiz {
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
	}

	let classes = $state<TeacherClass[]>([]);
	let quizzes = $state<MyQuiz[]>([]);
	let loading = $state(true);
	let error = $state("");

	// Form buat kuis.
	let classId = $state("");
	let title = $state("");
	let bank = $state<BankQuestion[]>([]);
	let bankLoading = $state(false);
	let bankError = $state("");
	let subjectFilter = $state("");
	let searchText = $state("");
	let selectedIds = $state<number[]>([]);
	let saving = $state(false);
	let saveMsg = $state("");
	let saveError = $state("");

	let selectedClass = $derived(classes.find((c) => c.id === classId) ?? null);
	let subjects = $derived([...new Set(bank.map((q) => q.subject))].sort());
	let filteredBank = $derived(
		bank.filter((q) => {
			if (subjectFilter && q.subject !== subjectFilter) return false;
			if (searchText.trim()) {
				const needle = searchText.trim().toLowerCase();
				if (!q.question.toLowerCase().includes(needle)) return false;
			}
			return true;
		})
	);
	let canSave = $derived(
		selectedClass !== null && title.trim().length >= 3 && title.trim().length <= 120 && selectedIds.length >= 1 && selectedIds.length <= 30
	);

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			const [cData, qData] = await Promise.all([
				api<{ classes: TeacherClass[] }>("/api/teacher/classes"),
				api<{ quizzes: MyQuiz[] }>("/api/teacher/quizzes")
			]);
			classes = cData.classes ?? [];
			quizzes = qData.quizzes ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat data guru.";
		} finally {
			loading = false;
		}
	});

	async function muatBank() {
		if (!selectedClass) {
			bank = [];
			return;
		}
		bankLoading = true;
		bankError = "";
		bank = [];
		selectedIds = [];
		subjectFilter = "";
		try {
			const data = await api<{ questions: BankQuestion[] }>(
				`/api/teacher/bank?product=${encodeURIComponent(selectedClass.product_id)}`
			);
			bank = data.questions ?? [];
			if (bank.length === 0) bankError = "Belum ada soal bank untuk produk kelas ini.";
		} catch (e) {
			bankError = e instanceof Error ? e.message : "Gagal memuat bank soal.";
		} finally {
			bankLoading = false;
		}
	}

	function togglePilih(id: number) {
		if (selectedIds.includes(id)) selectedIds = selectedIds.filter((x) => x !== id);
		else if (selectedIds.length < 30) selectedIds = [...selectedIds, id];
	}

	function typeLabel(type: string): string {
		if (type === "pg") return "Pilihan Ganda";
		if (type === "pg_kompleks") return "Pilihan Ganda Kompleks";
		if (type === "bs") return "Benar / Salah";
		if (type === "menjodohkan") return "Menjodohkan";
		if (type === "isian") return "Isian";
		if (type === "uraian") return "Uraian";
		return type;
	}

	async function simpanKuis() {
		if (!canSave || saving) return;
		saving = true;
		saveMsg = "";
		saveError = "";
		try {
			const data = await api<{ quiz: MyQuiz }>("/api/teacher/quizzes", {
				method: "POST",
				body: JSON.stringify({ class_id: classId, title: title.trim(), question_ids: selectedIds })
			});
			quizzes = [data.quiz, ...quizzes];
			saveMsg = `Kuis "${data.quiz.title}" tersimpan — ${data.quiz.question_count} soal.`;
			title = "";
			selectedIds = [];
		} catch (e) {
			saveError = e instanceof Error ? e.message : "Gagal menyimpan kuis.";
		} finally {
			saving = false;
		}
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/akun")}>
	<Icon name="chevron-left" size={18} /> Kembali ke akun
</button>

<header class="page-heading page-heading-practice">
	<h1>
		<Icon name="school" size={18} class="shrink-0" /> Kuis buatan guru
	</h1>
	<p class="text-sm text-[#5f6b62]">Rakit kuis dari bank soal untuk kelasmu, lalu lihat siapa saja yang sudah mengerjakan.</p>
</header>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else}
	{#if classes.length === 0}
		<div class="card mt-4 p-4">
			<p class="flex items-center gap-1.5 text-sm font-semibold"><Icon name="info" size={16} /> Kamu belum punya kelas</p>
			<p class="mt-1 text-sm text-[#5f6b62]">Buat kelas dulu di halaman Akun (butuh produk yang sudah lunas), lalu kembali ke sini untuk merakit kuis.</p>
			<button type="button" class="btn btn-primary mt-3" onclick={() => goto("/akun")}>
				<Icon name="users" size={16} /> Ke halaman akun
			</button>
		</div>
	{:else}
		<!-- Buat kuis baru -->
		<div class="card mt-4 p-4">
			<h2 class="flex items-center gap-1.5 text-sm font-semibold text-[#177245]"><Icon name="plus" size={16} /> Buat kuis baru</h2>

			<label class="mt-3 block text-xs font-medium text-[#5f6b62]" for="kelas">Kelas</label>
			<select id="kelas" class="input mt-1" bind:value={classId} onchange={muatBank}>
				<option value="">— Pilih kelas —</option>
				{#each classes as c (c.id)}
					<option value={c.id}>{c.name} ({c.product_title}) — {c.member_count} siswa</option>
				{/each}
			</select>

			{#if selectedClass}
				<label class="mt-3 block text-xs font-medium text-[#5f6b62]" for="judul">Judul kuis</label>
				<input
					id="judul"
					class="input mt-1"
					placeholder="Contoh: Kuis Membilang sampai 10"
					maxlength="120"
					bind:value={title}
				/>
				<p class="mt-1 text-xs text-[#5f6b62]">3–120 karakter. Soal boleh dari mapel/bab mana pun dalam produk kelas ini.</p>

				{#if bankLoading}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat bank soal...</p>
				{:else if bankError}
					<p class="err mt-4">{bankError}</p>
				{:else if bank.length > 0}
					<div class="mt-4 flex flex-wrap gap-2">
						<select class="input !w-auto" bind:value={subjectFilter} aria-label="Filter mapel">
							<option value="">Semua mapel</option>
							{#each subjects as s (s)}
								<option value={s}>{s}</option>
							{/each}
						</select>
						<input
							class="input min-w-40 flex-1"
							placeholder="Cari soal..."
							bind:value={searchText}
						/>
					</div>
					<p class="mt-2 text-xs font-medium text-[#5f6b62]">
						{filteredBank.length} soal ditampilkan • {selectedIds.length} dari 30 soal dipilih
					</p>
					<div class="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1">
						{#each filteredBank as q (q.id)}
							{@const qid = Number(q.id)}
							{@const picked = selectedIds.includes(qid)}
							<label
								class="card flex cursor-pointer items-start gap-2 px-3 py-2.5 text-sm {picked
									? '!border-[#177245] bg-[#ece9dc]'
									: ''}"
							>
								<input type="checkbox" class="mt-1 shrink-0" checked={picked} onchange={() => togglePilih(qid)} />
								<span class="min-w-0">
									<span class="font-medium">{q.question}</span>
									<span class="mt-1 flex flex-wrap gap-1">
										<span class="badge badge-leaf">{typeLabel(q.type)}</span>
										<span class="tabular-nums badge badge-gray">{q.points} poin</span>
										<span class="badge badge-gray">{q.origin}</span>
									</span>
									{#if picked}
										<span class="mt-1 block text-xs font-medium text-[#177245]">Kunci: {q.answer_label || "-"}</span>
									{/if}
								</span>
							</label>
						{/each}
					</div>
					{#if saveMsg}<p class="tabular-nums ok-msg mt-3">{saveMsg}</p>{/if}
					{#if saveError}<p class="err mt-3">{saveError}</p>{/if}
					<button type="button" class="btn btn-leaf mt-3" disabled={!canSave || saving} onclick={simpanKuis}>
						{#if saving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan kuis ({selectedIds.length} soal){/if}
					</button>
				{/if}
			{/if}
		</div>
	{/if}

	<!-- Daftar kuis saya -->
	<div class="card mt-4 p-4">
		<h2 class="flex items-center gap-1.5 text-sm font-semibold text-[#177245]"><Icon name="file-text" size={16} /> Kuis buatan saya</h2>
		{#if quizzes.length === 0}
			<p class="mt-2 text-sm text-[#5f6b62]">Belum ada kuis. Rakit kuis pertamamu di atas ya.</p>
		{:else}
			<div class="mt-2 space-y-2">
				{#each quizzes as q (q.id)}
					<div class="card p-3">
						<p class="text-sm font-semibold">{q.title}</p>
						<p class="mt-0.5 text-xs text-[#5f6b62]">
							{q.class_name} • {q.subject} Kelas {q.grade} • {q.question_count} soal • {q.submissions} siswa sudah mengerjakan
						</p>
						<a href="/kuis-guru/{q.id}" class="btn btn-outline mt-2">
							<Icon name="chart" size={16} /> Lihat Rekap
						</a>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
