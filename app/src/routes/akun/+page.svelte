<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import BottomSheet from "$lib/BottomSheet.svelte";
	import BlogContent from "$lib/info/BlogContent.svelte";
	import FaqContent from "$lib/info/FaqContent.svelte";
	import UpdateContent from "$lib/info/UpdateContent.svelte";
	import PrivasiContent from "$lib/info/PrivasiContent.svelte";
	import SyaratContent from "$lib/info/SyaratContent.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		apiBlob,
		downloadBlob,
		formatTanggal,
		getToken,
		waLink,
		type Order,
		type ProductPublic,
		type PredictionData,
		type PublicQuestion,
		type TrackerData
	} from "$lib/api";
	import { auth } from "$lib/store";

	// ---- Auth form ----
	let mode = $state<"login" | "register">("login");
	let name = $state("");
	let email = $state("");
	let password = $state("");
	let whatsapp = $state("");
	let authLoading = $state(false);
	let authError = $state("");

	// ---- Profil ----
	let tracker = $state<TrackerData | null>(null);
	let trackerError = $state("");
	let waEdit = $state("");
	let waSaving = $state(false);
	let waMsg = $state("");
	let waOk = $state(false);

	// ---- Bagian yang bisa dibuka-tutup ----
	let open = $state({
		daily: false,
		stickers: false,
		skor: false,
		prediksi: false,
		laporan: false,
		ortu: false,
		kelas: false
	});

	// ---- Prediksi Nilai SAS ----
	let prediction = $state<PredictionData | null>(null);
	let predictionError = $state("");

	// ---- Bank Soal Sulitku ----
	let hardTotal = $state<number | null>(null);

	// ---- Sertifikat simulasi ----
	let certDownloading = $state<number | null>(null);
	let certError = $state("");
	let simScores = $derived((tracker?.scores ?? []).filter((s) => s.kind === "simulation"));

	/** Lulus = skor/max_score >= 70%. */
	function simLulus(s: { score: number; max_score: number }): boolean {
		return s.max_score > 0 && s.score / s.max_score >= 0.7;
	}

	async function unduhSertifikat(attemptId: number) {
		if (certDownloading !== null) return;
		certDownloading = attemptId;
		certError = "";
		try {
			const { blob } = await apiBlob(`/api/certificate/${attemptId}`);
			downloadBlob(blob, `sertifikat-${attemptId}.pdf`);
		} catch (e) {
			certError = e instanceof Error ? e.message : "Gagal mengunduh sertifikat.";
		} finally {
			certDownloading = null;
		}
	}

	// ---- Bottom sheet Bantuan & Info ----
	type SheetKind = "blog" | "faq" | "update" | "privasi" | "syarat";
	let sheet = $state<SheetKind | null>(null);
	let sheetTitle = $derived(
		sheet === "blog"
			? "Blog"
			: sheet === "faq"
				? "FAQ"
				: sheet === "update"
					? "Update"
					: sheet === "privasi"
						? "Kebijakan Privasi"
						: sheet === "syarat"
							? "Syarat & Ketentuan"
							: ""
	);

	// ---- Latihan Harian ----
	let dailyDate = $state("");
	let dailyQs = $state<PublicQuestion[]>([]);
	let dailyLoading = $state(false);
	let dailyError = $state("");
	let dailyAnswers = $state<Record<string, unknown>>({});
	let dailyResult = $state<{
		score: number;
		max_score: number;
		review: { questionId: number | string; correct: boolean; discussion: string }[];
	} | null>(null);
	let dailySubmitting = $state(false);

	// ---- Mode Orang Tua ----
	let parentCode = $state("");
	let parentCodeMsg = $state("");
	let redeemCode = $state("");
	let redeemMsg = $state("");
	let redeemOk = $state(false);
	let children = $state<
		{
			id: string;
			name: string;
			email: string;
			sas_locked: boolean;
			daily_target: number;
			streak: number;
			done_chapters: number;
			scores: unknown[];
		}[]
	>([]);
	let childrenError = $state("");
	let childrenLoading = $state(false);

	// ---- Paket Guru / Kelas ----
	let myProducts = $state<ProductPublic[]>([]);
	let classProductId = $state("");
	let className = $state("");
	let classMsg = $state("");
	let classOk = $state(false);
	let joinCode = $state("");
	let joinMsg = $state("");
	let joinOk = $state(false);
	let classDetail = $state<{
		class: { id: string; code: string; name: string };
		members: { id: string; name: string; done_chapters: number; scores: unknown[] }[];
	} | null>(null);
	let classDetailLoading = $state(false);

	let loggedIn = $derived(Boolean($auth.user));
	let isAdmin = $derived($auth.user?.role === "admin");

	onMount(async () => {
		if (!getToken()) return;
		try {
			const { user } = await api<{ user: { id: string; name: string; email: string; whatsapp: string | null; role: string; created_at: string } }>("/api/auth/me");
			auth.setUser(user);
			waEdit = user.whatsapp ?? "";
			await loadTracker();
			await loadPrediction();
			await loadHardBank();
		} catch {
			/* belum login — api() sudah menghapus token */
		}
	});

	async function loadHardBank() {
		try {
			const data = await api<{ total: number }>("/api/hard-bank");
			hardTotal = data.total ?? 0;
		} catch {
			hardTotal = null;
		}
	}

	async function loadTracker() {
		try {
			tracker = await api<TrackerData>("/api/tracker");
		} catch (e) {
			trackerError = e instanceof Error ? e.message : "Gagal memuat progres belajar.";
		}
	}

	async function loadPrediction() {
		try {
			prediction = await api<PredictionData>("/api/prediction");
		} catch (e) {
			predictionError = e instanceof Error ? e.message : "Gagal memuat prediksi nilai SAS.";
		}
	}

	async function submitAuth() {
		authLoading = true;
		authError = "";
		try {
			if (mode === "register") {
				const data = await api<{ user: Parameters<typeof auth.login>[0]; token: string }>(
					"/api/auth/register",
					{
						method: "POST",
						body: JSON.stringify({
							name: name.trim(),
							email: email.trim(),
							password,
							whatsapp: whatsapp.trim() || undefined
						})
					}
				);
				auth.login(data.user, data.token);
			} else {
				const data = await api<{ user: Parameters<typeof auth.login>[0]; token: string }>(
					"/api/auth/login",
					{
						method: "POST",
						body: JSON.stringify({ email: email.trim(), password })
					}
				);
				auth.login(data.user, data.token);
			}
			waEdit = $auth.user?.whatsapp ?? "";
			await loadTracker();
		} catch (e) {
			authError = e instanceof Error ? e.message : "Gagal masuk. Coba lagi ya.";
		} finally {
			authLoading = false;
		}
	}

	async function keluar() {
		try {
			await api("/api/auth/logout", { method: "POST" });
		} catch {
			/* abaikan — logout lokal tetap jalan */
		}
		auth.logout();
		goto("/");
	}

	async function simpanWa() {
		waSaving = true;
		waMsg = "";
		try {
			const data = await api<{ user: Parameters<typeof auth.login>[0] }>(
				"/api/account/whatsapp",
				{ method: "POST", body: JSON.stringify({ whatsapp: waEdit.trim() }) }
			);
			auth.setUser(data.user);
			waMsg = "Nomor WhatsApp tersimpan.";
			waOk = true;;
		} catch (e) {
			waMsg = e instanceof Error ? e.message : "Gagal menyimpan nomor.";
			waOk = false;
		} finally {
			waSaving = false;
		}
	}

	// ---- Latihan Harian ----
	async function toggleDaily() {
		open.daily = !open.daily;
		if (open.daily && dailyQs.length === 0) {
			dailyLoading = true;
			dailyError = "";
			try {
				const data = await api<{ date: string; questions: PublicQuestion[] }>("/api/daily");
				dailyDate = data.date;
				dailyQs = data.questions ?? [];
			} catch (e) {
				dailyError = e instanceof Error ? e.message : "Gagal memuat latihan harian.";
			} finally {
				dailyLoading = false;
			}
		}
	}

	async function submitDaily() {
		if (dailyQs.length === 0 || dailySubmitting) return;
		dailySubmitting = true;
		try {
			const data = await api<{
				score: number;
				max_score: number;
				review: { questionId: number | string; correct: boolean; discussion: string }[];
			}>("/api/quiz/submit", {
				method: "POST",
				body: JSON.stringify({ kind: "daily", ref_id: dailyDate, answers: dailyAnswers })
			});
			dailyResult = data;
			await loadTracker();
		} catch (e) {
			dailyError = e instanceof Error ? e.message : "Gagal mengirim jawaban.";
		} finally {
			dailySubmitting = false;
		}
	}

	function dailyQText(qid: number | string): string {
		return dailyQs.find((q) => String(q.id) === String(qid))?.question ?? "";
	}

	// ---- Laporan Mingguan ----
	let laporan = $derived.by(() => {
		if (!tracker) return null;
		const now = new Date();
		const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
		const days = tracker.studyDays.filter((d) => new Date(d) >= weekAgo).length;
		const done = tracker.doneChapters.filter((c) => new Date(c.done_at) >= weekAgo).length;
		const weekScores = tracker.scores.filter((s) => new Date(s.created_at) >= weekAgo);
		const avg =
			weekScores.length > 0
				? Math.round(
						(weekScores.reduce((a, s) => a + (s.max_score ? s.score / s.max_score : 0), 0) /
							weekScores.length) *
							100
					)
				: null;
		return { days, done, avg, totalScores: weekScores.length };
	});

	function laporanText(): string {
		if (!laporan || !$auth.user) return "";
		return (
			`Laporan Mingguan Belajar — ${$auth.user.name}\n` +
			`Minggu ini: belajar ${laporan.days} hari, menyelesaikan ${laporan.done} bab, ` +
			`${laporan.totalScores} kuis/simulasi dikerjakan` +
			(laporan.avg !== null ? `, rata-rata nilai ${laporan.avg}%.` : `.`) +
			`\nStreak belajar: ${tracker?.streak ?? 0} hari. Semangat terus ya!`
		);
	}

	// ---- Mode Orang Tua ----
	async function toggleOrtu() {
		open.ortu = !open.ortu;
		if (open.ortu) await loadChildren();
	}

	async function loadChildren() {
		childrenLoading = true;
		childrenError = "";
		try {
			const data = await api<{ children: typeof children }>("/api/parent/children");
			children = data.children ?? [];
		} catch (e) {
			childrenError = e instanceof Error ? e.message : "Gagal memuat daftar anak.";
		} finally {
			childrenLoading = false;
		}
	}

	async function buatKode() {
		parentCodeMsg = "";
		try {
			const data = await api<{ code: string }>("/api/parent/link", { method: "POST" });
			parentCode = data.code;
			parentCodeMsg = "Bagikan kode ini ke anakmu — anak menebus sendiri dari akunnya.";
		} catch (e) {
			parentCodeMsg = e instanceof Error ? e.message : "Gagal membuat kode.";
		}
	}

	async function tebusKode() {
		redeemMsg = "";
		try {
			await api("/api/parent/redeem", {
				method: "POST",
				body: JSON.stringify({ code: redeemCode.trim() })
			});
			redeemMsg = "Kode berhasil ditebus. Akun ini sekarang terhubung sebagai anak.";
			redeemOk = true;
			redeemCode = "";
		} catch (e) {
			redeemMsg = e instanceof Error ? e.message : "Gagal menebus kode.";
			redeemOk = false;
		}
	}

	async function setLock(childId: string, locked: boolean) {
		try {
			await api("/api/parent/lock", {
				method: "POST",
				body: JSON.stringify({ child_id: childId, sas_locked: locked })
			});
			children = children.map((c) => (c.id === childId ? { ...c, sas_locked: locked } : c));
		} catch (e) {
			childrenError = e instanceof Error ? e.message : "Gagal mengubah kunci simulasi.";
		}
	}

	async function setTarget(childId: string, target: number) {
		try {
			await api("/api/parent/target", {
				method: "POST",
				body: JSON.stringify({ child_id: childId, daily_target: target })
			});
			children = children.map((c) => (c.id === childId ? { ...c, daily_target: target } : c));
		} catch (e) {
			childrenError = e instanceof Error ? e.message : "Gagal mengubah target harian.";
		}
	}

	// ---- Paket Guru / Kelas ----
	async function toggleKelas() {
		open.kelas = !open.kelas;
		if (open.kelas && myProducts.length === 0) {
			try {
				const [ordersData, catalogData] = await Promise.all([
					api<{ orders: Order[] }>("/api/orders"),
					api<{ products: ProductPublic[] }>("/api/catalog")
				]);
				const ownedIds = new Set<string>();
				for (const o of ordersData.orders ?? []) {
					if (o.status === "PAID") for (const it of o.items) ownedIds.add(it.product_id);
				}
				myProducts = (catalogData.products ?? []).filter((p) => ownedIds.has(p.id));
				if (myProducts.length > 0) classProductId = myProducts[0].id;
			} catch {
				/* daftar produk kosong — pesan tampil di form */
			}
		}
	}

	async function buatKelas() {
		classMsg = "";
		try {
			const data = await api<{ class: { id: string; code: string; name: string } }>("/api/class", {
				method: "POST",
				body: JSON.stringify({ product_id: classProductId, name: className.trim() })
			});
			classMsg = `Kelas "${data.class.name}" dibuat! Kode kelas: ${data.class.code} — bagikan ke siswa.`;
			classOk = true;
			className = "";
			await bukaKelas(data.class.id);
		} catch (e) {
			classMsg = e instanceof Error ? e.message : "Gagal membuat kelas.";
			classOk = false;
		}
	}

	async function gabungKelas() {
		joinMsg = "";
		try {
			const data = await api<{ class: { id: string; code: string; name: string } }>(
				"/api/class/join",
				{ method: "POST", body: JSON.stringify({ code: joinCode.trim() }) }
			);
			joinMsg = `Berhasil bergabung dengan kelas "${data.class.name}".`;
			joinOk = true;
			joinCode = "";
			await bukaKelas(data.class.id);
		} catch (e) {
			joinMsg = e instanceof Error ? e.message : "Gagal bergabung ke kelas.";
			joinOk = false;
		}
	}

	async function bukaKelas(id: string) {
		classDetailLoading = true;
		try {
			classDetail = await api<{
				class: { id: string; code: string; name: string };
				members: { id: string; name: string; done_chapters: number; scores: unknown[] }[];
			}>(`/api/class/${id}`);
		} catch (e) {
			classMsg = e instanceof Error ? e.message : "Gagal memuat kelas.";
		} finally {
			classDetailLoading = false;
		}
	}

	async function unduhRekap(classId: string) {
		try {
			const { blob, filename } = await apiBlob(`/api/class/${classId}/recap`);
			downloadBlob(blob, filename || `rekap-kelas-${classId}.csv`);
		} catch (e) {
			classMsg = e instanceof Error ? e.message : "Gagal mengunduh rekap.";
		}
	}
