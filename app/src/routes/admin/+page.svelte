<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		formatRupiah,
		formatTanggal,
		getToken,
		type ChapterMeta,
		type Product,
		type User
	} from "$lib/api";
	import { auth } from "$lib/store";

	type Tab = "ringkasan" | "produk" | "pengguna" | "video" | "voucher" | "cron";
	let tab = $state<Tab>("ringkasan");
	let isAdmin = $state(false);
	let checking = $state(true);
	let error = $state("");
	let notice = $state("");
	let adminName = $state("");
	let drawerOpen = $state(false);

	const MENU: { id: Tab; label: string; icon: string }[] = [
		{ id: "ringkasan", label: "Ringkasan", icon: "chart" },
		{ id: "produk", label: "Produk", icon: "package" },
		{ id: "voucher", label: "Voucher", icon: "receipt" },
		{ id: "pengguna", label: "Pengguna", icon: "users" },
		{ id: "video", label: "Video per Bab", icon: "video" },
		{ id: "cron", label: "Email & Cron", icon: "clock" }
	];

	const TAB_TITLE: Record<Tab, string> = {
		ringkasan: "Ringkasan",
		produk: "Produk",
		voucher: "Voucher",
		pengguna: "Pengguna & Role",
		video: "Video per Bab",
		cron: "Email & Cron"
	};

	function navClass(t: Tab): string {
		const base =
			"flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold";
		return tab === t
			? `${base} bg-[#177245] text-white`
			: `${base} text-[#3f4a42] hover:bg-[#ece9dc]`;
	}

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

	// ---- Cron Email ----
	let cronDate = $state("");
	let cronRunning = $state<"daily" | "weekly" | null>(null);
	let cronResult = $state<{ job: string; sent: number; skipped: number; errors: string[] } | null>(
		null
	);
	let cronError = $state("");

	/** Tanggal saja (tanpa jam) untuk kolom kedaluwarsa voucher. */
	function fmtDate(iso: string | null): string {
		if (!iso) return "-";
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
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
				error = "Halaman ini hanya untuk admin.";
			} else {
				isAdmin = true;
				adminName = user.name;
				await loadProducts();
				await loadStats();
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memeriksa hak akses.";
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
			error = e instanceof Error ? e.message : "Gagal memuat produk.";
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
			error = e instanceof Error ? e.message : "Gagal memuat pengguna.";
		} finally {
			usersLoading = false;
		}
	}

	function switchTab(t: Tab) {
		tab = t;
		notice = "";
		drawerOpen = false;
		if (t === "pengguna" && users.length === 0) loadUsers();
		if (t === "voucher" && vouchers.length === 0) loadVouchers();
		if (t === "ringkasan" && !stats && !statsLoading) loadStats();
	}

	async function loadVouchers() {
		vouchersLoading = true;
		try {
			const data = await api<{ vouchers: Voucher[] }>("/api/admin/vouchers");
			vouchers = data.vouchers ?? [];
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal memuat voucher.";
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
			notice = `Voucher ${data.voucher.code} dibuat.`;
			vForm = { code: "", type: "percent", value: 0, max_uses: "", min_total: "", expires_at: "" };
		} catch (e) {
			vError = e instanceof Error ? e.message : "Gagal membuat voucher.";
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
			notice = `Voucher ${v.code} ${data.voucher.active ? "diaktifkan" : "dinonaktifkan"}.`;
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengubah status voucher.";
		} finally {
			vToggling = null;
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
			cronError = e instanceof Error ? e.message : "Gagal menjalankan cron.";
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
				notice = "Produk baru ditambahkan.";
			} else {
				const data = await api<{ product: Product }>(`/api/admin/products/${editId}`, {
					method: "PUT",
					body: JSON.stringify(body)
				});
				products = products.map((p) => (p.id === editId ? data.product : p));
				notice = "Produk diperbarui.";
			}
			editId = null;
		} catch (e) {
			formError = e instanceof Error ? e.message : "Gagal menyimpan produk.";
		} finally {
			formSaving = false;
		}
	}

	async function hapusProduk(id: string, title: string) {
		if (!confirm(`Hapus produk "${title}"? Tindakan ini tidak bisa dibatalkan.`)) return;
		try {
			await api(`/api/admin/products/${id}`, { method: "DELETE" });
			products = products.filter((p) => p.id !== id);
			notice = "Produk dihapus.";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menghapus produk.";
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
			notice = e instanceof Error ? e.message : "Gagal mengubah status tampil.";
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
			notice = url ? "Link eksternal disimpan." : "Link eksternal dihapus.";
			externalUrlDraft = "";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menyimpan link eksternal.";
		}
	}

	function fileToDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(new Error("Gagal membaca berkas."));
			reader.readAsDataURL(file);
		});
	}

	async function uploadGambar(p: Product) {
		if (!uploadFile) {
			notice = "Pilih berkas gambar dulu ya.";
			return;
		}
		uploading = true;
		try {
			const dataUrl = await fileToDataUrl(uploadFile);
			await api(`/api/admin/products/${p.id}/images`, {
				method: "POST",
				body: JSON.stringify({ filename: uploadFile.name, dataUrl, kind: uploadKind })
			});
			notice = `Gambar (${uploadKind}) berhasil diunggah untuk "${p.title}".`;
			uploadFile = null;
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunggah gambar.";
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
			notice = `${u.name} sekarang ${role === "admin" ? "Admin" : "Pelanggan"}.`;
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengubah role.";
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
			notice = e instanceof Error ? e.message : "Gagal memuat bab.";
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
				? "Video bab tersimpan."
				: "Video bab dihapus.";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menyimpan video.";
		} finally {
			videoSaving = false;
		}
	}
