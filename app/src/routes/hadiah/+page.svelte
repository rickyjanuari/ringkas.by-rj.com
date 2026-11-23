<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatTanggal, getToken } from "$lib/api";

	type GiftInfo = {
		valid: boolean;
		paid: boolean;
		claimed: boolean;
		expired: boolean;
		products: { product_id: string; title: string }[];
		giver_name: string;
		recipient_name: string | null;
		message: string | null;
		expires_at: string | null;
	};

	let token = $state("");
	let info = $state<GiftInfo | null>(null);
	let loading = $state(true);
	let error = $state("");
	let claiming = $state(false);
	let claimError = $state("");
	let claimed = $state<{ already: boolean; products: { product_id: string; title: string }[] } | null>(null);

	let loggedIn = $derived(Boolean(getToken()));

	onMount(async () => {
		try {
			token = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
		} catch {
			token = "";
		}
		if (!token) {
			error = "Tautan hadiah tidak lengkap. Buka lagi tautan dari email hadiahmu ya.";
			loading = false;
			return;
		}
		// Belum login: simpan token supaya setelah masuk/daftar, halaman
		// Akun mengembalikanmu ke sini secara otomatis (bukan di URL
		// setelah login — token tidak lagi tampil di address bar).
		if (!loggedIn) {
			try {
				sessionStorage.setItem("ringkas_pending_gift_token", token);
			} catch {
				/* abaikan */
			}
		}
		try {
			info = await api<GiftInfo>(`/api/gift/claim?token=${encodeURIComponent(token)}`);
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat hadiah.";
		} finally {
			loading = false;
		}
	});

	async function klaim() {
		if (!token || claiming) return;
		claiming = true;
		claimError = "";
		try {
			const data = await api<{ ok: boolean; already: boolean; products: { product_id: string; title: string }[] }>(
				"/api/gift/claim",
				{ method: "POST", body: JSON.stringify({ token }) }
			);
			claimed = { already: data.already, products: data.products ?? [] };
			try {
				sessionStorage.removeItem("ringkas_pending_gift_token");
			} catch {
				/* abaikan */
			}
		} catch (e) {
			claimError = e instanceof Error ? e.message : "Gagal mengklaim hadiah.";
		} finally {
			claiming = false;
		}
	}
</script>

<header class="page-heading page-heading-account">
	<h1><Icon name="package" size={18} /> Hadiah untukmu</h1>
</header>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat hadiahmu...</p>
{:else if error}
	<div class="card mx-auto mt-4 max-w-xl p-6 text-center">
		<p class="flex justify-center"><Icon name="x-circle" size={40} class="text-[#b91c1c]" /></p>
		<p class="mt-2 font-semibold">Hadiah tidak ditemukan</p>
		<p class="mt-1 text-sm text-[#5f6b62]">{error}</p>
		<a href="/katalog" class="btn btn-primary mt-4"><Icon name="search" size={16} /> Lihat katalog</a>
	</div>
{:else if claimed}
	<div class="card mx-auto mt-4 max-w-xl p-6 text-center">
		<p class="flex justify-center"><Icon name="check-circle" size={40} class="text-[#177245]" /></p>
		<p class="mt-2 text-lg font-semibold">
			{claimed.already ? "Hadiah ini sudah ada di akunmu." : "Hadiah berhasil diklaim."}
		</p>
		<p class="mt-1 text-sm text-[#5f6b62]">
			{claimed.already
				? "Aksesnya sudah masuk ke akunmu sebelumnya — langsung belajar saja ya."
				: "Produk di bawah ini sekarang milikmu. Selamat belajar."}
		</p>
		<div class="mt-3 space-y-1 text-left">
			{#each claimed.products as p (p.product_id)}
				<p class="flex items-center gap-1.5 text-sm">
					<Icon name="book-open" size={16} class="shrink-0" /> {p.title}
				</p>
			{/each}
		</div>
		{#if claimed.products[0]}
			<a href={`/belajar/${claimed.products[0].product_id}`} class="btn btn-primary btn-block mt-4">
				<Icon name="book-open" size={16} /> Buka ruang belajar
			</a>
		{/if}
		<a href="/pesanan" class="btn btn-outline btn-block mt-2">
			<Icon name="receipt" size={16} /> Lihat Pesanan saya
		</a>
	</div>
{:else if info}
	<div class="card mx-auto mt-4 max-w-xl p-6">
		<p class="flex justify-center"><Icon name="package" size={40} class="text-[#177245]" /></p>
		<p class="mt-2 text-center text-lg font-semibold">Kamu mendapat hadiah.</p>
		<p class="mt-1 text-center text-sm text-[#5f6b62]">
			{info.giver_name} membelikanmu materi belajar dari Ringkas.
		</p>
		<div class="mt-4 space-y-1">
			{#each info.products as p (p.product_id)}
				<p class="flex items-center gap-1.5 text-sm">
					<Icon name="book-open" size={16} class="shrink-0" /> <span class="font-semibold">{p.title}</span>
				</p>
			{/each}
		</div>
		{#if info.message}
			<p class="mt-3 rounded-xl bg-[#fff8e6] px-3 py-2 text-sm italic">
				&ldquo;{info.message}&rdquo;
			</p>
		{/if}
		{#if info.expires_at}
			<p class="mt-3 text-center text-xs font-semibold text-[#5f6b62]">
				Tautan klaim berlaku sampai {formatTanggal(info.expires_at)}
			</p>
		{/if}

		{#if !info.paid}
			<p class="err mt-4">
				Hadiah ini belum lunas — tunggu sampai pembeli menyelesaikan pembayaran ya.
			</p>
		{:else if info.expired}
			<p class="err mt-4">
				Tautan klaim hadiah ini sudah kedaluwarsa. Minta pembeli untuk menghubungi admin Ringkas ya.
			</p>
		{:else if info.claimed}
			<p class="ok-msg mt-4">Hadiah ini sudah diklaim. Bila ini hadiahmu, cek status klaim di bawah.</p>
			{#if loggedIn}
				<button type="button" class="btn btn-primary btn-block mt-3" disabled={claiming} onclick={klaim}>
					{#if claiming}Memeriksa...{:else}<Icon name="check" size={16} /> Cek status klaim{/if}
				</button>
			{:else}
				<button type="button" class="btn btn-primary btn-block mt-3" onclick={() => goto("/akun")}>
					<Icon name="user" size={16} /> Masuk untuk mengecek
				</button>
			{/if}
		{:else if loggedIn}
			<button type="button" class="btn btn-primary btn-block mt-4" disabled={claiming} onclick={klaim}>
				{#if claiming}Mengklaim...{:else}<Icon name="package" size={16} /> Klaim hadiah ini{/if}
			</button>
			<p class="mt-2 text-center text-xs text-[#5f6b62]">
				Hadiah masuk ke akun yang sedang masuk ({info.recipient_name ?? "penerima"}) — pastikan
				email akunmu sama dengan email penerima hadiah.
			</p>
		{:else}
			<button type="button" class="btn btn-primary btn-block mt-4" onclick={() => goto("/akun")}>
				<Icon name="user" size={16} /> Masuk / daftar untuk klaim
			</button>
			<p class="mt-2 text-center text-xs text-[#5f6b62]">
				Belum punya akun? Daftar dulu dengan email penerima hadiah — setelah masuk, kamu kembali
				ke halaman ini secara otomatis.
			</p>
		{/if}
		{#if claimError}
			<p class="err mt-3">{claimError}</p>
		{/if}
	</div>
{/if}