</script>

<!-- Desktop: dua kolom — akun kiri, Bantuan & Info sticky kanan -->
<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
	<div class="min-w-0">
{#if !loggedIn}
	<h1 class="flex items-center gap-2 text-xl font-extrabold"><Icon name="user" size={22} /> Akun</h1>
	<p class="text-sm text-[#5f6b62]">Masuk untuk menyimpan progres belajarmu.</p>

	<div class="mt-4 flex gap-2">
		<button type="button" class="chip flex-1 justify-center" class:active={mode === "login"} onclick={() => (mode = "login")}>
			Masuk
		</button>
		<button type="button" class="chip flex-1 justify-center" class:active={mode === "register"} onclick={() => (mode = "register")}>
			Daftar
		</button>
	</div>

	<form
		class="card mt-3 space-y-3 p-4 lg:max-w-xl"
		onsubmit={(e) => {
			e.preventDefault();
			submitAuth();
		}}
	>
		{#if mode === "register"}
			<div>
				<label class="lbl" for="reg-nama">Nama</label>
				<input id="reg-nama" class="input" bind:value={name} placeholder="Nama kamu" required />
			</div>
		{/if}
		<div>
			<label class="lbl" for="auth-email">Email</label>
			<input
				id="auth-email"
				class="input"
				type="email"
				bind:value={email}
				placeholder="kamu@contoh.id"
				required
			/>
		</div>
		<div>
			<label class="lbl" for="auth-pass">Password</label>
			<input
				id="auth-pass"
				class="input"
				type="password"
				bind:value={password}
				placeholder={mode === "register" ? "Minimal 6 karakter" : "Password kamu"}
				minlength={mode === "register" ? 6 : undefined}
				required
			/>
		</div>
		{#if mode === "register"}
			<div>
				<label class="lbl" for="reg-wa">Nomor WhatsApp (opsional)</label>
				<input
					id="reg-wa"
					class="input"
					type="tel"
					bind:value={whatsapp}
					placeholder="08xxxxxxxxxx"
				/>
			</div>
		{/if}
		{#if authError}
			<p class="err">{authError}</p>
		{/if}
		<button type="submit" class="btn btn-primary btn-block" disabled={authLoading}>
			{#if authLoading}Memproses...{:else if mode === "register"}<Icon name="sparkles" size={16} /> Daftar Sekarang{:else}<Icon name="rocket" size={16} /> Masuk{/if}
		</button>
	</form>
{:else}
	<!-- Profil -->
	<div class="card flex items-center gap-3 p-4">
		<span class="flex h-12 w-12 items-center justify-center rounded-full bg-[#177245] text-white"><Icon name="user" size={24} /></span>
		<div class="min-w-0 flex-1">
			<p class="truncate font-extrabold">{$auth.user?.name}</p>
			<p class="truncate text-sm text-[#5f6b62]">{$auth.user?.email}</p>
			<p class="text-xs font-bold text-[#177245]">
				{#if isAdmin}<span class="inline-flex items-center gap-1"><Icon name="crown" size={14} /> Admin</span>{:else}<span class="inline-flex items-center gap-1"><Icon name="backpack" size={14} /> Pelanggan</span>{/if}
				{#if tracker}• <Icon name="flame" size={14} class="inline-block align-[-2px]" /> Streak {tracker.streak} hari{/if}
			</p>
		</div>
	</div>

	{#if trackerError}
		<p class="err mt-3">{trackerError}</p>
	{/if}

	<!-- Edit WA -->
	<div class="card mt-3 p-4">
		<label class="lbl" for="wa-edit">Nomor WhatsApp</label>
		<div class="flex gap-2">
			<input id="wa-edit" class="input" type="tel" bind:value={waEdit} placeholder="08xxxxxxxxxx" />
			<button type="button" class="btn btn-primary shrink-0" disabled={waSaving} onclick={simpanWa}>
				{waSaving ? "..." : "Simpan"}
			</button>
		</div>
		{#if waMsg}
			<p class="mt-2 text-sm {waOk ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{waMsg}</p>
		{/if}
	</div>

	<!-- Menu -->
	<div class="mt-4 space-y-3">
		<!-- Latihan Harian -->
		<div class="card overflow-hidden">
			<button type="button" class="flex w-full items-center gap-3 p-4 text-left" onclick={toggleDaily}>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="alarm-clock" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-extrabold">Latihan Harian 5 Menit</span>
					<span class="text-xs text-[#5f6b62]">5 soal cepat setiap hari, jaga streak belajarmu</span>
				</span>
				<span><Icon name={open.daily ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.daily}
				<div class="border-t border-[#e7e2d2] p-4">
					{#if dailyLoading}
						<p class="text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
					{:else if dailyError}
						<p class="err">{dailyError}</p>
					{:else if dailyQs.length === 0}
						<p class="text-sm text-[#5f6b62]">Belum ada soal hari ini.</p>
					{:else if !dailyResult}
						<p class="text-sm font-bold">Latihan {dailyDate} — jawab semua soal ya!</p>
						<div class="mt-3 space-y-4">
							{#each dailyQs as q, i (q.id)}
								<div>
									<p class="text-sm font-bold">{i + 1}. {q.question}</p>
									{#if q.type === "pg" && Array.isArray(q.options)}
										<div class="mt-2 space-y-1.5">
											{#each q.options as opt (opt)}
												<label class="card flex cursor-pointer items-center gap-2 !rounded-lg px-3 py-2 text-sm">
													<input
														type="radio"
														name={`daily-${q.id}`}
														value={opt}
														checked={dailyAnswers[String(q.id)] === opt}
														onchange={() => (dailyAnswers = { ...dailyAnswers, [String(q.id)]: opt })}
													/>
													{opt}
												</label>
											{/each}
										</div>
									{:else if q.type === "bs"}
										<div class="mt-2 flex gap-2">
											{#each ["Benar", "Salah"] as opt (opt)}
												<button
													type="button"
													class="chip flex-1 justify-center"
													class:active={dailyAnswers[String(q.id)] === opt}
													onclick={() => (dailyAnswers = { ...dailyAnswers, [String(q.id)]: opt })}
												>
													{opt}
												</button>
											{/each}
										</div>
									{:else}
										<input
											class="input mt-2"
											placeholder="Tulis jawabanmu..."
											value={(dailyAnswers[String(q.id)] as string) ?? ""}
											oninput={(e) => {
												const t = e.currentTarget.value;
												dailyAnswers = { ...dailyAnswers, [String(q.id)]: t };
											}}
										/>
									{/if}
								</div>
							{/each}
						</div>
						<button
							type="button"
							class="btn btn-primary btn-block mt-4"
							disabled={dailySubmitting}
							onclick={submitDaily}
						>
							{#if dailySubmitting}Memeriksa...{:else}<Icon name="check" size={16} /> Kirim Jawaban{/if}
						</button>
					{:else}
						<p class="text-center text-lg font-extrabold">
							Skor: {dailyResult.score} / {dailyResult.max_score} <Icon name="party-popper" size={18} class="inline-block align-[-2px]" />
						</p>
						<div class="mt-3 space-y-2">
							{#each dailyResult.review as r (r.questionId)}
								<div class="card !rounded-lg p-3 text-sm">
									<p class="font-bold">
										{#if r.correct}<Icon name="check-circle" size={15} class="inline-block align-[-2px] text-[#065f46]" /> Benar{:else}<Icon name="x-circle" size={15} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat{/if} — {dailyQText(r.questionId)}
									</p>
									<p class="mt-1 text-[#3f4a42]">{r.discussion}</p>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Peta Belajar -->
		<div class="card p-4">
			<div class="flex items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="map" size={22} /></span>
				<div class="min-w-0 flex-1">
					<p class="font-extrabold">Peta Belajar</p>
					<p class="text-xs text-[#5f6b62]">Jalur bab per kelas — node terbuka saat bab selesai.</p>
				</div>
			</div>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each [1, 2, 3, 4, 5, 6] as g (g)}
					<a href="/peta-belajar/k{g}" class="chip">Kelas {g}</a>
				{/each}
			</div>
		</div>

		<!-- Soal Sulitku -->
		<div class="card p-4">
			<div class="flex items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="target" size={22} /></span>
				<div class="min-w-0 flex-1">
					<p class="font-extrabold">Soal Sulitku</p>
					<p class="text-xs text-[#5f6b62]">
						{hardTotal === null
							? "Soal yang pernah dijawab salah — ulangi sampai benar."
							: hardTotal === 0
								? "Belum ada soal sulit. Terus kerjakan kuis dan simulasi!"
								: `${hardTotal} soal menunggu diulang sampai benar.`}
					</p>
				</div>
				<a href="/soal-sulitku" class="btn btn-leaf shrink-0 !px-3 !py-2 text-xs">
					<Icon name="target" size={14} /> Buka Bank
				</a>
			</div>
		</div>

		<!-- Stiker & Lencana -->
		<div class="card overflow-hidden">
			<button
				type="button"
				class="flex w-full items-center gap-3 p-4 text-left"
				onclick={() => (open.stickers = !open.stickers)}
			>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="trophy" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-extrabold">Stiker & Lencana</span>
					<span class="text-xs text-[#5f6b62]">
						{tracker ? `${tracker.stickers.length} stiker • ${tracker.badges.length} lencana` : "Lihat koleksimu"}
					</span>
				</span>
				<span><Icon name={open.stickers ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.stickers && tracker}
				<div class="border-t border-[#e7e2d2] p-4">
					<p class="text-sm font-bold">Lencana</p>
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#if tracker.badges.length === 0}
							<p class="text-sm text-[#5f6b62]">Belum ada lencana. Selesaikan satu bab untuk mulai!</p>
						{:else}
							{#each tracker.badges as b (b)}
								<span class="badge badge-sun"><Icon name="award" size={13} /> {b}</span>
							{/each}
						{/if}
					</div>
					<p class="mt-4 text-sm font-bold">Stiker ({tracker.stickers.length})</p>
					<p class="mt-1 text-sm text-[#5f6b62]">
						{tracker.stickers.length === 0
							? "Belum ada stiker. Tandai bab selesai untuk dapat stiker!"
							: "Kumpulkan 7 stiker untuk lencana Kolektor 7!"}
					</p>
				</div>
			{/if}
		</div>

		<!-- Skor Simulasi & Sertifikat -->
		<div class="card overflow-hidden">
			<button
				type="button"
				class="flex w-full items-center gap-3 p-4 text-left"
				onclick={() => (open.skor = !open.skor)}
			>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="award" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-extrabold">Skor Simulasi & Sertifikat</span>
					<span class="text-xs text-[#5f6b62]">
						{tracker ? `${simScores.length} simulasi dikerjakan` : "Unduh sertifikat untuk simulasi yang lulus"}
					</span>
				</span>
				<span><Icon name={open.skor ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.skor}
				<div class="border-t border-[#e7e2d2] p-4">
					{#if !tracker}
						<p class="text-sm text-[#5f6b62]">Memuat skor...</p>
					{:else if simScores.length === 0}
						<p class="text-sm text-[#5f6b62]">
							Belum ada skor simulasi. Kerjakan simulasi SAS dari Ruang Belajar ya!
						</p>
					{:else}
						<p class="text-xs text-[#5f6b62]">
							Simulasi dengan nilai 70% ke atas bisa diunduh sertifikatnya.
						</p>
						<div class="mt-2 space-y-2">
							{#each simScores as s (s.id)}
								<div class="card !rounded-lg flex items-center gap-3 p-3">
									<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#177245]"><Icon name="trophy" size={17} /></span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-bold">{s.ref_id}</p>
										<p class="text-xs text-[#5f6b62]">
											Skor {s.score} / {s.max_score} • {formatTanggal(s.created_at)}
										</p>
									</div>
									{#if simLulus(s)}
										<button
											type="button"
											class="btn btn-sun shrink-0 !px-2.5 !py-1.5 text-xs"
											disabled={certDownloading === s.id}
											onclick={() => unduhSertifikat(s.id)}
										>
											{#if certDownloading === s.id}Mengunduh...{:else}<Icon name="award" size={14} /> Sertifikat{/if}
										</button>
									{/if}
								</div>
							{/each}
						</div>
						{#if certError}
							<p class="err mt-2">{certError}</p>
						{/if}
					{/if}
				</div>
			{/if}
		</div>

		<!-- Prediksi Nilai SAS -->
		<div class="card overflow-hidden">
			<button
				type="button"
				class="flex w-full items-center gap-3 p-4 text-left"
				onclick={() => (open.prediksi = !open.prediksi)}
			>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="target" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-extrabold">Prediksi Nilai SAS</span>
					<span class="text-xs text-[#5f6b62]">
						{prediction?.hasData
							? `Perkiraan keseluruhan: ${prediction.overall}% dari ${prediction.totalSimulations} simulasi`
							: "Perkiraan nilai SAS dari nilai simulasimu"}
					</span>
				</span>
				<span><Icon name={open.prediksi ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.prediksi}
				<div class="border-t border-[#e7e2d2] p-4">
					{#if predictionError}
						<p class="err">{predictionError}</p>
					{:else if !prediction}
						<p class="text-sm text-[#5f6b62]">Memuat prediksi...</p>
					{:else if !prediction.hasData}
						<p class="text-sm text-[#5f6b62]">
							Belum ada simulasi yang dikerjakan. Kerjakan satu simulasi SAS dulu, lalu prediksimu muncul di sini.
						</p>
						<a href="/katalog" class="btn btn-primary btn-block mt-3">
							<Icon name="rocket" size={16} /> Cari Simulasi SAS
						</a>
					{:else}
						<div class="flex items-center gap-3">
							<span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#177245] text-xl font-extrabold text-white">
								{prediction.overall}%
							</span>
							<div class="min-w-0">
								<p class="text-sm font-extrabold">Perkiraan nilai SAS keseluruhan</p>
								<p class="text-xs text-[#5f6b62]">
									Dari {prediction.totalSimulations} simulasi — simulasi terbaru paling menentukan.
								</p>
							</div>
						</div>
						<div class="mt-3 space-y-2">
							{#each prediction.subjects as s (`${s.subject}-${s.grade}`)}
								<div class="card !rounded-lg p-3">
									<div class="flex items-baseline justify-between gap-2">
										<p class="text-sm font-bold">{s.subject} • Kelas {s.grade}</p>
										<p class="text-sm font-extrabold text-[#177245]">{s.prediction}%</p>
									</div>
									<div class="mt-1.5 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
										<div
											class="h-full bg-[#177245] transition-all"
											style="width: {Math.max(0, Math.min(100, s.prediction))}%"
										></div>
									</div>
									<p class="mt-1 text-xs text-[#5f6b62]">
										{s.attempts} simulasi • terakhir {s.latest_percent}% ({formatTanggal(s.latest_at)})
									</p>
								</div>
							{/each}
						</div>
						{#if prediction.weakChapters.length > 0}
							<p class="mt-4 text-sm font-bold">Bab yang perlu diulang</p>
							<div class="mt-2 space-y-2">
								{#each prediction.weakChapters as w (w.chapter_id)}
									<a
										href={`/belajar/${w.product_id}/${w.chapter_id}`}
										class="card !rounded-lg flex items-center gap-3 p-3"
									>
										<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#177245]"><Icon name="book-open" size={17} /></span>
										<span class="min-w-0 flex-1">
											<span class="block truncate text-sm font-bold">{w.title}</span>
											<span class="block text-xs text-[#5f6b62]">{w.reason}</span>
										</span>
										<Icon name="chevron-right" size={16} class="shrink-0 text-[#9aa096]" />
									</a>
								{/each}
							</div>
						{/if}
						<p class="mt-3 flex items-start gap-1.5 text-[11px] text-[#5f6b62]">
							<Icon name="info" size={13} class="mt-0.5 shrink-0" />
							<span>Perkiraan, bukan nilai resmi — nilai SAS sebenarnya ditentukan oleh sekolah.</span>
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Laporan Mingguan -->
		<div class="card overflow-hidden">
			<button
				type="button"
				class="flex w-full items-center gap-3 p-4 text-left"
				onclick={() => (open.laporan = !open.laporan)}
			>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="chart" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-extrabold">Laporan Mingguan Orang Tua</span>
					<span class="text-xs text-[#5f6b62]">Ringkasan belajar 7 hari terakhir, bisa dibagikan</span>
				</span>
				<span><Icon name={open.laporan ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.laporan}
				<div class="border-t border-[#e7e2d2] p-4">
					{#if laporan}
						<div class="grid grid-cols-3 gap-2 text-center">
							<div class="card !rounded-lg p-2">
								<p class="text-lg font-extrabold text-[#177245]">{laporan.days}</p>
								<p class="text-[11px] font-bold text-[#5f6b62]">hari belajar</p>
							</div>
							<div class="card !rounded-lg p-2">
								<p class="text-lg font-extrabold text-[#177245]">{laporan.done}</p>
								<p class="text-[11px] font-bold text-[#5f6b62]">bab selesai</p>
							</div>
							<div class="card !rounded-lg p-2">
								<p class="text-lg font-extrabold text-[#177245]">
									{laporan.avg === null ? "—" : `${laporan.avg}%`}
								</p>
								<p class="text-[11px] font-bold text-[#5f6b62]">nilai rata-rata</p>
							</div>
						</div>
						<a
							href={waLink($auth.user?.whatsapp, laporanText())}
							target="_blank"
							rel="noopener noreferrer"
							class="btn btn-leaf btn-block mt-3"
						>
							<Icon name="message" size={16} /> Bagikan via WhatsApp
						</a>
						<p class="mt-2 text-[11px] text-[#5f6b62]">
							Membuka WhatsApp dengan laporan siap kirim — bukan pengiriman otomatis dari server.
						</p>
					{:else}
						<p class="text-sm text-[#5f6b62]">Memuat laporan...</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Mode Orang Tua -->
		<div class="card overflow-hidden">
			<button type="button" class="flex w-full items-center gap-3 p-4 text-left" onclick={toggleOrtu}>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="users" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-extrabold">Mode Orang Tua</span>
					<span class="text-xs text-[#5f6b62]">Hubungkan akun anak, kunci simulasi, atur target harian</span>
				</span>
				<span><Icon name={open.ortu ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.ortu}
				<div class="border-t border-[#e7e2d2] space-y-4 p-4">
					<div>
						<p class="text-sm font-bold">Kode untuk anakmu</p>
						<p class="text-xs text-[#5f6b62]">Anak menebus kode ini dari akunnya sendiri.</p>
						<div class="mt-2 flex gap-2">
							<button type="button" class="btn btn-outline" onclick={buatKode}>Buat Kode</button>
							{#if parentCode}
								<span class="flex items-center rounded-lg bg-[#fbeecd] px-3 font-extrabold tracking-widest">
									{parentCode}
								</span>
							{/if}
						</div>
						{#if parentCodeMsg}
							<p class="mt-1 text-xs text-[#5f6b62]">{parentCodeMsg}</p>
						{/if}
					</div>
					<div>
						<label class="lbl" for="redeem">Tebus kode (bila akun ini adalah anak)</label>
						<div class="flex gap-2">
							<input id="redeem" class="input" bind:value={redeemCode} placeholder="Kode 6 karakter" maxlength="6" />
							<button type="button" class="btn btn-primary shrink-0" onclick={tebusKode}>Tebus</button>
						</div>
						{#if redeemMsg}
							<p class="mt-1 text-xs {redeemOk ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{redeemMsg}</p>
						{/if}
					</div>
					<div>
						<p class="text-sm font-bold">Anak terhubung</p>
						{#if childrenLoading}
							<p class="mt-1 text-sm text-[#5f6b62]">Memuat...</p>
						{:else if childrenError}
							<p class="err mt-1">{childrenError}</p>
						{:else if children.length === 0}
							<p class="mt-1 text-sm text-[#5f6b62]">Belum ada anak terhubung.</p>
						{:else}
							<div class="mt-2 space-y-2">
								{#each children as c (c.id)}
									<div class="card !rounded-lg p-3">
										<p class="text-sm font-extrabold">{c.name}</p>
										<p class="text-xs text-[#5f6b62]">
											{c.email} • <Icon name="flame" size={13} class="inline-block align-[-2px]" /> {c.streak} hari • {c.done_chapters} bab selesai
										</p>
										<div class="mt-2 flex flex-wrap items-center gap-2">
											<button
												type="button"
												class="btn {c.sas_locked ? 'btn-sun' : 'btn-ghost'} !px-2.5 !py-1.5 text-xs"
												onclick={() => setLock(c.id, !c.sas_locked)}
											>
												{#if c.sas_locked}<Icon name="lock" size={14} /> Simulasi terkunci{:else}<Icon name="unlock" size={14} /> Simulasi terbuka{/if}
											</button>
											<label class="flex items-center gap-1 text-xs font-bold">
												Target/hari
												<input
													class="input !w-16 !px-2 !py-1"
													type="number"
													min="0"
													max="10"
													value={c.daily_target}
													onchange={(e) => setTarget(c.id, Number(e.currentTarget.value))}
												/>
											</label>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Paket Guru / Kelas -->
		<div class="card overflow-hidden">
			<button type="button" class="flex w-full items-center gap-3 p-4 text-left" onclick={toggleKelas}>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"><Icon name="school" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-extrabold">Paket Guru / Kelas</span>
					<span class="text-xs text-[#5f6b62]">Buat kelas dari produk yang kamu miliki, pantau siswa</span>
				</span>
				<span><Icon name={open.kelas ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.kelas}
				<div class="border-t border-[#e7e2d2] space-y-4 p-4">
					<div>
						<p class="text-sm font-bold">Buat kelas baru</p>
						{#if myProducts.length === 0}
							<p class="mt-1 text-sm text-[#5f6b62]">
								Kamu belum punya produk berbayar. Beli produk dulu untuk membuat kelas.
							</p>
						{:else}
							<label class="lbl mt-2" for="kelas-produk">Produk kelas</label>
							<select id="kelas-produk" class="input" bind:value={classProductId}>
								{#each myProducts as p (p.id)}
									<option value={p.id}>{p.title}</option>
								{/each}
							</select>
							<label class="lbl mt-2" for="kelas-nama">Nama kelas</label>
							<input id="kelas-nama" class="input" bind:value={className} placeholder="Contoh: Kelas 1A" />
							<button type="button" class="btn btn-primary mt-2" onclick={buatKelas}>Buat Kelas</button>
						{/if}
						{#if classMsg}
							<p class="mt-2 text-sm {classOk ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{classMsg}</p>
						{/if}
					</div>
					<div>
						<label class="lbl" for="join">Gabung ke kelas (sebagai siswa)</label>
						<div class="flex gap-2">
							<input id="join" class="input" bind:value={joinCode} placeholder="Kode kelas" />
							<button type="button" class="btn btn-outline shrink-0" onclick={gabungKelas}>Gabung</button>
						</div>
						{#if joinMsg}
							<p class="mt-1 text-xs {joinOk ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{joinMsg}</p>
						{/if}
					</div>
					{#if classDetailLoading}
						<p class="text-sm text-[#5f6b62]">Memuat kelas...</p>
					{:else if classDetail}
						<div>
							<p class="text-sm font-extrabold">
								<Icon name="school" size={16} class="inline-block align-[-2px]" /> {classDetail.class.name} <span class="text-[#5f6b62]">(kode: {classDetail.class.code})</span>
							</p>
							<div class="mt-2 space-y-1.5">
								{#each classDetail.members as m (m.id)}
									<div class="card !rounded-lg flex justify-between p-2.5 text-sm">
										<span class="font-bold">{m.name}</span>
										<span class="text-[#5f6b62]">{m.done_chapters} bab selesai</span>
									</div>
								{/each}
								{#if classDetail.members.length === 0}
									<p class="text-sm text-[#5f6b62]">Belum ada siswa.</p>
								{/if}
							</div>
							<button
								type="button"
								class="btn btn-ghost mt-2 text-xs"
								onclick={() => classDetail && unduhRekap(classDetail.class.id)}
							>
								<Icon name="download" size={15} /> Unduh Rekap (CSV)
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if isAdmin}
			<a href="/admin" class="btn btn-sun btn-block"><Icon name="crown" size={16} /> Admin — Kelola Produk</a>
		{/if}
		<button type="button" class="btn btn-danger btn-block" onclick={keluar}><Icon name="logout" size={16} /> Keluar</button>
		<p class="text-center text-xs text-[#9aa096]">Terakhir diperbarui {formatTanggal($auth.user?.created_at)}</p>
	</div>
{/if}
	</div>

	<div class="lg:sticky lg:top-[72px] lg:self-start">
<!-- Bantuan & Info -->
<div class="card mt-4 p-4 lg:mt-0">
	<p class="text-sm font-extrabold">Bantuan &amp; Info</p>
	<div class="mt-2 flex flex-wrap gap-2">
		<button type="button" class="chip" onclick={() => (sheet = "blog")}>
			<Icon name="file-text" size={15} /> Blog
		</button>
		<button type="button" class="chip" onclick={() => (sheet = "faq")}>
			<Icon name="help-circle" size={15} /> FAQ
		</button>
		<button type="button" class="chip" onclick={() => (sheet = "update")}>
			<Icon name="sparkles" size={15} /> Update
		</button>
		<button type="button" class="chip" onclick={() => (sheet = "privasi")}>
			<Icon name="lock" size={15} /> Privasi
		</button>
		<button type="button" class="chip" onclick={() => (sheet = "syarat")}>
			<Icon name="scroll" size={15} /> Syarat
		</button>
	</div>
	<p class="mt-2 text-[11px] text-[#5f6b62]">
		Ketuk untuk membaca di sini, atau buka halaman penuh dari menu bawah situs.
	</p>
</div>
	</div>
</div>

<BottomSheet open={sheet !== null} title={sheetTitle} onClose={() => (sheet = null)}>
	{#if sheet === "blog"}
		<BlogContent />
	{:else if sheet === "faq"}
		<FaqContent />
	{:else if sheet === "update"}
		<UpdateContent />
	{:else if sheet === "privasi"}
		<PrivasiContent />
	{:else if sheet === "syarat"}
		<SyaratContent />
	{/if}
</BottomSheet>
