<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import {
		api,
		apiBlob,
		downloadBlob,
		formatRupiah,
		formatTanggal,
		getToken,
		type Order
	} from "$lib/api";
	import { cart } from "$lib/store";
	import Icon from "$lib/Icon.svelte";

	const LAST_ORDER_KEY = "ringkas_last_order";

	let orderId = $state<string | null>(null);
	let order = $state<Order | null>(null);
	let loading = $state(true);
	let error = $state("");
	let downloadingStruk = $state(false);
	let checkingNow = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	/** Order sudah lunas: keranjang tidak perlu lagi menyimpan itemnya. */
	function tandaiLunas() {
		cart.clear();
		try {
			localStorage.removeItem(LAST_ORDER_KEY);
		} catch {
			/* abaikan */
		}
	}

	async function loadOrder(id: string, quiet = false): Promise<Order | null> {
		try {
			const data = await api<{ order: Order }>(`/api/payment/status/${id}`);
			order = data.order;
			error = "";
			if (data.order.status === "PAID") tandaiLunas();
			return data.order;
		} catch (e) {
			if (!quiet) {
				error =
					e instanceof Error ? e.message : "Gagal memuat order. Coba lagi ya.";
			}
			return null;
		}
	}

	function startPolling() {
		stopPolling();
		pollTimer = setInterval(async () => {
			if (!orderId) return;
			const o = await loadOrder(orderId, true);
			if (o && o.status !== "PENDING") stopPolling();
		}, 10000);
	}

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		orderId = $page.url.searchParams.get("order_id");
		if (!orderId) {
			loading = false;
			return;
		}
		const o = await loadOrder(orderId);
		loading = false;
		if (o && o.status === "PENDING") startPolling();
	});

	onDestroy(stopPolling);

	async function cekSekarang() {
		if (!orderId || checkingNow) return;
		checkingNow = true;
		const o = await loadOrder(orderId);
		checkingNow = false;
		if (o && o.status === "PENDING") startPolling();
	}

	async function unduhStruk() {
		if (!order || downloadingStruk) return;
		downloadingStruk = true;
		try {
			const { blob, filename } = await apiBlob(`/api/orders/${order.id}/receipt`);
			downloadBlob(blob, filename || `struk-${order.id}.pdf`);
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal mengunduh struk.";
		} finally {
			downloadingStruk = false;
		}
	}

	function lanjutkanBayar() {
		if (!orderId) return;
		try {
			localStorage.setItem(LAST_ORDER_KEY, orderId);
		} catch {
			/* abaikan */
		}
		goto("/checkout");
	}
</script>

<!-- Bar atas layar dorong: kembali + judul di tengah -->
<div
	class="sticky top-0 z-30 -mx-4 flex items-center gap-2 border-b border-[#e7e2d2] bg-[#fffdf7]/95 px-2 py-2.5 backdrop-blur lg:top-14 lg:-mx-8 lg:px-4"
>
	<button
		type="button"
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#177245]"
		aria-label="Kembali ke Pesanan Saya"
		onclick={() => goto("/pesanan")}
	>
		<Icon name="chevron-left" size={24} />
	</button>
	<h1 class="min-w-0 flex-1 truncate text-center text-base font-bold">
		Status Pembayaran
	</h1>
	<span class="h-9 w-9 shrink-0" aria-hidden="true"></span>
