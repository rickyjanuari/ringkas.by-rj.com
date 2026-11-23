<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		apiBlob,
		downloadBlob,
		formatRupiah,
		formatTanggal,
		getToken,
		type ChapterMeta,
		type Product,
		type User
	} from "$lib/api";
	import { auth } from "$lib/store";

	type Tab = "ringkasan" | "pesanan" | "produk" | "pengguna" | "video" | "voucher" | "cron" | "pengumuman" | "audit" | "tryout" | "tanya-jawab" | "tanggal-sas" | "donasi";
	let tab = $state<Tab>("ringkasan");
	let isAdmin = $state(false);
	let checking = $state(true);
	let error = $state("");
	let notice = $state("");
	let adminName = $state("");
	let drawer = $state<HTMLDialogElement>();

	const MENU: { label: string; items: { id: Tab; label: string; icon: string }[] }[] = [
		{ label: "Toko", items: [
			{ id: "ringkasan", label: "Ringkasan", icon: "chart" },
			{ id: "pesanan", label: "Pesanan", icon: "shopping-cart" },
			{ id: "produk", label: "Produk", icon: "package" },
			{ id: "voucher", label: "Voucher", icon: "receipt" },
			{ id: "donasi", label: "Donasi", icon: "thumbs-up" }
		] },
		{ label: "Pembelajaran", items: [
			{ id: "video", label: "Video per bab", icon: "video" },
			{ id: "tryout", label: "Tryout", icon: "trophy" },
			{ id: "tanggal-sas", label: "Tanggal SAS", icon: "calendar" },
			{ id: "tanya-jawab", label: "Tanya jawab", icon: "message" }
		] },
		{ label: "Sistem", items: [
			{ id: "pengguna", label: "Pengguna", icon: "users" },
			{ id: "pengumuman", label: "Pengumuman", icon: "sparkles" },
			{ id: "cron", label: "Email & cron", icon: "clock" },
			{ id: "audit", label: "Log aktivitas", icon: "history" }
		] }
	];

	const TAB_TITLE: Record<Tab, string> = {
		ringkasan: "Ringkasan",
		pesanan: "Pesanan",
		donasi: "Donasi",
		produk: "Produk",
		voucher: "Voucher",
		pengguna: "Pengguna & role",
		video: "Video per bab",
		tryout: "Tryout terjadwal",
		"tanggal-sas": "Tanggal SAS",
		"tanya-jawab": "Tanya jawab per bab",
		cron: "Email & cron",
		pengumuman: "Pengumuman",
		audit: "Log aktivitas"
	};

	// ---- Ringkasan ----
	type AdminStats = {
		products_total: number;
		products_visible: number;
		products_hidden: number;
		users_total: number;
		orders_total: number;
		orders_paid: number;
		revenue_paid: number;
		vouchers_active: number;
		emails_sent: number;
	};
	type RecentOrder = {
		id: string;
		buyer_name: string | null;
		buyer_email: string | null;
		products: string[];
		total: number;
		status: string;
		created_at: string;
		paid_at: string | null;
	};
	let stats = $state<AdminStats | null>(null);
	let recentOrders = $state<RecentOrder[]>([]);
	let statsLoading = $state(false);
	let statsError = $state("");

	async function loadStats() {
		statsLoading = true;
		statsError = "";
		try {
			const data = await api<{ stats: AdminStats; recentOrders: RecentOrder[] }>(
				"/api/admin/stats"
			);
			stats = data.stats;
			recentOrders = data.recentOrders ?? [];
		} catch (e) {
			statsError =
				e instanceof Error ? e.message : "Gagal memuat ringkasan. Coba muat ulang ya.";
		} finally {
			statsLoading = false;
		}
	}

	function statusBadge(status: string): string {
		if (status === "PAID") return "badge badge-leaf";
		if (status === "PENDING") return "badge badge-sun";
		return "badge badge-gray";
	}

	// ---- Produk ----
	let products = $state<Product[]>([]);
	let productsLoading = $state(false);
	let editId = $state<string | null>(null);
	let searchQuery = $state("");
	let jenjangFilter = $state("Semua");
	let expandedProductId = $state<string | null>(null);
	let jenjangOptions = $derived([
		"Semua",
		...new Set(products.map((p) => p.jenjang).filter(Boolean))
	]);
	let filteredProducts = $derived(
		products.filter((p) => {
			const q = searchQuery.trim().toLowerCase();
			const cocokCari =
				!q ||
				p.title.toLowerCase().includes(q) ||
				p.mapel.toLowerCase().includes(q);
			const cocokJenjang = jenjangFilter === "Semua" || p.jenjang === jenjangFilter;
			return cocokCari && cocokJenjang;
		})
	);
	let form = $state({
		title: "",
		jenjang: "SD",
		mapel: "",
		price: 0,
		strikethrough_price: null as number | null,
		pages: 0,
		cover_label: "",
		cover_color: "#177245",
		badge: "",
		category: "Kelas",
		description: "",
		external_url: ""
	});
	let formSaving = $state(false);
	let formError = $state("");
	let externalUrlDraft = $state("");
	let uploadFile = $state<File | null>(null);
	let uploadKind = $state<"feature" | "gallery">("feature");
	let uploading = $state(false);
	let productToDelete = $state<Product | null>(null);
	let productDeleting = $state(false);
	let productDeleteError = $state("");

	// ---- Pengguna ----
	let users = $state<
		{ id: string; name: string; email: string; role: string; whatsapp: string | null; created_at: string; order_count: number }[]
	>([]);
	let usersLoading = $state(false);

	// ---- Video per bab ----
	let videoProductId = $state("");
	let videoChapters = $state<ChapterMeta[]>([]);
	let videoChapterId = $state("");
	let videoUrl = $state("");
	let videoDuration = $state("");
	let shortUrl = $state("");
	let shortDuration = $state("");
	let videoLoading = $state(false);
	let videoSaving = $state(false);

	// ---- Voucher ----
	type Voucher = {
		code: string;
		type: "percent" | "fixed";
		value: number;
		max_uses: number | null;
		uses: number;
		min_total: number | null;
		expires_at: string | null;
		active: number;
		created_at: string;
	};
	let vouchers = $state<Voucher[]>([]);
	let vouchersLoading = $state(false);
	let vForm = $state({
		code: "",
		type: "percent" as "percent" | "fixed",
		value: 0,
		max_uses: "",
		min_total: "",
		expires_at: ""
	});
	let vSaving = $state(false);
	let vError = $state("");
	let vToggling = $state<string | null>(null);

	// ---- Cron email ----
	let cronDate = $state("");
	let cronRunning = $state<"daily" | "weekly" | null>(null);
	let cronResult = $state<{ job: string; sent: number; skipped: number; errors: string[] } | null>(
		null
	);
	let cronError = $state("");

	// ---- Pesanan ----
	type AdminOrderList = {
		id: string;
		buyer_name: string | null;
		buyer_email: string | null;
		products: string[];
		total: number;
		status: string;
		created_at: string;
		paid_at: string | null;
	};
	type AdminOrderDetail = {
		id: string;
		user_id: string;
		buyer_name: string | null;
		buyer_email: string | null;
		whatsapp: string | null;
		items: { product_id: string; title: string; price: number; included_in_bundle: boolean }[];
		total: number;
		total_amount: number | null;
		discount_amount: number;
		voucher_code: string | null;
		status: string;
		created_at: string;
		paid_at: string | null;
		expired_at: string | null;
		klikqris_order_id: string | null;
	};
	let orders = $state<AdminOrderList[]>([]);
	let ordersTotal = $state(0);
	let ordersPage = $state(1);
	let ordersPages = $state(1);
	let ordersLoading = $state(false);
	let ordersError = $state("");
	let ordersLoaded = $state(false);
	let orderQuery = $state("");
	let orderStatus = $state("Semua");
	let orderDetail = $state<AdminOrderDetail | null>(null);
	let orderDetailLoading = $state(false);
	let orderDetailError = $state("");
	let resendOrderStatus = $state("");
	let resendingOrder = $state(false);
	let exportingOrders = $state(false);

	async function loadOrders(page = 1) {
		ordersLoading = true;
		ordersError = "";
		try {
			const params = new URLSearchParams({ page: String(page), limit: "20" });
			if (orderQuery.trim()) params.set("q", orderQuery.trim());
			if (orderStatus !== "Semua") params.set("status", orderStatus);
			const data = await api<{
				orders: AdminOrderList[];
				total: number;
				page: number;
				pages: number;
			}>(`/api/admin/orders?${params.toString()}`);
			orders = data.orders ?? [];
			ordersTotal = data.total ?? 0;
			ordersPage = data.page ?? 1;
			ordersPages = data.pages ?? 1;
			ordersLoaded = true;
		} catch (e) {
			ordersError = e instanceof Error ? e.message : "Gagal memuat pesanan. Coba muat ulang ya.";
		} finally {
			ordersLoading = false;
		}
	}

	function cariPesanan() {
		loadOrders(1);
	}

	async function bukaDetailOrder(id: string) {
		orderDetailLoading = true;
		orderDetailError = "";
		resendOrderStatus = "";
		try {
			const data = await api<{ order: AdminOrderDetail }>(
				`/api/admin/orders/${encodeURIComponent(id)}`
			);
			orderDetail = data.order;
		} catch (e) {
			orderDetailError = e instanceof Error ? e.message : "Gagal memuat detail order";
		} finally {
			orderDetailLoading = false;
		}
	}

	function templateEmailOrder(status: string): "paid" | "pending" | "expired" {
		if (status === "PAID") return "paid";
		if (status === "EXPIRED") return "expired";
		return "pending";
	}

	function labelKirimUlangOrder(status: string): string {
		if (status === "PAID") return "Kirim ulang email lunas";
		if (status === "EXPIRED") return "Kirim ulang email kedaluwarsa";
		return "Kirim ulang email menunggu bayar";
	}

	async function kirimUlangEmailOrder() {
		if (!orderDetail) return;
		resendingOrder = true;
		resendOrderStatus = "";
		try {
			const data = await api<{ sent: boolean; skipped?: boolean; error?: string }>(
				"/api/admin/resend-email",
				{
					method: "POST",
					body: JSON.stringify({
						orderId: orderDetail.id,
						template: templateEmailOrder(orderDetail.status)
					})
				}
			);
			resendOrderStatus = hasilKirimUlang(data);
		} catch (e) {
			resendOrderStatus = e instanceof Error ? e.message : "Gagal mengirim email";
		} finally {
			resendingOrder = false;
		}
	}

	/** Pesan hasil kirim ulang email dari respons { sent, skipped, error }. */
	function hasilKirimUlang(data: { sent: boolean; skipped?: boolean; error?: string }): string {
		if (data.sent) return "Email terkirim";
		if (data.skipped)
			return "Email dilewati: RESEND_API_KEY belum disetel di server";
		return `Gagal mengirim email: ${data.error ?? "kesalahan tidak diketahui"}.`;
	}

	async function unduhCsvOrder() {
		exportingOrders = true;
		try {
			const { blob, filename } = await apiBlob("/api/admin/export/orders.csv");
			downloadBlob(blob, filename);
			notice = "CSV order diunduh";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunduh CSV order";
		} finally {
			exportingOrders = false;
		}
	}

	// ---- Reset kata sandi & kirim ulang email selamat datang (tab Pengguna) ----
	let adminId = $state("");
	let resetUser = $state<{ id: string; name: string; email: string } | null>(null);
	let resetPw = $state("");
	let resetPw2 = $state("");
	let resetError = $state("");
	let resetSaving = $state(false);
	let resendUserId = $state<string | null>(null);
	let userEmailResult = $state<Record<string, string>>({});
	let exportingUsers = $state(false);

	async function simpanResetPassword() {
		if (!resetUser) return;
		if (resetPw.length < 8) {
			resetError = "Kata sandi baru minimal 8 karakter";
			return;
		}
		if (resetPw !== resetPw2) {
			resetError = "Konfirmasi kata sandi tidak cocok";
			return;
		}
		resetSaving = true;
		resetError = "";
		try {
			await api(`/api/admin/users/${resetUser.id}/reset-password`, {
				method: "POST",
				body: JSON.stringify({ password: resetPw })
			});
			notice = `Kata sandi ${resetUser.name} berhasil direset`;
			resetUser = null;
			resetPw = "";
			resetPw2 = "";
		} catch (e) {
			resetError = e instanceof Error ? e.message : "Gagal mereset kata sandi";
		} finally {
			resetSaving = false;
		}
	}

	async function kirimUlangEmailSelamatDatang(u: { id: string; name: string }) {
		resendUserId = u.id;
		try {
			const data = await api<{ sent: boolean; skipped?: boolean; error?: string }>(
				"/api/admin/resend-email",
				{
					method: "POST",
					body: JSON.stringify({ userId: u.id, template: "welcome" })
				}
			);
			userEmailResult = { ...userEmailResult, [u.id]: hasilKirimUlang(data) };
		} catch (e) {
			userEmailResult = {
				...userEmailResult,
				[u.id]: e instanceof Error ? e.message : "Gagal mengirim email"
			};
		} finally {
			resendUserId = null;
		}
	}

	async function unduhCsvPengguna() {
		exportingUsers = true;
		try {
			const { blob, filename } = await apiBlob("/api/admin/export/users.csv");
			downloadBlob(blob, filename);
			notice = "CSV pengguna diunduh";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunduh CSV pengguna";
		} finally {
			exportingUsers = false;
		}
	}

	// ---- Pengumuman ----
	type AnnouncementSettings = {
		announcement_text: string | null;
		announcement_enabled: number | boolean;
		promo_text: string | null;
		promo_enabled: number | boolean;
	};
	let settingsLoaded = $state(false);
	let settingsLoading = $state(false);
	let settingsError = $state("");
	let settingsSaving = $state(false);
	let annText = $state("");
	let annEnabled = $state(false);
	let promoText = $state("");
	let promoEnabled = $state(false);

	async function loadSettings() {
		settingsLoading = true;
		settingsError = "";
		try {
			const data = await api<{ settings: AnnouncementSettings }>("/api/admin/settings");
			annText = data.settings.announcement_text ?? "";
			annEnabled = Boolean(data.settings.announcement_enabled);
			promoText = data.settings.promo_text ?? "";
			promoEnabled = Boolean(data.settings.promo_enabled);
			settingsLoaded = true;
		} catch (e) {
			settingsError = e instanceof Error ? e.message : "Gagal memuat pengumuman";
		} finally {
			settingsLoading = false;
		}
	}

	async function simpanSettings() {
		settingsSaving = true;
		settingsError = "";
		try {
			const data = await api<{ settings: AnnouncementSettings }>("/api/admin/settings", {
				method: "POST",
				body: JSON.stringify({
					announcement_text: annText.trim(),
					announcement_enabled: annEnabled ? 1 : 0,
					promo_text: promoText.trim(),
					promo_enabled: promoEnabled ? 1 : 0
				})
			});
			annText = data.settings.announcement_text ?? "";
			annEnabled = Boolean(data.settings.announcement_enabled);
			promoText = data.settings.promo_text ?? "";
			promoEnabled = Boolean(data.settings.promo_enabled);
			notice = "Pengumuman tersimpan";
		} catch (e) {
			settingsError = e instanceof Error ? e.message : "Gagal menyimpan pengumuman";
		} finally {
			settingsSaving = false;
		}
	}

	/** Tanggal saja (tanpa jam) untuk kolom kedaluwarsa voucher. */
	function fmtDate(iso: string | null): string {
		if (!iso) return "-";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
	}

	// ---- Log Aktivitas (audit log) ----
	type AuditItem = {
		id: number;
		admin_email: string;
		action: string;
		target: string | null;
		detail: string | null;
		created_at: string;
	};
	const AUDIT_ACTIONS: { value: string; label: string }[] = [
		{ value: "Semua", label: "Semua aksi" },
		{ value: "product_create", label: "Buat produk" },
		{ value: "product_update", label: "Ubah produk" },
		{ value: "product_delete", label: "Hapus produk" },
		{ value: "product_set_active", label: "Ubah status tampil produk" },
		{ value: "product_external_link", label: "Ubah link eksternal produk" },
		{ value: "product_image_upload", label: "Unggah gambar produk" },
		{ value: "product_image_delete", label: "Hapus gambar produk" },
		{ value: "product_set_feature", label: "Ubah gambar utama produk" },
		{ value: "user_set_role", label: "Ubah role pengguna" },
		{ value: "user_reset_password", label: "Reset kata sandi pengguna" },
		{ value: "email_resend", label: "Kirim ulang email" },
		{ value: "export_orders", label: "Ekspor order (CSV)" },
		{ value: "export_users", label: "Ekspor pengguna (CSV)" },
		{ value: "settings_update", label: "Ubah pengaturan" },
		{ value: "chapter_video_set", label: "Ubah video bab" },
		{ value: "voucher_create", label: "Buat voucher" },
		{ value: "voucher_set_active", label: "Ubah status voucher" },
		{ value: "cron_run", label: "Jalankan cron email" }
	];
	const AUDIT_LIMIT = 20;
	let auditItems = $state<AuditItem[]>([]);
	let auditTotal = $state(0);
	let auditPage = $state(1);
	let auditPages = $derived(Math.max(1, Math.ceil(auditTotal / AUDIT_LIMIT)));
	let auditLoading = $state(false);
	let auditError = $state("");
	let auditLoaded = $state(false);
	let auditAction = $state("Semua");
	let auditQuery = $state("");

	function labelAksi(action: string): string {
		return AUDIT_ACTIONS.find((a) => a.value === action)?.label ?? action;
	}

	async function loadAudit(page = 1) {
		auditLoading = true;
		auditError = "";
		try {
			const params = new URLSearchParams({ page: String(page), limit: String(AUDIT_LIMIT) });
			if (auditAction !== "Semua") params.set("action", auditAction);
			if (auditQuery.trim()) params.set("q", auditQuery.trim());
			const data = await api<{
				items: AuditItem[];
				total: number;
				page: number;
				limit: number;
			}>(`/api/admin/audit-log?${params.toString()}`);
			auditItems = data.items ?? [];
			auditTotal = data.total ?? 0;
			auditPage = data.page ?? 1;
			auditLoaded = true;
		} catch (e) {
			auditError =
				e instanceof Error ? e.message : "Gagal memuat log aktivitas. Coba muat ulang ya.";
		} finally {
			auditLoading = false;
		}
	}

	function cariAudit() {
		loadAudit(1);
	}

	// ---- Keamanan & backup ----
	let lastBackupAt = $state<string | null>(null);
	let backupInfoLoaded = $state(false);
	let backupInfoError = $state("");
	let backupDownloading = $state(false);
	let backupStale = $derived(
		!lastBackupAt ||
			Number.isNaN(new Date(lastBackupAt).getTime()) ||
			Date.now() - new Date(lastBackupAt).getTime() > 7 * 24 * 60 * 60 * 1000
	);

	async function loadBackupInfo() {
		try {
			const data = await api<{ settings: { last_backup_at?: string | null } }>(
				"/api/admin/settings"
			);
			lastBackupAt = data.settings?.last_backup_at ?? null;
			backupInfoLoaded = true;
		} catch (e) {
			backupInfoError = e instanceof Error ? e.message : "Gagal memuat info backup";
		}
	}

	async function unduhBackup() {
		backupDownloading = true;
		try {
			const { blob, filename } = await apiBlob("/api/admin/backup");
			downloadBlob(blob, filename);
			notice = "Backup database diunduh";
			await loadBackupInfo();
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunduh backup";
		} finally {
			backupDownloading = false;
		}
	}

	// ---- Keamanan akun (2FA) ----
	// Secret dan kode pemulihan hanya disimpan di state selama proses
	// aktivasi; tidak pernah ditulis ke log.
	type TwoFaSetup = {
		secret: string;
		otpauthUrl: string;
		qrSvg: string;
		recoveryCodes: string[];
	};
	let twoFaEnabled = $state<boolean | null>(null);
	let twoFaLoading = $state(false);
	let twoFaError = $state("");
	let twoFaSetup = $state<TwoFaSetup | null>(null);
	let twoFaStarting = $state(false);
	let twoFaCode = $state("");
	let twoFaConfirming = $state(false);
	let twoFaConfirmError = $state("");
	let twoFaDisableOpen = $state(false);
	let twoFaDisableCode = $state("");
	let twoFaDisabling = $state(false);
	let twoFaDisableError = $state("");
	let secretCopied = $state(false);

	async function loadTwoFa() {
		twoFaLoading = true;
		twoFaError = "";
		try {
			const data = await api<{ enabled: boolean }>("/api/2fa/status");
			twoFaEnabled = Boolean(data.enabled);
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : "Gagal memuat status 2FA";
		} finally {
			twoFaLoading = false;
		}
	}

	async function mulaiSetup2fa() {
		twoFaStarting = true;
		twoFaConfirmError = "";
		try {
			const data = await api<TwoFaSetup>("/api/2fa/setup/start", { method: "POST" });
			twoFaSetup = data;
			twoFaCode = "";
		} catch (e) {
			twoFaError = e instanceof Error ? e.message : "Gagal memulai aktivasi 2FA";
		} finally {
			twoFaStarting = false;
		}
	}

	async function konfirmasiSetup2fa() {
		if (!/^\d{6}$/.test(twoFaCode.trim())) {
			twoFaConfirmError = "Masukkan kode 6 digit dari aplikasi authenticator kamu";
			return;
		}
		twoFaConfirming = true;
		twoFaConfirmError = "";
		try {
			await api("/api/2fa/setup/confirm", {
				method: "POST",
				body: JSON.stringify({ code: twoFaCode.trim() })
			});
			twoFaSetup = null;
			twoFaEnabled = true;
			twoFaCode = "";
			notice = "2FA aktif. Akun kamu sekarang lebih aman.";
		} catch (e) {
			twoFaConfirmError =
				e instanceof Error ? e.message : "Kode tidak cocok. Periksa lagi kodenya ya.";
		} finally {
			twoFaConfirming = false;
		}
	}

	async function nonaktifkan2fa() {
		if (!/^\d{6}$/.test(twoFaDisableCode.trim())) {
			twoFaDisableError = "Masukkan kode 6 digit dari aplikasi authenticator kamu";
			return;
		}
		twoFaDisabling = true;
		twoFaDisableError = "";
		try {
			await api("/api/2fa/disable", {
				method: "POST",
				body: JSON.stringify({ code: twoFaDisableCode.trim() })
			});
			twoFaEnabled = false;
			twoFaDisableOpen = false;
			twoFaDisableCode = "";
			notice = "2FA dinonaktifkan.";
		} catch (e) {
			twoFaDisableError =
				e instanceof Error ? e.message : "Kode tidak cocok. Periksa lagi kodenya ya.";
		} finally {
			twoFaDisabling = false;
		}
	}

	async function salinSecret2fa() {
		if (!twoFaSetup) return;
		try {
			await navigator.clipboard.writeText(twoFaSetup.secret);
			secretCopied = true;
			setTimeout(() => (secretCopied = false), 2000);
		} catch {
			twoFaConfirmError = "Gagal menyalin. Salin secret secara manual ya.";
		}
	}

	// ---- Tryout (admin) ----
	// Soal tryout dipilih server sekali saat dibuat (dari bank simulasi
	// kelas itu) dan disimpan di tryouts.question_ids — semua peserta
	// mengerjakan soal yang sama. Tryout pertama tiap kelas sebaiknya
	// dibuat gratis (centang "Gratis") agar semua akun login bisa ikut.
	interface AdminTryout {
		id: string;
		grade: number;
		title: string;
		starts_at: string;
		ends_at: string;
		duration_minutes: number;
		question_count: number;
		question_ids_count: number;
		is_free: number;
		status: string;
		phase: string;
		participants: number;
		submissions: number;
		created_at: string;
	}
	let adminTryouts = $state<AdminTryout[]>([]);
	let tryoutsLoading = $state(false);
	let tryoutError = $state("");
	let tSaving = $state(false);
	let tDeletingId = $state<string | null>(null);
	let tForm = $state({
		grade: 1,
		title: "",
		starts_at: "",
		ends_at: "",
		duration_minutes: 60,
		question_count: 25,
		is_free: false
	});

	async function loadTryouts() {
		tryoutsLoading = true;
		tryoutError = "";
		try {
			const data = await api<{ tryouts: AdminTryout[] }>("/api/admin/tryouts");
			adminTryouts = data.tryouts ?? [];
		} catch (e) {
			tryoutError = e instanceof Error ? e.message : "Gagal memuat tryout";
		} finally {
			tryoutsLoading = false;
		}
	}

	async function buatTryout() {
		tSaving = true;
		tryoutError = "";
		try {
			const data = await api<{ tryout: AdminTryout }>("/api/admin/tryouts", {
				method: "POST",
				body: JSON.stringify({
					grade: Number(tForm.grade),
					title: tForm.title.trim(),
					starts_at: tForm.starts_at,
					ends_at: tForm.ends_at,
					duration_minutes: Number(tForm.duration_minutes),
					question_count: Number(tForm.question_count),
					is_free: tForm.is_free
				})
			});
			adminTryouts = [data.tryout, ...adminTryouts].sort((a, b) =>
				a.starts_at < b.starts_at ? 1 : -1
			);
			notice = `Tryout "${data.tryout.title}" dibuat (${data.tryout.question_ids_count} soal)`;
			tForm = { grade: 1, title: "", starts_at: "", ends_at: "", duration_minutes: 60, question_count: 25, is_free: false };
		} catch (e) {
			tryoutError = e instanceof Error ? e.message : "Gagal membuat tryout";
		} finally {
			tSaving = false;
		}
	}

	async function hapusTryout(t: AdminTryout) {
		if (!confirm(`Hapus tryout "${t.title}"?`)) return;
		tDeletingId = t.id;
		tryoutError = "";
		try {
			await api(`/api/admin/tryouts/${t.id}`, { method: "DELETE" });
			adminTryouts = adminTryouts.filter((x) => x.id !== t.id);
			notice = `Tryout "${t.title}" dihapus`;
		} catch (e) {
			tryoutError = e instanceof Error ? e.message : "Gagal menghapus tryout";
		} finally {
			tDeletingId = null;
		}
	}

	// ---- Tanya Jawab (admin) ----
	interface AdminQa {
		id: number;
		product_id: string;
		chapter_id: string;
		chapter_title: string;
		asker_name: string;
		question: string;
		answer: string | null;
		status: string;
		status_label: string;
		created_at: string;
		answered_at: string | null;
	}
	let adminQa = $state<AdminQa[]>([]);
	let qaLoading = $state(false);
	let qaError = $state("");
	let qaFilter = $state("pending");
	let qaAnswers = $state<Record<number, string>>({});
	let qaBusyId = $state<number | null>(null);

	const QA_FILTERS: { id: string; label: string }[] = [
		{ id: "pending", label: "Menunggu moderasi" },
		{ id: "approved", label: "Menunggu jawaban" },
		{ id: "answered", label: "Sudah dijawab" },
		{ id: "rejected", label: "Ditolak" },
		{ id: "semua", label: "Semua" }
	];

	async function loadQa() {
		qaLoading = true;
		qaError = "";
		try {
			const q = qaFilter === "semua" ? "" : `?status=${qaFilter}`;
			const data = await api<{ questions: AdminQa[] }>(`/api/admin/qa${q}`);
			adminQa = data.questions ?? [];
			const next: Record<number, string> = {};
			for (const item of adminQa) next[item.id] = item.answer ?? "";
			qaAnswers = next;
		} catch (e) {
			qaError = e instanceof Error ? e.message : "Gagal memuat tanya jawab";
		} finally {
			qaLoading = false;
		}
	}

	async function qaAksi(q: AdminQa, aksi: "approve" | "reject" | "delete") {
		if (aksi === "delete" && !confirm("Hapus pertanyaan ini?")) return;
		qaBusyId = q.id;
		qaError = "";
		try {
			await api(`/api/admin/qa/${q.id}/${aksi}`, { method: "POST", body: JSON.stringify({}) });
			notice =
				aksi === "approve"
					? "Pertanyaan disetujui — kini tampil di halaman bab"
					: aksi === "reject"
						? "Pertanyaan ditolak"
						: "Pertanyaan dihapus";
			await loadQa();
		} catch (e) {
			qaError = e instanceof Error ? e.message : "Gagal memproses pertanyaan";
		} finally {
			qaBusyId = null;
		}
	}

	async function qaJawab(q: AdminQa) {
		const jawaban = (qaAnswers[q.id] ?? "").trim();
		if (!jawaban) {
			qaError = "Jawaban tidak boleh kosong";
			return;
		}
		qaBusyId = q.id;
		qaError = "";
		try {
			await api(`/api/admin/qa/${q.id}/answer`, {
				method: "POST",
				body: JSON.stringify({ answer: jawaban })
			});
			notice = q.status === "answered" ? "Jawaban diperbarui" : "Jawaban disimpan — pertanyaan kini terjawab";
			await loadQa();
		} catch (e) {
			qaError = e instanceof Error ? e.message : "Gagal menyimpan jawaban";
		} finally {
			qaBusyId = null;
		}
	}

	function qaBadgeAdmin(status: string): string {
		if (status === "answered") return "badge badge-leaf";
		if (status === "pending") return "badge badge-sun";
		if (status === "approved") return "badge badge-sun";
		return "badge badge-gray";
	}

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			const { user } = await api<{ user: User }>("/api/auth/me");
			auth.setUser(user);
			if (user.role !== "admin") {
				error = "Halaman ini hanya untuk admin";
			} else {
				isAdmin = true;
				adminName = user.name;
				adminId = user.id;
				await loadProducts();
				await loadStats();
				loadBackupInfo();
				loadTwoFa();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memeriksa hak akses";
		} finally {
			checking = false;
		}
	});

	async function loadProducts() {
		productsLoading = true;
		try {
			const data = await api<{ products: Product[] }>("/api/admin/products");
			products = data.products ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat produk";
		} finally {
			productsLoading = false;
		}
	}

	async function loadUsers() {
		usersLoading = true;
		try {
			const data = await api<{ users: typeof users }>("/api/admin/users");
			users = data.users ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat pengguna";
		} finally {
			usersLoading = false;
		}
	}

	// ---- Tanggal SAS ----
	type ExamDateAdmin = { grade: number; date: string | null; label: string; daysLeft: number | null };
	let examDates = $state<ExamDateAdmin[]>([]);
	let examDatesLoaded = $state(false);
	let examDatesLoading = $state(false);
	let examDraft = $state<Record<number, { date: string; label: string }>>({});
	let examSavingGrade = $state<number | null>(null);

	async function loadExamDates() {
		examDatesLoading = true;
		try {
			const data = await api<{ dates: ExamDateAdmin[] }>("/api/exam-dates");
			examDates = data.dates ?? [];
			examDatesLoaded = true;
			const draft: Record<number, { date: string; label: string }> = {};
			for (const d of examDates) draft[d.grade] = { date: d.date ?? "", label: d.label ?? "" };
			for (let g = 1; g <= 6; g++) if (!draft[g]) draft[g] = { date: "", label: "" };
			examDraft = draft;
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal memuat tanggal SAS";
		} finally {
			examDatesLoading = false;
		}
	}

	function examDraftFor(g: number) {
		return examDraft[g] ?? { date: "", label: "" };
	}

	function setExamDraft(g: number, patch: Partial<{ date: string; label: string }>) {
		examDraft = { ...examDraft, [g]: { ...examDraftFor(g), ...patch } };
	}

	function formatTanggalSas(iso: string | null): string {
		if (!iso) return "-";
		const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
	}

	function sasCountdown(g: number): string {
		const d = examDates.find((x) => x.grade === g);
		if (!d || d.date === null || d.daysLeft === null) return "Tanggal SAS belum diatur";
		if (d.daysLeft < 0) return `Sudah lewat • ${formatTanggalSas(d.date)}`;
		if (d.daysLeft === 0) return `Hari ini • ${formatTanggalSas(d.date)}`;
		if (d.daysLeft === 1) return `Besok • ${formatTanggalSas(d.date)}`;
		return `${d.daysLeft} hari lagi • ${formatTanggalSas(d.date)}`;
	}

	async function simpanTanggalSas(g: number) {
		examSavingGrade = g;
		try {
			const d = examDraftFor(g);
			await api("/api/admin/exam-dates", {
				method: "POST",
				body: JSON.stringify({ grade: g, date: d.date || null, label: d.label.trim() })
			});
			notice = `Tanggal SAS Kelas ${g} tersimpan`;
			await loadExamDates();
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menyimpan tanggal SAS";
		} finally {
			examSavingGrade = null;
		}
	}

	async function hapusTanggalSas(g: number) {
		examSavingGrade = g;
		try {
			await api("/api/admin/exam-dates", {
				method: "POST",
				body: JSON.stringify({ grade: g, date: null, label: examDraftFor(g).label.trim() })
			});
			notice = `Tanggal SAS Kelas ${g} dihapus`;
			await loadExamDates();
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menghapus tanggal SAS";
		} finally {
			examSavingGrade = null;
		}
	}

	function switchTab(t: Tab) {
		if (tab !== t) window.scrollTo(0, 0);
		tab = t;
		notice = "";
		drawer?.close();
		if (t === "pengguna" && users.length === 0) loadUsers();
		if (t === "voucher" && vouchers.length === 0) loadVouchers();
		if (t === "ringkasan" && !stats && !statsLoading) loadStats();
		if (t === "pesanan" && !ordersLoaded) loadOrders(1);
		if (t === "donasi" && !donationsLoaded) loadDonations();
		if (t === "pengumuman" && !settingsLoaded) loadSettings();
		if (t === "audit" && !auditLoaded) loadAudit(1);
		if (t === "tryout" && adminTryouts.length === 0) loadTryouts();
		if (t === "tanggal-sas" && !examDatesLoaded) loadExamDates();
		if (t === "tanya-jawab" && adminQa.length === 0) loadQa();
	}

	async function loadVouchers() {
		vouchersLoading = true;
		try {
			const data = await api<{ vouchers: Voucher[] }>("/api/admin/vouchers");
			vouchers = data.vouchers ?? [];
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal memuat voucher";
		} finally {
			vouchersLoading = false;
		}
	}

	async function buatVoucher() {
		vSaving = true;
		vError = "";
		const body: Record<string, unknown> = {
			code: vForm.code.trim().toUpperCase(),
			type: vForm.type,
			value: Number(vForm.value)
		};
		if (vForm.max_uses.trim()) body.max_uses = Number(vForm.max_uses);
		if (vForm.min_total.trim()) body.min_total = Number(vForm.min_total);
		if (vForm.expires_at) body.expires_at = vForm.expires_at;
		try {
			const data = await api<{ voucher: Voucher }>("/api/admin/vouchers", {
				method: "POST",
				body: JSON.stringify(body)
			});
			vouchers = [data.voucher, ...vouchers];
			notice = `Voucher ${data.voucher.code} dibuat`;
			vForm = { code: "", type: "percent", value: 0, max_uses: "", min_total: "", expires_at: "" };
		} catch (e) {
			vError = e instanceof Error ? e.message : "Gagal membuat voucher";
		} finally {
			vSaving = false;
		}
	}

	async function toggleVoucher(v: Voucher) {
		vToggling = v.code;
		try {
			const data = await api<{ voucher: Voucher }>(
				`/api/admin/vouchers/${encodeURIComponent(v.code)}/active`,
				{ method: "POST", body: JSON.stringify({ active: v.active ? 0 : 1 }) }
			);
			vouchers = vouchers.map((x) => (x.code === v.code ? data.voucher : x));
			notice = `Voucher ${v.code} ${data.voucher.active ? "diaktifkan" : "dinonaktifkan"}`;
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengubah status voucher";
		} finally {
			vToggling = null;
		}
	}

	// ---- Donasi (Beli 1, donasi 1) ----
	type AdminDonation = {
		id: string;
		order_id: string;
		product_title: string;
		donor_name: string | null;
		donor_email: string | null;
		amount: number;
		status: string;
		recipient_name: string | null;
		recipient_email: string | null;
		created_at: string;
		assigned_at: string | null;
	};
	let donations = $state<AdminDonation[]>([]);
	let donationsLoading = $state(false);
	let donationsError = $state("");
	let donationsLoaded = $state(false);
	let assignEmails = $state<Record<string, string>>({});
	let assignErrors = $state<Record<string, string>>({});
	let assigningId = $state<string | null>(null);

	function labelStatusDonasi(status: string): string {
		if (status === "available") return "Tersedia di pool";
		if (status === "assigned") return "Sudah ditetapkan";
		return status;
	}

	function badgeDonasi(status: string): string {
		return status === "available" ? "badge badge-sun" : "badge badge-leaf";
	}

	async function loadDonations() {
		donationsLoading = true;
		donationsError = "";
		try {
			const data = await api<{ donations: AdminDonation[] }>("/api/admin/donations");
			donations = data.donations ?? [];
			donationsLoaded = true;
		} catch (e) {
			donationsError =
				e instanceof Error ? e.message : "Gagal memuat donasi. Coba muat ulang ya.";
		} finally {
			donationsLoading = false;
		}
	}

	async function tetapkanDonasi(d: AdminDonation) {
		const email = (assignEmails[d.id] ?? "").trim().toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			assignErrors = {
				...assignErrors,
				[d.id]: "Masukkan email penerima yang valid dulu ya"
			};
			return;
		}
		assigningId = d.id;
		assignErrors = { ...assignErrors, [d.id]: "" };
		try {
			await api(`/api/admin/donations/${d.id}/assign`, {
				method: "POST",
				body: JSON.stringify({ email })
			});
			donations = donations.map((x) =>
				x.id === d.id
					? { ...x, status: "assigned", recipient_email: email, assigned_at: new Date().toISOString() }
					: x
			);
			assignEmails = { ...assignEmails, [d.id]: "" };
			notice = `Donasi "${d.product_title}" ditetapkan ke ${email}`;
		} catch (e) {
			assignErrors = {
				...assignErrors,
				[d.id]: e instanceof Error ? e.message : "Gagal menetapkan penerima"
			};
		} finally {
			assigningId = null;
		}
	}

	async function jalankanCron(job: "daily" | "weekly") {
		cronRunning = job;
		cronError = "";
		cronResult = null;
		try {
			const data = await api<{ job: string; sent: number; skipped: number; errors: string[] }>(
				"/api/admin/cron/run",
				{
					method: "POST",
					body: JSON.stringify({ job, ...(cronDate ? { date: cronDate } : {}) })
				}
			);
			cronResult = data;
		} catch (e) {
			cronError = e instanceof Error ? e.message : "Gagal menjalankan cron";
		} finally {
			cronRunning = null;
		}
	}

	// ---- CRUD produk ----
	function mulaiTambah() {
		editId = "baru";
		form = {
			title: "",
			jenjang: "SD",
			mapel: "",
			price: 0,
			strikethrough_price: null,
			pages: 0,
			cover_label: "",
			cover_color: "#177245",
			badge: "",
			category: "Kelas",
			description: "",
			external_url: ""
		};
		formError = "";
	}

	function mulaiEdit(p: Product) {
		editId = p.id;
		form = {
			title: p.title,
			jenjang: p.jenjang,
			mapel: p.mapel,
			price: p.price,
			strikethrough_price: p.strikethrough_price,
			pages: p.pages,
			cover_label: p.cover_label,
			cover_color: p.cover_color,
			badge: p.badge ?? "",
			category: p.category,
			description: p.description,
			external_url: p.external_url ?? ""
		};
		formError = "";
	}

	async function simpanProduk() {
		formSaving = true;
		formError = "";
		const body = {
			title: form.title.trim(),
			jenjang: form.jenjang.trim(),
			mapel: form.mapel.trim(),
			price: Number(form.price),
			strikethrough_price: form.strikethrough_price ? Number(form.strikethrough_price) : null,
			pages: Number(form.pages),
			cover_label: form.cover_label.trim(),
			cover_color: form.cover_color.trim(),
			badge: form.badge.trim() || null,
			category: form.category.trim(),
			description: form.description.trim(),
			external_url: form.external_url.trim() || null
		};
		try {
			if (editId === "baru") {
				const data = await api<{ product: Product }>("/api/admin/products", {
					method: "POST",
					body: JSON.stringify(body)
				});
				products = [data.product, ...products];
				notice = "Produk baru ditambahkan";
			} else {
				const data = await api<{ product: Product }>(`/api/admin/products/${editId}`, {
					method: "PUT",
					body: JSON.stringify(body)
				});
				products = products.map((p) => (p.id === editId ? data.product : p));
				notice = "Produk diperbarui";
			}
			editId = null;
		} catch (e) {
			formError = e instanceof Error ? e.message : "Gagal menyimpan produk";
		} finally {
			formSaving = false;
		}
	}

	function mintaHapusProduk(product: Product) {
		productToDelete = product;
		productDeleteError = "";
	}

	function batalHapusProduk() {
		if (productDeleting) return;
		productToDelete = null;
		productDeleteError = "";
	}

	async function konfirmasiHapusProduk() {
		const product = productToDelete;
		if (!product || productDeleting) return;
		productDeleting = true;
		productDeleteError = "";
		try {
			await api(`/api/admin/products/${product.id}`, { method: "DELETE" });
			products = products.filter((p) => p.id !== product.id);
			if (expandedProductId === product.id) expandedProductId = null;
			if (editId === product.id) editId = null;
			productToDelete = null;
			notice = "Produk dihapus";
		} catch (e) {
			productDeleteError = e instanceof Error ? e.message : "Gagal menghapus produk";
		} finally {
			productDeleting = false;
		}
	}

	async function toggleActive(p: Product) {
		try {
			const data = await api<{ product: Product }>(`/api/admin/products/${p.id}/active`, {
				method: "POST",
				body: JSON.stringify({ active: p.active ? 0 : 1 })
			});
			products = products.map((x) => (x.id === p.id ? data.product : x));
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengubah status tampil";
		}
	}

	async function simpanExternalLink(p: Product) {
		const url = externalUrlDraft.trim();
		try {
			const data = await api<{ product: Product }>(
				`/api/admin/products/${p.id}/external-link`,
				{ method: "POST", body: JSON.stringify({ url }) }
			);
			products = products.map((x) => (x.id === p.id ? data.product : x));
			notice = url ? "Link eksternal disimpan" : "Link eksternal dihapus";
			externalUrlDraft = "";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menyimpan link eksternal";
		}
	}

	function fileToDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(new Error("Gagal membaca berkas"));
			reader.readAsDataURL(file);
		});
	}

	async function uploadGambar(p: Product) {
		if (!uploadFile) {
			notice = "Pilih berkas gambar dulu ya";
			return;
		}
		uploading = true;
		try {
			const dataUrl = await fileToDataUrl(uploadFile);
			await api(`/api/admin/products/${p.id}/images`, {
				method: "POST",
				body: JSON.stringify({ filename: uploadFile.name, dataUrl, kind: uploadKind })
			});
			notice = `Gambar (${uploadKind}) berhasil diunggah untuk "${p.title}"`;
			uploadFile = null;
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunggah gambar";
		} finally {
			uploading = false;
		}
	}

	// ---- Pengguna & Role ----
	async function setRole(u: { id: string; name: string; role: string }, role: "admin" | "customer") {
		try {
			const data = await api<{ user: User }>(`/api/admin/users/${u.id}/role`, {
				method: "POST",
				body: JSON.stringify({ role })
			});
			users = users.map((x) => (x.id === u.id ? { ...x, role: data.user.role } : x));
			notice = `${u.name} sekarang ${role === "admin" ? "Admin" : "Pelanggan"}`;
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengubah role";
		}
	}

	// ---- Video per bab ----
	async function pilihProdukVideo() {
		videoChapterId = "";
		videoUrl = "";
		videoDuration = "";
		shortUrl = "";
		shortDuration = "";
		if (!videoProductId) {
			videoChapters = [];
			return;
		}
		videoLoading = true;
		try {
			const data = await api<{ chapters: ChapterMeta[] }>(`/api/products/${videoProductId}`);
			videoChapters = data.chapters ?? [];
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal memuat bab";
		} finally {
			videoLoading = false;
		}
	}

	function pilihBabVideo() {
		const ch = videoChapters.find((c) => c.id === videoChapterId);
		videoUrl = ch?.video_url ?? "";
		videoDuration = ch?.video_duration ?? "";
		shortUrl = ch?.short_url ?? "";
		shortDuration = ch?.short_duration ?? "";
	}

	async function simpanVideo() {
		if (!videoChapterId) return;
		videoSaving = true;
		try {
			const data = await api<{ chapter: ChapterMeta }>(
				`/api/admin/chapters/${videoChapterId}/video`,
				{
					method: "POST",
					body: JSON.stringify({
						video_url: videoUrl.trim(),
						video_duration: videoDuration.trim(),
						short_url: shortUrl.trim(),
						short_duration: shortDuration.trim()
					})
				}
			);
			videoChapters = videoChapters.map((c) => (c.id === videoChapterId ? data.chapter : c));
			notice = videoUrl.trim() || shortUrl.trim()
				? "Video bab tersimpan"
				: "Video bab dihapus";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menyimpan video";
		} finally {
			videoSaving = false;
		}
	}
