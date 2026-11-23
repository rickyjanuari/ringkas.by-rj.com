<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";
	import { gradeLabel, gradeOfProduct, gradeStyle } from "$lib/gradeTheme";

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

<header class="commerce-heading">
	<a href="/katalog" class="store-text-link product-back"><Icon name="arrow-left" size={18} /> Kembali ke katalog</a>
	<h1 class="store-title">Keranjang.</h1>
</header>

{#if loading}
	<p class="store-state" role="status">Memuat keranjang…</p>
{:else if error}
	<p class="store-state" role="alert">{error}</p>
{:else if $cart.length === 0}
	<div class="store-state cart-empty">
		<Icon name="shopping-cart" size={27} />
		<h2>Keranjangmu masih kosong.</h2>
		<a href="/katalog" class="store-button store-button-dark">Jelajahi katalog <Icon name="arrow-right" size={18} /></a>
	</div>
{:else}
	{#if missing > 0}
		<p class="err mb-4" role="status">{missing} produk di keranjang sudah tidak tersedia dan tidak dihitung.</p>
	{/if}
	<div class="cart-layout">
		{#if items.length > 0}
			<ul class="cart-items">
				{#each items as product (product.id)}
					{@const grade = gradeLabel(product.id)}
					<li>
						<span class="cart-item-icon" style={gradeStyle(grade ? gradeOfProduct(product.id) : 0)} aria-hidden="true"><Icon name="book-open" size={24} /></span>
						<div>
							<a href="/produk/{encodeURIComponent(product.id)}">{product.title}</a>
							<p>{product.jenjang}{grade ? ' · ' + grade : ''} · {product.mapel}</p>
							<strong>{formatRupiah(product.price)}</strong>
						</div>
						<button type="button" aria-label="Hapus {product.title}" title="Hapus produk" onclick={() => cart.remove(product.id)}><Icon name="trash" size={19} /></button>
					</li>
				{/each}
			</ul>
		{/if}
		<section class="cart-summary" aria-labelledby="cart-summary-title">
			<h2 id="cart-summary-title">Ringkasan pesanan.</h2>
			<p><span>{items.length} produk</span><span>{formatRupiah(total)}</span></p>
			<p><strong>Total bayar</strong><strong>{formatRupiah(total)}</strong></p>
			{#if items.length > 0}
				<a href="/checkout" class="store-button store-button-dark">Checkout <Icon name="arrow-right" size={18} /></a>
			{/if}
			<button type="button" class="store-text-link" onclick={() => cart.clear()}>Kosongkan keranjang</button>
		</section>
	</div>
{/if}