</div>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if !orderId}
	<div class="card mt-4 p-6 text-center lg:mx-auto lg:max-w-xl">
		<p class="flex justify-center">
			<Icon name="help-circle" size={40} class="text-[#177245]" />
		</p>
		<p class="mt-2 text-lg font-extrabold">Tidak Ada Nomor Order</p>
		<p class="mt-1 text-sm text-[#5f6b62]">
			Halaman ini membutuhkan nomor order. Buka Pesanan Saya untuk melihat pesananmu.
		</p>
		<div class="mt-4 flex flex-col gap-2">
			<a href="/pesanan" class="btn btn-primary btn-block">Lihat Pesanan Saya</a>
			<a href="/katalog" class="btn btn-outline btn-block">Lihat Katalog</a>
		</div>
	</div>
{:else if error || !order}
	<div class="card mt-4 p-6 text-center lg:mx-auto lg:max-w-xl">
		<p class="flex justify-center">
			<Icon name="x-circle" size={40} class="text-[#b91c1c]" />
		</p>
		<p class="mt-2 text-lg font-extrabold">Order Tidak Ditemukan</p>
		<p class="mt-1 text-sm text-[#5f6b62]">
			{error || "Order tidak ditemukan atau bukan milik akun ini."}
		</p>
		<div class="mt-4 flex flex-col gap-2">
			<a href="/pesanan" class="btn btn-primary btn-block">Lihat Pesanan Saya</a>
			<a href="/katalog" class="btn btn-outline btn-block">Lihat Katalog</a>
		</div>
	</div>
{:else if order.status === "PAID"}
	<div class="card mt-4 p-6 text-center lg:mx-auto lg:max-w-xl">
		<p class="flex justify-center">
			<Icon name="check-circle" size={56} class="text-[#177245]" />
		</p>
		<h2 class="mt-2 text-xl font-extrabold text-[#065f46]">Pembayaran Berhasil!</h2>
		<p class="mt-1 text-sm text-[#5f6b62]">
			Terima kasih! Produkmu sudah bisa dibuka di Ruang Belajar.
		</p>

		<div class="mt-4 space-y-2 rounded-2xl bg-[#f7f5ef] p-4 text-left text-sm">
			<div class="flex justify-between gap-2">
				<span class="text-[#5f6b62]">Nomor order</span>
				<b class="break-all text-right">{order.id}</b>
			</div>
			{#each order.items as it (it.product_id)}
				<div class="flex justify-between gap-2">
					<span class="text-[#5f6b62]">{it.title}</span>
					<b class="shrink-0">{formatRupiah(it.price)}</b>
				</div>
			{/each}
			<div
				class="flex justify-between gap-2 border-t border-dashed border-[#e7e2d2] pt-2"
			>
				<span class="text-[#5f6b62]">Total dibayar</span>
				<b class="text-[#177245]">{formatRupiah(order.total_amount ?? order.total)}</b>
			</div>
			{#if order.paid_at}
				<div class="flex justify-between gap-2">
					<span class="text-[#5f6b62]">Tanggal bayar</span>
					<b>{formatTanggal(order.paid_at)}</b>
				</div>
			{/if}
		</div>

		<div class="mt-4 flex flex-col gap-2">
			{#each order.items as it (it.product_id)}
				<a href={`/belajar/${it.product_id}`} class="btn btn-leaf btn-block">
					<Icon name="book-open" size={16} /> Mulai Belajar — {it.title}
				</a>
				{#if it.externalUrl}
					<a
						href={it.externalUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-outline btn-block"
					>
						<Icon name="link" size={16} /> Buka Produk — {it.title}
					</a>
				{/if}
			{/each}
			<button
				type="button"
				class="btn btn-primary btn-block"
				disabled={downloadingStruk}
				onclick={unduhStruk}
			>
				{#if downloadingStruk}
					Mengunduh...
				{:else}
					<Icon name="receipt" size={16} /> Unduh Struk
				{/if}
			</button>
			<a href="/pesanan" class="btn btn-outline btn-block">Lihat Pesanan Saya</a>
			<a href="/" class="btn btn-ghost btn-block">Kembali ke Beranda</a>
		</div>
	</div>
{:else if order.status === "EXPIRED"}
	<div class="card mt-4 p-6 text-center lg:mx-auto lg:max-w-xl">
		<p class="flex justify-center">
			<Icon name="alarm-clock" size={40} class="text-[#b91c1c]" />
		</p>
		<p class="mt-2 text-lg font-extrabold">Pembayaran Kedaluwarsa</p>
		<p class="mt-1 text-sm text-[#5f6b62]">
			Nomor order: <b>{order.id}</b>. Kode QRIS ini sudah tidak berlaku. Silakan buat
			pembayaran baru dari keranjang.
		</p>
		<div class="mt-4 flex flex-col gap-2">
			<a href="/keranjang" class="btn btn-primary btn-block">Checkout Lagi</a>
			<a href="/pesanan" class="btn btn-outline btn-block">Lihat Pesanan Saya</a>
		</div>
	</div>
{:else}
	<div class="card mt-4 p-6 text-center lg:mx-auto lg:max-w-xl">
		<p class="flex justify-center">
			<Icon name="clock" size={40} class="text-[#177245]" />
		</p>
		<p class="mt-2 text-lg font-extrabold">Menunggu Pembayaran</p>
		<p class="mt-1 text-sm text-[#5f6b62]">
			Nomor order: <b>{order.id}</b>
		</p>
		<p class="mt-3 text-2xl font-extrabold text-[#177245]">
			{formatRupiah(order.total_amount ?? order.total)}
		</p>
		{#if order.expired_at}
			<p class="mt-1 text-xs font-semibold text-[#b91c1c]">
				Berlaku sampai {formatTanggal(order.expired_at)}
			</p>
		{/if}
		<p class="mt-3 text-sm text-[#5f6b62]">
			Kami mengecek status pembayaranmu otomatis setiap 10 detik. Halaman ini akan berubah
			sendiri menjadi "Pembayaran Berhasil" begitu pembayaran masuk.
		</p>
		<div class="mt-4 flex flex-col gap-2">
			<button type="button" class="btn btn-primary btn-block" onclick={lanjutkanBayar}>
				<Icon name="link" size={16} /> Lanjutkan Bayar
			</button>
			<button
				type="button"
				class="btn btn-outline btn-block"
				disabled={checkingNow}
				onclick={cekSekarang}
			>
				{#if checkingNow}
					Memeriksa...
				{:else}
					<Icon name="refresh" size={16} /> Cek Status Sekarang
				{/if}
			</button>
			<a href="/pesanan" class="btn btn-ghost btn-block">Lihat Pesanan Saya</a>
		</div>
	</div>
{/if}

{#if error && order}
	<p class="err mt-3">{error}</p>
{/if}