</script>

{#snippet adminLinks()}
	<nav class="admin-menu" aria-label="Bagian admin">
		{#each MENU as group (group.label)}
			<div class="admin-menu-group">
				<p>{group.label}</p>
				{#each group.items as item (item.id)}
					<button type="button" aria-current={tab === item.id ? "true" : undefined} onclick={() => switchTab(item.id)}>
						<Icon name={item.icon} size={18} /> {item.label}
						{#if item.id === "produk" && products.length}
							<span>{products.length}</span>
						{/if}
					</button>
				{/each}
			</div>
		{/each}
	</nav>
{/snippet}

{#if checking}
	<p class="store-state" role="status">Memuat panel admin…</p>
{:else if !isAdmin}
	<header class="page-heading page-heading-account"><h1>Panel admin</h1></header>
	<p class="err mt-4" role="alert">{error || "Halaman ini hanya untuk admin"}</p>
	<a href="/" class="btn btn-primary mt-4">Kembali ke beranda</a>
{:else}
	<div class="admin-layout">
		<aside class="admin-sidebar">
			{@render adminLinks()}
			<a href="/akun" class="admin-back"><Icon name="arrow-left" size={18} /> Kembali ke akun</a>
		</aside>

		<dialog class="admin-drawer" bind:this={drawer} aria-label="Menu admin">
			<div class="admin-drawer-header">
				<strong>Menu admin</strong>
				<button type="button" class="btn btn-ghost" aria-label="Tutup menu admin" onclick={() => drawer?.close()}><Icon name="x" size={20} /></button>
			</div>
			{@render adminLinks()}
			<a href="/akun" class="admin-back"><Icon name="arrow-left" size={18} /> Kembali ke akun</a>
		</dialog>

		<div class="admin-content">
			<header class="admin-heading">
				<div>
					<p class="eyebrow">Panel admin</p>
					<h1>{TAB_TITLE[tab]}</h1>
				</div>
				<div class="admin-heading-actions">
					<span><Icon name="user" size={17} /> {adminName}</span>
					<button type="button" class="btn btn-outline admin-menu-trigger" onclick={() => drawer?.showModal()}>
						<Icon name="layers" size={19} /> Menu
					</button>
				</div>
			</header>
			{#if error}
				<p class="err mt-3" role="alert">{error}</p>
			{/if}
			{#if notice}
				<p class="ok-msg mt-3" role="status">{notice}</p>
			{/if}

			{#if tab === "ringkasan"}
				<div class="mt-4 flex items-center justify-between gap-2">
					<p class="text-sm font-semibold text-[#3f4a42]">Kinerja toko</p>
					<button type="button" class="btn btn-ghost !px-3 !py-2 text-xs" disabled={statsLoading} onclick={loadStats}>
						<Icon name="refresh" size={16} /> {statsLoading ? "Memuat..." : "Muat ulang"}
					</button>
				</div>
				{#if statsLoading && !stats}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if statsError && !stats}
					<p class="err mt-4">{statsError}</p>
					<button type="button" class="btn btn-primary mt-3" onclick={loadStats}>Coba lagi</button>
				{:else if stats}
					{#if statsError}
						<p class="err mt-4">{statsError}</p>
					{/if}
					<div class="admin-metrics">
						<div class="admin-metric admin-metric-featured">
							<span><Icon name="credit-card" size={19} /> Pendapatan</span>
							<strong>{formatRupiah(stats.revenue_paid)}</strong>
							<small>Dari {stats.orders_paid} pesanan lunas</small>
						</div>
						{#each [
							{ label: "Pesanan", icon: "receipt", value: stats.orders_total, detail: `${stats.orders_paid} sudah lunas`, target: "pesanan" as const },
							{ label: "Produk", icon: "package", value: stats.products_total, detail: `${stats.products_visible} tampil · ${stats.products_hidden} tersembunyi`, target: "produk" as const },
							{ label: "Pengguna", icon: "users", value: stats.users_total, detail: "Akun terdaftar", target: "pengguna" as const },
							{ label: "Voucher aktif", icon: "bookmark", value: stats.vouchers_active, detail: "Kode dapat digunakan", target: "voucher" as const },
							{ label: "Email terkirim", icon: "message", value: stats.emails_sent, detail: "Riwayat pengiriman", target: "cron" as const }
						] as metric (metric.target)}
							<button class="admin-metric" type="button" onclick={() => switchTab(metric.target)}>
								<span><Icon name={metric.icon} size={19} /> {metric.label} <Icon name="arrow-right" size={16} class="metric-arrow" /></span>
								<strong>{metric.value}</strong>
								<small>{metric.detail}</small>
							</button>
						{/each}
					</div>

					<h2 class="mt-8 text-base font-semibold">Pesanan terbaru</h2>
					{#if recentOrders.length === 0}
						<p class="mt-2 text-sm text-[#5f6b62]">Belum ada order</p>
					{:else}
						<div class="card mt-2 hidden overflow-x-auto p-0 md:block">
							<table class="w-full min-w-[720px] text-left text-xs">
								<thead>
									<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
										<th class="px-3 py-2 font-semibold">Order</th>
										<th class="px-3 py-2 font-semibold">Pembeli</th>
										<th class="px-3 py-2 font-semibold">Produk</th>
										<th class="px-3 py-2 font-semibold">Total</th>
										<th class="px-3 py-2 font-semibold">Status</th>
										<th class="px-3 py-2 font-semibold">Tanggal</th>
									</tr>
								</thead>
								<tbody>
									{#each recentOrders as o (o.id)}
										<tr class="border-b border-[#f0ede2] align-top last:border-0">
											<td class="px-3 py-2 font-semibold tabular-nums">{o.id}</td>
											<td class="px-3 py-2">
												<p class="font-medium">{o.buyer_name ?? "-"}</p>
												<p class="text-[#5f6b62]">{o.buyer_email ?? "-"}</p>
											</td>
											<td class="px-3 py-2">{o.products.join(", ") || "-"}</td>
											<td class="px-3 py-2 font-medium tabular-nums">{formatRupiah(o.total)}</td>
											<td class="px-3 py-2"><span class={statusBadge(o.status)}>{o.status}</span></td>
											<td class="px-3 py-2">{formatTanggal(o.created_at)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<div class="mt-2 space-y-2 md:hidden">
							{#each recentOrders as o (o.id)}
								<article class="card p-3">
									<div class="flex items-start justify-between gap-2">
										<p class="text-sm font-semibold tabular-nums">{o.id}</p>
										<span class={statusBadge(o.status)}>{o.status}</span>
									</div>
									<p class="mt-1 text-xs font-medium">{o.buyer_name ?? "-"} • {o.buyer_email ?? "-"}</p>
									<p class="mt-0.5 text-xs text-[#5f6b62]">{o.products.join(", ") || "-"}</p>
									<p class="mt-1 text-sm font-medium tabular-nums">{formatRupiah(o.total)} <span class="text-xs font-normal text-[#5f6b62]">• {formatTanggal(o.created_at)}</span></p>
								</article>
							{/each}
						</div>
					{/if}
				{/if}

				<!-- Keamanan: backup database & 2FA akun admin -->
				<h2 class="mt-8 text-base font-semibold">Keamanan</h2>
				<div class="mt-2 grid gap-3 lg:grid-cols-2">
					<div class="card space-y-3 p-4">
						<p class="flex items-center gap-2 text-sm font-semibold">
							<Icon name="shield" size={16} /> Keamanan & backup
						</p>
						<p class="text-xs text-[#5f6b62]">
							Unduh salinan database toko (berkas SQL) dan simpan di tempat yang aman
						</p>
						{#if backupInfoError && !backupInfoLoaded}
							<p class="err">{backupInfoError}</p>
						{:else if lastBackupAt}
							<p class="text-sm">
								Backup terakhir: <span class="font-medium tabular-nums">{formatTanggal(lastBackupAt)}</span>
							</p>
							{#if backupStale}
								<p class="rounded-xl border border-[#fde68a] bg-[#fef3c7] px-3 py-2 text-sm font-medium text-[#92400e]">
									<Icon name="alert" size={16} class="inline-block align-[-2px]" />
									Sudah lebih dari 7 hari sejak backup terakhir
								</p>
							{/if}
						{:else}
							<p class="rounded-xl border border-[#fde68a] bg-[#fef3c7] px-3 py-2 text-sm font-medium text-[#92400e]">
								<Icon name="alert" size={16} class="inline-block align-[-2px]" />
								Belum pernah backup
							</p>
						{/if}
						<div>
							<button
								type="button"
								class="btn btn-primary"
								disabled={backupDownloading}
								onclick={unduhBackup}
							>
								{#if backupDownloading}
									Mengunduh...
								{:else}
									<Icon name="download" size={16} /> Unduh backup database
								{/if}
							</button>
						</div>
					</div>

					<div class="card space-y-3 p-4">
						<p class="flex items-center gap-2 text-sm font-semibold">
							<Icon name="shield" size={16} /> Keamanan akun (2FA)
						</p>
						<p class="text-xs text-[#5f6b62]">
							Autentikasi dua faktor: setiap masuk, selain kata sandi kamu juga memasukkan
							kode 6 digit dari aplikasi authenticator
						</p>
						{#if twoFaLoading && twoFaEnabled === null}
							<p class="text-sm font-semibold text-[#5f6b62]">Memuat status 2FA...</p>
						{:else if twoFaError && twoFaEnabled === null}
							<p class="err">{twoFaError}</p>
							<button type="button" class="btn btn-ghost" onclick={loadTwoFa}>
								<Icon name="refresh" size={16} /> Coba lagi
							</button>
						{:else if twoFaSetup}
							<p class="text-sm font-medium">
								Pindai kode QR ini dengan aplikasi authenticator (mis. Google Authenticator):
							</p>
							<div class="flex justify-center rounded-xl bg-white p-3">
								<div class="w-48 [&_svg]:h-auto [&_svg]:w-full">{@html twoFaSetup.qrSvg}</div>
							</div>
							<div>
								<p class="lbl">Atau masukkan secret ini secara manual</p>
								<div class="flex items-center gap-2">
									<code class="min-w-0 flex-1 break-all rounded-lg bg-[#f7f5ef] px-3 py-2 text-sm font-semibold">
										{twoFaSetup.secret}
									</code>
									<button
										type="button"
										class="btn btn-outline shrink-0 !px-3 !py-2 text-xs"
										onclick={salinSecret2fa}
									>
										{secretCopied ? "Disalin" : "Salin"}
									</button>
								</div>
							</div>
							<div>
								<p class="lbl">Kode pemulihan — simpan di tempat aman</p>
								<p class="rounded-xl border border-[#fde68a] bg-[#fef3c7] px-3 py-2 text-sm font-medium text-[#92400e]">
									<Icon name="alert" size={16} class="inline-block align-[-2px]" />
									Simpan kode ini di tempat aman — kode hanya tampil sekali
								</p>
								<ul class="mt-2 grid grid-cols-2 gap-2">
									{#each twoFaSetup.recoveryCodes as c (c)}
										<li>
											<code class="block rounded-lg bg-[#f7f5ef] px-2 py-2 text-center text-sm font-semibold tracking-wide">
												{c}
											</code>
										</li>
									{/each}
								</ul>
							</div>
							<div>
								<label class="lbl" for="2fa-code">Kode 6 digit dari aplikasi authenticator</label>
								<input
									id="2fa-code"
									class="input"
									inputmode="numeric"
									autocomplete="one-time-code"
									maxlength="6"
									placeholder="123456"
									bind:value={twoFaCode}
								/>
							</div>
							{#if twoFaConfirmError}
								<p class="err">{twoFaConfirmError}</p>
							{/if}
							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									class="btn btn-primary"
									disabled={twoFaConfirming}
									onclick={konfirmasiSetup2fa}
								>
									{twoFaConfirming ? "Memeriksa..." : "Konfirmasi & aktifkan 2FA"}
								</button>
								<button
									type="button"
									class="btn btn-ghost"
									onclick={() => {
										twoFaSetup = null;
										twoFaCode = "";
										twoFaConfirmError = "";
									}}
								>
									Batal
								</button>
							</div>
						{:else if twoFaEnabled}
							<p>
								<span class="badge badge-leaf">
									<Icon name="check-circle" size={16} /> 2FA aktif
								</span>
							</p>
							<p class="text-sm text-[#5f6b62]">
								Akun ini dilindungi kode authenticator
							</p>
							{#if !twoFaDisableOpen}
								<div>
									<button
										type="button"
										class="btn btn-outline"
										onclick={() => {
											twoFaDisableOpen = true;
											twoFaDisableCode = "";
											twoFaDisableError = "";
										}}
									>
										<Icon name="unlock" size={16} /> Nonaktifkan 2FA
									</button>
								</div>
							{:else}
								<div>
									<label class="lbl" for="2fa-disable-code">Kode 6 digit saat ini</label>
									<input
										id="2fa-disable-code"
										class="input"
										inputmode="numeric"
										autocomplete="one-time-code"
										maxlength="6"
										placeholder="123456"
										bind:value={twoFaDisableCode}
									/>
								</div>
								{#if twoFaDisableError}
									<p class="err">{twoFaDisableError}</p>
								{/if}
								<div class="flex flex-wrap gap-2">
									<button
										type="button"
										class="btn btn-danger"
										disabled={twoFaDisabling}
										onclick={nonaktifkan2fa}
									>
										{twoFaDisabling ? "Memproses..." : "Nonaktifkan 2FA"}
									</button>
									<button
										type="button"
										class="btn btn-ghost"
										onclick={() => {
											twoFaDisableOpen = false;
											twoFaDisableCode = "";
											twoFaDisableError = "";
										}}
									>
										Batal
									</button>
								</div>
							{/if}
						{:else}
							<p>
								<span class="badge badge-sun">
									<Icon name="alert" size={16} /> 2FA nonaktif
								</span>
							</p>
							<p class="text-sm text-[#5f6b62]">Aktifkan 2FA supaya akun admin lebih aman</p>
							{#if twoFaError}
								<p class="err">{twoFaError}</p>
							{/if}
							<div>
								<button
									type="button"
									class="btn btn-primary"
									disabled={twoFaStarting}
									onclick={mulaiSetup2fa}
								>
									{#if twoFaStarting}
										Memuat...
									{:else}
										<Icon name="shield" size={16} /> Aktifkan 2FA
									{/if}
								</button>
							</div>
						{/if}
					</div>
				</div>
			{:else if tab === "pesanan"}
				<form
					class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
					onsubmit={(e) => {
						e.preventDefault();
						cariPesanan();
					}}
				>
					<div class="relative flex-1">
						<input
							class="input !pl-9"
							type="search"
							placeholder="Cari order atau email"
							bind:value={orderQuery}
							aria-label="Cari order"
						/>
						<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6b62]"><Icon name="search" size={16} /></span>
					</div>
					<select
						class="input sm:!w-44"
						bind:value={orderStatus}
						aria-label="Filter status order"
						onchange={() => loadOrders(1)}
					>
						<option value="Semua">Semua status</option>
						<option value="PENDING">PENDING</option>
						<option value="PAID">PAID</option>
						<option value="EXPIRED">EXPIRED</option>
					</select>
					<button type="submit" class="btn btn-primary">
						<Icon name="search" size={16} /> Cari
					</button>
					<button type="button" class="btn btn-ghost" disabled={ordersLoading} onclick={() => loadOrders(ordersPage)}>
						<Icon name="refresh" size={16} /> {ordersLoading ? "Memuat..." : "Muat ulang"}
					</button>
					<button type="button" class="btn btn-outline" disabled={exportingOrders} onclick={unduhCsvOrder}>
						<Icon name="download" size={16} /> {exportingOrders ? "Mengunduh..." : "Unduh CSV order"}
					</button>
				</form>
				<p class="mt-3 text-sm font-medium tabular-nums text-[#3f4a42]">
					Menampilkan {orders.length} dari {ordersTotal} order
				</p>

				{#if ordersLoading && !ordersLoaded}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if ordersError && !ordersLoaded}
					<p class="err mt-4">{ordersError}</p>
					<button type="button" class="btn btn-primary mt-3" onclick={() => loadOrders(1)}>Coba lagi</button>
				{:else if orders.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">
						{ordersTotal === 0 ? "Belum ada order" : "Tidak ada order yang cocok dengan pencarian"}
					</p>
				{:else}
					{#if ordersError}
						<p class="err mt-3">{ordersError}</p>
					{/if}
					<!-- Tabel desktop -->
					<div class="card mt-3 hidden overflow-x-auto p-0 md:block">
						<table class="w-full min-w-[760px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2 font-semibold">Order</th>
									<th class="px-3 py-2 font-semibold">Pembeli</th>
									<th class="px-3 py-2 font-semibold">Produk</th>
									<th class="px-3 py-2 font-semibold">Total</th>
									<th class="px-3 py-2 font-semibold">Status</th>
									<th class="px-3 py-2 font-semibold">Tanggal</th>
									<th class="px-3 py-2 text-right font-semibold">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{#each orders as o (o.id)}
									<tr class="cursor-pointer border-b border-[#f0ede2] align-top last:border-0 hover:bg-[#f7f5ef]" onclick={() => bukaDetailOrder(o.id)}>
										<td class="px-3 py-2 font-semibold tabular-nums">{o.id}</td>
										<td class="px-3 py-2">
											<p class="font-medium">{o.buyer_name ?? "-"}</p>
											<p class="text-[#5f6b62]">{o.buyer_email ?? "-"}</p>
										</td>
										<td class="px-3 py-2">{o.products.join(", ") || "-"}</td>
										<td class="px-3 py-2 font-medium tabular-nums">{formatRupiah(o.total)}</td>
										<td class="px-3 py-2"><span class={statusBadge(o.status)}>{o.status}</span></td>
										<td class="px-3 py-2">{formatTanggal(o.created_at)}</td>
										<td class="px-3 py-2 text-right">
											<button
												type="button"
												class="btn btn-outline !px-3 !py-2 text-xs"
												onclick={(e) => {
													e.stopPropagation();
													bukaDetailOrder(o.id);
												}}
											>
												Detail
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<!-- Kartu mobile -->
					<div class="mt-3 space-y-2 md:hidden">
						{#each orders as o (o.id)}
							<div
								class="card cursor-pointer p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#177245]"
								role="button"
								tabindex="0"
								onclick={() => bukaDetailOrder(o.id)}
								onkeydown={(e) => e.key === "Enter" && bukaDetailOrder(o.id)}
							>
								<div class="flex items-start justify-between gap-2">
									<p class="text-sm font-semibold tabular-nums">{o.id}</p>
									<span class={statusBadge(o.status)}>{o.status}</span>
								</div>
								<p class="mt-1 text-xs font-medium">{o.buyer_name ?? "-"} • {o.buyer_email ?? "-"}</p>
								<p class="mt-0.5 text-xs text-[#5f6b62]">{o.products.join(", ") || "-"}</p>
								<p class="mt-1 text-sm font-medium tabular-nums">{formatRupiah(o.total)} <span class="text-xs font-normal text-[#5f6b62]">• {formatTanggal(o.created_at)}</span></p>
								<button
									type="button"
									class="btn btn-outline mt-2 !px-3 !py-2 text-xs"
									onclick={(e) => {
										e.stopPropagation();
										bukaDetailOrder(o.id);
									}}
								>
									Detail
								</button>
							</div>
						{/each}
					</div>
					<div class="mt-4 flex items-center justify-between gap-2">
						<button
							type="button"
							class="btn btn-ghost !px-3 !py-2 text-xs"
							disabled={ordersPage <= 1 || ordersLoading}
							onclick={() => loadOrders(ordersPage - 1)}
						>
							<Icon name="chevron-left" size={16} /> Sebelumnya
						</button>
						<p class="text-sm font-medium tabular-nums text-[#3f4a42]">Halaman {ordersPage} dari {ordersPages}</p>
						<button
							type="button"
							class="btn btn-ghost !px-3 !py-2 text-xs"
							disabled={ordersPage >= ordersPages || ordersLoading}
							onclick={() => loadOrders(ordersPage + 1)}
						>
							Berikutnya <Icon name="chevron-right" size={16} />
						</button>
					</div>
				{/if}
			{:else if tab === "produk"}
				<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
					<div class="relative flex-1">
						<input
							class="input !pl-9"
							type="search"
							placeholder="Cari produk"
							bind:value={searchQuery}
							aria-label="Cari produk"
						/>
						<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6b62]"><Icon name="search" size={16} /></span>
					</div>
					<select class="input sm:!w-40" bind:value={jenjangFilter} aria-label="Filter jenjang">
						{#each jenjangOptions as j (j)}
							<option value={j}>{j === "Semua" ? "Semua jenjang" : j}</option>
						{/each}
					</select>
					<button type="button" class="btn btn-primary" onclick={mulaiTambah}>
						<Icon name="plus" size={16} /> Tambah produk
					</button>
				</div>
				<p class="mt-3 text-sm font-medium tabular-nums text-[#3f4a42]">
					Menampilkan {filteredProducts.length} dari {products.length} produk
				</p>

				{#if productsLoading}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if filteredProducts.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">
						{products.length === 0 ? "Belum ada produk" : "Tidak ada produk yang cocok dengan pencarian"}
					</p>
				{:else}
					<!-- Tabel desktop -->
					<div class="card mt-3 hidden overflow-x-auto p-0 md:block">
						<table class="w-full min-w-[780px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2 font-semibold">Cover</th>
									<th class="px-3 py-2 font-semibold">Judul</th>
									<th class="px-3 py-2 font-semibold">Jenjang / mapel</th>
									<th class="px-3 py-2 font-semibold">Harga</th>
									<th class="px-3 py-2 font-semibold">Status</th>
									<th class="px-3 py-2 text-right font-semibold">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredProducts as p (p.id)}
									<tr class="border-b border-[#f0ede2] align-top">
										<td class="px-3 py-2">
											<div
												class="flex h-12 w-12 items-center justify-center rounded-lg px-1 text-center text-xs font-semibold leading-tight text-white"
												style="background: {p.cover_color}"
											>
												{p.cover_label}
											</div>
										</td>
										<td class="px-3 py-2">
											<p class="text-sm font-semibold leading-snug">{p.title}</p>
											{#if p.badge}
												<span class="badge badge-sun mt-1">{p.badge}</span>
											{/if}
										</td>
										<td class="px-3 py-2">{p.jenjang} • {p.mapel}</td>
										<td class="px-3 py-2">
											<p class="font-medium tabular-nums">{formatRupiah(p.price)}</p>
											{#if p.strikethrough_price}
												<p class="text-[#5f6b62] line-through">{formatRupiah(p.strikethrough_price)}</p>
											{/if}
										</td>
										<td class="px-3 py-2">
											<div class="flex flex-wrap gap-1">
												{#if p.active}
													<span class="badge badge-leaf">Tampil</span>
												{:else}
													<span class="badge badge-gray">Tersembunyi</span>
												{/if}
												{#if p.badge === "BUNDEL"}
													<span class="badge badge-brand">Bundel</span>
												{/if}
												{#if p.external_url}
													<span class="badge badge-brand"><Icon name="link" size={16} /> Link eksternal</span>
												{/if}
											</div>
										</td>
										<td class="px-3 py-2">
											<div class="flex flex-wrap justify-end gap-2">
												<button type="button" class="btn btn-outline !px-3 !py-2 text-xs" onclick={() => mulaiEdit(p)}>
													<Icon name="edit" size={16} /> Edit
												</button>
												<button
													type="button"
													class="btn {p.active ? 'btn-ghost' : 'btn-leaf'} !px-3 !py-2 text-xs"
													onclick={() => toggleActive(p)}
												>
													{p.active ? "Sembunyikan" : "Tampilkan"}
												</button>
												<button
													type="button"
													class="btn btn-danger !px-3 !py-2 text-xs"
											onclick={() => mintaHapusProduk(p)}
												>
													<Icon name="trash" size={16} /> Hapus
												</button>
												<button
													type="button"
													class="btn btn-ghost !px-3 !py-2 text-xs"
													onclick={() => (expandedProductId = expandedProductId === p.id ? null : p.id)}
												>
													<Icon name="link" size={16} /> Gambar & link
												</button>
											</div>
										</td>
									</tr>
									{#if expandedProductId === p.id}
										<tr class="border-b border-[#f0ede2] bg-[#f7f5ef]">
											<td class="px-3 py-3" colspan="6">
												<div class="flex flex-wrap items-center gap-2">
													<input
														class="input !w-64 !px-2 !py-2 text-xs"
														placeholder="Link eksternal (https://...)"
														value={p.external_url ?? ""}
														oninput={(e) => (externalUrlDraft = e.currentTarget.value)}
													/>
													<button
														type="button"
														class="btn btn-ghost !px-3 !py-2 text-xs"
														onclick={() => simpanExternalLink(p)}
													>
														Simpan link
													</button>
													<input
														type="file"
														accept="image/*"
														class="text-xs"
														onchange={(e) => {
															uploadFile = e.currentTarget.files?.[0] ?? null;
														}}
													/>
													<select class="input !w-auto !px-2 !py-2 text-xs" bind:value={uploadKind}>
														<option value="feature">Feature</option>
														<option value="gallery">Gallery</option>
													</select>
													<button
														type="button"
														class="btn btn-sun !px-3 !py-2 text-xs"
														disabled={uploading || !uploadFile}
														onclick={() => uploadGambar(p)}
													>
														{#if uploading}Mengunggah...{:else}<Icon name="upload" size={16} /> Unggah gambar{/if}
													</button>
												</div>
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
					<!-- Kartu mobile -->
					<div class="mt-3 space-y-3 md:hidden">
						{#each filteredProducts as p (p.id)}
							<article class="card p-3">
								<div class="flex items-start gap-3">
									<div
										class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg px-1 text-center text-xs font-semibold leading-tight text-white"
										style="background: {p.cover_color}"
									>
										{p.cover_label}
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-semibold leading-snug">{p.title}</p>
										<p class="text-xs text-[#5f6b62]">
											{p.jenjang} • {p.mapel} • {formatRupiah(p.price)}
											{#if p.strikethrough_price}
												<span class="line-through">{formatRupiah(p.strikethrough_price)}</span>
											{/if}
										</p>
										<div class="mt-1 flex flex-wrap gap-1">
											{#if p.active}
												<span class="badge badge-leaf">Tampil</span>
											{:else}
												<span class="badge badge-gray">Tersembunyi</span>
											{/if}
											{#if p.badge === "BUNDEL"}
												<span class="badge badge-brand">Bundel</span>
											{/if}
											{#if p.badge}
												<span class="badge badge-sun">{p.badge}</span>
											{/if}
											{#if p.external_url}
												<span class="badge badge-brand"><Icon name="link" size={16} /> Link eksternal</span>
											{/if}
										</div>
									</div>
									<button
										type="button"
										class="btn {p.active ? 'btn-ghost' : 'btn-leaf'} shrink-0 !px-3 !py-2 text-xs"
										onclick={() => toggleActive(p)}
									>
										{p.active ? "Sembunyikan" : "Tampilkan"}
									</button>
								</div>
								<div class="mt-2 flex flex-wrap gap-2">
									<button type="button" class="btn btn-outline !px-3 !py-2 text-xs" onclick={() => mulaiEdit(p)}>
										<Icon name="edit" size={16} /> Edit
									</button>
									<button
										type="button"
										class="btn btn-danger !px-3 !py-2 text-xs"
										onclick={() => mintaHapusProduk(p)}
									>
										<Icon name="trash" size={16} /> Hapus
									</button>
									<input
										class="input !w-44 !px-2 !py-2 text-xs"
										placeholder="Link eksternal (https://...)"
										value={p.external_url ?? ""}
										oninput={(e) => (externalUrlDraft = e.currentTarget.value)}
									/>
									<button
										type="button"
										class="btn btn-ghost !px-3 !py-2 text-xs"
										onclick={() => simpanExternalLink(p)}
									>
										Simpan link
									</button>
								</div>
								<div class="mt-2 flex flex-wrap items-center gap-2 border-t border-dashed border-[#e7e2d2] pt-2">
									<input
										type="file"
										accept="image/*"
										class="text-xs"
										onchange={(e) => {
											uploadFile = e.currentTarget.files?.[0] ?? null;
										}}
									/>
									<select class="input !w-auto !px-2 !py-2 text-xs" bind:value={uploadKind}>
										<option value="feature">Feature</option>
										<option value="gallery">Gallery</option>
									</select>
									<button
										type="button"
										class="btn btn-sun !px-3 !py-2 text-xs"
										disabled={uploading || !uploadFile}
										onclick={() => uploadGambar(p)}
									>
										{#if uploading}Mengunggah...{:else}<Icon name="upload" size={16} /> Unggah gambar{/if}
									</button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			{:else if tab === "pengguna"}
				<div class="mt-4 flex flex-wrap items-center justify-between gap-2">
					<p class="text-sm font-medium tabular-nums text-[#3f4a42]">{users.length} pengguna terdaftar</p>
					<button type="button" class="btn btn-outline" disabled={exportingUsers} onclick={unduhCsvPengguna}>
						<Icon name="download" size={16} /> {exportingUsers ? "Mengunduh..." : "Unduh CSV pengguna"}
					</button>
				</div>
				{#if usersLoading}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if users.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">Belum ada pengguna</p>
				{:else}
					<div class="card mt-3 hidden overflow-x-auto p-0 md:block">
						<table class="w-full min-w-[680px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2 font-semibold">Nama</th>
									<th class="px-3 py-2 font-semibold">Email</th>
									<th class="px-3 py-2 font-semibold">Order</th>
									<th class="px-3 py-2 font-semibold">Role</th>
									<th class="px-3 py-2 text-right font-semibold">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{#each users as u (u.id)}
									<tr class="border-b border-[#f0ede2] last:border-0">
										<td class="px-3 py-2 font-semibold">{u.name}</td>
										<td class="px-3 py-2">{u.email}</td>
										<td class="px-3 py-2">{u.order_count} order</td>
										<td class="px-3 py-2">
											{#if u.role === "admin"}
												<span class="badge badge-sun"><Icon name="crown" size={16} /> Admin</span>
											{:else}
												<span class="badge badge-leaf"><Icon name="backpack" size={16} /> Pelanggan</span>
											{/if}
										</td>
										<td class="px-3 py-2 text-right">
											<div class="flex flex-wrap justify-end gap-2">
												{#if u.role === "admin"}
													<button
														type="button"
														class="btn btn-ghost !px-3 !py-2 text-xs"
														onclick={() => setRole(u, "customer")}
													>
														Jadikan pelanggan
													</button>
												{:else}
													<button
														type="button"
														class="btn btn-sun !px-3 !py-2 text-xs"
														onclick={() => setRole(u, "admin")}
													>
														Jadikan admin
													</button>
												{/if}
												{#if u.id === adminId}
													<button type="button" class="btn btn-ghost !px-3 !py-2 text-xs" disabled title="Tidak bisa reset kata sandi sendiri">
														<Icon name="lock" size={16} /> Reset kata sandi
													</button>
												{:else}
													<button
														type="button"
														class="btn btn-outline !px-3 !py-2 text-xs"
														onclick={() => {
															resetUser = u;
															resetPw = "";
															resetPw2 = "";
															resetError = "";
														}}
													>
														<Icon name="lock" size={16} /> Reset kata sandi
													</button>
												{/if}
												<button
													type="button"
													class="btn btn-ghost !px-3 !py-2 text-xs"
													disabled={resendUserId === u.id}
													onclick={() => kirimUlangEmailSelamatDatang(u)}
												>
													<Icon name="message" size={16} />
													{resendUserId === u.id ? "Mengirim..." : "Kirim ulang email"}
												</button>
											</div>
											{#if u.id === adminId}
												<p class="mt-1 text-xs text-[#5f6b62]">Tidak bisa reset kata sandi sendiri</p>
											{/if}
											{#if userEmailResult[u.id]}
												<p class="mt-1 text-xs font-medium text-[#065f46]">{userEmailResult[u.id]}</p>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="mt-3 space-y-2 md:hidden">
						{#each users as u (u.id)}
							<div class="card p-3">
								<div class="flex items-center gap-3">
									<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ece9dc] text-[#3f4a42]"><Icon name="user" size={18} /></span>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{u.name}</p>
										<p class="truncate text-xs text-[#5f6b62]">
											{u.email} • {u.order_count} order • {#if u.role === "admin"}<Icon name="crown" size={16} class="inline-block align-[-2px]" /> Admin{:else}<Icon name="backpack" size={16} class="inline-block align-[-2px]" /> Pelanggan{/if}
										</p>
									</div>
								</div>
								<div class="mt-2 flex flex-wrap gap-2">
									{#if u.role === "admin"}
										<button
											type="button"
											class="btn btn-ghost !px-3 !py-2 text-xs"
											onclick={() => setRole(u, "customer")}
										>
											Jadikan pelanggan
										</button>
									{:else}
										<button
											type="button"
											class="btn btn-sun !px-3 !py-2 text-xs"
											onclick={() => setRole(u, "admin")}
										>
											Jadikan admin
										</button>
									{/if}
									{#if u.id === adminId}
										<button type="button" class="btn btn-ghost !px-3 !py-2 text-xs" disabled title="Tidak bisa reset kata sandi sendiri">
											<Icon name="lock" size={16} /> Reset kata sandi
										</button>
									{:else}
										<button
											type="button"
											class="btn btn-outline !px-3 !py-2 text-xs"
											onclick={() => {
												resetUser = u;
												resetPw = "";
												resetPw2 = "";
												resetError = "";
											}}
										>
											<Icon name="lock" size={16} /> Reset kata sandi
										</button>
									{/if}
									<button
										type="button"
										class="btn btn-ghost !px-3 !py-2 text-xs"
										disabled={resendUserId === u.id}
										onclick={() => kirimUlangEmailSelamatDatang(u)}
									>
										<Icon name="message" size={16} />
										{resendUserId === u.id ? "Mengirim..." : "Kirim ulang email"}
									</button>
								</div>
								{#if u.id === adminId}
									<p class="mt-2 text-xs text-[#5f6b62]">Tidak bisa reset kata sandi sendiri</p>
								{/if}
								{#if userEmailResult[u.id]}
									<p class="mt-2 text-xs font-medium text-[#065f46]">{userEmailResult[u.id]}</p>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{:else if tab === "video"}
				<div class="card mt-4 space-y-3 p-4">
					<p class="text-sm font-semibold"><Icon name="video" size={16} /> Video per bab</p>
					<p class="text-xs text-[#5f6b62]">
						Video tampil di Ruang Belajar sebagai kartu "Tonton Video Pembelajaran". Video pendek
						(vertikal 9:16, ±60 detik) tampil sebagai kartu "Tonton Video Pendek". Kosongkan URL
						untuk menghapus video.
					</p>
					<div>
						<label class="lbl" for="v-produk">Pilih produk</label>
						<select id="v-produk" class="input" bind:value={videoProductId} onchange={pilihProdukVideo}>
							<option value="">— Pilih produk —</option>
							{#each products as p (p.id)}
								<option value={p.id}>{p.title}</option>
							{/each}
						</select>
					</div>
					{#if videoLoading}
						<p class="text-sm text-[#5f6b62]">Memuat bab...</p>
					{:else if videoChapters.length > 0}
						<div>
							<label class="lbl" for="v-bab">Pilih bab</label>
							<select id="v-bab" class="input" bind:value={videoChapterId} onchange={pilihBabVideo}>
								<option value="">— Pilih bab —</option>
								{#each videoChapters as c (c.id)}
									<option value={c.id}>
										{c.title}{c.video_url ? " (ada video)" : ""}{c.short_url ? " (ada video pendek)" : ""}
									</option>
								{/each}
							</select>
						</div>
					{/if}
					{#if videoChapterId}
						<div>
							<label class="lbl" for="v-url">URL video (YouTube/embed, http/https)</label>
							<input
								id="v-url"
								class="input"
								type="url"
								bind:value={videoUrl}
								placeholder="https://www.youtube.com/embed/..."
							/>
						</div>
						<div>
							<label class="lbl" for="v-dur">Durasi (contoh: 1 menit 17 detik)</label>
							<input id="v-dur" class="input" bind:value={videoDuration} placeholder="1 menit 17 detik" />
						</div>
						<div>
							<label class="lbl" for="v-short">URL video pendek (vertikal 9:16) — http/https atau path situs</label>
							<input
								id="v-short"
								class="input"
								type="text"
								bind:value={shortUrl}
								placeholder="/shorts/membilang-10.html"
							/>
							<p class="mt-1 text-xs text-[#5f6b62]">
								Video pendek bawaan: /shorts/membilang-10.html (Membilang) dan
								/shorts/penjumlahan-10.html (Penjumlahan).
							</p>
						</div>
						<div>
							<label class="lbl" for="v-short-dur">Durasi video pendek (contoh: 1 menit)</label>
							<input id="v-short-dur" class="input" bind:value={shortDuration} placeholder="1 menit" />
						</div>
						<button
							type="button"
							class="btn btn-primary"
							disabled={videoSaving}
							onclick={simpanVideo}
						>
							{#if videoSaving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan Video{/if}
						</button>
					{/if}
				</div>
			{:else if tab === "voucher"}
				<form
					class="card mt-4 space-y-3 p-4"
					onsubmit={(e) => {
						e.preventDefault();
						buatVoucher();
					}}
				>
					<p class="text-sm font-semibold"><Icon name="receipt" size={16} /> Buat voucher baru</p>
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label class="lbl" for="v-code">Kode voucher</label>
							<input
								id="v-code"
								class="input uppercase"
								bind:value={vForm.code}
								placeholder="Contoh: HEMAT10"
								required
							/>
						</div>
						<div>
							<label class="lbl" for="v-type">Tipe</label>
							<select id="v-type" class="input" bind:value={vForm.type}>
								<option value="percent">Persen (%)</option>
								<option value="fixed">Nominal (Rp)</option>
							</select>
						</div>
						<div>
							<label class="lbl" for="v-value">
								Nilai {vForm.type === "percent" ? "(%, 1–100)" : "(Rp)"}
							</label>
							<input
								id="v-value"
								class="input"
								type="number"
								min="1"
								max={vForm.type === "percent" ? 100 : undefined}
								bind:value={vForm.value}
								required
							/>
						</div>
						<div>
							<label class="lbl" for="v-max">Maks. pemakaian (opsional)</label>
							<input
								id="v-max"
								class="input"
								type="number"
								min="1"
								bind:value={vForm.max_uses}
								placeholder="Tanpa batas"
							/>
						</div>
						<div>
							<label class="lbl" for="v-min">Min. belanja Rp (opsional)</label>
							<input
								id="v-min"
								class="input"
								type="number"
								min="0"
								bind:value={vForm.min_total}
								placeholder="Tanpa minimum"
							/>
						</div>
						<div>
							<label class="lbl" for="v-exp">Kedaluwarsa (opsional)</label>
							<input id="v-exp" class="input" type="date" bind:value={vForm.expires_at} />
						</div>
					</div>
					{#if vError}
						<p class="err">{vError}</p>
					{/if}
					<button type="submit" class="btn btn-primary" disabled={vSaving}>
						{#if vSaving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan voucher{/if}
					</button>
				</form>

				{#if vouchersLoading}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if vouchers.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">Belum ada voucher</p>
				{:else}
					<div class="card mt-3 overflow-x-auto p-0">
						<table class="w-full min-w-[680px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2 font-semibold">Kode</th>
									<th class="px-3 py-2 font-semibold">Tipe</th>
									<th class="px-3 py-2 font-semibold">Nilai</th>
									<th class="px-3 py-2 font-semibold">Terpakai</th>
									<th class="px-3 py-2 font-semibold">Min. belanja</th>
									<th class="px-3 py-2 font-semibold">Kedaluwarsa</th>
									<th class="px-3 py-2 font-semibold">Status</th>
									<th class="px-3 py-2 font-semibold"></th>
								</tr>
							</thead>
							<tbody>
								{#each vouchers as v (v.code)}
									<tr class="border-b border-[#f0ede2] last:border-0">
										<td class="px-3 py-2 font-semibold tabular-nums">{v.code}</td>
										<td class="px-3 py-2">{v.type === "percent" ? "Persen" : "Nominal"}</td>
										<td class="px-3 py-2 font-medium tabular-nums">
											{v.type === "percent" ? `${v.value}%` : formatRupiah(v.value)}
										</td>
										<td class="px-3 py-2">{v.uses}{v.max_uses ? ` / ${v.max_uses}` : ""}</td>
										<td class="px-3 py-2">{v.min_total ? formatRupiah(v.min_total) : "-"}</td>
										<td class="px-3 py-2">{fmtDate(v.expires_at)}</td>
										<td class="px-3 py-2">
											{#if v.active}
												<span class="badge badge-leaf">Aktif</span>
											{:else}
												<span class="badge badge-gray">Nonaktif</span>
											{/if}
										</td>
										<td class="px-3 py-2 text-right">
											<button
												type="button"
												class="btn {v.active ? 'btn-ghost' : 'btn-leaf'} !px-3 !py-2 text-xs"
												disabled={vToggling === v.code}
												onclick={() => toggleVoucher(v)}
											>
												{v.active ? "Nonaktifkan" : "Aktifkan"}
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{:else if tab === "cron"}
				<div class="card mt-4 space-y-3 p-4">
					<p class="text-sm font-semibold"><Icon name="clock" size={16} /> Cron email</p>
					<p class="text-xs text-[#5f6b62]">
						Jalankan pengiriman email terjadwal secara manual. Pengingat harian dikirim ke orang tua
						anak yang belum belajar hari itu; laporan mingguan berisi ringkasan belajar 7 hari terakhir.
					</p>
					<div>
						<label class="lbl" for="cron-date">Tanggal (opsional, bila kosong memakai hari ini)</label>
						<input id="cron-date" class="input" type="date" bind:value={cronDate} />
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							class="btn btn-primary"
							disabled={cronRunning !== null}
							onclick={() => jalankanCron("daily")}
						>
							{#if cronRunning === "daily"}Menjalankan...{:else}<Icon name="refresh" size={16} /> Jalankan pengingat harian{/if}
						</button>
						<button
							type="button"
							class="btn btn-sun"
							disabled={cronRunning !== null}
							onclick={() => jalankanCron("weekly")}
						>
							{#if cronRunning === "weekly"}Menjalankan...{:else}<Icon name="refresh" size={16} /> Jalankan laporan mingguan{/if}
						</button>
					</div>
					{#if cronError}
						<p class="err">{cronError}</p>
					{/if}
					{#if cronResult}
						<div class="rounded-xl bg-[#f7f5ef] p-3 text-sm">
							<p class="font-semibold">
								Hasil: {cronResult.job === "daily" ? "Pengingat harian" : "Laporan mingguan"}
							</p>
							<p class="mt-1">
								Terkirim: <span class="font-medium tabular-nums">{cronResult.sent}</span> • Dilewati: <span class="font-medium tabular-nums">{cronResult.skipped}</span>
							</p>
							{#if cronResult.errors.length > 0}
								<p class="mt-2 font-semibold text-[#b91c1c]">Error ({cronResult.errors.length}):</p>
								<ul class="list-disc pl-5 text-[#b91c1c]">
									{#each cronResult.errors as err (err)}
										<li>{err}</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-1 text-[#065f46]">Selesai tanpa error</p>
							{/if}
						</div>
					{/if}
				</div>
			{:else if tab === "audit"}
				<form
					class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
					onsubmit={(e) => {
						e.preventDefault();
						cariAudit();
					}}
				>
					<select
						class="input sm:!w-64"
						bind:value={auditAction}
						aria-label="Filter aksi"
						onchange={() => loadAudit(1)}
					>
						{#each AUDIT_ACTIONS as a (a.value)}
							<option value={a.value}>{a.label}</option>
						{/each}
					</select>
					<div class="relative flex-1">
						<input
							class="input !pl-9"
							type="search"
							placeholder="Cari email admin"
							bind:value={auditQuery}
							aria-label="Cari email admin"
						/>
						<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6b62]"><Icon name="search" size={16} /></span>
					</div>
					<button type="submit" class="btn btn-primary">
						<Icon name="search" size={16} /> Cari
					</button>
					<button type="button" class="btn btn-ghost" disabled={auditLoading} onclick={() => loadAudit(auditPage)}>
						<Icon name="refresh" size={16} /> {auditLoading ? "Memuat..." : "Muat ulang"}
					</button>
				</form>
				<p class="mt-3 text-sm font-medium tabular-nums text-[#3f4a42]">
					Menampilkan {auditItems.length} dari {auditTotal} aktivitas
				</p>

				{#if auditLoading && !auditLoaded}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if auditError && !auditLoaded}
					<p class="err mt-4">{auditError}</p>
					<button type="button" class="btn btn-primary mt-3" onclick={() => loadAudit(1)}>Coba lagi</button>
				{:else if auditItems.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">
						{auditTotal === 0
							? "Belum ada aktivitas tercatat"
							: "Tidak ada aktivitas yang cocok dengan pencarian"}
					</p>
				{:else}
					{#if auditError}
						<p class="err mt-3">{auditError}</p>
					{/if}
					<!-- Tabel desktop -->
					<div class="card mt-3 hidden overflow-x-auto p-0 md:block">
						<table class="w-full min-w-[760px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2 font-semibold">Waktu</th>
									<th class="px-3 py-2 font-semibold">Admin</th>
									<th class="px-3 py-2 font-semibold">Aksi</th>
									<th class="px-3 py-2 font-semibold">Target</th>
									<th class="px-3 py-2 font-semibold">Detail</th>
								</tr>
							</thead>
							<tbody>
								{#each auditItems as a (a.id)}
									<tr class="border-b border-[#f0ede2] align-top last:border-0">
										<td class="whitespace-nowrap px-3 py-2">{formatTanggal(a.created_at)}</td>
										<td class="break-all px-3 py-2 font-semibold">{a.admin_email}</td>
										<td class="px-3 py-2">
											<span class="badge badge-brand">{labelAksi(a.action)}</span>
										</td>
										<td class="break-all px-3 py-2">{a.target ?? "-"}</td>
										<td class="break-words px-3 py-2">{a.detail ?? "-"}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<!-- Kartu mobile -->
					<div class="mt-3 space-y-2 md:hidden">
						{#each auditItems as a (a.id)}
							<article class="card p-3">
								<div class="flex items-start justify-between gap-2">
									<span class="badge badge-brand">{labelAksi(a.action)}</span>
									<span class="shrink-0 text-xs text-[#5f6b62]">{formatTanggal(a.created_at)}</span>
								</div>
								<p class="mt-2 break-all text-xs font-medium">{a.admin_email}</p>
								{#if a.target}
									<p class="mt-0.5 break-all text-xs text-[#5f6b62]">Target: {a.target}</p>
								{/if}
								{#if a.detail}
									<p class="mt-0.5 break-words text-xs text-[#5f6b62]">{a.detail}</p>
								{/if}
							</article>
						{/each}
					</div>
					<div class="mt-4 flex items-center justify-between gap-2">
						<button
							type="button"
							class="btn btn-ghost !px-3 !py-2 text-xs"
							disabled={auditPage <= 1 || auditLoading}
							onclick={() => loadAudit(auditPage - 1)}
						>
							<Icon name="chevron-left" size={16} /> Sebelumnya
						</button>
						<p class="text-sm font-medium tabular-nums text-[#3f4a42]">Halaman {auditPage} dari {auditPages}</p>
						<button
							type="button"
							class="btn btn-ghost !px-3 !py-2 text-xs"
							disabled={auditPage >= auditPages || auditLoading}
							onclick={() => loadAudit(auditPage + 1)}
						>
							Berikutnya <Icon name="chevron-right" size={16} />
						</button>
					</div>
				{/if}
			{:else if tab === "pengumuman"}
				<div class="card mt-4 space-y-3 p-4">
					<p class="text-sm font-semibold"><Icon name="sparkles" size={16} /> Pengumuman & promo beranda</p>
					<p class="text-xs text-[#5f6b62]">
						Pengumuman tampil sebagai banner di atas carousel Beranda. Teks promo menggantikan teks
						slide ke-3 carousel ("Paket SAS…") bila diaktifkan.
					</p>
					{#if settingsLoading && !settingsLoaded}
						<p class="text-sm text-[#5f6b62]">Memuat...</p>
					{:else}
						<div>
							<label class="lbl" for="ann-text">Teks pengumuman (maks. 500 karakter)</label>
							<textarea
								id="ann-text"
								class="input"
								rows="3"
								maxlength="500"
								bind:value={annText}
								placeholder="Contoh: Promo akhir tahun — semua paket SAS diskon 10% sampai 31 Desember."
							></textarea>
							<p class="mt-1 text-right text-xs text-[#5f6b62]">{annText.length}/500 karakter</p>
							<label class="mt-1 flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#3f4a42]">
								<input type="checkbox" class="h-4 w-4 accent-[#177245]" bind:checked={annEnabled} />
								Tampilkan pengumuman
							</label>
						</div>
						<div>
							<label class="lbl" for="promo-text">Teks promo slide ke-3 carousel (maks. 500 karakter)</label>
							<textarea
								id="promo-text"
								class="input"
								rows="3"
								maxlength="500"
								bind:value={promoText}
								placeholder="Contoh: Paket SAS Kelas 1–6 kini Rp15 ribu — beli sekali, langsung bisa dipakai latihan."
							></textarea>
							<p class="mt-1 text-right text-xs text-[#5f6b62]">{promoText.length}/500 karakter</p>
							<label class="mt-1 flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#3f4a42]">
								<input type="checkbox" class="h-4 w-4 accent-[#177245]" bind:checked={promoEnabled} />
								Pakai teks promo
							</label>
						</div>
						{#if settingsError}
							<p class="err">{settingsError}</p>
						{/if}
						<div class="flex flex-wrap gap-2">
							<button type="button" class="btn btn-primary" disabled={settingsSaving} onclick={simpanSettings}>
								{#if settingsSaving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan{/if}
							</button>
							<button type="button" class="btn btn-ghost" disabled={settingsLoading} onclick={loadSettings}>
								<Icon name="refresh" size={16} /> Muat ulang
							</button>
						</div>
					{/if}
				</div>
			{:else if tab === "tryout"}
				<form
					class="card mt-4 space-y-3 p-4"
					onsubmit={(e) => {
						e.preventDefault();
						buatTryout();
					}}
				>
					<p class="text-sm font-semibold"><Icon name="trophy" size={16} /> Jadwalkan tryout baru</p>
					<p class="text-xs text-[#5f6b62]">
						Soal dipilih otomatis dari bank simulasi kelas itu (lintas mapel, {tForm.question_count} soal) dan
						disimpan saat tryout dibuat — semua peserta mengerjakan soal yang sama. Tryout pertama tiap
						kelas sebaiknya dibuat gratis agar semua akun login bisa ikut. Waktu diisi dalam WIB.
					</p>
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label class="lbl" for="t-grade">Kelas</label>
							<select id="t-grade" class="input" bind:value={tForm.grade}>
								{#each [1, 2, 3, 4, 5, 6] as g (g)}
									<option value={g}>Kelas {g}</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="lbl" for="t-durasi">Durasi (menit)</label>
							<input id="t-durasi" class="input" type="number" min="10" max="180" bind:value={tForm.duration_minutes} required />
						</div>
						<div class="col-span-2">
							<label class="lbl" for="t-judul">Judul tryout</label>
							<input id="t-judul" class="input" maxlength="120" bind:value={tForm.title} placeholder="Contoh: Tryout Akbar Kelas 1 — November" required />
						</div>
						<div>
							<label class="lbl" for="t-mulai">Mulai (tanggal + jam WIB)</label>
							<input id="t-mulai" class="input" type="datetime-local" bind:value={tForm.starts_at} required />
						</div>
						<div>
							<label class="lbl" for="t-selesai">Selesai (tanggal + jam WIB)</label>
							<input id="t-selesai" class="input" type="datetime-local" bind:value={tForm.ends_at} required />
						</div>
						<div>
							<label class="lbl" for="t-jumlah">Jumlah soal (5–50)</label>
							<input id="t-jumlah" class="input" type="number" min="5" max="50" bind:value={tForm.question_count} required />
						</div>
						<div class="flex items-end pb-2">
							<label class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#3f4a42]">
								<input type="checkbox" class="h-4 w-4 accent-[#177245]" bind:checked={tForm.is_free} />
								Gratis — semua akun login boleh ikut
							</label>
						</div>
					</div>
					{#if tryoutError}
						<p class="err">{tryoutError}</p>
					{/if}
					<button type="submit" class="btn btn-primary" disabled={tSaving}>
						{#if tSaving}Membuat...{:else}<Icon name="plus" size={16} /> Buat tryout{/if}
					</button>
				</form>
				<div class="card mt-4 p-4">
					<div class="flex items-center justify-between gap-2">
						<p class="text-sm font-semibold">Daftar tryout</p>
						<button type="button" class="btn btn-ghost !px-3 !py-2 text-xs" disabled={tryoutsLoading} onclick={loadTryouts}>
							<Icon name="refresh" size={16} /> Muat ulang
						</button>
					</div>
					{#if tryoutsLoading && adminTryouts.length === 0}
						<p class="mt-2 text-sm text-[#5f6b62]">Memuat...</p>
					{:else if adminTryouts.length === 0}
						<p class="mt-2 text-sm text-[#5f6b62]">Belum ada tryout</p>
					{:else}
						<div class="mt-3 space-y-2">
							{#each adminTryouts as t (t.id)}
								<div class="card !rounded-lg p-3 text-sm">
									<p class="flex flex-wrap items-center gap-2">
										<span class="badge {t.phase === 'live' ? 'badge-leaf' : t.phase === 'upcoming' ? 'badge-sun' : 'badge-gray'}">
											{t.phase === "live" ? "Berlangsung" : t.phase === "upcoming" ? "Mendatang" : "Selesai"}
										</span>
										{#if t.is_free}<span class="badge badge-leaf">Gratis</span>{/if}
										<span class="font-semibold">{t.title}</span>
									</p>
									<p class="mt-1 text-xs text-[#5f6b62]">
										Kelas {t.grade} • {t.question_ids_count} soal • {t.duration_minutes} menit • {t.participants} peserta • {t.submissions} sudah mengerjakan
									</p>
									<p class="mt-0.5 text-xs text-[#5f6b62]">
										{formatTanggal(t.starts_at)} — {formatTanggal(t.ends_at)}
									</p>
									<div class="mt-2 flex gap-2">
										<a href="/tryout/{t.id}" class="btn btn-outline text-xs">Lihat halaman</a>
										{#if t.phase === "upcoming"}
											<button
												type="button"
												class="btn btn-ghost text-xs !text-[#b91c1c]"
												disabled={tDeletingId === t.id}
												onclick={() => hapusTryout(t)}
											>
												<Icon name="trash" size={16} /> Hapus
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if tab === "tanya-jawab"}
				<div class="card mt-4 p-4">
					<p class="text-sm font-semibold"><Icon name="message" size={16} /> Moderasi tanya jawab per bab</p>
					<p class="mt-1 text-xs text-[#5f6b62]">
						Pertanyaan baru masuk sebagai "Menunggu Moderasi" dan tidak tampil ke anak lain sampai disetujui.
						Setujui dulu, lalu isi jawaban — jawaban tampil di halaman bab bersama pertanyaan.
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each QA_FILTERS as f (f.id)}
							<button
								type="button"
								class="chip"
								class:active={qaFilter === f.id}
								onclick={() => {
									qaFilter = f.id;
									loadQa();
								}}
							>
								{f.label}
							</button>
						{/each}
						<button type="button" class="btn btn-ghost !px-3 !py-2 text-xs" disabled={qaLoading} onclick={loadQa}>
							<Icon name="refresh" size={16} /> Muat ulang
						</button>
					</div>
					{#if qaError}
						<p class="err mt-3">{qaError}</p>
					{/if}
					{#if qaLoading && adminQa.length === 0}
						<p class="mt-3 text-sm text-[#5f6b62]">Memuat...</p>
					{:else if adminQa.length === 0}
						<p class="mt-3 text-sm text-[#5f6b62]">Tidak ada pertanyaan untuk filter ini</p>
					{:else}
						<div class="mt-3 space-y-3">
							{#each adminQa as q (q.id)}
								<div class="card !rounded-lg p-3 text-sm">
									<p class="flex flex-wrap items-center gap-2 text-xs">
										<span class={qaBadgeAdmin(q.status)}>{q.status_label}</span>
										<span class="font-medium text-[#5f6b62]">{q.chapter_title}</span>
										<span class="text-[#5f6b62]">• {q.asker_name} • {formatTanggal(q.created_at)}</span>
									</p>
									<p class="mt-2 font-medium leading-relaxed">{q.question}</p>
									<div class="mt-2">
										<label class="lbl" for={`qa-jawab-${q.id}`}>Jawaban admin (maks. 1000 karakter)</label>
										<textarea
											id={`qa-jawab-${q.id}`}
											class="input"
											rows="2"
											maxlength="1000"
											value={qaAnswers[q.id] ?? ""}
											oninput={(e) => {
												qaAnswers = { ...qaAnswers, [q.id]: e.currentTarget.value };
											}}
											placeholder="Tulis jawaban yang jelas dan ramah anak"
										></textarea>
									</div>
									<div class="mt-2 flex flex-wrap gap-2">
										{#if q.status === "pending"}
											<button
												type="button"
												class="btn btn-leaf text-xs"
												disabled={qaBusyId === q.id}
												onclick={() => qaAksi(q, "approve")}
											>
												<Icon name="check" size={16} /> Setujui
											</button>
										{/if}
										{#if q.status === "pending" || q.status === "approved"}
											<button
												type="button"
												class="btn btn-ghost text-xs"
												disabled={qaBusyId === q.id}
												onclick={() => qaAksi(q, "reject")}
											>
												<Icon name="x" size={16} /> Tolak
											</button>
										{/if}
										{#if q.status !== "rejected"}
											<button
												type="button"
												class="btn btn-primary text-xs"
												disabled={qaBusyId === q.id || !(qaAnswers[q.id] ?? "").trim()}
												onclick={() => qaJawab(q)}
											>
												<Icon name="save" size={16} /> {q.status === "answered" ? "Perbarui jawaban" : "Simpan jawaban"}
											</button>
										{/if}
										<button
											type="button"
											class="btn btn-ghost text-xs !text-[#b91c1c]"
											disabled={qaBusyId === q.id}
											onclick={() => qaAksi(q, "delete")}
										>
											<Icon name="trash" size={16} /> Hapus
										</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if tab === "tanggal-sas"}
				<div class="card mt-4 space-y-3 p-4">
					<p class="text-sm font-semibold"><Icon name="calendar" size={16} /> Tanggal SAS per kelas</p>
					<p class="text-xs text-[#5f6b62]">
						Tanggal SAS tampil sebagai hitung mundur di Beranda dan Akun. Kosongkan tanggal lalu
						Simpan, atau pakai Hapus Tanggal, bila tanggal belum ditentukan — siswa melihat
						"Tanggal SAS belum diatur".
					</p>
					{#if examDatesLoading && !examDatesLoaded}
						<p class="text-sm text-[#5f6b62]">Memuat...</p>
					{:else}
						<div class="space-y-3">
							{#each [1, 2, 3, 4, 5, 6] as g (g)}
								<div class="card !rounded-lg p-3">
									<p class="text-sm font-semibold">Kelas {g}</p>
									<div class="mt-2 grid grid-cols-2 gap-2">
										<div>
											<label class="lbl" for={`sas-tanggal-${g}`}>Tanggal SAS</label>
											<input
												id={`sas-tanggal-${g}`}
												class="input"
												type="date"
												value={examDraftFor(g).date}
												oninput={(e) => setExamDraft(g, { date: e.currentTarget.value })}
											/>
										</div>
										<div>
											<label class="lbl" for={`sas-label-${g}`}>Label (opsional)</label>
											<input
												id={`sas-label-${g}`}
												class="input"
												maxlength="120"
												value={examDraftFor(g).label}
												oninput={(e) => setExamDraft(g, { label: e.currentTarget.value })}
												placeholder="Contoh: SAS semester 1"
											/>
										</div>
									</div>
									<p class="mt-2 text-xs font-medium tabular-nums text-[#177245]">{sasCountdown(g)}</p>
									<div class="mt-2 flex flex-wrap gap-2">
										<button
											type="button"
											class="btn btn-primary text-xs"
											disabled={examSavingGrade === g}
											onclick={() => simpanTanggalSas(g)}
										>
											{#if examSavingGrade === g}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan{/if}
										</button>
										<button
											type="button"
											class="btn btn-ghost text-xs !text-[#b91c1c]"
											disabled={examSavingGrade === g}
											onclick={() => hapusTanggalSas(g)}
										>
											<Icon name="trash" size={16} /> Hapus Tanggal
										</button>
									</div>
								</div>
							{/each}
						</div>
						<button
							type="button"
							class="btn btn-ghost text-xs"
							disabled={examDatesLoading}
							onclick={loadExamDates}
						>
							<Icon name="refresh" size={16} /> Muat ulang
						</button>
					{/if}
				</div>
			{:else if tab === "donasi"}
				<div class="card mt-4 p-4">
					<p class="flex items-center gap-2 text-sm font-semibold">
						<Icon name="thumbs-up" size={18} /> Pool donasi — beli 1, donasi 1
					</p>
					<p class="mt-1 text-xs text-[#5f6b62]">
						Setiap donasi adalah 1 akses produk dari pembeli yang memilih "Beli 1, donasi 1".
						Tetapkan email penerima supaya aksesnya masuk ke akun anak yang membutuhkan.
					</p>
					<div class="mt-3 flex items-center justify-between gap-2">
						<p class="text-sm font-medium tabular-nums text-[#3f4a42]">
							{donations.filter((d) => d.status === "available").length} tersedia di pool
							• {donations.length} donasi total
						</p>
						<button
							type="button"
							class="btn btn-ghost !px-3 !py-2 text-xs"
							disabled={donationsLoading}
							onclick={loadDonations}
						>
							<Icon name="refresh" size={16} /> {donationsLoading ? "Memuat..." : "Muat ulang"}
						</button>
					</div>
				</div>
				{#if donationsLoading && !donationsLoaded}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if donationsError && !donationsLoaded}
					<p class="err mt-4">{donationsError}</p>
					<button type="button" class="btn btn-primary mt-3" onclick={loadDonations}>Coba lagi</button>
				{:else if donations.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">Belum ada donasi di pool</p>
				{:else}
					{#if donationsError}
						<p class="err mt-4">{donationsError}</p>
					{/if}
					<div class="card mt-3 overflow-x-auto p-0">
						<table class="w-full min-w-[760px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2 font-semibold">Produk</th>
									<th class="px-3 py-2 font-semibold">Pendonor</th>
									<th class="px-3 py-2 font-semibold">Jumlah</th>
									<th class="px-3 py-2 font-semibold">Status</th>
									<th class="px-3 py-2 font-semibold">Penerima</th>
									<th class="px-3 py-2 font-semibold">Tanggal</th>
									<th class="px-3 py-2 font-semibold">Tetapkan penerima</th>
								</tr>
							</thead>
							<tbody>
								{#each donations as d (d.id)}
									<tr class="border-b border-[#f0ede2] align-top last:border-0">
										<td class="px-3 py-2">
											<p class="font-semibold">{d.product_title}</p>
											<p class="text-[#5f6b62]">Order {d.order_id}</p>
										</td>
										<td class="px-3 py-2">
											<p class="font-medium">{d.donor_name ?? "-"}</p>
											<p class="text-[#5f6b62]">{d.donor_email ?? "-"}</p>
										</td>
										<td class="px-3 py-2 font-medium tabular-nums">{formatRupiah(d.amount)}</td>
										<td class="px-3 py-2">
											<span class={badgeDonasi(d.status)}>{labelStatusDonasi(d.status)}</span>
										</td>
										<td class="px-3 py-2">
											{#if d.recipient_email}
												<p class="font-medium">{d.recipient_name ?? "-"}</p>
												<p class="text-[#5f6b62]">{d.recipient_email}</p>
												{#if d.assigned_at}
													<p class="text-[#5f6b62]">{formatTanggal(d.assigned_at)}</p>
												{/if}
											{:else}
												-
											{/if}
										</td>
										<td class="px-3 py-2">{formatTanggal(d.created_at)}</td>
										<td class="px-3 py-2">
											{#if d.status === "available"}
												<div class="flex min-w-52 gap-2">
													<input
														class="input !px-2 !py-2 text-xs"
														type="email"
														placeholder="email@penerima.id"
														aria-label={`Email penerima untuk donasi ${d.product_title}`}
														value={assignEmails[d.id] ?? ""}
														oninput={(e) => {
															assignEmails = {
																...assignEmails,
																[d.id]: e.currentTarget.value
															};
														}}
														onkeydown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																tetapkanDonasi(d);
															}
														}}
													/>
													<button
														type="button"
														class="btn btn-primary shrink-0 !px-3 !py-2 text-xs"
														disabled={assigningId === d.id}
														onclick={() => tetapkanDonasi(d)}
													>
														{assigningId === d.id ? "Menyimpan..." : "Tetapkan"}
													</button>
												</div>
												{#if assignErrors[d.id]}
													<p class="err mt-1">{assignErrors[d.id]}</p>
												{/if}
											{:else}
												<span class="text-[#5f6b62]">Sudah ditetapkan</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Modal konfirmasi hapus produk: tidak memakai dialog browser agar aman pada Browser Locker. -->
	{#if productToDelete}
		<div class="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-product-title" aria-describedby="delete-product-description">
			<button
				type="button"
				aria-label="Batal hapus produk"
				class="absolute inset-0 bg-black/50"
				disabled={productDeleting}
				onclick={batalHapusProduk}
			></button>
			<div class="relative w-full max-w-md space-y-4 rounded-t-2xl bg-[#fffdf7] p-5 shadow-[0_12px_36px_rgb(0_0_0/0.18)] sm:rounded-2xl">
				<div class="flex items-start gap-3">
					<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
						<Icon name="trash" size={19} />
					</div>
					<div class="min-w-0">
						<h2 id="delete-product-title" class="font-semibold text-[#1e2821]">Hapus produk?</h2>
						<p id="delete-product-description" class="mt-1 text-sm leading-6 text-[#5f6b62]">
							Anda akan menghapus <span class="font-semibold text-[#1e2821]">{productToDelete.title}</span>. Produk, gambar, bab, dan relasi bundelnya akan dihapus. Riwayat order lama tetap tersimpan.
						</p>
					</div>
				</div>
				{#if productDeleteError}
					<p class="err">{productDeleteError}</p>
				{/if}
				<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button type="button" class="btn btn-ghost" disabled={productDeleting} onclick={batalHapusProduk}>Batal</button>
					<button type="button" class="btn btn-danger" disabled={productDeleting} onclick={konfirmasiHapusProduk}>
						{#if productDeleting}Menghapus...{:else}<Icon name="trash" size={16} /> Ya, hapus produk{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Modal form tambah/edit produk -->
	{#if editId}
		<div class="admin-modal fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-label={editId === "baru" ? "Produk baru" : "Edit produk"}>
			<button
				type="button"
				aria-label="Tutup form produk"
				class="absolute inset-0 bg-black/40"
				onclick={() => (editId = null)}
			></button>
			<form
				class="relative max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl bg-[#fffdf7] p-4 shadow-[0_8px_24px_rgb(0_0_0/0.06)] sm:rounded-2xl"
				onsubmit={(e) => {
					e.preventDefault();
					simpanProduk();
				}}
			>
				<div class="flex items-center justify-between gap-2">
					<p class="flex items-center gap-2 font-semibold">{editId === "baru" ? "Produk baru" : "Edit produk"}</p>
					<button
						type="button"
						aria-label="Tutup form produk"
						class="btn btn-ghost !px-2 !py-2"
						onclick={() => (editId = null)}
					>
						<Icon name="x" size={18} />
					</button>
				</div>
				<div>
					<label class="lbl" for="f-title">Judul</label>
					<input id="f-title" class="input" bind:value={form.title} required />
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="lbl" for="f-jenjang">Jenjang</label>
						<input id="f-jenjang" class="input" bind:value={form.jenjang} required />
					</div>
					<div>
						<label class="lbl" for="f-mapel">Mapel</label>
						<input id="f-mapel" class="input" bind:value={form.mapel} required />
					</div>
					<div>
						<label class="lbl" for="f-price">Harga (Rp)</label>
						<input id="f-price" class="input" type="number" min="0" bind:value={form.price} required />
					</div>
					<div>
						<label class="lbl" for="f-disc">Harga coret (Rp, opsional)</label>
						<input id="f-disc" class="input" type="number" min="0" bind:value={form.strikethrough_price} />
					</div>
					<div>
						<label class="lbl" for="f-pages">Halaman</label>
						<input id="f-pages" class="input" type="number" min="0" bind:value={form.pages} />
					</div>
					<div>
						<label class="lbl" for="f-cat">Kategori</label>
						<input id="f-cat" class="input" bind:value={form.category} />
					</div>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div>
						<label class="lbl" for="f-label">Label cover</label>
						<input id="f-label" class="input" bind:value={form.cover_label} />
					</div>
					<div>
						<label class="lbl" for="f-color">Warna cover</label>
						<input id="f-color" class="input" type="color" bind:value={form.cover_color} />
					</div>
				</div>
				<div>
					<label class="lbl" for="f-badge">Badge (opsional)</label>
					<input id="f-badge" class="input" bind:value={form.badge} placeholder="Contoh: Terlaris" />
				</div>
				<div>
					<label class="lbl" for="f-desc">Deskripsi</label>
					<textarea id="f-desc" class="input" rows="2" bind:value={form.description}></textarea>
				</div>
				<div>
					<label class="lbl" for="f-ext">Link eksternal (opsional, http/https)</label>
					<input id="f-ext" class="input" type="url" bind:value={form.external_url} placeholder="https://..." />
				</div>
				{#if formError}
					<p class="err">{formError}</p>
				{/if}
				<div class="flex gap-2">
					<button type="submit" class="btn btn-primary flex-1" disabled={formSaving}>
						{#if formSaving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan{/if}
					</button>
					<button type="button" class="btn btn-ghost" onclick={() => (editId = null)}>Batal</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Modal detail order -->
	{#if orderDetailLoading || orderDetail || orderDetailError}
		<div class="admin-modal fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-label="Detail order">
			<button
				type="button"
				aria-label="Tutup detail order"
				class="absolute inset-0 bg-black/40"
				onclick={() => {
					orderDetail = null;
					orderDetailError = "";
					resendOrderStatus = "";
				}}
			></button>
			<div class="relative max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl bg-[#fffdf7] p-4 shadow-[0_8px_24px_rgb(0_0_0/0.06)] sm:rounded-2xl">
				<div class="flex items-center justify-between gap-2">
					<p class="font-semibold">Detail order</p>
					<button
						type="button"
						aria-label="Tutup detail order"
						class="btn btn-ghost !px-2 !py-2"
						onclick={() => {
							orderDetail = null;
							orderDetailError = "";
							resendOrderStatus = "";
						}}
					>
						<Icon name="x" size={18} />
					</button>
				</div>
				{#if orderDetailLoading}
					<p class="text-sm font-semibold text-[#5f6b62]">Memuat detail order...</p>
				{:else if orderDetailError}
					<p class="err">{orderDetailError}</p>
				{:else if orderDetail}
					<div class="flex flex-wrap items-center gap-2">
						<p class="text-sm font-semibold tabular-nums">{orderDetail.id}</p>
						<span class={statusBadge(orderDetail.status)}>{orderDetail.status}</span>
					</div>
					<dl class="space-y-2 text-sm">
						<div class="flex justify-between gap-3">
							<dt class="text-[#5f6b62]">Pembeli</dt>
							<dd class="text-right font-medium">{orderDetail.buyer_name ?? "-"}</dd>
						</div>
						<div class="flex justify-between gap-3">
							<dt class="text-[#5f6b62]">Email</dt>
							<dd class="text-right font-medium">{orderDetail.buyer_email ?? "-"}</dd>
						</div>
						<div class="flex justify-between gap-3">
							<dt class="text-[#5f6b62]">WhatsApp</dt>
							<dd class="text-right font-medium">{orderDetail.whatsapp ?? "-"}</dd>
						</div>
						<div class="flex justify-between gap-3">
							<dt class="text-[#5f6b62]">Dibuat</dt>
							<dd class="text-right font-medium">{formatTanggal(orderDetail.created_at)}</dd>
						</div>
						<div class="flex justify-between gap-3">
							<dt class="text-[#5f6b62]">Dibayar</dt>
							<dd class="text-right font-medium">{formatTanggal(orderDetail.paid_at)}</dd>
						</div>
						<div class="flex justify-between gap-3">
							<dt class="text-[#5f6b62]">Kedaluwarsa</dt>
							<dd class="text-right font-medium">{formatTanggal(orderDetail.expired_at)}</dd>
						</div>
						{#if orderDetail.klikqris_order_id}
							<div class="flex justify-between gap-3">
								<dt class="text-[#5f6b62]">No. KlikQRIS</dt>
								<dd class="text-right font-medium">{orderDetail.klikqris_order_id}</dd>
							</div>
						{/if}
					</dl>
					<div class="border-t border-[#e7e2d2] pt-3">
						<p class="text-sm font-semibold">Item</p>
						<ul class="mt-2 space-y-2">
							{#each orderDetail.items as item (item.product_id)}
								<li class="flex items-start justify-between gap-3 text-sm">
									<span>
										{item.title}
										{#if item.included_in_bundle}
											<span class="badge badge-brand ml-1">Bundel</span>
										{/if}
									</span>
									<span class="shrink-0 font-medium tabular-nums">{formatRupiah(item.price)}</span>
								</li>
							{/each}
						</ul>
					</div>
					<dl class="space-y-2 border-t border-[#e7e2d2] pt-3 text-sm">
						{#if orderDetail.voucher_code}
							<div class="flex justify-between gap-3">
								<dt class="text-[#5f6b62]">Voucher ({orderDetail.voucher_code})</dt>
								<dd class="text-right font-medium">−{formatRupiah(orderDetail.discount_amount || 0)}</dd>
							</div>
						{/if}
						{#if orderDetail.total_amount != null && orderDetail.total_amount !== orderDetail.total}
							<div class="flex justify-between gap-3">
								<dt class="text-[#5f6b62]">Kode unik</dt>
								<dd class="text-right font-medium">{formatRupiah(orderDetail.total_amount - orderDetail.total)}</dd>
							</div>
						{/if}
						<div class="flex justify-between gap-3 text-base">
							<dt class="font-semibold">Total</dt>
							<dd class="font-semibold tabular-nums text-[#177245]">{formatRupiah(orderDetail.total)}</dd>
						</div>
						{#if orderDetail.total_amount != null}
							<div class="flex justify-between gap-3">
								<dt class="text-[#5f6b62]">Total dibayar (dengan kode unik)</dt>
								<dd class="text-right font-medium">{formatRupiah(orderDetail.total_amount)}</dd>
							</div>
						{/if}
					</dl>
					<div class="border-t border-[#e7e2d2] pt-3">
						<button
							type="button"
							class="btn btn-primary w-full"
							disabled={resendingOrder}
							onclick={kirimUlangEmailOrder}
						>
							{#if resendingOrder}
								Mengirim...
							{:else}
								<Icon name="message" size={16} /> {labelKirimUlangOrder(orderDetail.status)}
							{/if}
						</button>
						{#if resendOrderStatus}
							<p class="ok-msg mt-2">{resendOrderStatus}</p>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Modal reset kata sandi -->
	{#if resetUser}
		<div class="admin-modal fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-label="Reset kata sandi">
			<button
				type="button"
				aria-label="Tutup reset kata sandi"
				class="absolute inset-0 bg-black/40"
				onclick={() => {
					resetUser = null;
					resetPw = "";
					resetPw2 = "";
					resetError = "";
				}}
			></button>
			<form
				class="relative max-h-[92dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-2xl bg-[#fffdf7] p-4 shadow-[0_8px_24px_rgb(0_0_0/0.06)] sm:rounded-2xl"
				onsubmit={(e) => {
					e.preventDefault();
					simpanResetPassword();
				}}
			>
				<div class="flex items-center justify-between gap-2">
					<p class="flex items-center gap-2 font-semibold"><Icon name="lock" size={18} /> Reset kata sandi</p>
					<button
						type="button"
						aria-label="Tutup reset kata sandi"
						class="btn btn-ghost !px-2 !py-2"
						onclick={() => {
							resetUser = null;
							resetPw = "";
							resetPw2 = "";
							resetError = "";
						}}
					>
						<Icon name="x" size={18} />
					</button>
				</div>
				<p class="text-sm text-[#5f6b62]">
					Kata sandi baru untuk <span class="font-medium">{resetUser.name}</span> ({resetUser.email}). Kata sandi tidak pernah
					ditampilkan kembali.
				</p>
				<div>
					<label class="lbl" for="reset-pw">Kata sandi baru (min. 8 karakter)</label>
					<input
						id="reset-pw"
						class="input"
						type="password"
						autocomplete="new-password"
						minlength="8"
						bind:value={resetPw}
						required
					/>
				</div>
				<div>
					<label class="lbl" for="reset-pw2">Konfirmasi kata sandi baru</label>
					<input
						id="reset-pw2"
						class="input"
						type="password"
						autocomplete="new-password"
						minlength="8"
						bind:value={resetPw2}
						required
					/>
				</div>
				{#if resetError}
					<p class="err">{resetError}</p>
				{/if}
				<div class="flex gap-2">
					<button type="submit" class="btn btn-primary flex-1" disabled={resetSaving}>
						{#if resetSaving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan kata sandi{/if}
					</button>
					<button
						type="button"
						class="btn btn-ghost"
						onclick={() => {
							resetUser = null;
							resetPw = "";
							resetPw2 = "";
							resetError = "";
						}}
					>
						Batal
					</button>
				</div>
			</form>
		</div>
	{/if}
{/if}
