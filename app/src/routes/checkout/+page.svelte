<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		formatRupiah,
		formatTanggal,
		getToken,
		isImageUrl,
		type Order,
		type ProductPublic
	} from "$lib/api";
	import { cart, auth } from "$lib/store";
	import Icon from "$lib/Icon.svelte";

	const LAST_ORDER_KEY = "ringkas_last_order";

	let catalog = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");
	let whatsapp = $state("");
	let creating = $state(false);
	let checking = $state(false);
	// ---- Beli sebagai hadiah ----
	let giftOn = $state(false);
	let giftEmail = $state("");
	let giftName = $state("");
	let giftMessage = $state("");
	let giftError = $state("");
	type OrderGift = Order & {
		is_gift?: boolean;
		gift_recipient_email?: string | null;
		gift_recipient_name?: string | null;
		donated?: boolean;
	};
	let order = $state<OrderGift | null>(null);
	let createError = $state("");
	let statusMsg = $state("");

	// ---- Voucher ----
	let voucherCode = $state("");
	let voucherApplying = $state(false);
	let voucherMsg = $state("");
	let voucherError = $state("");
	let appliedVoucher = $state<{ code: string; discount: number; total_after: number } | null>(null);

	// ---- Beli 1, donasi 1 ----
	let donateOn = $state(false);

	let items = $derived(
		$cart
			.map((id) => catalog.find((p) => p.id === id))
			.filter((p): p is ProductPublic => Boolean(p))
	);
	let total = $derived(items.reduce((s, p) => s + p.price, 0));
	let totalBayar = $derived(appliedVoucher ? appliedVoucher.total_after : total);
	// Donasi = 1× harga produk SEBELUM diskon voucher (bukan setelah diskon).
	let donationAmount = $derived(donateOn ? total : 0);
	let grandTotal = $derived(totalBayar + donationAmount);
	let loggedIn = $derived(Boolean(getToken()));

	async function loadOrder(id: string) {
		try {
			const data = await api<{ order: Order }>(`/api/payment/status/${id}`);
			order = data.order;
			return data.order;
		} catch (e) {
			createError = e instanceof Error ? e.message : "Gagal memuat order.";
			return null;
		}
	}

	onMount(async () => {
		if (!loggedIn) {
			goto("/akun");
			return;
		}
		whatsapp = $auth.user?.whatsapp ?? "";
		try {
			const data = await api<{ products: ProductPublic[] }>("/api/catalog");
			catalog = data.products ?? [];
			// Bila kembali ke halaman ini dan ada order terakhir yang masih PENDING,
			// tampilkan lagi supaya bisa "Lanjutkan Bayar".
			const lastId = localStorage.getItem(LAST_ORDER_KEY);
			if (lastId && $cart.length === 0) {
				const restored = await loadOrder(lastId);
				if (restored && restored.status === "PAID") {
					cart.clear();
					localStorage.removeItem(LAST_ORDER_KEY);
					goto(`/sukses?order_id=${restored.id}`);
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat katalog.";
		} finally {
			loading = false;
		}
	});

	function newIdempotencyKey(): string {
		if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
		return `key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	}

	async function pakaiVoucher() {
		const code = voucherCode.trim().toUpperCase();
		if (!code) {
			voucherError = "Masukkan kode voucher dulu ya.";
			return;
		}
		voucherApplying = true;
		voucherError = "";
		voucherMsg = "";
		try {
			const data = await api<{
				valid: boolean;
				code: string;
				type: string;
				value: number;
				discount: number;
				total_after: number;
			}>(`/api/voucher/validate?code=${encodeURIComponent(code)}&total=${total}`);
			appliedVoucher = { code: data.code, discount: data.discount, total_after: data.total_after };
			voucherMsg = `Voucher ${data.code} dipakai — hemat ${formatRupiah(data.discount)}!`;
		} catch (e) {
			voucherError = e instanceof Error ? e.message : "Voucher tidak bisa dipakai.";
			appliedVoucher = null;
		} finally {
			voucherApplying = false;
		}
	}

	function hapusVoucher() {
		appliedVoucher = null;
		voucherCode = "";
		voucherMsg = "";
		voucherError = "";
	}

	async function buatQris() {
		if (creating || items.length === 0) return;
		// Validasi hadiah di sisi klien (server memvalidasi ulang):
		// email penerima wajib + valid, bukan email sendiri, pesan <= 200.
		giftError = "";
		if (giftOn) {
			const emailPenerima = giftEmail.trim().toLowerCase();
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPenerima)) {
				giftError = "Email penerima hadiah wajib diisi dengan format yang benar.";
				return;
			}
			if ($auth.user?.email && emailPenerima === $auth.user.email.toLowerCase()) {
				giftError = "Hadiah tidak bisa dikirim ke emailmu sendiri.";
				return;
			}
			if (giftMessage.length > 200) {
				giftError = "Pesan hadiah maksimal 200 karakter.";
				return;
			}
		}
		creating = true;
		createError = "";
		statusMsg = "";
		try {
			const data = await api<{ order: OrderGift }>("/api/checkout", {
				method: "POST",
				body: JSON.stringify({
					items: items.map((p) => p.id),
					idempotency_key: newIdempotencyKey(),
					whatsapp: whatsapp.trim() || undefined,
					voucher_code: appliedVoucher?.code ?? undefined,
					...(donateOn ? { donate: true } : {}),
					...(giftOn
						? {
								gift_recipient_email: giftEmail.trim(),
								gift_recipient_name: giftName.trim() || undefined,
								gift_message: giftMessage.trim() || undefined
							}
						: {})
				})
			});
			order = data.order;
			localStorage.setItem(LAST_ORDER_KEY, data.order.id);
		} catch (e) {
			// 503 KlikQRIS belum dikonfigurasi: tampilkan pesan ramah dari server.
			createError =
				e instanceof Error
					? e.message
					: "Pembayaran belum bisa dibuat. Coba lagi sebentar lagi ya.";
		} finally {
			creating = false;
		}
	}

	async function cekStatus() {
		if (!order || checking) return;
		checking = true;
		statusMsg = "";
		try {
			const data = await api<{ order: Order }>(`/api/payment/status/${order.id}`);
			order = data.order;
			if (data.order.status === "PAID") {
				cart.clear();
				localStorage.removeItem(LAST_ORDER_KEY);
				goto(`/sukses?order_id=${data.order.id}`);
			} else if (data.order.status === "EXPIRED") {
				statusMsg = "Kode QRIS ini sudah kedaluwarsa. Silakan buat pembayaran baru.";
			} else {
				statusMsg = "Belum ada pembayaran masuk. Coba cek lagi sebentar lagi ya.";
			}
		} catch (e) {
			statusMsg = e instanceof Error ? e.message : "Gagal memeriksa status.";
		} finally {
			checking = false;
		}
	}
</script>

<!-- Bar atas layar dorong: kembali + judul di tengah -->
<div
	class="sticky top-0 z-30 -mx-4 flex items-center gap-2 border-b border-[#e7e2d2] bg-[#fffdf7]/95 px-2 py-2.5 backdrop-blur lg:top-14 lg:-mx-8 lg:px-4"
>
	<button
		type="button"
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#177245]"
		aria-label="Kembali"
		onclick={() => goto("/keranjang")}
	>
		<Icon name="chevron-left" size={24} />
	</button>
	<h1 class="min-w-0 flex-1 truncate text-center text-base font-bold">Checkout</h1>
	<span class="h-9 w-9 shrink-0" aria-hidden="true"></span>
</div>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if order}
	<!-- Tampilan pembayaran QRIS (bila order sudah PAID, pengguna diarahkan ke /sukses) -->
	<div class="card mt-4 p-4 text-center lg:mx-auto lg:max-w-xl">
		{#if order.status === "EXPIRED"}
			<p class="flex justify-center"><Icon name="alarm-clock" size={40} class="text-[#b91c1c]" /></p>
			<p class="mt-2 text-lg font-extrabold">Kode QRIS Kedaluwarsa</p>
			<p class="mt-1 text-sm text-[#3f4a42]">
				Nomor order: <b>{order.id}</b>. Silakan buat pembayaran baru dari keranjang.
			</p>
			<a href="/keranjang" class="btn btn-primary mt-4 w-full">Kembali ke Keranjang</a>
		{:else}
			<p class="text-lg font-extrabold">Scan QRIS untuk Membayar</p>
			<p class="mt-1 text-sm text-[#5f6b62]">Nomor order: <b>{order.id}</b></p>
			{#if order.qris_url && isImageUrl(order.qris_url)}
				<img
					src={order.qris_url}
					alt="Kode QRIS pembayaran"
					class="mx-auto mt-4 h-60 w-60 rounded-2xl border border-[#e7e2d2] object-contain"
				/>
			{:else if order.qris_url}
				<p class="mt-4 break-all rounded-xl bg-[#f7f5ef] p-3 text-xs">{order.qris_url}</p>
			{/if}
			<p class="mt-3 text-2xl font-extrabold text-[#177245]">
				{formatRupiah(order.total_amount ?? order.total)}
			</p>
			{#if order.is_gift}
				<p class="mx-auto mt-2 flex max-w-md items-center justify-center gap-1.5 rounded-xl bg-[#fff8e6] px-3 py-2 text-sm font-bold text-[#22302a]">
					<Icon name="package" size={16} class="shrink-0" />
					<span>
						Hadiah untuk {order.gift_recipient_name ?? order.gift_recipient_email} — aksesnya
						milik penerima, bukan kamu.
					</span>
				</p>
			{/if}
			{#if order.donated}
				<p class="mx-auto mt-2 flex max-w-md items-center justify-center gap-1.5 rounded-xl bg-[#e7f7ef] px-3 py-2 text-sm font-bold text-[#065f46]">
					<Icon name="thumbs-up" size={16} class="shrink-0" />
					<span>Kamu mendonasikan 1 akses produk ini.</span>
				</p>
			{/if}
			{#if order.discount_amount}
				<p class="mt-1 text-sm font-bold text-[#065f46]">
					Diskon voucher{#if order.voucher_code} ({order.voucher_code}){/if}: -{formatRupiah(
						order.discount_amount
					)}
				</p>
			{/if}
			{#if order.expired_at}
				<p class="mt-1 text-xs font-semibold text-[#b91c1c]">
					Berlaku sampai {formatTanggal(order.expired_at)}
				</p>
			{/if}
			{#if order.direct_url}
				<a
					href={order.direct_url}
					target="_blank"
					rel="noopener noreferrer"
					class="btn btn-outline btn-block mt-4"
				>
					<Icon name="link" size={16} /> Lanjutkan Bayar (Buka Pembayaran)
				</a>
			{/if}
			<button
				type="button"
				class="btn btn-primary btn-block mt-2"
				disabled={checking}
				onclick={cekStatus}
			>
				{#if checking}Memeriksa...{:else}<Icon name="refresh" size={16} /> Cek Status Pembayaran{/if}
			</button>
			{#if statusMsg}
				<p class="ok-msg mt-3 text-left">{statusMsg}</p>
			{/if}
			<p class="mt-3 text-xs text-[#5f6b62]">
				Sudah bayar tapi status belum berubah? Tekan "Cek Status" lagi setelah beberapa detik.
			</p>
		{/if}
	</div>
{:else if items.length === 0}
	<div class="card mt-4 p-6 text-center lg:mx-auto lg:max-w-xl">
		<p class="flex justify-center"><Icon name="shopping-cart" size={40} class="text-[#177245]" /></p>
		<p class="mt-2 font-bold">Keranjangmu kosong</p>
		<p class="mt-1 text-sm text-[#5f6b62]">Tidak ada yang perlu dibayar sekarang.</p>
		<a href="/katalog" class="btn btn-primary mt-4"><Icon name="search" size={16} /> Lihat Katalog</a>
	</div>
{:else}
	<!-- Desktop: dua kolom — form kiri, ringkasan order sticky kanan -->
	<div class="lg:mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
		<div class="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-[72px] lg:self-start">
	<!-- Ringkasan order -->
	<div class="card mt-4 p-4 lg:mt-0">
		<h2 class="text-sm font-extrabold text-[#3f4a42]">Ringkasan Order</h2>
		<div class="mt-2 space-y-2">
			{#each items as p (p.id)}
				<div class="flex justify-between gap-2 text-sm">
					<span class="line-clamp-1 font-semibold">{p.title}</span>
					<span class="shrink-0 font-bold">{formatRupiah(p.price)}</span>
				</div>
			{/each}
		</div>
		<div class="mt-3 flex justify-between border-t border-dashed border-[#e7e2d2] pt-3">
			<span class="font-extrabold">Total Bayar</span>
			<span class="text-lg font-extrabold text-[#177245]">{formatRupiah(grandTotal)}</span>
		</div>
		{#if donateOn}
			<div class="mt-2 flex justify-between text-sm font-bold text-[#065f46]">
				<span>Donasi 1 akses</span>
				<span>{formatRupiah(donationAmount)}</span>
			</div>
		{/if}
		{#if appliedVoucher}
			<div class="mt-2 flex justify-between text-sm font-bold text-[#065f46]">
				<span>Diskon ({appliedVoucher.code})</span>
				<span>-{formatRupiah(appliedVoucher.discount)}</span>
			</div>
		{/if}
	</div>
		</div>

		<div class="min-w-0 lg:col-start-1 lg:row-start-1">
	<!-- Kode voucher -->
	<div class="card mt-3 p-4 lg:mt-0">
		<label class="lbl" for="voucher">Kode Voucher (opsional)</label>
		{#if appliedVoucher}
			<p class="ok-msg flex items-center justify-between gap-2">
				<span><Icon name="receipt" size={15} class="inline-block align-[-2px]" /> Voucher {appliedVoucher.code} aktif — hemat {formatRupiah(appliedVoucher.discount)}</span>
				<button type="button" class="shrink-0 font-extrabold underline" onclick={hapusVoucher}>
					Hapus
				</button>
			</p>
		{:else}
			<div class="flex gap-2">
				<input
					id="voucher"
					class="input uppercase"
					type="text"
					placeholder="Contoh: HEMAT10"
					bind:value={voucherCode}
					onkeydown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							pakaiVoucher();
						}
					}}
				/>
				<button
					type="button"
					class="btn btn-sun shrink-0"
					disabled={voucherApplying}
					onclick={pakaiVoucher}
				>
					{voucherApplying ? "Memeriksa..." : "Pakai"}
				</button>
			</div>
		{/if}
		{#if voucherError}
			<p class="err mt-2">{voucherError}</p>
		{/if}
		{#if voucherMsg}
			<p class="ok-msg mt-2">{voucherMsg}</p>
		{/if}
	</div>

	<div class="card mt-3 p-4">
		<label class="lbl" for="wa">Nomor WhatsApp (opsional)</label>
		<input
			id="wa"
			class="input"
			type="tel"
			inputmode="tel"
			placeholder="08xxxxxxxxxx"
			bind:value={whatsapp}
		/>
		<p class="mt-1 text-xs text-[#5f6b62]">
			Bila diisi, nomor ini dipakai untuk info pesananmu.
		</p>
	</div>

	<!-- Beli sebagai hadiah -->
	<div class="card mt-3 p-4">
		<label class="flex cursor-pointer items-start gap-2.5">
			<input type="checkbox" class="mt-1 h-4 w-4 shrink-0 accent-[#177245]" bind:checked={giftOn} />
			<span>
				<span class="flex items-center gap-1.5 font-extrabold">
					<Icon name="package" size={17} /> Beli sebagai hadiah
				</span>
				<span class="mt-0.5 block text-xs text-[#5f6b62]">
					Produk dikirim ke email penerima. Aksesnya milik penerima — bukan akunmu.
				</span>
			</span>
		</label>
		{#if giftOn}
			<div class="mt-3 space-y-3">
				<div>
					<label class="lbl" for="gift-email">Email penerima (wajib)</label>
					<input
						id="gift-email"
						class="input"
						type="email"
						placeholder="penerima@contoh.id"
						bind:value={giftEmail}
						required
					/>
				</div>
				<div>
					<label class="lbl" for="gift-nama">Nama penerima (opsional)</label>
					<input
						id="gift-nama"
						class="input"
						type="text"
						placeholder="Nama penerima hadiah"
						maxlength={100}
						bind:value={giftName}
					/>
				</div>
				<div>
					<label class="lbl" for="gift-pesan">Pesan singkat (opsional)</label>
					<textarea
						id="gift-pesan"
						class="input min-h-16 resize-y"
						placeholder="Tulis pesan untuk penerima..."
						maxlength={200}
						bind:value={giftMessage}
					></textarea>
					<p class="mt-1 text-right text-xs text-[#5f6b62]">{giftMessage.length}/200</p>
				</div>
				<p class="text-xs text-[#5f6b62]">
					Setelah lunas, penerima mendapat email berisi tautan klaim (berlaku 30 hari).
					Bila email penerima sudah punya akun Ringkas, akses langsung masuk ke akunnya.
				</p>
			</div>
		{/if}
		{#if giftError}
			<p class="err mt-2">{giftError}</p>
		{/if}
	</div>

	<!-- Beli 1, donasi 1 -->
	<div class="card mt-3 p-4">
		<label class="flex cursor-pointer items-start gap-2.5">
			<input type="checkbox" class="mt-1 h-4 w-4 shrink-0 accent-[#177245]" bind:checked={donateOn} />
			<span>
				<span class="flex items-center gap-1.5 font-extrabold">
					<Icon name="thumbs-up" size={17} /> Beli 1, donasi 1
				</span>
				<span class="mt-0.5 block text-xs text-[#5f6b62]">
					Berbagi satu akses belajar untuk anak yang membutuhkan.
				</span>
			</span>
		</label>
		{#if donateOn}
			<p class="mt-3 rounded-xl bg-[#e7f7ef] px-3 py-2 text-sm text-[#22302a]">
				Kamu membayar 2× harga produk: 1 untukmu, 1 didonasikan ke anak yang membutuhkan.
				Donasi masuk pool dan ditetapkan admin ke penerima.
			</p>
		{/if}
	</div>

	{#if createError}
		<p class="err mt-3">{createError}</p>
	{/if}

	<button
		type="button"
		class="btn btn-primary btn-block mt-4 !py-3 text-base"
		disabled={creating || items.length === 0}
		onclick={buatQris}
	>
		{#if creating}Membuat QRIS...{:else}<Icon name="smartphone" size={16} /> Buat QRIS{/if}
	</button>
	<p class="mt-2 text-center text-xs text-[#5f6b62]">
		Pembayaran aman via QRIS. Satu kode QRIS untuk satu order.
	</p>
		</div>
	</div>
{/if}
