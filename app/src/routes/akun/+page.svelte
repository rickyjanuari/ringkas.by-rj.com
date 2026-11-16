<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import Avatar from "$lib/Avatar.svelte";
	import ThemeToggle from "$lib/ThemeToggle.svelte";
	import SoundToggle from "$lib/SoundToggle.svelte";
	import { getOnboardingDone } from "$lib/onboarding";
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
	import {
		loadSettings,
		saveSettings,
		type UserSettings
	} from "$lib/settings";

	// ---- Auth form ----
	let mode = $state<"login" | "register">("login");
	let name = $state("");
	let email = $state("");
	let password = $state("");
	let whatsapp = $state("");
	let authLoading = $state(false);
	let authError = $state("");

	// ---- Turnstile (anti-bot di login/daftar) ----
	// Site key diambil sekali dari GET /api/config (publik). Bila tidak
	// ada site key, atau skrip gagal dimuat, widget tidak tampil dan auth
	// jalan tanpa token — server yang memutuskan menerimanya.
	type TurnstileApi = {
		render: (
			el: HTMLElement,
			opts: {
				sitekey: string;
				callback?: (token: string) => void;
				"expired-callback"?: () => void;
				"error-callback"?: () => void;
			}
		) => string;
		reset: (widgetId?: string) => void;
		remove?: (widgetId?: string) => void;
	};
	let turnstileSiteKey = $state("");
	let turnstileToken = $state("");
	let turnstileReady = $state(false);
	let turnstileWidgetId = $state<string | null>(null);
	let turnstileEl: HTMLDivElement | null = $state(null);

	function getTurnstile(): TurnstileApi | undefined {
		return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
	}

	function loadTurnstileScript(): Promise<void> {
		return new Promise((resolve) => {
			if (getTurnstile()) {
				turnstileReady = true;
				resolve();
				return;
			}
			const src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
			const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
			let done = false;
			const finish = () => {
				if (done) return;
				done = true;
				if (getTurnstile()) turnstileReady = true;
				resolve();
			};
			if (existing) {
				existing.addEventListener("load", finish);
				existing.addEventListener("error", finish);
			} else {
				const s = document.createElement("script");
				s.src = src;
				s.async = true;
				s.defer = true;
				s.onload = finish;
				s.onerror = finish;
				document.head.appendChild(s);
			}
			// Pengaman: jangan gantung selamanya bila skrip macet.
			setTimeout(finish, 8000);
		});
	}

	function renderTurnstile() {
		const w = getTurnstile();
		if (!turnstileSiteKey || !turnstileEl || !w) return;
		try {
			if (turnstileWidgetId) w.remove?.(turnstileWidgetId);
		} catch {
			/* abaikan */
		}
		turnstileWidgetId = null;
		try {
			turnstileWidgetId = w.render(turnstileEl, {
				sitekey: turnstileSiteKey,
				callback: (token: string) => {
					turnstileToken = token;
				},
				"expired-callback": () => {
					turnstileToken = "";
				},
				"error-callback": () => {
					turnstileToken = "";
				}
			});
		} catch {
			/* widget gagal render — lanjut tanpa token */
		}
	}

	function resetTurnstile() {
		turnstileToken = "";
		if (!turnstileWidgetId) return;
		try {
			getTurnstile()?.reset(turnstileWidgetId);
		} catch {
			/* abaikan */
		}
	}

	async function initTurnstile() {
		let siteKey = "";
		try {
			const cfg = await api<{ turnstileSiteKey?: string }>("/api/config");
			siteKey = cfg.turnstileSiteKey ?? "";
		} catch {
			/* endpoint belum ada / gagal — lanjut tanpa Turnstile */
			return;
		}
		if (!siteKey) return;
		turnstileSiteKey = siteKey;
		await loadTurnstileScript();
		renderTurnstile();
	}

	// Render ulang widget bila wadahnya muncul kembali (mis. setelah logout).
	$effect(() => {
		if (turnstileReady && turnstileSiteKey && turnstileEl) renderTurnstile();
	});

	// ---- Verifikasi dua langkah (2FA) ----
	let twofaStep = $state(false);
	let twofaChallenge = $state("");
	let twofaCode = $state("");
	let twofaUseRecovery = $state(false);
	let twofaLoading = $state(false);
	let twofaError = $state("");

	function batal2fa() {
		twofaStep = false;
		twofaChallenge = "";
		twofaCode = "";
		twofaError = "";
		twofaUseRecovery = false;
	}

	// ---- Referral: Ajak teman, dapat diskon ----
	type ReferralData = {
		referral_code: string;
		share_url: string;
		referred_count: number;
		vouchers: {
			code: string;
			type: string;
			value: number;
			expires_at: string | null;
			uses: number;
			max_uses: number | null;
			active: number;
			role: string;
			created_at: string;
		}[];
	};
	let referralCode = $state("");
	let referral = $state<ReferralData | null>(null);
	let referralLoading = $state(false);
	let referralError = $state("");
	let referralCopied = $state(false);
	let referralCopyError = $state("");

	async function loadReferral() {
		referralLoading = true;
		referralError = "";
		try {
			referral = await api<ReferralData>("/api/referral");
		} catch (e) {
			referralError = e instanceof Error ? e.message : "Gagal memuat data referral.";
			referral = null;
		} finally {
			referralLoading = false;
		}
	}

	async function salinKode() {
		if (!referral) return;
		referralCopyError = "";
		try {
			await navigator.clipboard.writeText(referral.referral_code);
			referralCopied = true;
			setTimeout(() => {
				referralCopied = false;
			}, 2000);
		} catch {
			referralCopyError = "Gagal menyalin otomatis — salin manual kodenya ya.";
		}
	}

	function referralShareText(): string {
		if (!referral) return "";
		return (
			`Belajar di Ringkas bareng aku, yuk. Daftar pakai kode ajakanku ${referral.referral_code}: ${referral.share_url} — ` +
			`kamu dan aku sama-sama dapat voucher diskon 10% saat pembelian pertamamu lunas.`
		);
	}

	function voucherStatus(v: ReferralData["vouchers"][number]): string {
		if (v.max_uses !== null && v.uses >= v.max_uses) return "Sudah dipakai";
		if (v.expires_at && new Date(v.expires_at).getTime() <= Date.now()) return "Kedaluarsa";
		if (v.active !== 1) return "Tidak aktif";
		return "Aktif";
	}

	// Bila pengguna datang dari tautan klaim hadiah (/hadiah) dan belum
	// login, token disimpan di sessionStorage — setelah berhasil masuk/
	// daftar, kembali ke halaman klaim secara otomatis.
	function lanjutKeHadiahBilaAda(): boolean {
		try {
			const token = sessionStorage.getItem("ringkas_pending_gift_token");
			if (token) {
				sessionStorage.removeItem("ringkas_pending_gift_token");
				goto(`/hadiah?token=${encodeURIComponent(token)}`);
				return true;
			}
		} catch {
			/* abaikan */
		}
		return false;
	}

	/**
	 * Arahkan akun BARU yang belum onboarding ke /onboarding (sekali saja).
	 * Hanya akun yang dibuat setelah fitur ini rilis (16 Nov 2026) —
	 * pengguna lama tidak diganggu. Tidak pernah memblokir halaman Akun.
	 */
	async function cekOnboarding() {
		try {
			if (!$auth.user) return;
			const { user } = await api<{ user: { created_at: string } }>("/api/auth/me");
			if (new Date(user.created_at).getTime() < Date.parse("2026-11-16T00:00:00+07:00")) return;
			if (await getOnboardingDone()) return;
			goto("/onboarding");
		} catch {
			/* abaikan */
		}
	}
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

	// ---- Prediksi nilai SAS ----
	let prediction = $state<PredictionData | null>(null);
	let predictionError = $state("");

	// ---- Bank Soal sulitku ----
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

	// ---- Bottom sheet Bantuan & info ----
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
						? "Kebijakan privasi"
						: sheet === "syarat"
							? "Syarat & ketentuan"
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

	// ---- Mode orang tua ----
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

	// ---- Paket guru / kelas ----
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
		// Kode ajakan dari tautan bagikan teman (?ref=KODE) — isi otomatis
		// ke form daftar.
		try {
			const refParam = new URLSearchParams(window.location.search).get("ref");
			if (refParam) referralCode = refParam.trim().toUpperCase();
		} catch {
			/* abaikan */
		}
		// Konfigurasi publik (Turnstile) — sekali, tanpa menunggu hasil.
		void initTurnstile();
		if (!getToken()) return;
		try {
			const { user } = await api<{ user: { id: string; name: string; email: string; whatsapp: string | null; role: string; created_at: string } }>("/api/auth/me");
			auth.setUser(user);
			waEdit = user.whatsapp ?? "";
			await loadTracker();
			await loadPrediction();
			await loadHardBank();
			await loadReferral();
			await loadXp();
			await loadJournal();
			await loadExamDates();
			await loadAccSettings();
			await loadPortfolioCount();
			await cekOnboarding();
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

	// ---- Aksesibilitas & hemat data + Portofolioku ----
	const OPSI_AKSES: { key: keyof UserSettings; label: string; desc: string }[] = [
		{ key: "readable_font", label: "Font ramah baca", desc: "Huruf Atkinson Hyperlegible, spasi lebih lega" },
		{ key: "high_contrast", label: "Kontras tinggi", desc: "Teks lebih tegas di atas latar putih" },
		{ key: "large_text", label: "Huruf besar", desc: "Ukuran teks naik satu tingkat" },
		{ key: "data_saver", label: "Mode hemat data", desc: "Sembunyikan gambar berat; video hanya dimuat saat diketuk" }
	];
	let accSettings = $state<UserSettings | null>(null);
	let accSaving = $state<keyof UserSettings | null>(null);
	let accError = $state("");
	let portfolioCount = $state<number | null>(null);

	async function loadAccSettings() {
		try {
			accSettings = await loadSettings();
		} catch {
			accSettings = null;
		}
	}
	async function loadPortfolioCount() {
		try {
			const data = await api<{ items: unknown[] }>("/api/portfolio");
			portfolioCount = data.items?.length ?? 0;
		} catch {
			portfolioCount = null;
		}
	}
	async function toggleAcc(key: keyof UserSettings) {
		if (!accSettings || accSaving) return;
		const lama = accSettings[key];
		const baru = (lama === 1 ? 0 : 1) as 0 | 1;
		accSettings = { ...accSettings, [key]: baru };
		accSaving = key;
		accError = "";
		try {
			accSettings = await saveSettings({ [key]: baru });
		} catch (e) {
			accSettings = { ...accSettings, [key]: lama };
			accError = e instanceof Error ? e.message : "Gagal menyimpan pengaturan.";
		} finally {
			accSaving = null;
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

	// ---- Level & XP ----
	type XpEvent = { action: string; ref_id: string | null; xp: number; created_at: string };
	type XpData = {
		totalXp: number;
		level: number;
		xpIntoLevel: number;
		xpForNextLevel: number;
		nextLevelAt: number;
		stage: number;
		stageName: string;
		events: XpEvent[];
	};
	let xp = $state<XpData | null>(null);
	let xpError = $state("");

	function xpLabel(action: string): string {
		switch (action) {
			case "chapter":
				return "Bab selesai";
			case "quiz":
				return "Kuis bab";
			case "simulation":
				return "Simulasi";
			case "story":
				return "Soal cerita";
			case "daily":
				return "Latihan harian";
			case "cerita":
				return "Cerita edukasi";
			case "streak":
				return "Streak harian";
			default:
				return action;
		}
	}

	async function loadXp() {
		try {
			xp = await api<XpData>("/api/xp");
		} catch (e) {
			xpError = e instanceof Error ? e.message : "Gagal memuat XP.";
		}
	}

	// ---- Jurnal harian ----
	type JournalEntry = { date: string; text: string; updated_at: string };
	let journalEntries = $state<JournalEntry[]>([]);
	let journalText = $state("");
	let journalError = $state("");
	let journalSaving = $state(false);
	let journalMsg = $state("");
	let journalOk = $state(false);

	/** Tanggal ISO (YYYY-MM-DD) ke format Indonesia, tanpa geser zona waktu. */
	function formatTanggalId(iso: string): string {
		const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
	}

	async function loadJournal() {
		try {
			const data = await api<{ today: JournalEntry | null; entries: JournalEntry[] }>(
				"/api/journal"
			);
			journalEntries = data.entries ?? [];
			journalText = data.today?.text ?? "";
		} catch (e) {
			journalError = e instanceof Error ? e.message : "Gagal memuat jurnal.";
		}
	}

	async function simpanJurnal() {
		journalSaving = true;
		journalMsg = "";
		journalOk = false;
		try {
			const data = await api<{ ok: boolean; date?: string; deleted?: boolean }>("/api/journal", {
				method: "POST",
				body: JSON.stringify({ text: journalText.trim() })
			});
			journalMsg = data.deleted ? "Jurnal hari ini dihapus." : "Jurnal tersimpan.";
			journalOk = true;
			await loadJournal();
		} catch (e) {
			journalMsg = e instanceof Error ? e.message : "Gagal menyimpan jurnal.";
			journalOk = false;
		} finally {
			journalSaving = false;
		}
	}

	// ---- Hitung mundur SAS ----
	type ExamDate = { grade: number; date: string | null; label: string; daysLeft: number | null };
	type ExamTryout = { id: string; grade: number; title: string; starts_at: string; daysLeft: number };
	let examDates = $state<ExamDate[] | null>(null);
	let examTryouts = $state<ExamTryout[]>([]);
	let examError = $state("");

	function examLabel(d: ExamDate): string {
		if (d.date === null || d.daysLeft === null) return `Kelas ${d.grade} — Tanggal SAS belum diatur`;
		if (d.daysLeft < 0) return `Kelas ${d.grade} — Sudah lewat (${formatTanggalId(d.date)})`;
		if (d.daysLeft === 0) return `Kelas ${d.grade} — Hari ini (${formatTanggalId(d.date)})`;
		if (d.daysLeft === 1) return `Kelas ${d.grade} — Besok (${formatTanggalId(d.date)})`;
		return `Kelas ${d.grade} — ${d.daysLeft} hari lagi (${formatTanggalId(d.date)})`;
	}

	async function loadExamDates() {
		try {
			const data = await api<{ dates: ExamDate[]; tryouts: ExamTryout[] }>("/api/exam-dates");
			examDates = data.dates ?? [];
			examTryouts = data.tryouts ?? [];
		} catch (e) {
			examError = e instanceof Error ? e.message : "Gagal memuat tanggal SAS.";
		}
	}

	// ---- Jurnal Anak (Mode orang tua) ----
	let childJournal = $state<
		Record<string, { entries: JournalEntry[]; loading: boolean; error: string; open: boolean }>
	>({});

	function childJ(id: string) {
		return childJournal[id] ?? { entries: [], loading: false, error: "", open: false };
	}

	async function toggleChildJournal(childId: string) {
		const cur = childJournal[childId];
		if (cur?.open) {
			childJournal = { ...childJournal, [childId]: { ...cur, open: false } };
			return;
		}
		childJournal = {
			...childJournal,
			[childId]: { entries: cur?.entries ?? [], loading: true, error: "", open: true }
		};
		try {
			const data = await api<{
				child: { id: string; name: string };
				entries: JournalEntry[];
			}>(`/api/parent/children/${encodeURIComponent(childId)}/journal`);
			childJournal = {
				...childJournal,
				[childId]: { entries: data.entries ?? [], loading: false, error: "", open: true }
			};
		} catch (e) {
			childJournal = {
				...childJournal,
				[childId]: {
					entries: [],
					loading: false,
					error: e instanceof Error ? e.message : "Gagal memuat jurnal anak.",
					open: true
				}
			};
		}
	}

	type LoginResponse =
		| { user: Parameters<typeof auth.login>[0]; token: string; needs2fa?: false }
		| { needs2fa: true; challenge: string };

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
							whatsapp: whatsapp.trim() || undefined,
							referral_code: referralCode.trim() || undefined,
							turnstile_token: turnstileToken || undefined
						})
					}
				);
				auth.login(data.user, data.token);
			} else {
				const data = await api<LoginResponse>("/api/auth/login", {
					method: "POST",
					body: JSON.stringify({
						email: email.trim(),
						password,
						turnstile_token: turnstileToken || undefined
					})
				});
				if ("needs2fa" in data && data.needs2fa) {
					// Langkah kedua: akun memakai 2FA — minta kode autentikator.
					twofaChallenge = data.challenge;
					twofaCode = "";
					twofaError = "";
					twofaUseRecovery = false;
					twofaStep = true;
					return;
				}
				auth.login(data.user, data.token);
			}
			waEdit = $auth.user?.whatsapp ?? "";
			await loadTracker();
			await loadReferral();
			if (!lanjutKeHadiahBilaAda()) await cekOnboarding();
		} catch (e) {
			authError = e instanceof Error ? e.message : "Gagal masuk. Coba lagi ya.";
			resetTurnstile();
		} finally {
			authLoading = false;
		}
	}

	async function submit2fa() {
		if (!twofaChallenge || twofaLoading) return;
		twofaLoading = true;
		twofaError = "";
		try {
			const data = await api<{ user: Parameters<typeof auth.login>[0]; token: string }>(
				"/api/auth/login-2fa",
				{
					method: "POST",
					body: JSON.stringify({ challenge: twofaChallenge, code: twofaCode.trim() })
				}
			);
			auth.login(data.user, data.token);
			waEdit = $auth.user?.whatsapp ?? "";
			batal2fa();
			await loadTracker();
			await loadReferral();
			if (!lanjutKeHadiahBilaAda()) await cekOnboarding();
		} catch (e) {
			twofaError = e instanceof Error ? e.message : "Kode salah. Coba lagi ya.";
		} finally {
			twofaLoading = false;
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
			`\nStreak belajar: ${tracker?.streak ?? 0} hari. Semangat terus ya.`
		);
	}

	// ---- Mode orang tua ----
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

	// ---- Paket guru / kelas ----
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
			classMsg = `Kelas "${data.class.name}" dibuat. Kode kelas: ${data.class.code} — bagikan ke siswa.`;
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

