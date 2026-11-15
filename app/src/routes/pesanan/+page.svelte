<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import {
		api,
		apiBlob,
		downloadBlob,
		formatRupiah,
		formatTanggal,
		getToken,
		waLink,
		type Order
	} from "$lib/api";
	import { auth } from "$lib/store";

	let orders = $state<Order[]>([]);
	let loading = $state(true);
	let error = $state("");
	let checkingId = $state<string | null>(null);
	let downloadingId = $state<string | null>(null);
	let notice = $state("");

	let statusBadge = $derived((s: string) =>
		s === "PAID" ? "badge-leaf" : s === "EXPIRED" ? "badge-red" : "badge-sun"
	);
	let statusLabel = $derived((s: string) =>
		s === "PAID" ? "LUNAS" : s === "EXPIRED" ? "KEDALUWARSA" : "MENUNGGU BAYAR"
	);

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		await loadOrders();
	});

	async function loadOrders() {
		loading = true;
		error = "";
		try {
			const data = await api<{ orders: Order[] }>("/api/orders");
			orders = data.orders ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat pesanan.";
		} finally {
			loading = false;
		}
	}

	async function cekStatus(orderId: string) {
		checkingId = orderId;
		notice = "";
		try {
			const data = await api<{ order: Order }>(`/api/payment/status/${orderId}`);
			orders = orders.map((o) => (o.id === orderId ? data.order : o));
			notice =
				data.order.status === "PAID"
					? `🎉 Order ${orderId} sudah LUNAS. Selamat belajar!`
					: data.order.status === "EXPIRED"
						? `⏰ Order ${orderId} sudah kedaluwarsa.`
						: `Order ${orderId} masih menunggu pembayaran.`;
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal memeriksa status.";
		} finally {
			checkingId = null;
		}
	}

	async function unduhStruk(orderId: string) {
		downloadingId = `struk-${orderId}`;
		try {
			const { blob, filename } = await apiBlob(`/api/orders/${orderId}/receipt`);
			downloadBlob(blob, filename || `struk-${orderId}.pdf`);
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunduh struk.";
		} finally {
			downloadingId = null;
		}
	}

	async function unduhPdf(orderId: string, productId: string, title: string) {
		downloadingId = `pdf-${orderId}-${productId}`;
		try {
			const { blob, filename } = await apiBlob(
				`/api/orders/${orderId}/download/${productId}`
			);
			downloadBlob(blob, filename || `${title}.pdf`);
		} catch (e) {
			notice = e instanceof Error ? e.message : "Gagal mengunduh PDF.";
		} finally {
			downloadingId = null;
		}
	}

	function pesanWa(o: Order, productTitle: string, link: string): string {
		const nama = $auth.user?.name ?? "Saya";
		return (
			`Halo! ${nama} sudah membeli "${productTitle}" di Ringkas.\n` +
			`Nomor order: ${o.id}\n` +
			`Link produk: ${link}\n` +
			`Terima kasih!`
		);
	}

	function linkProduk(productId: string, externalUrl?: string | null): string {
		if (externalUrl) return externalUrl;
		return `${location.origin}/belajar/${productId}`;
	}
</script>

<h1 class="text-xl font-extrabold">Pesanan Saya 🧾</h1>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#64748b]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
	<button type="button" class="btn btn-primary mt-3" onclick={loadOrders}>Coba Lagi</button>
{:else if orders.length === 0}
	<div class="card mt-4 p-6 text-center">
		<p class="text-4xl">🧾</p>
		<p class="mt-2 font-bold">Belum ada pesanan</p>
		<p class="mt-1 text-sm text-[#64748b]">Pesananmu setelah checkout akan muncul di sini.</p>
		<a href="/katalog" class="btn btn-primary mt-4">🔍 Lihat Katalog</a>
	</div>
{:else}
	{#if notice}
		<p class="ok-msg mt-4">{notice}</p>
	{/if}
	<div class="mt-4 space-y-3">
		{#each orders as o (o.id)}
			<article class="card p-4">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="truncate text-sm font-extrabold">{o.id}</p>
						<p class="text-xs text-[#64748b]">{formatTanggal(o.created_at)}</p>
					</div>
					<span class="badge {statusBadge(o.status)}">{statusLabel(o.status)}</span>
				</div>
				<div class="mt-2 space-y-1">
					{#each o.items as it (it.product_id)}
						<p class="text-sm">📘 {it.title} — <b>{formatRupiah(it.price)}</b></p>
					{/each}
				</div>
				<p class="mt-2 text-sm">
					Total: <b class="text-[#2273d8]">{formatRupiah(o.total_amount ?? o.total)}</b>
				</p>

				{#if o.status === "PENDING"}
					<button
						type="button"
						class="btn btn-primary btn-block mt-3"
						disabled={checkingId === o.id}
						onclick={() => cekStatus(o.id)}
					>
						{checkingId === o.id ? "Memeriksa..." : "🔄 Cek Status Pembayaran"}
					</button>
				{/if}

				{#if o.status === "PAID"}
					<div class="mt-3 grid grid-cols-2 gap-2">
						<button
							type="button"
							class="btn btn-outline text-xs"
							disabled={downloadingId === `struk-${o.id}`}
							onclick={() => unduhStruk(o.id)}
						>
							🧾 Unduh Struk
						</button>
						{#each o.items as it (it.product_id)}
							<button
								type="button"
								class="btn btn-ghost text-xs"
								disabled={downloadingId === `pdf-${o.id}-${it.product_id}`}
								onclick={() => unduhPdf(o.id, it.product_id, it.title)}
							>
								📄 Unduh PDF
							</button>
							{#if it.externalUrl}
								<a
									href={it.externalUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="btn btn-sun text-xs"
								>
									🔗 Buka Produk
								</a>
							{/if}
							<a
								href={waLink(
									o.whatsapp ?? $auth.user?.whatsapp,
									pesanWa(o, it.title, linkProduk(it.product_id, it.externalUrl))
								)}
								target="_blank"
								rel="noopener noreferrer"
								class="btn btn-leaf text-xs"
							>
								💬 Kirim ke WhatsApp
							</a>
						{/each}
					</div>
					<p class="mt-2 text-[11px] leading-relaxed text-[#64748b]">
						Membuka WhatsApp dengan pesan siap kirim — bukan pengiriman otomatis dari server.
					</p>
					<a href={`/belajar/${o.items[0]?.product_id}`} class="btn btn-primary btn-block mt-2">
						📖 Buka Ruang Belajar
					</a>
				{/if}
			</article>
		{/each}
	</div>
{/if}
