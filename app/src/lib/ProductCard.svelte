<script lang="ts">
	import { goto } from "$app/navigation";
	import { formatRupiah, type ProductPublic } from "$lib/api";
	import { gradeLabel, gradeOfProduct, gradeStyle } from "$lib/gradeTheme";
	import { cart } from "$lib/store";
	import Icon from "$lib/Icon.svelte";

	let { product }: { product: ProductPublic } = $props();
	let grade = $derived(gradeLabel(product.id));
	let added = $derived($cart.includes(product.id));
	let href = $derived(`/produk/${encodeURIComponent(product.id)}`);

	function openCart() {
		if (added) void goto("/keranjang");
		else cart.add(product.id);
	}
</script>

<article class="product-card" style={gradeStyle(grade ? gradeOfProduct(product.id) : 0)}>
	<div class="product-preview" aria-hidden="true">
		<span class="product-book">
			<span class="product-book-brand"><Icon name="book-open" size={15} /> Ringkas</span>
			<span class="product-book-title">{product.cover_label || product.mapel}</span>
			<span class="product-book-level">{product.jenjang}{grade ? ' · ' + grade : ''}</span>
		</span>
	</div>
	<div class="product-body">
		<p class="product-meta">
			<span>{product.jenjang}{grade ? ' · ' + grade : ''}</span>
			{#if product.badge}<span class="product-badge">{product.badge}</span>{/if}
		</p>
		<h3><a href={href}>{product.title}</a></h3>
		<p class="product-subject">{product.mapel}{product.pages > 0 ? ' · ' + product.pages + ' hlm' : ''}</p>
		<div class="product-bottom">
			<p class="product-price">
				<strong>{formatRupiah(product.price)}</strong>
				{#if product.strikethrough_price}<s>{formatRupiah(product.strikethrough_price)}</s>{/if}
			</p>
			<button
				class="product-add"
				class:is-added={added}
				type="button"
				onclick={openCart}
				aria-label={added ? `${product.title} ada di keranjang. Buka keranjang.` : `Tambah ${product.title} ke keranjang`}
				title={added ? "Buka keranjang" : "Tambah ke keranjang"}
			>
				<Icon name={added ? "check" : "plus"} size={20} />
			</button>
			<span class="sr-only" role="status">{added ? product.title + " ada di keranjang." : ""}</span>
		</div>
	</div>
</article>
