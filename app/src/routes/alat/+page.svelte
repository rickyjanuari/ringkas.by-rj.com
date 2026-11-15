<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import NumberLine from "$lib/tools/NumberLine.svelte";
	import MultiplicationTable from "$lib/tools/MultiplicationTable.svelte";
	import FractionCalculator from "$lib/tools/FractionCalculator.svelte";

	type AlatId = "garis" | "perkalian" | "pecahan";
	let terbuka = $state<AlatId | null>(null);

	function alih(id: AlatId) {
		terbuka = terbuka === id ? null : id;
	}
</script>

<h1 class="mt-3 text-xl font-extrabold leading-snug">Alat Interaktif</h1>
<p class="mt-1 text-sm text-[#5f6b62]">
	Tiga alat main sambil belajar Matematika. Semuanya berjalan langsung di perangkatmu — tanpa perlu masuk atau menunggu.
</p>

<div class="mt-4 space-y-4">
	<!-- Garis Bilangan -->
	<div class="card p-4">
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<h2 class="flex items-center gap-1.5 text-base font-extrabold text-[#177245]">
					<Icon name="target" size={18} /> Garis Bilangan
				</h2>
				<p class="mt-1 text-sm leading-relaxed">
					Lompat maju dan mundur di garis 0–20, lalu lihat kalimat penjumlahannya.
				</p>
				<p class="mt-2"><span class="badge badge-leaf">Matematika • Kelas 1–2</span></p>
			</div>
			<button type="button" class="btn {terbuka === 'garis' ? 'btn-ghost' : 'btn-primary'}" onclick={() => alih("garis")}>
				{#if terbuka === "garis"}<Icon name="x" size={16} /> Tutup{:else}<Icon name="chevron-down" size={16} /> Buka{/if}
			</button>
		</div>
		{#if terbuka === "garis"}
			<div class="mt-4"><NumberLine /></div>
		{/if}
	</div>

	<!-- Tabel Perkalian -->
	<div class="card p-4">
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<h2 class="flex items-center gap-1.5 text-base font-extrabold text-[#177245]">
					<Icon name="target" size={18} /> Tabel Perkalian
				</h2>
				<p class="mt-1 text-sm leading-relaxed">
					Lihat hasil 1–10 × 1–10 dengan sekali ketuk, lalu uji diri dengan Latihan Acak.
				</p>
				<p class="mt-2"><span class="badge badge-leaf">Matematika • Kelas 3–4</span></p>
			</div>
			<button type="button" class="btn {terbuka === 'perkalian' ? 'btn-ghost' : 'btn-primary'}" onclick={() => alih("perkalian")}>
				{#if terbuka === "perkalian"}<Icon name="x" size={16} /> Tutup{:else}<Icon name="chevron-down" size={16} /> Buka{/if}
			</button>
		</div>
		{#if terbuka === "perkalian"}
			<div class="mt-4"><MultiplicationTable /></div>
		{/if}
	</div>

	<!-- Kalkulator Pecahan -->
	<div class="card p-4">
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div>
				<h2 class="flex items-center gap-1.5 text-base font-extrabold text-[#177245]">
					<Icon name="target" size={18} /> Kalkulator Pecahan
				</h2>
				<p class="mt-1 text-sm leading-relaxed">
					Jumlah, kurang, kali, dan bagi pecahan — hasilnya disederhanakan dan digambar sebagai potongan lingkaran.
				</p>
				<p class="mt-2"><span class="badge badge-leaf">Matematika • Kelas 5–6</span></p>
			</div>
			<button type="button" class="btn {terbuka === 'pecahan' ? 'btn-ghost' : 'btn-primary'}" onclick={() => alih("pecahan")}>
				{#if terbuka === "pecahan"}<Icon name="x" size={16} /> Tutup{:else}<Icon name="chevron-down" size={16} /> Buka{/if}
			</button>
		</div>
		{#if terbuka === "pecahan"}
			<div class="mt-4"><FractionCalculator /></div>
		{/if}
	</div>
</div>
