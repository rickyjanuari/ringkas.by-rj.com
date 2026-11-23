<script lang="ts">
	import { page } from "$app/state";
	import Icon from "$lib/Icon.svelte";
</script>

<section class="page-heading page-heading-account">
	<p class="eyebrow">{page.status}</p>
	<h1>{page.status === 404 ? "Halaman tidak ditemukan" : "Halaman belum bisa dibuka"}</h1>
	<p>{page.status === 404 ? "Periksa kembali alamatnya atau lanjut dari beranda." : "Coba muat kembali halaman ini."}</p>
	<a href="/" class="store-button store-button-dark">Beranda <Icon name="arrow-right" size={18} /></a>
</section>
