<script lang="ts">
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

<h1 class="text-xl font-extrabold">Keranjang 🛒</h1>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#64748b]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if $cart.length === 0}
	<div class="card mt-4 p-6 text-center">
		<p class="text-4xl">🛒</p>
		<p class="mt-2 font-bold">Keranjangmu masih kosong</p>
		<p class="mt-1 text-sm text-[#64748b]">Yuk, cari rangkuman favoritmu di katalog.</p>
		<a href="/katalog" class="btn btn-primary mt-4">🔍 Lihat Katalog</a>
	</div>
{:else}
	{#if missing > 0}
		<p class="err mt-4">
			{missing} produk di keranjang sudah tidak tersedia dan tidak dihitung.
		</p>
	{/if}
	<div class="mt-4 space-y-3">
		{#each items as p (p.id)}
			<article class="card flex gap-3 p-3">
				<div
					class="flex w-16 shrink-0 items-center justify-center rounded-xl px-1 text-center text-[11px] font-extrabold leading-tight text-white"
					style="background: {p.cover_color}"
				>
					{p.cover_label}
				</div>
				<div class="min-w-0 flex-1">
					<p class="line-clamp-2 text-sm font-bold leading-snug">{p.title}</p>
					<p class="text-xs text-[#64748b]">{p.jenjang} • {p.mapel}</p>
					<p class="mt-1 text-sm font-extrabold text-[#2273d8]">{formatRupiah(p.price)}</p>
				</div>
				<button
					type="button"
					class="btn btn-danger h-8 self-start !px-2.5 !py-1 text-xs"
					onclick={() => cart.remove(p.id)}
					aria-label="Hapus {p.title}"
				>
					Hapus
				</button>
			</article>
		{/each}
	</div>

	<div class="card mt-4 p-4">
		<div class="flex justify-between text-sm">
			<span class="text-[#64748b]">{items.length} produk</span>
			<span class="font-bold">{formatRupiah(total)}</span>
		</div>
		<div class="mt-2 flex justify-between border-t border-dashed border-[#dbe7f7] pt-2">
			<span class="font-extrabold">Total Bayar</span>
			<span class="text-lg font-extrabold text-[#2273d8]">{formatRupiah(total)}</span>
		</div>
		<button
			type="button"
			class="btn btn-primary btn-block mt-4"
			disabled={items.length === 0}
			onclick={() => goto("/checkout")}
		>
			💳 Checkout
		</button>
		<button type="button" class="btn btn-ghost btn-block mt-2" onclick={() => cart.clear()}>
			Kosongkan Keranjang
		</button>
	</div>
{/if}
