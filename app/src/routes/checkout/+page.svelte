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

	const LAST_ORDER_KEY = "ringkas_last_order";

	let catalog = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");
	let whatsapp = $state("");
	let creating = $state(false);
	let checking = $state(false);
	let order = $state<Order | null>(null);
	let createError = $state("");
	let statusMsg = $state("");

	let items = $derived(
		$cart
			.map((id) => catalog.find((p) => p.id === id))
			.filter((p): p is ProductPublic => Boolean(p))
	);
	let total = $derived(items.reduce((s, p) => s + p.price, 0));
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
				await loadOrder(lastId);
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

	async function buatQris() {
		if (creating || items.length === 0) return;
		creating = true;
		createError = "";
		statusMsg = "";
		try {
			const data = await api<{ order: Order }>("/api/checkout", {
				method: "POST",
				body: JSON.stringify({
					items: items.map((p) => p.id),
					idempotency_key: newIdempotencyKey(),
					whatsapp: whatsapp.trim() || undefined
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
				statusMsg = "🎉 Pembayaran berhasil! Produk sudah bisa dibuka di Ruang Belajar.";
				cart.clear();
				localStorage.removeItem(LAST_ORDER_KEY);
			} else if (data.order.status === "EXPIRED") {
				statusMsg = "⏰ Kode QRIS ini sudah kedaluwarsa. Silakan buat pembayaran baru.";
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

<button type="button" class="btn btn-ghost" onclick={() => goto("/keranjang")}>← Kembali</button>
<h1 class="mt-3 text-xl font-extrabold">Checkout 💳</h1>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#64748b]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if order}
	<!-- Tampilan pembayaran QRIS -->
	<div class="card mt-4 p-4 text-center">
		{#if order.status === "PAID"}
			<p class="text-4xl">🎉</p>
			<p class="mt-2 text-lg font-extrabold text-[#065f46]">Pembayaran Berhasil!</p>
			<p class="mt-1 text-sm text-[#475569]">Nomor order: <b>{order.id}</b></p>
			<p class="mt-1 text-sm text-[#475569]">
				Total dibayar: <b>{formatRupiah(order.total_amount ?? order.total)}</b>
			</p>
			<div class="mt-4 flex flex-col gap-2">
				<a href="/pesanan" class="btn btn-primary btn-block">Lihat Pesanan Saya</a>
				{#each order.items as it (it.product_id)}
					<a href={`/belajar/${it.product_id}`} class="btn btn-leaf btn-block">
						📖 Buka Ruang Belajar — {it.title}
					</a>
				{/each}
			</div>
		{:else if order.status === "EXPIRED"}
			<p class="text-4xl">⏰</p>
			<p class="mt-2 text-lg font-extrabold">Kode QRIS Kedaluwarsa</p>
			<p class="mt-1 text-sm text-[#475569]">
				Nomor order: <b>{order.id}</b>. Silakan buat pembayaran baru dari keranjang.
			</p>
			<a href="/keranjang" class="btn btn-primary mt-4 w-full">Kembali ke Keranjang</a>
		{:else}
			<p class="text-lg font-extrabold">Scan QRIS untuk Membayar</p>
			<p class="mt-1 text-sm text-[#64748b]">Nomor order: <b>{order.id}</b></p>
			{#if order.qris_url && isImageUrl(order.qris_url)}
				<img
					src={order.qris_url}
					alt="Kode QRIS pembayaran"
					class="mx-auto mt-4 h-60 w-60 rounded-2xl border border-[#e6eefb] object-contain"
				/>
			{:else if order.qris_url}
				<p class="mt-4 break-all rounded-xl bg-[#f6f9fe] p-3 text-xs">{order.qris_url}</p>
			{/if}
			<p class="mt-3 text-2xl font-extrabold text-[#2273d8]">
				{formatRupiah(order.total_amount ?? order.total)}
			</p>
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
					🔗 Lanjutkan Bayar (Buka Pembayaran)
				</a>
			{/if}
			<button
				type="button"
				class="btn btn-primary btn-block mt-2"
				disabled={checking}
				onclick={cekStatus}
			>
				{checking ? "Memeriksa..." : "🔄 Cek Status Pembayaran"}
			</button>
			{#if statusMsg}
				<p class="ok-msg mt-3 text-left">{statusMsg}</p>
			{/if}
			<p class="mt-3 text-xs text-[#64748b]">
				Sudah bayar tapi status belum berubah? Tekan "Cek Status" lagi setelah beberapa detik.
			</p>
		{/if}
	</div>
{:else if items.length === 0}
	<div class="card mt-4 p-6 text-center">
		<p class="text-4xl">🛒</p>
		<p class="mt-2 font-bold">Keranjangmu kosong</p>
		<p class="mt-1 text-sm text-[#64748b]">Tidak ada yang perlu dibayar sekarang.</p>
		<a href="/katalog" class="btn btn-primary mt-4">🔍 Lihat Katalog</a>
	</div>
{:else}
	<!-- Ringkasan order -->
	<div class="card mt-4 p-4">
		<h2 class="text-sm font-extrabold text-[#475569]">Ringkasan Order</h2>
		<div class="mt-2 space-y-2">
			{#each items as p (p.id)}
				<div class="flex justify-between gap-2 text-sm">
					<span class="line-clamp-1 font-semibold">{p.title}</span>
					<span class="shrink-0 font-bold">{formatRupiah(p.price)}</span>
				</div>
			{/each}
		</div>
		<div class="mt-3 flex justify-between border-t border-dashed border-[#dbe7f7] pt-3">
			<span class="font-extrabold">Total Bayar</span>
			<span class="text-lg font-extrabold text-[#2273d8]">{formatRupiah(total)}</span>
		</div>
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
		<p class="mt-1 text-xs text-[#64748b]">
			Bila diisi, nomor ini dipakai untuk info pesananmu.
		</p>
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
		{creating ? "Membuat QRIS..." : "📱 Buat QRIS"}
	</button>
	<p class="mt-2 text-center text-xs text-[#64748b]">
		Pembayaran aman via QRIS. Satu kode QRIS untuk satu order.
	</p>
{/if}
