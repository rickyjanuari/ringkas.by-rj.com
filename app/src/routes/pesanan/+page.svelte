<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import Mascot from "$lib/Mascot.svelte";
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

	// Field hadiah (migrasi 0010) — ditambahkan server di orderOut /
	// entri hadiah diterima; tidak ada di tipe Order bersama.
	type OrderGift = Order & {
		is_gift?: boolean;
		gift_recipient_email?: string | null;
		gift_recipient_name?: string | null;
		gift_message?: string | null;
		gift_claimed?: boolean;
		is_gift_received?: boolean;
		gift_from_name?: string | null;
		donated?: boolean;
	};

	let orders = $state<OrderGift[]>([]);
	let loading = $state(true);
	let error = $state("");
	let checkingId = $state<string | null>(null);
	let downloadingId = $state<string | null>(null);
	let notice = $state("");
	let paidCount = $derived(orders.filter((order) => order.status === "PAID").length);
	let pendingCount = $derived(orders.filter((order) => order.status === "PENDING").length);

	let statusBadge = $derived((s: string) =>
		s === "PAID" ? "badge-leaf" : s === "EXPIRED" ? "badge-red" : "badge-sun"
	);
	let statusLabel = $derived((s: string) =>
		s === "PAID" ? "Lunas" : s === "EXPIRED" ? "Kedaluwarsa" : "Menunggu bayar"
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
			const data = await api<{ orders: OrderGift[] }>("/api/orders");
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
					? `Order ${orderId} sudah LUNAS. Selamat belajar.`
					: data.order.status === "EXPIRED"
						? `Order ${orderId} sudah kedaluwarsa.`
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
			`Halo, ${nama} sudah membeli "${productTitle}" di Ringkas.\n` +
			`Nomor order: ${o.id}\n` +
			`Link produk: ${link}\n` +
			`Terima kasih.`
		);
	}

	function linkProduk(productId: string, externalUrl?: string | null): string {
		return `${location.origin}/belajar/${productId}`;
	}
</script>

