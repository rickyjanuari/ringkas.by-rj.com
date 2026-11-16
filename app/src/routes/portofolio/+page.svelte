<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import BottomSheet from "$lib/BottomSheet.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatTanggal, getToken } from "$lib/api";
	import { auth } from "$lib/store";

	// Batas dari kontrak API: maks. 20 karya, maks. 200 KB per gambar (JPEG).
	const MAKS_KARYA = 20;
	const MAKS_SISI = 800;
	const KUALITAS_JPEG = 0.82;
	const MAKS_BYTE = 200 * 1024;

	type PortfolioItem = {
		id: number | string;
		title: string;
		caption: string | null;
		image: string;
		created_at: string;
		stars_avg: number | null;
		stars_count: number;
		comments_count: number;
		owner_name?: string | null;
	};

	type PortfolioStar = { by_name: string | null; stars: number };
	type PortfolioComment = { by_name: string | null; text: string; created_at: string };

	// Mode lihat: karyaku sendiri, karya anak (orang tua), atau karya murid (guru).
	let viewMode = $state<"milikku" | "anak" | "kelas">("milikku");
	let viewTitle = $state("Portofolio Karyaku");
	let viewDesc = $state(
		"Pamerkan karyamu di sini — orang tua dan gurumu bisa memberi bintang dan komentar."
	);

	let items = $state<PortfolioItem[]>([]);
	let loading = $state(true);
	let error = $state("");
	let notice = $state("");

	// ---- Form unggah ----
	let fileInput = $state<HTMLInputElement | null>(null);
	let previewUrl = $state("");
	let judul = $state("");
	let caption = $state("");
	let uploading = $state(false);
	let uploadError = $state("");
	let ukuranTerakhir = $state(0);

	// ---- Detail karya (BottomSheet) ----
	let detailId = $state<number | string | null>(null);
	let detailItem = $state<PortfolioItem | null>(null);
	let detailStars = $state<PortfolioStar[]>([]);
	let detailComments = $state<PortfolioComment[]>([]);
	let detailLoading = $state(false);
	let detailError = $state("");
	let bintangDipilih = $state(0);
	let bintangTerkirim = $state(false);
	let mengirimBintang = $state(false);
	let bintangError = $state("");
	let komentarBaru = $state("");
	let mengirimKomentar = $state(false);
	let komentarError = $state("");

	let sheetOpen = $derived(detailId !== null);
	// Pemilik karya: mode milikku DAN id-nya ada di daftar karyaku sendiri.
	// Bila karya dibuka lewat tautan (orang tua/guru melihat karya anak),
	// kontrol bintang/komentar tampil — server tetap memvalidasi ulang.
	let isOwner = $derived(
		viewMode === "milikku" &&
			detailId !== null &&
			items.some((i) => String(i.id) === String(detailId))
	);

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		// Mode lihat karya anak/murid: /portofolio?anak=<id> atau ?kelas=<id>
		try {
			const params = new URLSearchParams(window.location.search);
			const anakId = params.get("anak");
			const kelasId = params.get("kelas");
			if (anakId) {
				viewMode = "anak";
				viewTitle = "Portofolio Anak";
				viewDesc = "Karya anakmu — beri bintang dan komentar penyemangat ya.";
			} else if (kelasId) {
				viewMode = "kelas";
				viewTitle = "Portofolio Murid";
				viewDesc = "Karya murid-murid kelasmu — beri bintang dan komentar penyemangat ya.";
			}
		} catch {
			/* abaikan */
		}
		await muatKarya();
		// Dukung tautan langsung ke satu karya: /portofolio?id=12
		try {
			const idParam = new URLSearchParams(window.location.search).get("id");
			if (idParam) bukaDetail(idParam);
		} catch {
			/* abaikan */
		}
	});

	async function muatKarya() {
		loading = true;
		error = "";
		try {
			let url = "/api/portfolio";
			if (viewMode === "anak") {
				const anakId = new URLSearchParams(window.location.search).get("anak") ?? "";
				url = `/api/parent/children/${encodeURIComponent(anakId)}/portfolio`;
			} else if (viewMode === "kelas") {
				const kelasId = new URLSearchParams(window.location.search).get("kelas") ?? "";
				url = `/api/classes/${encodeURIComponent(kelasId)}/portfolio`;
			}
			const data = await api<{ items: PortfolioItem[] }>(url);
			items = data.items ?? [];
		} catch (e) {
			error =
				e instanceof Error
					? e.message
					: viewMode === "milikku"
						? "Gagal memuat karyamu."
						: "Gagal memuat portofolio ini.";
		} finally {
			loading = false;
		}
	}

	/** Perkecil gambar di sisi klien: sisi terpanjang maks. 800px, JPEG 0.82. */
	function perkecilGambar(file: File): Promise<{ dataUrl: string; size: number }> {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				const skala = Math.min(1, MAKS_SISI / Math.max(img.width, img.height));
				const w = Math.max(1, Math.round(img.width * skala));
				const h = Math.max(1, Math.round(img.height * skala));
				const canvas = document.createElement("canvas");
				canvas.width = w;
				canvas.height = h;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					reject(new Error("Browser tidak bisa memproses gambar ini."));
					return;
				}
				ctx.drawImage(img, 0, 0, w, h);
				canvas.toBlob(
					(blob) => {
						if (!blob) {
							reject(new Error("Gagal memproses gambar. Coba berkas lain ya."));
							return;
						}
						const reader = new FileReader();
						reader.onload = () =>
							resolve({ dataUrl: String(reader.result), size: blob.size });
						reader.onerror = () =>
							reject(new Error("Gagal membaca gambar yang sudah diperkecil."));
						reader.readAsDataURL(blob);
					},
					"image/jpeg",
					KUALITAS_JPEG
				);
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error("Berkas itu bukan gambar yang bisa dibuka. Pilih gambar lain ya."));
			};
			img.src = url;
		});
	}

	async function pilihBerkas(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		uploadError = "";
		previewUrl = "";
		ukuranTerakhir = 0;
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			uploadError = "Pilih berkas gambar ya (JPG, PNG, atau WebP).";
			input.value = "";
			return;
		}
		try {
			const hasil = await perkecilGambar(file);
			if (hasil.size > MAKS_BYTE) {
				uploadError =
					"Setelah diperkecil, gambar ini masih di atas 200 KB. Coba gambar lain yang lebih sederhana ya.";
				input.value = "";
				return;
			}
			previewUrl = hasil.dataUrl;
			ukuranTerakhir = hasil.size;
		} catch (err) {
			uploadError =
				err instanceof Error ? err.message : "Gambar tidak bisa diproses. Coba lagi ya.";
			input.value = "";
		}
	}

	function batalUnggah() {
		previewUrl = "";
		judul = "";
		caption = "";
		uploadError = "";
		ukuranTerakhir = 0;
		if (fileInput) fileInput.value = "";
	}

	async function unggahKarya() {
		if (uploading) return;
		uploadError = "";
		notice = "";
		const judulBersih = judul.trim();
		if (!previewUrl) {
			uploadError = "Pilih gambar karyamu dulu ya.";
			return;
		}
		if (!judulBersih) {
			uploadError = "Judul karya wajib diisi.";
			return;
		}
		if (judulBersih.length > 100) {
			uploadError = "Judul maksimal 100 karakter.";
			return;
		}
		if (caption.trim().length > 300) {
			uploadError = "Caption maksimal 300 karakter.";
			return;
		}
		if (items.length >= MAKS_KARYA) {
			uploadError = `Kamu sudah punya ${MAKS_KARYA} karya. Hapus satu karya dulu sebelum mengunggah yang baru ya.`;
			return;
		}
		uploading = true;
		try {
			const data = await api<{ item: PortfolioItem }>("/api/portfolio", {
				method: "POST",
				body: JSON.stringify({
					title: judulBersih,
					caption: caption.trim() || undefined,
					image: previewUrl
				})
			});
			items = [data.item, ...items];
			notice = `Karya "${data.item.title}" berhasil diunggah!`;
			batalUnggah();
		} catch (e) {
			uploadError =
				e instanceof Error ? e.message : "Gagal mengunggah karya. Coba lagi ya.";
		} finally {
			uploading = false;
		}
	}

	async function bukaDetail(id: number | string) {
		detailId = id;
		detailItem = items.find((i) => String(i.id) === String(id)) ?? null;
		detailStars = [];
		detailComments = [];
		detailError = "";
		bintangDipilih = 0;
		bintangTerkirim = false;
		bintangError = "";
		komentarBaru = "";
		komentarError = "";
		detailLoading = true;
		try {
			const data = await api<{
				item: PortfolioItem;
				stars: PortfolioStar[];
				comments: PortfolioComment[];
			}>(`/api/portfolio/${encodeURIComponent(String(id))}`);
			detailItem = data.item;
			detailStars = data.stars ?? [];
			detailComments = data.comments ?? [];
		} catch (e) {
			detailError = e instanceof Error ? e.message : "Gagal memuat detail karya.";
		} finally {
			detailLoading = false;
		}
	}

	function tutupDetail() {
		detailId = null;
		detailItem = null;
		detailStars = [];
		detailComments = [];
	}

	async function kirimBintang() {
		if (detailId === null || mengirimBintang || bintangDipilih < 1 || bintangDipilih > 5)
			return;
		mengirimBintang = true;
		bintangError = "";
		try {
			const data = await api<{ ok: boolean; stars_avg: number; stars_count: number }>(
				`/api/portfolio/${encodeURIComponent(String(detailId))}/star`,
				{ method: "POST", body: JSON.stringify({ stars: bintangDipilih }) }
			);
			bintangTerkirim = true;
			if (detailItem) {
				detailItem = {
					...detailItem,
					stars_avg: data.stars_avg,
					stars_count: data.stars_count
				};
				items = items.map((i) =>
					String(i.id) === String(detailId)
						? { ...i, stars_avg: data.stars_avg, stars_count: data.stars_count }
						: i
				);
			}
		} catch (e) {
			bintangError =
				e instanceof Error ? e.message : "Gagal mengirim bintang. Coba lagi ya.";
		} finally {
			mengirimBintang = false;
		}
	}

	async function kirimKomentar() {
		if (detailId === null || mengirimKomentar) return;
		const teks = komentarBaru.trim();
		komentarError = "";
		if (!teks) {
			komentarError = "Tulis komentarmu dulu ya.";
			return;
		}
		if (teks.length > 300) {
			komentarError = "Komentar maksimal 300 karakter.";
			return;
		}
		mengirimKomentar = true;
		try {
			const data = await api<{ comment: PortfolioComment }>(
				`/api/portfolio/${encodeURIComponent(String(detailId))}/comment`,
				{ method: "POST", body: JSON.stringify({ text: teks }) }
			);
			detailComments = [
				...detailComments,
				{ ...data.comment, by_name: data.comment.by_name ?? ($auth.user?.name ?? "Kamu") }
			];
			if (detailItem) {
				detailItem = {
					...detailItem,
					comments_count: detailItem.comments_count + 1
				};
				items = items.map((i) =>
					String(i.id) === String(detailId)
						? { ...i, comments_count: i.comments_count + 1 }
						: i
				);
			}
			komentarBaru = "";
		} catch (e) {
			komentarError =
				e instanceof Error ? e.message : "Gagal mengirim komentar. Coba lagi ya.";
		} finally {
			mengirimKomentar = false;
		}
	}

	function labelBintang(avg: number | null, count: number): string {
		if (!count || avg === null || avg === undefined) return "Belum ada bintang";
		return `${Number(avg).toLocaleString("id-ID", { maximumFractionDigits: 1 })} (${count})`;
	}
