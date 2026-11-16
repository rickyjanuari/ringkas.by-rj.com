<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import Mascot from "$lib/Mascot.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";

	let catalog = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");

	let items = $derived(
		$cart
			.map((id) => catalog.find((p) => p.id === id))
			.filter((p): p is ProductPublic => Boolean(p))
	);
	let total = $derived(items.reduce((s, p) => s + p.price, 0));
	let missing = $derived($cart.length - items.length);

	onMount(async () => {
		try {
			const data = await api<{ products: ProductPublic[] }>("/api/catalog");
			catalog = data.products ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat katalog.";
		} finally {
			loading = false;
		}
	});
</script>

<h1 class="flex items-center gap-2 text-xl font-semibold"><Icon name="shopping-cart" size={18} /> Keranjang</h1>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if $cart.length === 0}
	<div class="card mt-4 p-6 text-center lg:mx-auto lg:max-w-xl">
		<p class="flex justify-center"><Mascot expression="berpikir" /></p>
		<p class="flex justify-center"><Icon name="shopping-cart" size={40} class="text-[#177245]" /></p>
		<p class="mt-2 font-semibold">Keranjangmu masih kosong</p>
		<p class="mt-1 text-sm text-[#5f6b62]">Yuk, cari rangkuman favoritmu di katalog.</p>
		<a href="/katalog" class="btn btn-primary mt-4"><Icon name="search" size={16} /> Lihat katalog</a>
	</div>
{:else}
	{#if missing > 0}
		<p class="err mt-4">
			{missing} produk di keranjang sudah tidak tersedia dan tidak dihitung.
		</p>
	{/if}
	<!-- Desktop: dua kolom — daftar item kiri, ringkasan sticky kanan -->
	<div class="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
	<div class="mt-4 space-y-3">
		{#each items as p (p.id)}
			<article class="card flex gap-3 p-3">
				<div
					class="flex w-16 shrink-0 items-center justify-center rounded-xl px-1 text-center text-[11px] font-semibold leading-tight text-white"
					style="background: {p.cover_color}"
				>
					{p.cover_label}
				</div>
				<div class="min-w-0 flex-1">
					<p class="line-clamp-2 text-sm font-semibold leading-snug">{p.title}</p>
					<p class="text-xs text-[#5f6b62]">{p.jenjang} • {p.mapel}</p>
					<p class="mt-1 text-sm font-semibold tabular-nums text-[#177245]">{formatRupiah(p.price)}</p>
				</div>
				<button
					type="button"
					class="btn btn-danger h-11 self-start !px-3 text-xs"
					onclick={() => cart.remove(p.id)}
					aria-label="Hapus {p.title}"
				>
					Hapus
				</button>
			</article>
		{/each}
	</div>

	<div class="card mt-4 p-4 lg:sticky lg:top-[72px] lg:self-start">
		<div class="flex justify-between text-sm">
			<span class="text-[#5f6b62]">{items.length} produk</span>
			<span class="font-semibold tabular-nums">{formatRupiah(total)}</span>
		</div>
		<div class="mt-2 flex justify-between border-t border-dashed border-[#e7e2d2] pt-2">
			<span class="font-semibold">Total bayar</span>
			<span class="text-lg font-semibold tabular-nums text-[#177245]">{formatRupiah(total)}</span>
		</div>
		<button
			type="button"
			class="btn btn-primary btn-block mt-4"
			disabled={items.length === 0}
			onclick={() => goto("/checkout")}
		>
			<Icon name="credit-card" size={16} /> Checkout
		</button>
		<button type="button" class="btn btn-ghost btn-block mt-2" onclick={() => cart.clear()}>
			Kosongkan keranjang
		</button>
	</div>
	</div>
{/if}
