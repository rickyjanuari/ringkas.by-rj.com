<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatRupiah, type ProductPublic } from "$lib/api";
	import { cart } from "$lib/store";

	let products = $state<ProductPublic[]>([]);
	let loading = $state(true);
	let error = $state("");
	let jenjang = $state("Semua");

	let jenjangList = $derived(["Semua", ...new Set(products.map((p) => p.jenjang))]);
	let shown = $derived(
		jenjang === "Semua" ? products : products.filter((p) => p.jenjang === jenjang)
	);

	onMount(async () => {
		try {
			const data = await api<{ products: ProductPublic[] }>("/api/catalog");
			products = data.products ?? [];
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat katalog.";
		} finally {
			loading = false;
		}
	});

	function tambah(id: string, ev: MouseEvent) {
		ev.stopPropagation();
		cart.add(id);
	}

	function buka(id: string) {
		goto(`/produk/${id}`);
	}
</script>

<!-- Hero promo -->
<section class="card overflow-hidden">
	<div class="bg-gradient-to-br from-[#2273d8] to-[#159a68] px-5 py-6 text-white">
		<p class="text-xs font-bold uppercase tracking-widest text-[#ffc531]">📘 Belajar jadi ringan</p>
		<h1 class="mt-1 text-2xl font-extrabold leading-snug">Rangkuman Materi SD, SMP, SMA</h1>
		<p class="mt-1 text-sm text-white/90">
			Teman belajar kamu: rangkuman kilat, kuis seru, dan simulasi SAS — semuanya ringkas dan
			mudah dipahami.
		</p>
		<a href="/katalog" class="btn btn-sun mt-4">🔍 Cari Materi</a>
	</div>
	<div class="flex divide-x divide-[#e6eefb] text-center text-xs font-bold text-[#475569]">
		<div class="flex-1 px-2 py-3">✅ Rangkuman kilat</div>
		<div class="flex-1 px-2 py-3">🎮 Kuis interaktif</div>
		<div class="flex-1 px-2 py-3">🏅 Simulasi SAS</div>
	</div>
</section>

<!-- Chip jenjang -->
<div class="mt-5 flex gap-2 overflow-x-auto pb-1">
	{#each jenjangList as j (j)}
		<button type="button" class="chip" class:active={jenjang === j} onclick={() => (jenjang = j)}>
			{j === "Semua" ? "✨ Semua" : `🎒 ${j}`}
		</button>
	{/each}
</div>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#64748b]">Memuat...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
{:else if shown.length === 0}
	<p class="mt-6 text-center text-sm text-[#64748b]">Belum ada produk untuk jenjang ini.</p>
{:else}
	<div class="mt-3 grid grid-cols-2 gap-3">
		{#each shown as p (p.id)}
			<div
				class="card cursor-pointer overflow-hidden"
				onclick={() => buka(p.id)}
				onkeydown={(e) => e.key === "Enter" && buka(p.id)}
				role="button"
				tabindex="0"
			>
				<div
					class="flex h-24 items-center justify-center px-3 text-center text-sm font-extrabold text-white"
					style="background: {p.cover_color}"
				>
					<span class="leading-tight">{p.cover_label}</span>
				</div>
				<div class="p-3">
					{#if p.badge}
						<span class="badge badge-sun">{p.badge}</span>
					{/if}
					<h2 class="mt-1 line-clamp-2 min-h-10 text-sm font-bold leading-snug">{p.title}</h2>
					<p class="mt-0.5 text-[11px] font-semibold text-[#64748b]">
						{p.jenjang} • {p.mapel} • {p.pages} hlm
					</p>
					<div class="mt-2 flex items-end justify-between gap-1">
						<div>
							{#if p.strikethrough_price}
								<p class="text-[11px] font-semibold text-[#94a3b8] line-through">
									{formatRupiah(p.strikethrough_price)}
								</p>
							{/if}
							<p class="text-sm font-extrabold text-[#2273d8]">{formatRupiah(p.price)}</p>
						</div>
						<button
							type="button"
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2273d8] text-base font-extrabold text-white"
							aria-label="Tambah {p.title} ke keranjang"
							onclick={(e) => tambah(p.id, e)}
						>
							+
						</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}
