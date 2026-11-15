<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		formatRupiah,
		getToken,
		type ChapterMeta,
		type Product,
		type User
	} from "$lib/api";
	import { auth } from "$lib/store";

	type Tab = "produk" | "pengguna" | "video" | "voucher" | "cron";
	let tab = $state<Tab>("produk");
	let isAdmin = $state(false);
	let checking = $state(true);
	let error = $state("");
	let notice = $state("");

	// ---- Produk ----
	let products = $state<Product[]>([]);
	let productsLoading = $state(false);
	let editId = $state<string | null>(null);
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
				await loadProducts();
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
		if (t === "pengguna" && users.length === 0) loadUsers();
		if (t === "voucher" && vouchers.length === 0) loadVouchers();
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
	}

	async function simpanVideo() {
		if (!videoChapterId) return;
		videoSaving = true;
		try {
			const data = await api<{ chapter: ChapterMeta }>(
				`/api/admin/chapters/${videoChapterId}/video`,
				{
					method: "POST",
					body: JSON.stringify({ video_url: videoUrl.trim(), video_duration: videoDuration.trim() })
				}
			);
			videoChapters = videoChapters.map((c) => (c.id === videoChapterId ? data.chapter : c));
			notice = videoUrl.trim()
				? "Video bab tersimpan."
				: "Video bab dihapus.";
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal menyimpan video.";
		} finally {
			videoSaving = false;
		}
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/akun")}><Icon name="chevron-left" size={18} /> Kembali ke Akun</button>
<h1 class="mt-3 flex items-center gap-2 text-xl font-extrabold"><Icon name="crown" size={22} /> Admin — Kelola Produk</h1>

{#if checking}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if !isAdmin}
	<p class="err mt-6">{error || "Halaman ini hanya untuk admin."}</p>
	<a href="/" class="btn btn-primary mt-4">Kembali ke Beranda</a>
{:else}
	{#if error}
		<p class="err mt-3">{error}</p>
	{/if}
	{#if notice}
		<p class="ok-msg mt-3">{notice}</p>
	{/if}

	<div class="mt-4 flex flex-wrap gap-2">
		<button type="button" class="chip" class:active={tab === "produk"} onclick={() => switchTab("produk")}>
			<Icon name="package" size={16} /> Produk ({products.length})
		</button>
		<button type="button" class="chip" class:active={tab === "pengguna"} onclick={() => switchTab("pengguna")}>
			<Icon name="users" size={16} /> Pengguna & Role
		</button>
		<button type="button" class="chip" class:active={tab === "video"} onclick={() => switchTab("video")}>
			<Icon name="video" size={16} /> Video per Bab
		</button>
		<button type="button" class="chip" class:active={tab === "voucher"} onclick={() => switchTab("voucher")}>
			<Icon name="receipt" size={16} /> Voucher ({vouchers.length})
		</button>
		<button type="button" class="chip" class:active={tab === "cron"} onclick={() => switchTab("cron")}>
			<Icon name="clock" size={16} /> Cron Email
		</button>
	</div>

	{#if tab === "produk"}
		<div class="mt-4 flex items-center justify-between">
			<p class="text-sm font-bold text-[#3f4a42]">Total {products.length} produk</p>
			<button type="button" class="btn btn-primary text-xs" onclick={mulaiTambah}>+ Tambah Produk</button>
		</div>

		{#if editId}
			<form
				class="card mt-3 space-y-3 p-4"
				onsubmit={(e) => {
					e.preventDefault();
					simpanProduk();
				}}
			>
				<p class="flex items-center gap-2 font-extrabold">{editId === "baru" ? "Produk Baru" : "Edit Produk"}</p>
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
		{/if}

		{#if productsLoading}
			<p class="mt-4 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
		{:else}
			<div class="mt-3 space-y-3">
				{#each products as p (p.id)}
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
								</p>
								<div class="mt-1 flex flex-wrap gap-1">
									{#if p.active}
										<span class="badge badge-leaf">TAMPIL</span>
									{:else}
										<span class="badge badge-gray">TERSEMBUNYI</span>
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
			<div class="mt-3 space-y-2">
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
				Video tampil di Ruang Belajar sebagai kartu "Tonton Video Pembelajaran". Kosongkan URL untuk
				menghapus video.
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
								{c.title}{c.video_url ? " (ada video)" : ""}
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
{/if}