</script>

{#if checking}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if !isAdmin}
	<p class="err mt-6">{error || "Halaman ini hanya untuk admin."}</p>
	<a href="/" class="btn btn-primary mt-4">Kembali ke Beranda</a>
{:else}
	<div class="lg:flex lg:items-start lg:gap-4">
		<!-- Sidebar desktop -->
		<aside class="card sticky top-4 hidden w-60 shrink-0 flex-col gap-1 p-3 lg:flex">
			<p class="flex items-center gap-2 px-2 pb-2 pt-1 text-base font-extrabold">
				<Icon name="crown" size={20} /> Admin Ringkas
			</p>
			{#each MENU as m (m.id)}
				<button type="button" class={navClass(m.id)} onclick={() => switchTab(m.id)}>
					<Icon name={m.icon} size={18} /> {m.label}
					{#if m.id === "produk"}
						<span class="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold">{products.length}</span>
					{:else if m.id === "voucher"}
						<span class="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold">{vouchers.length}</span>
					{/if}
				</button>
			{/each}
			<div class="mt-3 border-t border-[#e7e2d2] pt-3">
				<button type="button" class="btn btn-ghost w-full" onclick={() => goto("/akun")}>
					<Icon name="chevron-left" size={18} /> Kembali ke Akun
				</button>
			</div>
		</aside>

		<!-- Drawer mobile -->
		{#if drawerOpen}
			<div class="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Menu admin">
				<button
					type="button"
					aria-label="Tutup menu"
					class="absolute inset-0 bg-black/40"
					onclick={() => (drawerOpen = false)}
				></button>
				<aside class="absolute left-0 top-0 flex h-full w-72 flex-col gap-1 overflow-y-auto bg-[#fffdf7] p-3 shadow-xl">
					<div class="flex items-center justify-between px-2 pb-2 pt-1">
						<p class="flex items-center gap-2 text-base font-extrabold">
							<Icon name="crown" size={20} /> Admin Ringkas
						</p>
						<button
							type="button"
							aria-label="Tutup menu"
							class="btn btn-ghost !px-2 !py-1.5"
							onclick={() => (drawerOpen = false)}
						>
							<Icon name="x" size={18} />
						</button>
					</div>
					{#each MENU as m (m.id)}
						<button type="button" class={navClass(m.id)} onclick={() => switchTab(m.id)}>
							<Icon name={m.icon} size={18} /> {m.label}
							{#if m.id === "produk"}
								<span class="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold">{products.length}</span>
							{:else if m.id === "voucher"}
								<span class="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-xs font-extrabold">{vouchers.length}</span>
							{/if}
						</button>
					{/each}
					<div class="mt-3 border-t border-[#e7e2d2] pt-3">
						<button type="button" class="btn btn-ghost w-full" onclick={() => goto("/akun")}>
							<Icon name="chevron-left" size={18} /> Kembali ke Akun
						</button>
					</div>
				</aside>
			</div>
		{/if}

		<!-- Konten dashboard -->
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<button
					type="button"
					aria-label="Buka menu"
					class="btn btn-ghost !px-2.5 !py-2 lg:hidden"
					onclick={() => (drawerOpen = true)}
				>
					<Icon name="layers" size={18} />
				</button>
				<h1 class="flex items-center gap-2 text-xl font-extrabold">
					<Icon name="crown" size={22} /> {TAB_TITLE[tab]}
				</h1>
				<span class="ml-auto flex min-w-0 items-center gap-1.5 rounded-full bg-[#ece9dc] px-2.5 py-1.5 text-xs font-bold text-[#3f4a42]">
					<Icon name="user" size={15} />
					<span class="max-w-28 truncate sm:max-w-none">{adminName}</span>
				</span>
			</div>

			{#if error}
				<p class="err mt-3">{error}</p>
			{/if}
			{#if notice}
				<p class="ok-msg mt-3">{notice}</p>
			{/if}

			{#if tab === "ringkasan"}
				<div class="mt-4 flex items-center justify-between gap-2">
					<p class="text-sm font-bold text-[#3f4a42]">Angka-angka dari database toko</p>
					<button type="button" class="btn btn-ghost !px-2.5 !py-1.5 text-xs" disabled={statsLoading} onclick={loadStats}>
						<Icon name="refresh" size={15} /> {statsLoading ? "Memuat..." : "Muat ulang"}
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
					<div class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
						<div class="card p-3">
							<p class="flex items-center gap-1.5 text-xs font-bold text-[#5f6b62]"><Icon name="package" size={15} /> Total Produk</p>
							<p class="mt-1 text-2xl font-extrabold">{stats.products_total}</p>
							<p class="text-xs text-[#5f6b62]">{stats.products_visible} tampil • {stats.products_hidden} tersembunyi</p>
						</div>
						<div class="card p-3">
							<p class="flex items-center gap-1.5 text-xs font-bold text-[#5f6b62]"><Icon name="eye" size={15} /> Produk Tampil</p>
							<p class="mt-1 text-2xl font-extrabold">{stats.products_visible}</p>
							<p class="text-xs text-[#5f6b62]">dari {stats.products_total} produk</p>
						</div>
						<div class="card p-3">
							<p class="flex items-center gap-1.5 text-xs font-bold text-[#5f6b62]"><Icon name="users" size={15} /> Pengguna</p>
							<p class="mt-1 text-2xl font-extrabold">{stats.users_total}</p>
							<p class="text-xs text-[#5f6b62]">akun terdaftar</p>
						</div>
						<div class="card p-3">
							<p class="flex items-center gap-1.5 text-xs font-bold text-[#5f6b62]"><Icon name="receipt" size={15} /> Total Order</p>
							<p class="mt-1 text-2xl font-extrabold">{stats.orders_total}</p>
							<p class="text-xs text-[#5f6b62]">{stats.orders_paid} sudah lunas (PAID)</p>
						</div>
						<div class="card p-3">
							<p class="flex items-center gap-1.5 text-xs font-bold text-[#5f6b62]"><Icon name="check" size={15} /> Order Lunas</p>
							<p class="mt-1 text-2xl font-extrabold">{stats.orders_paid}</p>
							<p class="text-xs text-[#5f6b62]">status PAID</p>
						</div>
						<div class="card p-3">
							<p class="flex items-center gap-1.5 text-xs font-bold text-[#5f6b62]"><Icon name="credit-card" size={15} /> Pendapatan</p>
							<p class="mt-1 text-2xl font-extrabold">{formatRupiah(stats.revenue_paid)}</p>
							<p class="text-xs text-[#5f6b62]">total order PAID</p>
						</div>
						<div class="card p-3">
							<p class="flex items-center gap-1.5 text-xs font-bold text-[#5f6b62]"><Icon name="bookmark" size={15} /> Voucher Aktif</p>
							<p class="mt-1 text-2xl font-extrabold">{stats.vouchers_active}</p>
							<p class="text-xs text-[#5f6b62]">kode bisa dipakai</p>
						</div>
						<div class="card p-3">
							<p class="flex items-center gap-1.5 text-xs font-bold text-[#5f6b62]"><Icon name="sparkles" size={15} /> Email Terkirim</p>
							<p class="mt-1 text-2xl font-extrabold">{stats.emails_sent}</p>
							<p class="text-xs text-[#5f6b62]">jejak pengiriman email</p>
						</div>
					</div>

					<h2 class="mt-5 text-base font-extrabold">Order Terbaru</h2>
					{#if recentOrders.length === 0}
						<p class="mt-2 text-sm text-[#5f6b62]">Belum ada order.</p>
					{:else}
						<div class="card mt-2 hidden overflow-x-auto p-0 md:block">
							<table class="w-full min-w-[720px] text-left text-xs">
								<thead>
									<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
										<th class="px-3 py-2.5 font-extrabold">Order</th>
										<th class="px-3 py-2.5 font-extrabold">Pembeli</th>
										<th class="px-3 py-2.5 font-extrabold">Produk</th>
										<th class="px-3 py-2.5 font-extrabold">Total</th>
										<th class="px-3 py-2.5 font-extrabold">Status</th>
										<th class="px-3 py-2.5 font-extrabold">Tanggal</th>
									</tr>
								</thead>
								<tbody>
									{#each recentOrders as o (o.id)}
										<tr class="border-b border-[#f0ede2] align-top last:border-0">
											<td class="px-3 py-2.5 font-extrabold">{o.id}</td>
											<td class="px-3 py-2.5">
												<p class="font-bold">{o.buyer_name ?? "-"}</p>
												<p class="text-[#5f6b62]">{o.buyer_email ?? "-"}</p>
											</td>
											<td class="px-3 py-2.5">{o.products.join(", ") || "-"}</td>
											<td class="px-3 py-2.5 font-bold">{formatRupiah(o.total)}</td>
											<td class="px-3 py-2.5"><span class={statusBadge(o.status)}>{o.status}</span></td>
											<td class="px-3 py-2.5">{formatTanggal(o.created_at)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<div class="mt-2 space-y-2 md:hidden">
							{#each recentOrders as o (o.id)}
								<article class="card p-3">
									<div class="flex items-start justify-between gap-2">
										<p class="text-sm font-extrabold">{o.id}</p>
										<span class={statusBadge(o.status)}>{o.status}</span>
									</div>
									<p class="mt-1 text-xs font-bold">{o.buyer_name ?? "-"} • {o.buyer_email ?? "-"}</p>
									<p class="mt-0.5 text-xs text-[#5f6b62]">{o.products.join(", ") || "-"}</p>
									<p class="mt-1 text-sm font-bold">{formatRupiah(o.total)} <span class="text-xs font-normal text-[#5f6b62]">• {formatTanggal(o.created_at)}</span></p>
								</article>
							{/each}
						</div>
					{/if}
				{/if}
			{:else if tab === "produk"}
				<div class="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
					<div class="relative flex-1">
						<input
							class="input !pl-9"
							type="search"
							placeholder="Cari judul atau mapel..."
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
						<Icon name="plus" size={16} /> Tambah Produk
					</button>
				</div>
				<p class="mt-3 text-sm font-bold text-[#3f4a42]">
					Menampilkan {filteredProducts.length} dari {products.length} produk
				</p>

				{#if productsLoading}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if filteredProducts.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">
						{products.length === 0 ? "Belum ada produk." : "Tidak ada produk yang cocok dengan pencarian."}
					</p>
				{:else}
					<!-- Tabel desktop -->
					<div class="card mt-3 hidden overflow-x-auto p-0 md:block">
						<table class="w-full min-w-[780px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2.5 font-extrabold">Cover</th>
									<th class="px-3 py-2.5 font-extrabold">Judul</th>
									<th class="px-3 py-2.5 font-extrabold">Jenjang / Mapel</th>
									<th class="px-3 py-2.5 font-extrabold">Harga</th>
									<th class="px-3 py-2.5 font-extrabold">Status</th>
									<th class="px-3 py-2.5 text-right font-extrabold">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredProducts as p (p.id)}
									<tr class="border-b border-[#f0ede2] align-top">
										<td class="px-3 py-2.5">
											<div
												class="flex h-12 w-12 items-center justify-center rounded-lg px-1 text-center text-[10px] font-extrabold leading-tight text-white"
												style="background: {p.cover_color}"
											>
												{p.cover_label}
											</div>
										</td>
										<td class="px-3 py-2.5">
											<p class="text-sm font-bold leading-snug">{p.title}</p>
											{#if p.badge}
												<span class="badge badge-sun mt-1">{p.badge}</span>
											{/if}
										</td>
										<td class="px-3 py-2.5">{p.jenjang} • {p.mapel}</td>
										<td class="px-3 py-2.5">
											<p class="font-bold">{formatRupiah(p.price)}</p>
											{#if p.strikethrough_price}
												<p class="text-[#5f6b62] line-through">{formatRupiah(p.strikethrough_price)}</p>
											{/if}
										</td>
										<td class="px-3 py-2.5">
											<div class="flex flex-wrap gap-1">
												{#if p.active}
													<span class="badge badge-leaf">TAMPIL</span>
												{:else}
													<span class="badge badge-gray">TERSEMBUNYI</span>
												{/if}
												{#if p.badge === "BUNDEL"}
													<span class="badge badge-brand">BUNDEL</span>
												{/if}
												{#if p.external_url}
													<span class="badge badge-brand"><Icon name="link" size={12} /> Link eksternal</span>
												{/if}
											</div>
										</td>
										<td class="px-3 py-2.5">
											<div class="flex flex-wrap justify-end gap-1.5">
												<button type="button" class="btn btn-outline !px-2.5 !py-1.5 text-xs" onclick={() => mulaiEdit(p)}>
													<Icon name="edit" size={14} /> Edit
												</button>
												<button
													type="button"
													class="btn {p.active ? 'btn-ghost' : 'btn-leaf'} !px-2.5 !py-1.5 text-xs"
													onclick={() => toggleActive(p)}
												>
													{p.active ? "Sembunyikan" : "Tampilkan"}
												</button>
												<button
													type="button"
													class="btn btn-danger !px-2.5 !py-1.5 text-xs"
													onclick={() => hapusProduk(p.id, p.title)}
												>
													<Icon name="trash" size={14} /> Hapus
												</button>
												<button
													type="button"
													class="btn btn-ghost !px-2.5 !py-1.5 text-xs"
													onclick={() => (expandedProductId = expandedProductId === p.id ? null : p.id)}
												>
													<Icon name="link" size={14} /> Gambar & Link
												</button>
											</div>
										</td>
									</tr>
									{#if expandedProductId === p.id}
										<tr class="border-b border-[#f0ede2] bg-[#f7f5ef]">
											<td class="px-3 py-3" colspan="6">
												<div class="flex flex-wrap items-center gap-2">
													<input
														class="input !w-64 !px-2 !py-1.5 text-xs"
														placeholder="Link eksternal (https://...)"
														value={p.external_url ?? ""}
														oninput={(e) => (externalUrlDraft = e.currentTarget.value)}
													/>
													<button
														type="button"
														class="btn btn-ghost !px-2.5 !py-1.5 text-xs"
														onclick={() => simpanExternalLink(p)}
													>
														Simpan Link
													</button>
													<input
														type="file"
														accept="image/*"
														class="text-xs"
														onchange={(e) => {
															uploadFile = e.currentTarget.files?.[0] ?? null;
														}}
													/>
													<select class="input !w-auto !px-2 !py-1.5 text-xs" bind:value={uploadKind}>
														<option value="feature">Feature</option>
														<option value="gallery">Gallery</option>
													</select>
													<button
														type="button"
														class="btn btn-sun !px-2.5 !py-1.5 text-xs"
														disabled={uploading || !uploadFile}
														onclick={() => uploadGambar(p)}
													>
														{#if uploading}Mengunggah...{:else}<Icon name="upload" size={15} /> Upload Gambar{/if}
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
										class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg px-1 text-center text-[10px] font-extrabold leading-tight text-white"
										style="background: {p.cover_color}"
									>
										{p.cover_label}
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-bold leading-snug">{p.title}</p>
										<p class="text-xs text-[#5f6b62]">
											{p.jenjang} • {p.mapel} • {formatRupiah(p.price)}
											{#if p.strikethrough_price}
												<span class="line-through">{formatRupiah(p.strikethrough_price)}</span>
											{/if}
										</p>
										<div class="mt-1 flex flex-wrap gap-1">
											{#if p.active}
												<span class="badge badge-leaf">TAMPIL</span>
											{:else}
												<span class="badge badge-gray">TERSEMBUNYI</span>
											{/if}
											{#if p.badge === "BUNDEL"}
												<span class="badge badge-brand">BUNDEL</span>
											{/if}
											{#if p.badge}
												<span class="badge badge-sun">{p.badge}</span>
											{/if}
											{#if p.external_url}
												<span class="badge badge-brand"><Icon name="link" size={12} /> Link eksternal</span>
											{/if}
										</div>
									</div>
									<button
										type="button"
										class="btn {p.active ? 'btn-ghost' : 'btn-leaf'} shrink-0 !px-2.5 !py-1.5 text-xs"
										onclick={() => toggleActive(p)}
									>
										{p.active ? "Sembunyikan" : "Tampilkan"}
									</button>
								</div>
								<div class="mt-2 flex flex-wrap gap-2">
									<button type="button" class="btn btn-outline !px-2.5 !py-1.5 text-xs" onclick={() => mulaiEdit(p)}>
										<Icon name="edit" size={14} /> Edit
									</button>
									<button
										type="button"
										class="btn btn-danger !px-2.5 !py-1.5 text-xs"
										onclick={() => hapusProduk(p.id, p.title)}
									>
										<Icon name="trash" size={14} /> Hapus
									</button>
									<input
										class="input !w-44 !px-2 !py-1.5 text-xs"
										placeholder="Link eksternal (https://...)"
										value={p.external_url ?? ""}
										oninput={(e) => (externalUrlDraft = e.currentTarget.value)}
									/>
									<button
										type="button"
										class="btn btn-ghost !px-2.5 !py-1.5 text-xs"
										onclick={() => simpanExternalLink(p)}
									>
										Simpan Link
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
									<select class="input !w-auto !px-2 !py-1.5 text-xs" bind:value={uploadKind}>
										<option value="feature">Feature</option>
										<option value="gallery">Gallery</option>
									</select>
									<button
										type="button"
										class="btn btn-sun !px-2.5 !py-1.5 text-xs"
										disabled={uploading || !uploadFile}
										onclick={() => uploadGambar(p)}
									>
										{#if uploading}Mengunggah...{:else}<Icon name="upload" size={15} /> Upload Gambar{/if}
									</button>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			{:else if tab === "pengguna"}
				{#if usersLoading}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if users.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">Belum ada pengguna.</p>
				{:else}
					<div class="card mt-3 hidden overflow-x-auto p-0 md:block">
						<table class="w-full min-w-[680px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2.5 font-extrabold">Nama</th>
									<th class="px-3 py-2.5 font-extrabold">Email</th>
									<th class="px-3 py-2.5 font-extrabold">Order</th>
									<th class="px-3 py-2.5 font-extrabold">Role</th>
									<th class="px-3 py-2.5 text-right font-extrabold">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{#each users as u (u.id)}
									<tr class="border-b border-[#f0ede2] last:border-0">
										<td class="px-3 py-2.5 font-bold">{u.name}</td>
										<td class="px-3 py-2.5">{u.email}</td>
										<td class="px-3 py-2.5">{u.order_count} order</td>
										<td class="px-3 py-2.5">
											{#if u.role === "admin"}
												<span class="badge badge-sun"><Icon name="crown" size={12} /> Admin</span>
											{:else}
												<span class="badge badge-leaf"><Icon name="backpack" size={12} /> Pelanggan</span>
											{/if}
										</td>
										<td class="px-3 py-2.5 text-right">
											{#if u.role === "admin"}
												<button
													type="button"
													class="btn btn-ghost !px-2.5 !py-1.5 text-xs"
													onclick={() => setRole(u, "customer")}
												>
													Jadikan Pelanggan
												</button>
											{:else}
												<button
													type="button"
													class="btn btn-sun !px-2.5 !py-1.5 text-xs"
													onclick={() => setRole(u, "admin")}
												>
													Jadikan Admin
												</button>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<div class="mt-3 space-y-2 md:hidden">
						{#each users as u (u.id)}
							<div class="card flex items-center gap-3 p-3">
								<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ece9dc] text-[#177245]"><Icon name="user" size={18} /></span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-bold">{u.name}</p>
									<p class="truncate text-xs text-[#5f6b62]">
										{u.email} • {u.order_count} order • {#if u.role === "admin"}<Icon name="crown" size={13} class="inline-block align-[-2px]" /> Admin{:else}<Icon name="backpack" size={13} class="inline-block align-[-2px]" /> Pelanggan{/if}
									</p>
								</div>
								{#if u.role === "admin"}
									<button
										type="button"
										class="btn btn-ghost !px-2.5 !py-1.5 text-xs"
										onclick={() => setRole(u, "customer")}
									>
										Jadikan Pelanggan
									</button>
								{:else}
									<button
										type="button"
										class="btn btn-sun !px-2.5 !py-1.5 text-xs"
										onclick={() => setRole(u, "admin")}
									>
										Jadikan Admin
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{:else if tab === "video"}
				<div class="card mt-4 space-y-3 p-4">
					<p class="text-sm font-bold"><Icon name="video" size={16} /> Video per Bab</p>
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
					<p class="text-sm font-bold"><Icon name="receipt" size={16} /> Buat Voucher Baru</p>
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
						{#if vSaving}Menyimpan...{:else}<Icon name="save" size={16} /> Simpan Voucher{/if}
					</button>
				</form>

				{#if vouchersLoading}
					<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
				{:else if vouchers.length === 0}
					<p class="mt-4 text-sm text-[#5f6b62]">Belum ada voucher.</p>
				{:else}
					<div class="card mt-3 overflow-x-auto p-0">
						<table class="w-full min-w-[680px] text-left text-xs">
							<thead>
								<tr class="border-b border-[#e7e2d2] text-[#3f4a42]">
									<th class="px-3 py-2.5 font-extrabold">Kode</th>
									<th class="px-3 py-2.5 font-extrabold">Tipe</th>
									<th class="px-3 py-2.5 font-extrabold">Nilai</th>
									<th class="px-3 py-2.5 font-extrabold">Terpakai</th>
									<th class="px-3 py-2.5 font-extrabold">Min. Belanja</th>
									<th class="px-3 py-2.5 font-extrabold">Kedaluwarsa</th>
									<th class="px-3 py-2.5 font-extrabold">Status</th>
									<th class="px-3 py-2.5 font-extrabold"></th>
								</tr>
							</thead>
							<tbody>
								{#each vouchers as v (v.code)}
									<tr class="border-b border-[#f0ede2] last:border-0">
										<td class="px-3 py-2.5 font-extrabold">{v.code}</td>
										<td class="px-3 py-2.5">{v.type === "percent" ? "Persen" : "Nominal"}</td>
										<td class="px-3 py-2.5 font-bold">
											{v.type === "percent" ? `${v.value}%` : formatRupiah(v.value)}
										</td>
										<td class="px-3 py-2.5">{v.uses}{v.max_uses ? ` / ${v.max_uses}` : ""}</td>
										<td class="px-3 py-2.5">{v.min_total ? formatRupiah(v.min_total) : "-"}</td>
										<td class="px-3 py-2.5">{fmtDate(v.expires_at)}</td>
										<td class="px-3 py-2.5">
											{#if v.active}
												<span class="badge badge-leaf">Aktif</span>
											{:else}
												<span class="badge badge-gray">Nonaktif</span>
											{/if}
										</td>
										<td class="px-3 py-2.5 text-right">
											<button
												type="button"
												class="btn {v.active ? 'btn-ghost' : 'btn-leaf'} !px-2.5 !py-1.5 text-xs"
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
					<p class="text-sm font-bold"><Icon name="clock" size={16} /> Cron Email</p>
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
							<p class="font-extrabold">
								Hasil: {cronResult.job === "daily" ? "Pengingat harian" : "Laporan mingguan"}
							</p>
							<p class="mt-1">
								Terkirim: <b>{cronResult.sent}</b> • Dilewati: <b>{cronResult.skipped}</b>
							</p>
							{#if cronResult.errors.length > 0}
								<p class="mt-2 font-bold text-[#b91c1c]">Error ({cronResult.errors.length}):</p>
								<ul class="list-disc pl-5 text-[#b91c1c]">
									{#each cronResult.errors as err (err)}
										<li>{err}</li>
									{/each}
								</ul>
							{:else}
								<p class="mt-1 text-[#065f46]">Selesai tanpa error.</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Modal form tambah/edit produk -->
	{#if editId}
		<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-label={editId === "baru" ? "Produk Baru" : "Edit Produk"}>
			<button
				type="button"
				aria-label="Tutup form produk"
				class="absolute inset-0 bg-black/40"
				onclick={() => (editId = null)}
			></button>
			<form
				class="relative max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl bg-[#fffdf7] p-4 shadow-xl sm:rounded-2xl"
				onsubmit={(e) => {
					e.preventDefault();
					simpanProduk();
				}}
			>
				<div class="flex items-center justify-between gap-2">
					<p class="flex items-center gap-2 font-extrabold">{editId === "baru" ? "Produk Baru" : "Edit Produk"}</p>
					<button
						type="button"
						aria-label="Tutup form produk"
						class="btn btn-ghost !px-2 !py-1.5"
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
{/if}
