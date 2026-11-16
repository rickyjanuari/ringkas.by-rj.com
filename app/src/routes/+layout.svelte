<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	import type { Snippet } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { auth, cartCount } from "$lib/store";
	import { api, getToken, type User } from "$lib/api";
	import { applyCachedSettings, loadSettings, applySettings, settingsStore } from "$lib/settings";
	import Icon from "$lib/Icon.svelte";
	import PageFade from "$lib/PageFade.svelte";

	let { children }: { children?: Snippet } = $props();

	// Halaman layar penuh tanpa tab bar.
	const NO_TAB_PREFIXES = ["/produk/", "/checkout", "/belajar", "/admin", "/peta-belajar", "/soal-sulitku", "/soal-cerita", "/cerita", "/anbk", "/latihan-adaptif", "/latihan-tanpa-habis", "/rekam-suara", "/jadwal-belajar", "/kuis-guru"];
	let hideTabs = $derived(
		NO_TAB_PREFIXES.some((p) => $page.url.pathname.startsWith(p))
	);
	let tabActive = $derived((href: string) => {
		const path = $page.url.pathname;
		if (href === "/") return path === "/";
		return path === href || path.startsWith(href + "/");
	});

	// Bila ada token tapi profil belum dimuat, ambil dari server.
	// Pengaturan aksesibilitas/hemat data: terapkan cache dulu (instan),
	// lalu sinkronkan dari server bila sudah masuk. Label header memakai
	// store agar ikut berubah bila pengaturan diubah di halaman lain.
	let dataSaver = $derived($settingsStore.data_saver === 1);
	onMount(async () => {
		applyCachedSettings();
		if (getToken()) {
			const settings = await loadSettings();
			applySettings(settings);
		}
		if (getToken() && !$auth.user) {
			try {
				const { user } = await api<{ user: User }>("/api/auth/me");
				auth.setUser(user);
			} catch {
				/* token tidak valid — api() sudah menghapusnya */
			}
		}
	});

	function goCart() {
		goto("/keranjang");
	}

	// Pencarian header desktop: buka /katalog dengan kata kunci (?q=).
	let headerQ = $state("");
	function cariHeader(e: SubmitEvent) {
		e.preventDefault();
		const term = headerQ.trim();
		goto(term ? `/katalog?q=${encodeURIComponent(term)}` : "/katalog");
	}
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#f7f5ef] shadow-[0_1px_2px_rgb(0_0_0/0.05)] lg:max-w-7xl">
	<!-- Header mobile (tetap seperti semula) -->
	<header class="sticky top-0 z-40 border-b border-[#e7e2d2] bg-[#fffdf7]/95 backdrop-blur lg:hidden">
		<div class="flex items-center gap-2 px-4 py-3">
			<a href="/" class="flex items-center gap-2" aria-label="Ringkas — Beranda">
				<img
					src="/logo/logo-ringkas-icon-emerald.svg"
					alt="Logo Ringkas"
					width="24"
					height="24"
					class="datasaver-hide h-6 w-6 shrink-0"
				/>
				<span class="text-[19px] font-semibold text-[#22302a]">Ringkas</span>
			</a>
			<span class="ml-1 hidden rounded-full bg-[#fbeecd] px-2 py-0.5 text-[11px] font-medium text-[#92400e] sm:inline">
				Teman belajar
			</span>
			{#if dataSaver}
				<span class="ml-1 inline-flex items-center gap-1 rounded-full bg-[#dcefe2] px-2 py-0.5 text-[11px] font-medium text-[#115c39]">
					<Icon name="zap" size={16} /> Mode hemat data
				</span>
			{/if}
			<div class="ml-auto flex items-center gap-2">
				{#if $auth.user}
					<a href="/akun" class="flex items-center gap-1.5 rounded-full bg-[#ece9dc] px-2.5 py-1.5 text-xs font-medium text-[#177245]">
						<Icon name="flame" size={16} /> {$auth.user.name.split(" ")[0]}
					</a>
				{:else}
					<a href="/akun" class="btn btn-ghost !px-3 !py-1.5 text-xs">Masuk</a>
				{/if}
			</div>
		</div>
	</header>

	<!-- Header desktop: logo + menu + pencarian + keranjang (sticky, h-14) -->
	<header class="sticky top-0 z-40 hidden border-b border-[#e7e2d2] bg-[#fffdf7]/95 backdrop-blur lg:block">
		<div class="flex h-14 items-center gap-5 px-8">
			<a href="/" class="flex shrink-0 items-center gap-2" aria-label="Ringkas — Beranda">
				<img
					src="/logo/logo-ringkas-icon-emerald.svg"
					alt="Logo Ringkas"
					width="24"
					height="24"
					class="datasaver-hide h-6 w-6 shrink-0"
				/>
				<span class="text-[19px] font-semibold text-[#22302a]">Ringkas</span>
				<span class="ml-1 hidden rounded-full bg-[#fbeecd] px-2 py-0.5 text-[11px] font-medium text-[#92400e] xl:inline">
					Teman belajar
				</span>
				{#if dataSaver}
					<span class="ml-1 inline-flex items-center gap-1 rounded-full bg-[#dcefe2] px-2 py-0.5 text-[11px] font-medium text-[#115c39]">
						<Icon name="zap" size={16} /> Mode hemat data
					</span>
				{/if}
			</a>
			<nav class="flex shrink-0 items-center gap-1 text-sm font-semibold" aria-label="Menu utama">
				<a href="/" class="navlink" class:active={tabActive("/")}>Beranda</a>
				<a href="/katalog" class="navlink" class:active={tabActive("/katalog")}>Katalog</a>
				<a href="/pesanan" class="navlink" class:active={tabActive("/pesanan")}>Pesanan</a>
				<a href="/akun" class="navlink" class:active={tabActive("/akun")}>Akun</a>
			</nav>
			<form class="relative ml-auto w-56 shrink-0 xl:w-72" onsubmit={cariHeader} role="search">
				<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5f6b62]">
					<Icon name="search" size={16} />
				</span>
				<input
					class="input !rounded-full !py-1.5 !pl-9 text-sm"
					type="search"
					placeholder="Cari produk atau bab"
					bind:value={headerQ}
					aria-label="Cari di katalog"
				/>
			</form>
			<a
				href="/keranjang"
				class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#177245] hover:bg-[#ece9dc]"
				aria-label="Keranjang"
			>
				<Icon name="shopping-cart" size={18} />
				{#if $cartCount > 0}
					<span
						class="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[11px] font-semibold text-white"
						>{$cartCount}</span
					>
				{/if}
			</a>
			{#if $auth.user}
				<a href="/akun" class="flex shrink-0 items-center gap-1.5 rounded-full bg-[#ece9dc] px-2.5 py-1.5 text-xs font-medium text-[#177245]">
					<Icon name="flame" size={16} /> {$auth.user.name.split(" ")[0]}
				</a>
			{:else}
				<a href="/akun" class="btn btn-ghost shrink-0 !px-3 !py-1.5 text-xs">Masuk</a>
			{/if}
		</div>
	</header>

	<main class="flex-1 px-4 pb-24 pt-4 lg:px-8 lg:pb-12 lg:pt-6">
		<PageFade key={$page.url.pathname}>
			{@render children?.()}
		</PageFade>

		<footer class="mt-8 rounded-2xl bg-[#145c39] p-5 text-center text-white lg:mt-12 lg:flex lg:items-center lg:justify-between lg:gap-6 lg:px-8 lg:py-6 lg:text-left">
			<div>
				<p class="flex items-center justify-center gap-2 text-base font-semibold lg:justify-start">
					<img
						src="/logo/logo-ringkas-icon-emerald.svg"
						alt=""
						width="22"
						height="22"
						class="datasaver-hide h-[22px] w-[22px] shrink-0"
					/>
					<span>Ringkas</span>
				</p>
				<p class="mt-1 text-xs text-white/75">Rangkuman materi SD kelas 1–6</p>
			</div>
			<nav class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-white lg:mt-0">
				<a href="/blog">Blog</a>
				<a href="/faq">FAQ</a>
				<a href="/update">Update</a>
				<a href="/privasi">Privasi</a>
				<a href="/syarat">Syarat</a>
			</nav>
			<p class="mt-3 text-[11px] text-white/60 lg:mt-0">© 2026 Ringkas — Teman belajar yang ringkas.</p>
		</footer>
	</main>

	{#if !hideTabs}
		<nav
			class="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[430px] -translate-x-1/2 items-stretch border-t border-[#e7e2d2] bg-[#fffdf7] px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgb(0_0_0/0.06)] lg:hidden"
		>
			<a href="/" class="tablink" class:active={tabActive("/")} aria-label="Beranda">
				<Icon name="home" size={18} />Beranda
			</a>
			<a href="/katalog" class="tablink" class:active={tabActive("/katalog")} aria-label="Katalog">
				<Icon name="library" size={18} />Katalog
			</a>
			<button
				type="button"
				onclick={goCart}
				class="relative mx-1 -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f2b33d] text-[#22302a] shadow-[0_8px_24px_rgb(0_0_0/0.06)] ring-4 ring-[#fffdf7]"
				aria-label="Keranjang"
			>
				<Icon name="shopping-cart" size={26} />
				{#if $cartCount > 0}
					<span
						class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[11px] font-semibold text-white"
						>{$cartCount}</span
					>
				{/if}
			</button>
			<a href="/pesanan" class="tablink" class:active={tabActive("/pesanan")} aria-label="Pesanan">
				<Icon name="receipt" size={18} />Pesanan
			</a>
			<a href="/akun" class="tablink" class:active={tabActive("/akun")} aria-label="Akun">
				<Icon name="user" size={18} />Akun
			</a>
		</nav>
	{/if}
</div>
