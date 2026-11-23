<script lang="ts">
	import "../app.css";
	import "../storefront.css";
	import "../workspace.css";
	import { onMount } from "svelte";
	import type { Snippet } from "svelte";
	import { page } from "$app/state";
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
		NO_TAB_PREFIXES.some((p) => page.url.pathname.startsWith(p))
	);
	let tabActive = $derived((href: string) => {
		const path = page.url.pathname;
		if (href === "/") return path === "/";
		return path === href || path.startsWith(href + "/");
	});

	// Bila ada token tapi profil belum dimuat, ambil dari server.
	// Pengaturan aksesibilitas/hemat data: terapkan cache dulu (instan),
	// lalu sinkronkan dari server bila sudah masuk. Label header memakai
	// store agar ikut berubah bila pengaturan diubah di halaman lain.
	if (typeof window !== "undefined") applyCachedSettings();

	let dataSaver = $derived($settingsStore.data_saver === 1);
	onMount(async () => {
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

	// Pencarian header desktop: buka /katalog dengan kata kunci (?q=).
	const NAV = [
		{ href: "/", label: "Beranda", icon: "home" },
		{ href: "/katalog", label: "Katalog", icon: "library" },
		{ href: "/pesanan", label: "Pesanan", icon: "receipt" },
		{ href: "/alat", label: "Alat belajar", icon: "layers" }
	];
	const FOOTER = [
		{ href: "/blog", label: "Blog" },
		{ href: "/faq", label: "FAQ" },
		{ href: "/update", label: "Update" },
		{ href: "/privasi", label: "Privasi" },
		{ href: "/syarat", label: "Syarat" }
	];
	let storefront = $derived(
		["/", "/katalog", "/keranjang", "/checkout"].includes(page.url.pathname) || page.url.pathname.startsWith("/produk/")
	);
	let adminMode = $derived(page.url.pathname === "/admin");
	let focused = $derived(["/anbk/[paket]", "/cerita/[id]", "/tryout/[id]", "/kuis-guru/[id]", "/onboarding"].includes(page.route.id ?? ""));
	let headerQ = $state("");
	function cariHeader(e: SubmitEvent) {
		e.preventDefault();
		const term = headerQ.trim();
		goto(term ? `/katalog?q=${encodeURIComponent(term)}` : "/katalog");
	}
</script>

{#snippet cartLink(className: string)}
	<a class={className} href="/keranjang" aria-current={tabActive("/keranjang") ? "page" : undefined} aria-label="Keranjang, {$cartCount} produk">
		<Icon name="shopping-cart" size={21} />
		{#if $cartCount > 0}<span class="cart-count">{$cartCount}</span>{/if}
	</a>
{/snippet}

<div class="site-shell" class:storefront class:admin-shell={adminMode} class:focused-shell={focused} class:has-mobile-nav={!hideTabs}>
	<a class="skip-link" href="#site-main">Lewati ke konten</a>
	<header class="site-header">
		<div class="site-width header-content">
			<a href="/" class="site-brand" aria-label="Ringkas, Beranda">
				<img src="/logo/logo-ringkas-icon-emerald.svg" alt="" width="30" height="29" class="datasaver-hide" />
				<span>Ringkas<span class="brand-period">.</span></span>
			</a>
			{#if !adminMode}
				<nav class="header-nav" aria-label="Menu utama">
					{#each NAV as item (item.href)}
						<a href={item.href} aria-current={tabActive(item.href) ? "page" : undefined}>{item.label}</a>
					{/each}
				</nav>
			{/if}

			<div class="header-actions">
				{#if dataSaver}
					<span class="data-indicator" title="Mode hemat data" aria-label="Mode hemat data"><Icon name="zap" size={18} /></span>
				{/if}
				{#if !adminMode}
					<a href="/alat" class="header-tool" aria-current={tabActive("/alat") ? "page" : undefined} aria-label="Alat belajar"><Icon name="layers" size={17} /> Alat</a>
					<form class="header-search" action="/katalog" onsubmit={cariHeader} role="search" aria-label="Pencarian cepat">
						<Icon name="search" size={18} />
						<input name="q" type="search" placeholder="Cari materi" bind:value={headerQ} aria-label="Cari di katalog" />
					</form>
					{@render cartLink(hideTabs ? "header-cart" : "header-cart desktop-cart")}
				{/if}
				<a href="/akun" class="header-account" aria-current={tabActive("/akun") ? "page" : undefined}>
					<Icon name="user" size={17} />
					<span>{$auth.user ? $auth.user.name.split(" ")[0] : "Masuk"}</span>
				</a>
			</div>
		</div>
	</header>

	<main id="site-main" class="site-width site-main" tabindex="-1">
		<PageFade key={page.url.pathname}>
			{@render children?.()}
		</PageFade>
	</main>

	{#if !adminMode}
		<footer class="site-footer">
			<div class="site-width footer-content">
				<div>
					<a href="/" class="site-brand" aria-label="Ringkas, Beranda">
						<img src="/logo/logo-ringkas-icon-emerald.svg" alt="" width="30" height="29" class="datasaver-hide" />
						<span>Ringkas<span class="brand-period">.</span></span>
					</a>
					<p>Rangkuman dan latihan untuk kelas 1–6 SD & MI.</p>
				</div>
				<nav aria-label="Informasi Ringkas">
					{#each FOOTER as item (item.href)}
						<a href={item.href}>{item.label}</a>
					{/each}
				</nav>
				<p class="footer-copyright">© 2026 Ringkas</p>
			</div>
		</footer>
	{/if}

	{#if !hideTabs}
		<nav class="mobile-nav" aria-label="Navigasi bawah">
			{#each NAV.slice(0, 2) as item (item.href)}
				<a href={item.href} aria-current={tabActive(item.href) ? "page" : undefined}><Icon name={item.icon} size={20} />{item.label}</a>
			{/each}
			<a href="/keranjang" aria-current={tabActive("/keranjang") ? "page" : undefined} aria-label="Keranjang, {$cartCount} produk">
				<span class="tab-cart"><Icon name="shopping-cart" size={20} />
					{#if $cartCount > 0}<span class="cart-count">{$cartCount}</span>{/if}
				</span>
				Keranjang
			</a>
			<a href="/pesanan" aria-current={tabActive("/pesanan") ? "page" : undefined}><Icon name="receipt" size={20} />Pesanan</a>
			<a href="/akun" aria-current={tabActive("/akun") ? "page" : undefined}><Icon name="user" size={20} />Akun</a>
		</nav>
	{/if}
</div>
