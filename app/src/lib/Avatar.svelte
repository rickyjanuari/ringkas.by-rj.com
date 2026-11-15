<script lang="ts">
	// Avatar tanaman yang berkembang menurut tahap XP.
	// stage 1 = Benih, 2 = Tunas, 3 = Bunga, 4 = Pohon.
	let { stage = 1, size = 64 }: { stage?: number; size?: number } = $props();
	let s = $derived(Math.max(1, Math.min(4, Math.round(stage) || 1)));
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 64 64"
	fill="none"
	role="img"
	aria-label={s === 1 ? "Avatar Benih" : s === 2 ? "Avatar Tunas" : s === 3 ? "Avatar Bunga" : "Avatar Pohon"}
>
	<!-- Latar lingkaran kertas -->
	<circle cx="32" cy="32" r="30" fill="#f7f5ef" stroke="#e7e2d2" stroke-width="1.5" />
	<!-- Tanah -->
	<ellipse cx="32" cy="50" rx="20" ry="6" fill="#8a5a3b" />
	<ellipse cx="32" cy="49" rx="20" ry="5" fill="#a47148" />

	{#if s === 1}
		<!-- Benih: biji di tanah -->
		<ellipse cx="32" cy="43" rx="7" ry="9" fill="#7c4a2d" />
		<ellipse cx="32" cy="43" rx="4" ry="6" fill="#a47148" />
		<path d="M32 36 C32 40 32 42 32 44" stroke="#177245" stroke-width="2" stroke-linecap="round" />
	{:else if s === 2}
		<!-- Tunas: kecambah dua daun -->
		<path d="M32 50 C32 44 32 40 32 34" stroke="#177245" stroke-width="3" stroke-linecap="round" />
		<path d="M32 40 C26 39 21 35 20 29 C26 29 31 33 32 40 Z" fill="#177245" />
		<path d="M32 40 C38 39 43 35 44 29 C38 29 33 33 32 40 Z" fill="#2e8b57" />
	{:else if s === 3}
		<!-- Bunga: bunga mekar -->
		<path d="M32 50 C32 42 32 36 32 30" stroke="#177245" stroke-width="3" stroke-linecap="round" />
		<path d="M32 44 C27 43 23 40 22 35 C27 35 31 39 32 44 Z" fill="#177245" />
		<path d="M32 44 C37 43 41 40 42 35 C37 35 33 39 32 44 Z" fill="#2e8b57" />
		<g>
			<circle cx="32" cy="16" r="5" fill="#f2b33d" />
			<circle cx="32" cy="27" r="5" fill="#f2b33d" />
			<circle cx="21.5" cy="21.5" r="5" fill="#f2b33d" />
			<circle cx="42.5" cy="21.5" r="5" fill="#f2b33d" />
			<circle cx="25" cy="13.5" r="5" fill="#f2b33d" />
			<circle cx="39" cy="13.5" r="5" fill="#f2b33d" />
			<circle cx="25" cy="29.5" r="5" fill="#f2b33d" />
			<circle cx="39" cy="29.5" r="5" fill="#f2b33d" />
			<circle cx="32" cy="21.5" r="5.5" fill="#b45309" />
			<circle cx="32" cy="21.5" r="3" fill="#f2b33d" />
		</g>
	{:else}
		<!-- Pohon: pohon kecil berbuah -->
		<path d="M29 50 L30 34 L34 34 L35 50 Z" fill="#7c4a2d" />
		<path d="M32 40 L24 32 M32 38 L40 30" stroke="#7c4a2d" stroke-width="2.5" stroke-linecap="round" />
		<circle cx="22" cy="28" r="9" fill="#177245" />
		<circle cx="32" cy="20" r="11" fill="#177245" />
		<circle cx="42" cy="28" r="9" fill="#177245" />
		<circle cx="32" cy="29" r="8" fill="#2e8b57" />
		<circle cx="26" cy="26" r="2.5" fill="#f2b33d" />
		<circle cx="38" cy="24" r="2.5" fill="#f2b33d" />
		<circle cx="32" cy="32" r="2.5" fill="#f2b33d" />
	{/if}
</svg>
