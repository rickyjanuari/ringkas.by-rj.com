<!-- Maskot pemandu Ringkas: Tunas kecil berwajah ramah.
	Gaya mengikuti Avatar.svelte (viewBox 64, lingkaran latar kertas,
	palet emerald/marigold) — batang + dua daun + kepala bulat berwajah.
	Ekspresi: senang (mata tertutup bahagia, senyum lebar),
	semangat (mata terbuka, senyum lebar, bintang kecil),
	berpikir (mata menengadah, mulut kecil, tanda tanya). -->
<script lang="ts">
	let {
		expression = "senang",
		size = 72
	}: { expression?: "senang" | "semangat" | "berpikir"; size?: number } = $props();

	let label = $derived(
		expression === "semangat"
			? "Maskot Tunas bersemangat"
			: expression === "berpikir"
				? "Maskot Tunas sedang berpikir"
				: "Maskot Tunas senang"
	);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 64 64"
	fill="none"
	role="img"
	aria-label={label}
>
	<!-- Latar lingkaran kertas -->
	<circle cx="32" cy="32" r="30" fill="#f7f5ef" stroke="#e7e2d2" stroke-width="1.5" />
	<!-- Tanah -->
	<ellipse cx="32" cy="50" rx="20" ry="6" fill="#8a5a3b" />
	<ellipse cx="32" cy="49" rx="20" ry="5" fill="#a47148" />

	<!-- Batang -->
	<path d="M32 50 C32 46 32 42 32 36" stroke="#177245" stroke-width="3" stroke-linecap="round" />
	<!-- Dua daun -->
	<path d="M32 44 C27 43 23 40 22 35 C27 35 31 39 32 44 Z" fill="#177245" />
	<path d="M32 44 C37 43 41 40 42 35 C37 35 33 39 32 44 Z" fill="#2e8b57" />

	<!-- Kepala bulat marigold -->
	<circle cx="32" cy="24" r="11" fill="#f2b33d" stroke="#d97706" stroke-width="1" />

	{#if expression === "senang"}
		<!-- Mata tertutup bahagia -->
		<path d="M24.5 23 Q27 20.5 29.5 23" stroke="#22302a" stroke-width="1.8" stroke-linecap="round" />
		<path d="M34.5 23 Q37 20.5 39.5 23" stroke="#22302a" stroke-width="1.8" stroke-linecap="round" />
		<!-- Senyum lebar -->
		<path d="M27 27.5 Q32 32.5 37 27.5" stroke="#22302a" stroke-width="1.8" stroke-linecap="round" />
	{:else if expression === "semangat"}
		<!-- Mata terbuka -->
		<circle cx="27.5" cy="22.5" r="1.8" fill="#22302a" />
		<circle cx="36.5" cy="22.5" r="1.8" fill="#22302a" />
		<!-- Senyum lebar -->
		<path d="M26.5 27 Q32 33.5 37.5 27" stroke="#22302a" stroke-width="1.8" stroke-linecap="round" />
		<!-- Bintang kecil tanda semangat -->
		<path
			d="M48 7 L49.2 10.8 L53 12 L49.2 13.2 L48 17 L46.8 13.2 L43 12 L46.8 10.8 Z"
			fill="#f2b33d"
			stroke="#b45309"
			stroke-width="1"
			stroke-linejoin="round"
		/>
	{:else}
		<!-- Mata menengadah -->
		<circle cx="27.5" cy="21.5" r="1.8" fill="#22302a" />
		<circle cx="36.5" cy="21.5" r="1.8" fill="#22302a" />
		<!-- Mulut kecil ragu -->
		<path d="M30 29.5 Q32 28.5 34 29.5" stroke="#22302a" stroke-width="1.8" stroke-linecap="round" />
		<!-- Gelembung tanda tanya -->
		<circle cx="48" cy="14" r="6.5" fill="#fffdf7" stroke="#e7e2d2" stroke-width="1.5" />
		<path
			d="M46.5 12.5 a2 2 0 1 1 2 2 c-0.9 0 -1.2 0.5 -1.2 1.2"
			stroke="#22302a"
			stroke-width="1.4"
			stroke-linecap="round"
		/>
		<circle cx="47.3" cy="17.8" r="0.9" fill="#22302a" />
	{/if}
</svg>
