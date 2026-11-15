<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	import type { Snippet } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { auth, cartCount } from "$lib/store";
	import { api, getToken, type User } from "$lib/api";
	import Icon from "$lib/Icon.svelte";

	let { children }: { children?: Snippet } = $props();

	// Halaman layar penuh tanpa tab bar.
	const NO_TAB_PREFIXES = ["/produk/", "/checkout", "/belajar", "/admin"];
	let hideTabs = $derived(
		NO_TAB_PREFIXES.some((p) => $page.url.pathname.startsWith(p))
	);
	let tabActive = $derived((href: string) => {
		const path = $page.url.pathname;
		if (href === "/") return path === "/";
		return path === href || path.startsWith(href + "/");
	});

	// Bila ada token tapi profil belum dimuat, ambil dari server.
	onMount(async () => {
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
</script>

<div class="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#f7f5ef] shadow-[0_0_40px_rgb(23_114_69/0.08)]">
	<header class="sticky top-0 z-40 border-b border-[#e7e2d2] bg-[#fffdf7]/95 backdrop-blur">
		<div class="flex items-center gap-2 px-4 py-3">
			<a href="/" class="flex items-center gap-2" aria-label="Ringkas — Beranda">
				<img
					src="/logo/logo-ringkas-icon-emerald.svg"
					alt="Logo Ringkas"
					width="24"
					height="24"
					class="h-6 w-6 shrink-0"
				/>
				<span class="text-[19px] font-extrabold tracking-tight text-[#22302a]">Ringkas</span>
			</a>
			<span class="ml-1 hidden rounded-full bg-[#fbeecd] px-2 py-0.5 text-[11px] font-bold text-[#92400e] sm:inline">
				Teman Belajar
			</span>
			<div class="ml-auto flex items-center gap-2">
				{#if $auth.user}
					<a href="/akun" class="flex items-center gap-1.5 rounded-full bg-[#ece9dc] px-2.5 py-1.5 text-xs font-bold text-[#177245]">
						<Icon name="flame" size={14} /> {$auth.user.name.split(" ")[0]}
					</a>
				{:else}
					<a href="/akun" class="btn btn-ghost !px-3 !py-1.5 text-xs">Masuk</a>
				{/if}
			</div>
		</div>
	</header>

	<main class="flex-1 px-4 pb-24 pt-4">
		{@render children?.()}

		<footer class="mt-8 rounded-2xl bg-[#145c39] p-5 text-center text-white">
			<p class="flex items-center justify-center gap-2 text-base font-extrabold">
				<img
					src="/logo/logo-ringkas-icon-emerald.svg"
					alt=""
					width="22"
					height="22"
					class="h-[22px] w-[22px] shrink-0"
				/>
				<span>Ringkas</span>
			</p>
			<p class="mt-1 text-xs text-white/75">Rangkuman Materi SD, SMP, SMA</p>
			<nav class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-bold text-white">
				<a href="/blog">Blog</a>
				<a href="/faq">FAQ</a>
				<a href="/update">Update</a>
				<a href="/privasi">Privasi</a>
				<a href="/syarat">Syarat</a>
			</nav>
			<p class="mt-3 text-[11px] text-white/60">© 2026 Ringkas — Teman belajar yang ringkas.</p>
		</footer>
	</main>

	{#if !hideTabs}
		<nav
			class="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[430px] -translate-x-1/2 items-stretch border-t border-[#e7e2d2] bg-[#fffdf7] px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-4px_20px_rgb(23_114_69/0.08)]"
		>
			<a href="/" class="tablink" class:active={tabActive("/")} aria-label="Beranda">
				<Icon name="home" size={22} />Beranda
			</a>
			<a href="/katalog" class="tablink" class:active={tabActive("/katalog")} aria-label="Katalog">
				<Icon name="library" size={22} />Katalog
			</a>
			<button
				type="button"
				onclick={goCart}
				class="relative mx-1 -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f2b33d] text-[#22302a] shadow-lg shadow-[#f2b33d/40] ring-4 ring-[#fffdf7]"
				aria-label="Keranjang"
			>
				<Icon name="shopping-cart" size={26} />
				{#if $cartCount > 0}
					<span
						class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[11px] font-extrabold text-white"
						>{$cartCount}</span
					>
				{/if}
			</button>
			<a href="/pesanan" class="tablink" class:active={tabActive("/pesanan")} aria-label="Pesanan">
				<Icon name="receipt" size={22} />Pesanan
			</a>
			<a href="/akun" class="tablink" class:active={tabActive("/akun")} aria-label="Akun">
				<Icon name="user" size={22} />Akun
			</a>
		</nav>
	{/if}
</div>