</script>

<h1 class="flex items-center gap-2 text-xl font-semibold">
	<Icon name="pen" size={18} /> {viewTitle}
</h1>
<p class="mt-1 text-sm text-[#5f6b62]">
	{viewDesc}
</p>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat karya...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
	<button type="button" class="btn btn-primary mt-3" onclick={muatKarya}>Coba lagi</button>
{:else}
	{#if notice}
		<p class="tabular-nums ok-msg mt-4">{notice}</p>
	{/if}

	<!-- Form unggah karya (hanya untuk karyaku sendiri) -->
	{#if viewMode === "milikku"}
	<div class="card mt-4 p-4">
		<p class="flex items-center gap-2 text-sm font-semibold">
			<Icon name="upload" size={17} /> Unggah Karya Baru
		</p>
		<p class="mt-0.5 text-xs text-[#5f6b62]">
			{items.length} dari {MAKS_KARYA} karya • Gambar diperkecil otomatis (maks. 200 KB).
		</p>
		<div class="mt-3 space-y-3">
			<div>
				<label class="lbl" for="pf-file">Gambar karya</label>
				<input
					id="pf-file"
					class="input"
					type="file"
					accept="image/*"
					bind:this={fileInput}
					onchange={pilihBerkas}
				/>
				{#if previewUrl}
					<img
						src={previewUrl}
						alt="Pratinjau karya yang akan diunggah"
						class="mt-2 max-h-56 w-full rounded-2xl border border-[#e7e2d2] object-contain bg-[#f7f5ef]"
					/>
					<p class="mt-1 text-xs text-[#5f6b62]">
						Ukuran setelah diperkecil: {(ukuranTerakhir / 1024).toLocaleString("id-ID", {
							maximumFractionDigits: 0
						})} KB
					</p>
				{/if}
			</div>
			<div>
				<label class="lbl" for="pf-judul">Judul karya (wajib)</label>
				<input
					id="pf-judul"
					class="input"
					type="text"
					placeholder="Contoh: Gambar keluargaku"
					maxlength={100}
					bind:value={judul}
				/>
				<p class="mt-1 text-right text-xs text-[#5f6b62]">{judul.length}/100</p>
			</div>
			<div>
				<label class="lbl" for="pf-caption">Caption (opsional)</label>
				<textarea
					id="pf-caption"
					class="input min-h-16 resize-y"
					placeholder="Ceritakan sedikit tentang karyamu..."
					maxlength={300}
					bind:value={caption}
				></textarea>
				<p class="mt-1 text-right text-xs text-[#5f6b62]">{caption.length}/300</p>
			</div>
			{#if uploadError}
				<p class="err">{uploadError}</p>
			{/if}
			<div class="flex gap-2">
				<button
					type="button"
					class="btn btn-primary flex-1"
					disabled={uploading || !previewUrl || items.length >= MAKS_KARYA}
					onclick={unggahKarya}
				>
					{#if uploading}Mengunggah...{:else}<Icon name="upload" size={16} /> Unggah Karya{/if}
				</button>
				{#if previewUrl || judul || caption}
					<button type="button" class="btn btn-ghost" onclick={batalUnggah}>Batal</button>
				{/if}
			</div>
			{#if items.length >= MAKS_KARYA}
				<p class="text-xs text-[#5f6b62]">
					Kamu sudah mencapai batas {MAKS_KARYA} karya.
				</p>
			{/if}
		</div>
	</div>
	{/if}

	<!-- Grid kartu karya -->
	{#if items.length === 0}
		<div class="card mt-4 p-6 text-center">
			<p class="flex justify-center"><Icon name="pen" size={40} class="text-[#177245]" /></p>
			<p class="mt-2 font-medium">Belum ada karya</p>
			<p class="mt-1 text-sm text-[#5f6b62]">
				{#if viewMode === "milikku"}
					Unggah karya pertamamu lewat form di atas ya.
				{:else}
					Belum ada karya di sini.
				{/if}
			</p>
		</div>
	{:else}
		<div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
			{#each items as item (item.id)}
				<button
					type="button"
					class="card overflow-hidden p-0 text-left transition-shadow hover:shadow-[0_8px_24px_rgb(0_0_0/0.06)]"
					onclick={() => bukaDetail(item.id)}
				>
					<img
						src={item.image}
						alt={item.title}
						class="aspect-square w-full object-cover"
						loading="lazy"
					/>
					<span class="block p-3">
						<span class="block truncate text-sm font-semibold">{item.title}</span>
						{#if item.owner_name}
							<span class="block truncate text-xs font-medium text-[#177245]">{item.owner_name}</span>
						{/if}
						<span class="mt-0.5 block text-xs text-[#5f6b62]">{formatTanggal(item.created_at)}</span>
						<span class="mt-1.5 flex items-center gap-3 text-xs font-medium text-[#3f4a42]">
							<span class="flex items-center gap-1">
								<Icon name="star" size={16} class="text-[#f2b33d]" />
								{labelBintang(item.stars_avg, item.stars_count)}
							</span>
							<span class="flex items-center gap-1">
								<Icon name="message" size={16} />
								{item.comments_count} komentar
							</span>
						</span>
					</span>
				</button>
			{/each}
		</div>
	{/if}
{/if}

<!-- Detail karya -->
<BottomSheet open={sheetOpen} title={detailItem?.title ?? "Detail Karya"} onClose={tutupDetail}>
	{#if detailLoading}
		<p class="text-center text-sm font-semibold text-[#5f6b62]">Memuat detail karya...</p>
	{:else if detailError}
		<p class="err">{detailError}</p>
	{:else if detailItem}
		<img
			src={detailItem.image}
			alt={detailItem.title}
			class="w-full rounded-2xl border border-[#e7e2d2] object-contain bg-[#f7f5ef]"
		/>
		{#if detailItem.caption}
			<p class="mt-3 text-sm text-[#3f4a42]">{detailItem.caption}</p>
		{/if}
		<p class="mt-2 flex items-center gap-1.5 text-sm font-medium">
			<Icon name="star" size={16} class="text-[#f2b33d]" />
			{labelBintang(detailItem.stars_avg, detailItem.stars_count)}
			<span class="font-normal text-[#5f6b62]">• {formatTanggal(detailItem.created_at)}</span>
		</p>

		<h3 class="mt-4 text-sm font-semibold">Komentar ({detailComments.length})</h3>
		{#if detailComments.length === 0}
			<p class="mt-1 text-sm text-[#5f6b62]">Belum ada komentar.</p>
		{:else}
			<div class="mt-2 space-y-2">
				{#each detailComments as c (c.created_at + c.text)}
					<div class="rounded-xl bg-[#f7f5ef] px-3 py-2">
						<p class="text-xs font-semibold">{c.by_name ?? "Orang tua / guru"}</p>
						<p class="mt-0.5 text-sm">{c.text}</p>
						<p class="mt-0.5 text-xs text-[#5f6b62]">{formatTanggal(c.created_at)}</p>
					</div>
				{/each}
			</div>
		{/if}

		{#if isOwner}
			<p class="mt-4 rounded-xl bg-[#f7f5ef] px-3 py-2 text-sm text-[#5f6b62]">
				Ini karyamu — hanya orang tua dan gurumu yang bisa memberi bintang dan komentar.
			</p>
		{:else}
			<!-- Beri bintang (orang tua / guru) -->
			<div class="mt-4">
				<p class="text-sm font-semibold">Beri bintang</p>
				<div class="mt-1.5 flex items-center gap-1">
					{#each [1, 2, 3, 4, 5] as n (n)}
						<button
							type="button"
							aria-label={`Beri ${n} bintang`}
							class={bintangDipilih >= n ? "text-[#f2b33d]" : "text-[#c9c4b2]"}
							onclick={() => {
								bintangDipilih = n;
								bintangTerkirim = false;
							}}
						>
							<Icon name="star" size={28} />
						</button>
					{/each}
					<button
						type="button"
						class="btn btn-sun ml-2 !px-3 !py-1.5 text-xs"
						disabled={mengirimBintang || bintangDipilih < 1}
						onclick={kirimBintang}
					>
						{mengirimBintang ? "Mengirim..." : "Kirim Bintang"}
					</button>
				</div>
				{#if bintangTerkirim}
					<p class="ok-msg mt-2">Terima kasih. Bintangmu sudah tersimpan.</p>
				{/if}
				{#if bintangError}
					<p class="err mt-2">{bintangError}</p>
				{/if}
			</div>

			<!-- Tulis komentar (orang tua / guru) -->
			<div class="mt-4">
				<label class="lbl" for="pf-komentar">Tulis komentar</label>
				<textarea
					id="pf-komentar"
					class="input min-h-16 resize-y"
					placeholder="Tulis penyemangat untuk karya ini..."
					maxlength={300}
					bind:value={komentarBaru}
				></textarea>
				<p class="mt-1 text-right text-xs text-[#5f6b62]">{komentarBaru.length}/300</p>
				{#if komentarError}
					<p class="err mt-1">{komentarError}</p>
				{/if}
				<button
					type="button"
					class="btn btn-primary mt-1"
					disabled={mengirimKomentar}
					onclick={kirimKomentar}
				>
					{mengirimKomentar ? "Mengirim..." : "Kirim Komentar"}
				</button>
			</div>
		{/if}
	{/if}
</BottomSheet>
