<script lang="ts">
	import "../app.css";
	import { onMount } from "svelte";
	import type { Snippet } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { auth, cartCount } from "$lib/store";
	import { api, getToken, type User } from "$lib/api";

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

<div class="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#f6f9fe] shadow-[0_0_40px_rgb(34_115_216/0.08)]">
	<header class="sticky top-0 z-40 border-b border-[#e6eefb] bg-white/95 backdrop-blur">
		<div class="flex items-center gap-2 px-4 py-3">
			<a href="/" class="flex items-center gap-2" aria-label="Ringkas — Beranda">
				<img
					src="/logo/logo-ringkas-icon-1024.png"
					alt="Logo Ringkas"
					width="24"
					height="24"
					class="h-6 w-6 shrink-0 rounded-lg"
				/>
				<span class="text-xl font-extrabold tracking-tight text-[#2273d8]">Ringkas</span>
			</a>
			<span class="ml-1 hidden rounded-full bg-[#fff3c4] px-2 py-0.5 text-[11px] font-bold text-[#92400e] sm:inline">
				Teman Belajar
			</span>
			<div class="ml-auto flex items-center gap-2">
				{#if $auth.user}
					<a href="/akun" class="flex items-center gap-1.5 rounded-full bg-[#eef4fd] px-2.5 py-1.5 text-xs font-bold text-[#2273d8]">
						<span>🔥 {$auth.user.name.split(" ")[0]}</span>
					</a>
				{:else}
					<a href="/akun" class="btn btn-ghost !px-3 !py-1.5 text-xs">Masuk</a>
				{/if}
			</div>
		</div>
	</header>

	<main class="flex-1 px-4 pb-24 pt-4">
		{@render children?.()}

		<footer class="mt-8 border-t border-[#e6eefb] pt-4 text-center">
			<p class="text-sm font-extrabold text-[#2273d8]">Ringkas</p>
			<p class="mt-0.5 text-xs text-[#64748b]">Rangkuman Materi SD, SMP, SMA</p>
			<nav class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-bold text-[#2273d8]">
				<a href="/blog">Blog</a>
				<a href="/faq">FAQ</a>
				<a href="/update">Update</a>
				<a href="/privasi">Privasi</a>
				<a href="/syarat">Syarat</a>
			</nav>
			<p class="mt-3 text-[11px] text-[#94a3b8]">© 2026 Ringkas — Teman belajar yang ringkas.</p>
		</footer>
	</main>

	{#if !hideTabs}
		<nav
			class="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[430px] -translate-x-1/2 items-stretch border-t border-[#e6eefb] bg-white px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-4px_20px_rgb(34_115_216/0.08)]"
		>
			<a href="/" class="tablink" class:active={tabActive("/")} aria-label="Beranda">
				<span class="ico">🏠</span>Beranda
			</a>
			<a href="/katalog" class="tablink" class:active={tabActive("/katalog")} aria-label="Katalog">
				<span class="ico">📚</span>Katalog
			</a>
			<button
				type="button"
				onclick={goCart}
				class="relative mx-1 -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#ffc531] text-2xl shadow-lg shadow-[#ffc531/40] ring-4 ring-white"
				aria-label="Keranjang"
			>
				🛒
				{#if $cartCount > 0}
					<span
						class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e11d48] px-1 text-[11px] font-extrabold text-white"
						>{$cartCount}</span
					>
				{/if}
			</button>
			<a href="/pesanan" class="tablink" class:active={tabActive("/pesanan")} aria-label="Pesanan">
				<span class="ico">🧾</span>Pesanan
			</a>
			<a href="/akun" class="tablink" class:active={tabActive("/akun")} aria-label="Akun">
				<span class="ico">👤</span>Akun
			</a>
		</nav>
	{/if}
</div>