<!-- Desktop: dua kolom — akun kiri, Bantuan & info sticky kanan -->
<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
	<div class="min-w-0">
{#if !loggedIn}
	<h1 class="flex items-center gap-2 text-xl font-semibold"><Icon name="user" size={18} /> <span class="u-pencil">Akun</span></h1>
	<p class="text-sm text-[#5f6b62]">Masuk untuk menyimpan progres belajarmu.</p>

	{#if twofaStep}
		<!-- Langkah kedua: verifikasi dua langkah -->
		<form
			class="card mt-3 space-y-3 p-4 lg:max-w-xl"
			onsubmit={(e) => {
				e.preventDefault();
				submit2fa();
			}}
		>
			<div class="flex items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="shield" size={22} /></span>
				<div class="min-w-0">
					<p class="font-semibold">Verifikasi dua langkah</p>
					<p class="text-xs text-[#5f6b62]">
						Akunmu memakai autentikator. Masukkan kode dari aplikasi autentikatormu.
					</p>
				</div>
			</div>
			<div>
				<label class="lbl" for="2fa-code">{twofaUseRecovery ? "Kode pemulihan" : "Kode autentikator"}</label>
				<input
					id="2fa-code"
					class="input text-center font-semibold tracking-[0.3em]"
					bind:value={twofaCode}
					placeholder={twofaUseRecovery ? "Contoh: ABCD-1234" : "123456"}
					maxlength={twofaUseRecovery ? undefined : 6}
					inputmode={twofaUseRecovery ? "text" : "numeric"}
					autocomplete="one-time-code"
					required
				/>
			</div>
			{#if twofaError}
				<p class="err">{twofaError}</p>
			{/if}
			<button type="submit" class="btn btn-primary btn-block" disabled={twofaLoading}>
				{#if twofaLoading}Memeriksa...{:else}<Icon name="key" size={16} /> Verifikasi{/if}
			</button>
			<div class="flex items-center justify-between gap-2 text-sm">
				<button
					type="button"
					class="font-semibold text-[#177245] underline"
					onclick={() => {
						twofaUseRecovery = !twofaUseRecovery;
						twofaCode = "";
						twofaError = "";
					}}
				>
					{twofaUseRecovery ? "Gunakan kode autentikator" : "Gunakan kode pemulihan"}
				</button>
				<button type="button" class="font-semibold text-[#5f6b62] underline" onclick={batal2fa}>
					Kembali
				</button>
			</div>
		</form>
	{:else}
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
				placeholder={mode === "register" ? "Minimal 8 karakter" : "Password kamu"}
				minlength={mode === "register" ? 8 : undefined}
				required
			/>
			{#if mode === "register"}
				<p class="mt-1 text-xs text-[#5f6b62]">
					Minimal 8 karakter, jangan pakai kata sandi yang mudah ditebak atau pernah bocor.
				</p>
			{/if}
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
			<div>
				<label class="lbl" for="reg-ref">Kode ajakan (opsional)</label>
				<input
					id="reg-ref"
					class="input uppercase"
					bind:value={referralCode}
					placeholder="Contoh: RICKY-7K2Q"
					maxlength={24}
				/>
				<p class="mt-1 text-xs text-[#5f6b62]">
					Punya kode dari teman? Masukkan di sini — kamu dan temanmu sama-sama dapat voucher
					diskon 10% saat pembelian pertamamu lunas.
				</p>
			</div>
		{/if}
		{#if turnstileSiteKey}
			<div bind:this={turnstileEl} class="flex justify-center"></div>
		{/if}
		{#if authError}
			<p class="err">{authError}</p>
		{/if}
		<button type="submit" class="btn btn-primary btn-block" disabled={authLoading}>
			{#if authLoading}Memproses...{:else if mode === "register"}<Icon name="sparkles" size={16} /> Daftar sekarang{:else}<Icon name="rocket" size={16} /> Masuk{/if}
		</button>
	</form>
	{/if}
{:else}
	<!-- Profil -->
	<div class="card flex items-center gap-3 p-4">
		<span class="flex h-12 w-12 items-center justify-center rounded-full bg-[#177245] text-white"><Icon name="user" size={24} /></span>
		<div class="min-w-0 flex-1">
			<p class="truncate font-semibold">{$auth.user?.name}</p>
			<p class="truncate text-sm text-[#5f6b62]">{$auth.user?.email}</p>
			<p class="text-xs font-medium text-[#177245]">
				{#if isAdmin}<span class="inline-flex items-center gap-1"><Icon name="crown" size={16} /> Admin</span>{:else}<span class="inline-flex items-center gap-1"><Icon name="backpack" size={16} /> Pelanggan</span>{/if}
				{#if tracker}• <Icon name="flame" size={16} class="inline-block align-[-2px]" /> Streak {tracker.streak} hari{/if}
			</p>
		</div>
	</div>

	{#if trackerError}
		<p class="err mt-3">{trackerError}</p>
	{/if}

	<!-- Level & XP -->
	<div class="card mt-3 p-4">
		<div class="flex items-center gap-3">
			<Avatar stage={xp ? xp.stage : 1} size={56} />
			<div class="min-w-0 flex-1">
				<p class="font-semibold">Level &amp; XP</p>
				{#if xp}
					<p class="text-sm font-semibold tabular-nums text-[#177245]">Level {xp.level} • {xp.stageName}</p>
					<p class="text-xs text-[#5f6b62]">Total XP: {xp.totalXp}</p>
				{:else}
					<p class="text-xs text-[#5f6b62]">Tanamanmu tumbuh seiring XP yang kamu kumpulkan.</p>
				{/if}
			</div>
		</div>
		{#if xpError}
			<p class="err mt-3">{xpError}</p>
		{:else if xp}
			<div class="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e7e2d2]">
				<div
					class="h-full w-full origin-left bg-[#177245] transition-transform duration-300 ease-signature"
					style="transform: scaleX({xp.xpForNextLevel > 0
						? Math.min(100, Math.round((xp.xpIntoLevel / xp.xpForNextLevel) * 100)) / 100
						: 1})"
				></div>
			</div>
			<p class="mt-1 text-xs font-medium text-[#5f6b62]">
				{xp.xpIntoLevel} / {xp.xpForNextLevel} XP menuju Level {xp.level + 1}
			</p>
			{#if xp.events.length > 0}
				<p class="mt-3 text-sm font-semibold">Aktivitas XP terakhir</p>
				<ul class="mt-1.5 space-y-1.5">
					{#each xp.events.slice(0, 5) as ev (`${ev.created_at}-${ev.action}-${ev.ref_id ?? ""}`)}
						<li class="flex items-center justify-between gap-2 text-sm">
							<span>{xpLabel(ev.action)}</span>
							<span class="shrink-0 font-semibold tabular-nums text-[#177245]">+{ev.xp} XP</span>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<p class="mt-3 text-sm text-[#5f6b62]">Memuat XP...</p>
		{/if}
	</div>

	<!-- Jurnal harian -->
	<div class="card mt-3 p-4">
		<div class="flex items-center gap-3">
			<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="pen" size={22} /></span>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">Jurnal — Apa yang kupelajari hari ini?</p>
				<p class="text-xs text-[#5f6b62]">Tulis satu hal yang kamu pelajari hari ini.</p>
			</div>
		</div>
		{#if journalError}
			<p class="err mt-3">{journalError}</p>
		{:else}
			<label class="lbl mt-3" for="jurnal-text">Jurnal hari ini</label>
			<textarea
				id="jurnal-text"
				class="input"
				rows="3"
				maxlength="500"
				bind:value={journalText}
				placeholder="Contoh: Hari ini aku belajar membilang sampai 20..."
			></textarea>
			<p class="mt-1 text-right text-xs text-[#5f6b62]">{journalText.length}/500 karakter</p>
			<button type="button" class="btn btn-primary" disabled={journalSaving} onclick={simpanJurnal}>
				{#if journalSaving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan Jurnal{/if}
			</button>
			{#if journalMsg}
				<p class="mt-2 text-sm {journalOk ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{journalMsg}</p>
			{/if}
			{#if journalEntries.length > 0}
				<p class="mt-4 text-sm font-semibold">Jurnal terakhir</p>
				<div class="mt-2 space-y-2">
					{#each journalEntries.slice(0, 7) as e (e.date)}
						<div class="card !rounded-lg p-3">
							<p class="text-xs font-medium text-[#177245]">{formatTanggalId(e.date)}</p>
							<p class="mt-0.5 text-sm leading-relaxed">{e.text}</p>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-3 text-sm text-[#5f6b62]">Belum ada jurnal. Tulis jurnal pertamamu hari ini, yuk.</p>
			{/if}
		{/if}
	</div>

	<!-- Aksesibilitas & hemat data -->
	<div class="card mt-3 p-4">
		<div class="flex items-center gap-3">
			<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="eye" size={22} /></span>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">Aksesibilitas &amp; hemat data</p>
				<p class="text-xs text-[#5f6b62]">Atur tampilan supaya lebih nyaman dibaca dan lebih ringan. Tersimpan di akunmu.</p>
			</div>
		</div>
		{#if accSettings}
			<div class="mt-3 space-y-2">
				{#each OPSI_AKSES as t (t.key)}
					<label class="flex cursor-pointer items-center gap-3 rounded-xl bg-[#f7f5ef] px-3 py-2.5">
						<input
							type="checkbox"
							class="h-5 w-5 shrink-0 accent-[#177245]"
							checked={accSettings[t.key] === 1}
							disabled={accSaving !== null}
							onchange={() => toggleAcc(t.key)}
						/>
						<span class="min-w-0 flex-1">
							<span class="block text-sm font-semibold">{t.label}</span>
							<span class="block text-xs text-[#5f6b62]">{t.desc}</span>
						</span>
					</label>
				{/each}
			</div>
		{:else}
			<p class="mt-3 text-sm text-[#5f6b62]">Memuat pengaturan...</p>
		{/if}
		{#if accError}
			<p class="err mt-3">{accError}</p>
		{/if}
	</div>

	<!-- Mode tampilan & suara -->
	<div class="card mt-3 p-4">
		<div class="flex items-center gap-3">
			<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="moon" size={22} /></span>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">Mode Tampilan &amp; Suara</p>
				<p class="text-xs text-[#5f6b62]">Mode gelap dan bunyi jawaban benar. Tersimpan di akunmu.</p>
			</div>
		</div>
		<div class="mt-3">
			<ThemeToggle />
		</div>
		<div class="mt-3 border-t border-[#e7e2d2] pt-3">
			<SoundToggle />
		</div>
	</div>

	<!-- Portofolioku -->
	<div class="card mt-3 p-4">
		<div class="flex items-center gap-3">
			<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="pen" size={22} /></span>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">Portofolioku</p>
				<p class="text-xs text-[#5f6b62]">
					{#if portfolioCount === null}
						Karyamu — orang tua dan gurumu bisa memberi bintang dan komentar.
					{:else}
						Kamu punya {portfolioCount} karya. Orang tua dan gurumu bisa memberi bintang dan komentar.
					{/if}
				</p>
			</div>
			<a href="/portofolio" class="btn btn-leaf shrink-0 !px-3 !py-2 text-xs"><Icon name="pen" size={16} /> Buka portofolio</a>
		</div>
	</div>

	<!-- Hitung mundur SAS -->
	<div class="card mt-3 p-4">
		<div class="flex items-center gap-3">
			<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="calendar" size={22} /></span>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">Hitung mundur SAS</p>
				<p class="text-xs text-[#5f6b62]">Tanggal SAS per kelas, diatur oleh admin.</p>
			</div>
		</div>
		{#if examError}
			<p class="err mt-3">{examError}</p>
		{:else if !examDates}
			<p class="mt-3 text-sm text-[#5f6b62]">Memuat tanggal SAS...</p>
		{:else}
			<div class="mt-3 space-y-2">
				{#each examDates as d (d.grade)}
					<div class="card !rounded-lg flex items-center gap-3 p-3">
						<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] font-semibold text-[#177245]">{d.grade}</span>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold">{examLabel(d)}</p>
							{#if d.label}
								<p class="text-xs text-[#5f6b62]">{d.label}</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
			{#if examTryouts.length > 0}
				<p class="mt-4 text-sm font-semibold">Tryout mendatang</p>
				<div class="mt-2 space-y-2">
					{#each examTryouts as t (t.id)}
						<div class="card !rounded-lg p-3 text-sm">
							<p class="font-semibold">{t.title}</p>
							<p class="text-xs text-[#5f6b62]">
								Kelas {t.grade} • {t.daysLeft} hari lagi • {formatTanggalId(t.starts_at)}
							</p>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

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

	<!-- Ajak teman, dapat diskon (referral) -->
	<div class="card mt-3 p-4">
		<div class="flex items-center gap-3">
			<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="users" size={22} /></span>
			<div class="min-w-0 flex-1">
				<p class="font-semibold">Ajak teman, dapat diskon</p>
				<p class="text-xs text-[#5f6b62]">
					Bagikan kodemu — saat temanmu menyelesaikan pembelian pertamanya, kamu dan dia
					sama-sama dapat voucher diskon 10%.
				</p>
			</div>
		</div>
		{#if referralLoading}
			<p class="mt-3 text-sm text-[#5f6b62]">Memuat kode ajakan...</p>
		{:else if referralError}
			<p class="err mt-3">{referralError}</p>
			<button type="button" class="btn btn-outline mt-2 text-xs" onclick={loadReferral}>
				Coba lagi
			</button>
		{:else if referral}
			<div class="mt-3 flex items-center gap-2">
				<span class="min-w-0 flex-1 truncate rounded-lg bg-[#fbeecd] px-3 py-2 text-center font-semibold tracking-widest">
					{referral.referral_code}
				</span>
				<button type="button" class="btn btn-outline shrink-0 !px-3 !py-2 text-xs" onclick={salinKode}>
					<Icon name="check" size={16} /> {referralCopied ? "Tersalin" : "Salin kode"}
				</button>
			</div>
			{#if referralCopyError}
				<p class="mt-1 text-xs text-[#b91c1c]">{referralCopyError}</p>
			{/if}
			<a
				href={`https://wa.me/?text=${encodeURIComponent(referralShareText())}`}
				target="_blank"
				rel="noopener noreferrer"
				class="btn btn-leaf btn-block mt-2"
			>
				<Icon name="message" size={16} /> Bagikan via WhatsApp
			</a>
			<p class="mt-2 text-sm">
				Teman yang berhasil:
				<b class="text-[#177245]">{referral.referred_count} teman</b>
			</p>
			<p class="mt-3 text-sm font-semibold">Voucher hadiah saya</p>
			{#if referral.vouchers.length === 0}
				<p class="mt-1 text-sm text-[#5f6b62]">
					Belum ada voucher hadiah. Ajak temanmu daftar dan selesaikan pembelian pertamanya.
				</p>
			{:else}
				<div class="mt-2 space-y-2">
					{#each referral.vouchers as v (v.code)}
						<div class="card !rounded-lg flex items-center gap-3 p-3">
							<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#3f4a42]"><Icon name="receipt" size={16} /></span>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold">{v.code}</p>
								<p class="text-xs text-[#5f6b62]">
									Diskon {v.value}% • {v.role === "pengajak" ? "hadiah sebagai pengajak" : "hadiah sebagai teman yang diajak"}
									{#if v.expires_at}• berlaku sampai {formatTanggal(v.expires_at)}{/if}
								</p>
							</div>
							<span class="badge shrink-0 {voucherStatus(v) === 'Aktif' ? 'badge-leaf' : 'badge-sun'}">
								{voucherStatus(v)}
							</span>
						</div>
					{/each}
				</div>
				<p class="mt-2 text-xs text-[#5f6b62]">
					Masukkan kode voucher di halaman Checkout untuk memakai diskonnya.
				</p>
			{/if}
		{/if}
	</div>

	<!-- Menu -->
	<div class="mt-4 space-y-3">
		<!-- Latihan Harian -->
		<div class="card overflow-hidden">
			<button type="button" class="flex w-full items-center gap-3 p-4 text-left" onclick={toggleDaily}>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="alarm-clock" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-semibold">Latihan harian 5 menit</span>
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
						<p class="text-sm font-semibold">Latihan {dailyDate} — jawab semua soal ya.</p>
						<div class="mt-3 space-y-4">
							{#each dailyQs as q, i (q.id)}
								<div>
									<p class="text-sm font-semibold">{i + 1}. {q.question}</p>
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
							{#if dailySubmitting}Memeriksa...{:else}<Icon name="check" size={16} /> Kirim jawaban{/if}
						</button>
					{:else}
						<p class="text-center text-lg font-semibold tabular-nums">
							Skor: {dailyResult.score} / {dailyResult.max_score} <Icon name="party-popper" size={18} class="inline-block align-[-2px]" />
						</p>
						<div class="mt-3 space-y-2">
							{#each dailyResult.review as r (r.questionId)}
								<div class="card !rounded-lg p-3 text-sm">
									<p class="font-semibold">
										{#if r.correct}<Icon name="check-circle" size={16} class="inline-block align-[-2px] text-[#065f46]" /> Benar{:else}<Icon name="x-circle" size={16} class="inline-block align-[-2px] text-[#b91c1c]" /> Belum tepat{/if} — {dailyQText(r.questionId)}
									</p>
									<p class="mt-1 text-[#3f4a42]">{r.discussion}</p>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Peta belajar -->
		<div class="card p-4">
			<div class="flex items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="map" size={22} /></span>
				<div class="min-w-0 flex-1">
					<p class="font-semibold">Peta belajar</p>
					<p class="text-xs text-[#5f6b62]">Jalur bab per kelas — node terbuka saat bab selesai.</p>
				</div>
			</div>
			<div class="mt-3 flex flex-wrap gap-2">
				{#each [1, 2, 3, 4, 5, 6] as g (g)}
					<a href="/peta-belajar/k{g}" class="chip">Kelas {g}</a>
				{/each}
			</div>
		</div>

		<!-- Soal sulitku -->
		<div class="card p-4">
			<div class="flex items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="target" size={22} /></span>
				<div class="min-w-0 flex-1">
					<p class="font-semibold">Soal sulitku</p>
					<p class="text-xs text-[#5f6b62]">
						{hardTotal === null
							? "Soal yang pernah dijawab salah — ulangi sampai benar."
							: hardTotal === 0
								? "Belum ada soal sulit. Terus kerjakan kuis dan simulasi."
								: `${hardTotal} soal menunggu diulang sampai benar.`}
					</p>
				</div>
				<a href="/soal-sulitku" class="btn btn-leaf shrink-0 !px-3 !py-2 text-xs">
					<Icon name="target" size={16} /> Buka bank
				</a>
			</div>
		</div>

		<!-- Jadwal belajar + pengingat -->
		<div class="card p-4">
			<div class="flex items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="alarm-clock" size={22} /></span>
				<div class="min-w-0 flex-1">
					<p class="font-semibold">Jadwal belajar + pengingat</p>
					<p class="text-xs text-[#5f6b62]">Atur jadwal belajar mingguan anak dan aktifkan pengingat push di perangkat.</p>
				</div>
				<a href="/jadwal-belajar" class="btn btn-leaf shrink-0 !px-3 !py-2 text-xs">
					<Icon name="alarm-clock" size={16} /> Atur jadwal
				</a>
			</div>
		</div>

		<!-- Kuis buatan guru -->
		<div class="card p-4">
			<div class="flex items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="school" size={22} /></span>
				<div class="min-w-0 flex-1">
					<p class="font-semibold">Kuis buatan guru</p>
					<p class="text-xs text-[#5f6b62]">Guru merangkai kuis dari bank soal untuk kelasnya; siswa mengerjakan dan hasilnya terlihat guru.</p>
				</div>
				<a href="/kuis-guru" class="btn btn-leaf shrink-0 !px-3 !py-2 text-xs">
					<Icon name="school" size={16} /> Buka kuis guru
				</a>
			</div>
		</div>

		<!-- Stiker & lencana -->
		<div class="card overflow-hidden">
			<button
				type="button"
				class="flex w-full items-center gap-3 p-4 text-left"
				onclick={() => (open.stickers = !open.stickers)}
			>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="trophy" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-semibold">Stiker & lencana</span>
					<span class="text-xs text-[#5f6b62]">
						{tracker ? `${tracker.stickers.length} stiker • ${tracker.badges.length} lencana` : "Lihat koleksimu"}
					</span>
				</span>
				<span><Icon name={open.stickers ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.stickers && tracker}
				<div class="border-t border-[#e7e2d2] p-4">
					<p class="text-sm font-semibold">Lencana</p>
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#if tracker.badges.length === 0}
							<p class="text-sm text-[#5f6b62]">Belum ada lencana. Selesaikan satu bab untuk mulai.</p>
						{:else}
							{#each tracker.badges as b (b)}
								<span class="badge badge-sun"><Icon name="award" size={16} /> {b}</span>
							{/each}
						{/if}
					</div>
					<p class="mt-4 text-sm font-semibold">Stiker ({tracker.stickers.length})</p>
					<p class="mt-1 text-sm text-[#5f6b62]">
						{tracker.stickers.length === 0
							? "Belum ada stiker. Tandai bab selesai untuk dapat stiker."
							: "Kumpulkan 7 stiker untuk lencana Kolektor 7."}
					</p>
				</div>
			{/if}
		</div>

		<!-- Skor simulasi & sertifikat -->
		<div class="card overflow-hidden">
			<button
				type="button"
				class="flex w-full items-center gap-3 p-4 text-left"
				onclick={() => (open.skor = !open.skor)}
			>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="award" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-semibold">Skor simulasi & sertifikat</span>
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
							Belum ada skor simulasi. Kerjakan simulasi SAS dari Ruang Belajar ya.
						</p>
					{:else}
						<p class="text-xs text-[#5f6b62]">
							Simulasi dengan nilai 70% ke atas bisa diunduh sertifikatnya.
						</p>
						<div class="mt-2 space-y-2">
							{#each simScores as s (s.id)}
								<div class="card !rounded-lg flex items-center gap-3 p-3">
									<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#3f4a42]"><Icon name="trophy" size={16} /></span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-semibold">{s.ref_id}</p>
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
											{#if certDownloading === s.id}Mengunduh...{:else}<Icon name="award" size={16} /> Sertifikat{/if}
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

		<!-- Prediksi nilai SAS -->
		<div class="card overflow-hidden">
			<button
				type="button"
				class="flex w-full items-center gap-3 p-4 text-left"
				onclick={() => (open.prediksi = !open.prediksi)}
			>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="target" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-semibold">Prediksi nilai SAS</span>
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
							<Icon name="rocket" size={16} /> Cari simulasi SAS
						</a>
					{:else}
						<div class="flex items-center gap-3">
							<span class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#177245] text-xl font-semibold text-white">
								{prediction.overall}%
							</span>
							<div class="min-w-0">
								<p class="text-sm font-semibold">Perkiraan nilai SAS keseluruhan</p>
								<p class="text-xs text-[#5f6b62]">
									Dari {prediction.totalSimulations} simulasi — simulasi terbaru paling menentukan.
								</p>
							</div>
						</div>
						<div class="mt-3 space-y-2">
							{#each prediction.subjects as s (`${s.subject}-${s.grade}`)}
								<div class="card !rounded-lg p-3">
									<div class="flex items-baseline justify-between gap-2">
										<p class="text-sm font-semibold">{s.subject} • Kelas {s.grade}</p>
										<p class="text-sm font-semibold tabular-nums text-[#177245]">{s.prediction}%</p>
									</div>
									<div class="mt-1.5 h-2 overflow-hidden rounded-full bg-[#e7e2d2]">
										<div
											class="h-full w-full origin-left bg-[#177245] transition-transform duration-300 ease-signature"
											style="transform: scaleX({Math.max(0, Math.min(100, s.prediction)) / 100})"
										></div>
									</div>
									<p class="mt-1 text-xs text-[#5f6b62]">
										{s.attempts} simulasi • terakhir {s.latest_percent}% ({formatTanggal(s.latest_at)})
									</p>
								</div>
							{/each}
						</div>
						{#if prediction.weakChapters.length > 0}
							<p class="mt-4 text-sm font-semibold">Bab yang perlu diulang</p>
							<div class="mt-2 space-y-2">
								{#each prediction.weakChapters as w (w.chapter_id)}
									<a
										href={`/belajar/${w.product_id}/${w.chapter_id}`}
										class="card !rounded-lg flex items-center gap-3 p-3"
									>
										<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ece9dc] text-[#3f4a42]"><Icon name="book-open" size={16} /></span>
										<span class="min-w-0 flex-1">
											<span class="block truncate text-sm font-semibold">{w.title}</span>
											<span class="block text-xs text-[#5f6b62]">{w.reason}</span>
										</span>
										<Icon name="chevron-right" size={16} class="shrink-0 text-[#6e675c]" />
									</a>
								{/each}
							</div>
						{/if}
						<p class="mt-3 flex items-start gap-1.5 text-[11px] text-[#5f6b62]">
							<Icon name="info" size={16} class="mt-0.5 shrink-0" />
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
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="chart" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-semibold">Laporan mingguan orang tua</span>
					<span class="text-xs text-[#5f6b62]">Ringkasan belajar 7 hari terakhir, bisa dibagikan</span>
				</span>
				<span><Icon name={open.laporan ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.laporan}
				<div class="border-t border-[#e7e2d2] p-4">
					{#if laporan}
						<div class="grid grid-cols-3 gap-2 text-center">
							<div class="card !rounded-lg p-2">
								<p class="text-lg font-semibold tabular-nums text-[#177245]">{laporan.days}</p>
								<p class="text-[11px] font-medium text-[#5f6b62]">hari belajar</p>
							</div>
							<div class="card !rounded-lg p-2">
								<p class="text-lg font-semibold tabular-nums text-[#177245]">{laporan.done}</p>
								<p class="text-[11px] font-medium text-[#5f6b62]">bab selesai</p>
							</div>
							<div class="card !rounded-lg p-2">
								<p class="text-lg font-semibold tabular-nums text-[#177245]">
									{laporan.avg === null ? "—" : `${laporan.avg}%`}
								</p>
								<p class="text-[11px] font-medium text-[#5f6b62]">nilai rata-rata</p>
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

		<!-- Mode orang tua -->
		<div class="card overflow-hidden">
			<button type="button" class="flex w-full items-center gap-3 p-4 text-left" onclick={toggleOrtu}>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="users" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-semibold">Mode orang tua</span>
					<span class="text-xs text-[#5f6b62]">Hubungkan akun anak, kunci simulasi, atur target harian</span>
				</span>
				<span><Icon name={open.ortu ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.ortu}
				<div class="border-t border-[#e7e2d2] space-y-4 p-4">
					<div>
						<p class="text-sm font-semibold">Kode untuk anakmu</p>
						<p class="text-xs text-[#5f6b62]">Anak menebus kode ini dari akunnya sendiri.</p>
						<div class="mt-2 flex gap-2">
							<button type="button" class="btn btn-outline" onclick={buatKode}>Buat Kode</button>
							{#if parentCode}
								<span class="flex items-center rounded-lg bg-[#fbeecd] px-3 font-semibold tracking-widest">
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
						<p class="text-sm font-semibold">Anak terhubung</p>
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
										<p class="text-sm font-semibold">{c.name}</p>
										<p class="text-xs text-[#5f6b62]">
											{c.email} • <Icon name="flame" size={16} class="inline-block align-[-2px]" /> {c.streak} hari • {c.done_chapters} bab selesai
										</p>
										<div class="mt-2 flex flex-wrap items-center gap-2">
											<button
												type="button"
												class="btn {c.sas_locked ? 'btn-sun' : 'btn-ghost'} !px-2.5 !py-1.5 text-xs"
												onclick={() => setLock(c.id, !c.sas_locked)}
											>
												{#if c.sas_locked}<Icon name="lock" size={16} /> Simulasi terkunci{:else}<Icon name="unlock" size={16} /> Simulasi terbuka{/if}
											</button>
											<label class="flex items-center gap-1 text-xs font-medium">
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
										<div class="mt-3 border-t border-[#e7e2d2] pt-3">
											<button
												type="button"
												class="btn btn-ghost !px-2.5 !py-1.5 text-xs"
												onclick={() => toggleChildJournal(c.id)}
											>
												<Icon name="book-open" size={16} /> Jurnal {c.name}
												<Icon name={childJ(c.id).open ? "chevron-down" : "chevron-right"} size={16} />
											</button>
											<a
												href={`/portofolio?anak=${encodeURIComponent(c.id)}`}
												class="btn btn-ghost !px-2.5 !py-1.5 text-xs"
											>
												<Icon name="pen" size={16} /> Portofolio {c.name.split(" ")[0]}
											</a>
											{#if childJ(c.id).open}
												{#if childJ(c.id).loading}
													<p class="mt-2 text-sm text-[#5f6b62]">Memuat jurnal...</p>
												{:else if childJ(c.id).error}
													<p class="err mt-2">{childJ(c.id).error}</p>
												{:else if childJ(c.id).entries.length === 0}
													<p class="mt-2 text-sm text-[#5f6b62]">Belum ada jurnal.</p>
												{:else}
													<div class="mt-2 space-y-2">
														{#each childJ(c.id).entries as e (e.date)}
															<div class="card !rounded-lg p-3">
																<p class="text-xs font-medium text-[#177245]">{formatTanggalId(e.date)}</p>
																<p class="mt-0.5 text-sm leading-relaxed">{e.text}</p>
															</div>
														{/each}
													</div>
												{/if}
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<!-- Paket guru / kelas -->
		<div class="card overflow-hidden">
			<button type="button" class="flex w-full items-center gap-3 p-4 text-left" onclick={toggleKelas}>
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#3f4a42]"><Icon name="school" size={22} /></span>
				<span class="flex-1 text-left">
					<span class="block font-semibold">Paket guru / kelas</span>
					<span class="text-xs text-[#5f6b62]">Buat kelas dari produk yang kamu miliki, pantau siswa</span>
				</span>
				<span><Icon name={open.kelas ? "chevron-down" : "chevron-right"} size={18} /></span>
			</button>
			{#if open.kelas}
				<div class="border-t border-[#e7e2d2] space-y-4 p-4">
					<div>
						<p class="text-sm font-semibold">Buat kelas baru</p>
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
							<p class="text-sm font-semibold">
								<Icon name="school" size={16} class="inline-block align-[-2px]" /> {classDetail.class.name} <span class="text-[#5f6b62]">(kode: {classDetail.class.code})</span>
							</p>
							<div class="mt-2 space-y-1.5">
								{#each classDetail.members as m (m.id)}
									<div class="card !rounded-lg flex justify-between p-2.5 text-sm">
										<span class="font-semibold">{m.name}</span>
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
								<Icon name="download" size={16} /> Unduh Rekap (CSV)
							</button>
							<a
								href={`/portofolio?kelas=${encodeURIComponent(classDetail.class.id)}`}
								class="btn btn-ghost mt-2 ml-2 text-xs"
							>
								<Icon name="pen" size={16} /> Portofolio murid
							</a>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if isAdmin}
			<a href="/admin" class="btn btn-sun btn-block"><Icon name="crown" size={16} /> Admin — kelola produk</a>
		{/if}
		<button type="button" class="btn btn-danger btn-block" onclick={keluar}><Icon name="logout" size={16} /> Keluar</button>
		<p class="text-center text-xs text-[#6e675c]">Terakhir diperbarui {formatTanggal($auth.user?.created_at)}</p>
	</div>
{/if}
	</div>

	<div class="lg:sticky lg:top-[72px] lg:self-start">
<!-- Bantuan & info -->
<div class="card mt-4 p-4 lg:mt-0">
	<p class="text-sm font-semibold">Bantuan &amp; Info</p>
	<div class="mt-2 flex flex-wrap gap-2">
		<button type="button" class="chip" onclick={() => (sheet = "blog")}>
			<Icon name="file-text" size={16} /> Blog
		</button>
		<button type="button" class="chip" onclick={() => (sheet = "faq")}>
			<Icon name="help-circle" size={16} /> FAQ
		</button>
		<button type="button" class="chip" onclick={() => (sheet = "update")}>
			<Icon name="sparkles" size={16} /> Update
		</button>
		<button type="button" class="chip" onclick={() => (sheet = "privasi")}>
			<Icon name="lock" size={16} /> Privasi
		</button>
		<button type="button" class="chip" onclick={() => (sheet = "syarat")}>
			<Icon name="scroll" size={16} /> Syarat
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