<header class="page-heading page-heading-account order-heading">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1>
				<Icon name="receipt" size={21} /> Pesanan saya
			</h1>
			<p class="mt-1 max-w-xl text-sm leading-relaxed text-[#5f6b62]">
				Riwayat pembayaran, akses materi, dan struk pembelianmu.
			</p>
		</div>
		{#if !loading && orders.length > 0}
			<p class="shrink-0 pt-1 text-right text-sm text-[#5f6b62]">
				<strong class="block text-lg font-semibold tabular-nums text-[#22302a]">{orders.length}</strong>
				pesanan
			</p>
		{/if}
	</div>
	{#if !loading && orders.length > 0}
		<div class="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-[#5f6b62]">
			<span><b class="tabular-nums text-[#177245]">{paidCount}</b> sudah lunas</span>
			{#if pendingCount > 0}<span><b class="tabular-nums text-[#a15c00]">{pendingCount}</b> menunggu pembayaran</span>{/if}
		</div>
	{/if}
</header>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
	<button type="button" class="btn btn-primary mt-3" onclick={loadOrders}>Coba lagi</button>
{:else if orders.length === 0}
	<div class="mx-auto mt-10 max-w-xl border-y border-[#d8d2bd] px-6 py-10 text-center">
		<p class="flex justify-center"><Mascot expression="semangat" /></p>
		<p class="flex justify-center"><Icon name="receipt" size={40} class="text-[#177245]" /></p>
		<p class="mt-2 font-semibold">Belum ada pesanan</p>
		<p class="mt-1 text-sm text-[#5f6b62]">Pesananmu setelah checkout akan muncul di sini.</p>
		<a href="/katalog" class="btn btn-primary mt-4"><Icon name="search" size={16} /> Lihat katalog</a>
	</div>
{:else}
	{#if notice}
		<p class="ok-msg mt-4">{notice}</p>
	{/if}
	<section class="mt-5 overflow-hidden border-y border-[#d8d2bd]" aria-label="Daftar pesanan">
		<div class="hidden grid-cols-[minmax(15rem,1.25fr)_minmax(12rem,1fr)_auto] gap-6 border-b border-[#e7e2d2] px-1 py-3 text-xs font-semibold text-[#5f6b62] lg:grid">
			<span>Pesanan</span>
			<span>Produk & total</span>
			<span class="text-right">Aksi</span>
		</div>
		{#each orders as o (o.id)}
			<article class="border-b border-[#e7e2d2] py-5 first:pt-4 last:border-b-0 last:pb-5 lg:grid lg:grid-cols-[minmax(15rem,1.25fr)_minmax(12rem,1fr)_auto] lg:gap-6">
				<div class="flex items-start justify-between gap-2 lg:block">
					<div class="min-w-0">
						<p class="truncate font-mono text-xs font-semibold tracking-tight text-[#22302a]">{o.id}</p>
						<p class="text-xs text-[#5f6b62]">{formatTanggal(o.created_at)}</p>
					</div>
					<span class="badge {statusBadge(o.status)}">{statusLabel(o.status)}</span>
				</div>
				<div class="mt-3 border-t border-[#e7e2d2] pt-3 lg:mt-0 lg:border-0 lg:pt-0">
					<div class="space-y-1">
					{#each o.items as it (it.product_id)}
						<p class="flex items-center gap-1.5 text-sm"><Icon name="book-open" size={16} class="shrink-0" /> <span class="min-w-0">{it.title} — <b class="font-semibold tabular-nums">{formatRupiah(it.price)}</b></span></p>
					{/each}
					</div>
					<p class="mt-2 text-sm">
						Total <b class="font-semibold tabular-nums text-[#177245]">{formatRupiah(o.total_amount ?? o.total)}</b>
					</p>
				{#if o.is_gift}
					<p class="mt-2 flex items-start gap-1.5 rounded-xl bg-[#fff8e6] px-3 py-2 text-sm font-semibold text-[#22302a]">
						<Icon name="package" size={16} class="mt-0.5 shrink-0" />
						<span>
							Hadiah untuk {o.gift_recipient_name ?? o.gift_recipient_email}
							{#if o.gift_claimed}— sudah diklaim oleh penerima{:else}— menunggu diklaim penerima{/if}
						</span>
					</p>
				{:else if o.is_gift_received}
					<p class="mt-2 flex items-start gap-1.5 rounded-xl bg-[#e7f7ef] px-3 py-2 text-sm font-semibold text-[#065f46]">
						<Icon name="package" size={16} class="mt-0.5 shrink-0" />
						<span>Hadiah dari {o.gift_from_name ?? "seseorang"} — selamat belajar.</span>
					</p>
				{/if}
				{#if o.donated}
					<p class="mt-2 flex items-start gap-1.5 rounded-xl bg-[#e7f7ef] px-3 py-2 text-sm font-semibold text-[#065f46]">
						<Icon name="thumbs-up" size={16} class="mt-0.5 shrink-0" />
						<span>Kamu mendonasikan 1 akses</span>
					</p>
				{/if}

				</div>

				<div class="mt-4 lg:mt-0 lg:min-w-48">
				{#if o.status === "PENDING"}
					<button
						type="button"
						class="btn btn-primary btn-block"
						disabled={checkingId === o.id}
						onclick={() => cekStatus(o.id)}
					>
						{#if checkingId === o.id}Memeriksa...{:else}<Icon name="refresh" size={16} /> Cek status pembayaran{/if}
					</button>
				{/if}

				{#if o.status === "PAID"}
					{#if o.is_gift}
						<!-- Order hadiah (pembeli): akses milik penerima — hanya struk yang tampil. -->
						<div>
							<button
								type="button"
								class="btn btn-outline w-full text-xs"
								disabled={downloadingId === `struk-${o.id}`}
								onclick={() => unduhStruk(o.id)}
							>
								<Icon name="receipt" size={16} /> Unduh struk
							</button>
						</div>
						<p class="mt-2 text-xs text-[#5f6b62]">
							Tombol belajar dan unduh ada di akun penerima setelah hadiah diklaim.
						</p>
					{:else}
					<div class="grid grid-cols-2 gap-2">
						{#if !o.is_gift_received}
						<button
							type="button"
							class="btn btn-outline text-xs"
							disabled={downloadingId === `struk-${o.id}`}
							onclick={() => unduhStruk(o.id)}
						>
							<Icon name="receipt" size={16} /> Unduh struk
						</button>
						{/if}
						{#each o.items as it (it.product_id)}
							{#if it.externalUrl}
								<a
									href={it.externalUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="btn btn-sun text-xs"
								>
									<Icon name="file-text" size={16} /> PDF & Word
								</a>
							{:else}
								<button
									type="button"
									class="btn btn-ghost text-xs"
									disabled={downloadingId === `pdf-${o.id}-${it.product_id}`}
									onclick={() => unduhPdf(o.id, it.product_id, it.title)}
								>
									<Icon name="file-text" size={16} /> Unduh PDF
								</button>
							{/if}
							<a href={`/belajar/${it.product_id}`} class="btn btn-primary text-xs">
								<Icon name="book-open" size={16} /> Latihan web
							</a>
							<a
								href={waLink(
									o.whatsapp ?? $auth.user?.whatsapp,
									pesanWa(o, it.title, linkProduk(it.product_id, it.externalUrl))
								)}
								target="_blank"
								rel="noopener noreferrer"
								class="btn btn-leaf text-xs"
							>
								<Icon name="message" size={16} /> Kirim ke WhatsApp
							</a>
						{/each}
					</div>
					<p class="mt-2 text-[11px] leading-relaxed text-[#5f6b62]">
						Membuka WhatsApp dengan pesan siap kirim — bukan pengiriman otomatis dari server.
					</p>
					{/if}
				{/if}
				</div>
			</article>
		{/each}
	</section>
{/if}
