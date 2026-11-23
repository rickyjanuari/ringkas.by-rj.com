<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import NumberLine from "$lib/tools/NumberLine.svelte";
	import MultiplicationTable from "$lib/tools/MultiplicationTable.svelte";
	import FractionCalculator from "$lib/tools/FractionCalculator.svelte";

	const tools = [
		{ id: "garis", title: "Garis bilangan", level: "Kelas 1–2", symbol: "+ −", description: "Lompat maju dan mundur di garis 0–20.", component: NumberLine },
		{ id: "perkalian", title: "Tabel perkalian", level: "Kelas 3–4", symbol: "×", description: "Jelajahi hasil perkalian 1–10, lalu coba latihan acak.", component: MultiplicationTable },
		{ id: "pecahan", title: "Kalkulator pecahan", level: "Kelas 5–6", symbol: "½", description: "Hitung pecahan dan lihat hasilnya sebagai potongan lingkaran.", component: FractionCalculator }
	] as const;
	const practice = [
		{ href: "/soal-cerita", title: "Soal cerita", icon: "message", description: "Matematika dan Bahasa Indonesia dari kejadian sehari-hari." },
		{ href: "/latihan-adaptif", title: "Latihan adaptif", icon: "zap", description: "Latihan yang menyesuaikan tingkat kesulitan dengan jawabanmu." },
		{ href: "/latihan-tanpa-habis", title: "Latihan tanpa habis", icon: "refresh", description: "Lima soal hitung baru setiap kali kamu mulai." },
		{ href: "/anbk", title: "Simulasi ANBK", icon: "graduation-cap", description: "Kenali bentuk soal literasi dan numerasi untuk kelas 5." },
		{ href: "/tryout", title: "Tryout terjadwal", icon: "trophy", description: "Temukan ujian bersama untuk kelasmu." },
		{ href: "/kuis-guru", title: "Kuis buatan guru", icon: "school", description: "Buat kuis kelas atau masuk dengan kode dari gurumu." },
		{ href: "/cerita", title: "Cerita edukasi", icon: "book-open", description: "Baca cerita dan jawab pertanyaan tentang bacaanmu." }
	];

	let selectedId = $state<(typeof tools)[number]["id"]>("garis");
	let selected = $derived(tools.find((tool) => tool.id === selectedId) ?? tools[0]);
</script>

<header class="page-heading page-heading-study">
	<h1>Alat belajar</h1>
	<p>Jelajahi konsep Matematika, berlatih soal, atau baca satu cerita pendek.</p>
</header>

<section class="tool-section" aria-labelledby="tool-title">
	<h2 id="tool-title">Matematika interaktif</h2>
	<p>Ketiga alat ini bisa langsung dipakai tanpa akun.</p>
	<div class="tool-picker" role="group" aria-label="Pilih alat Matematika">
		{#each tools as tool (tool.id)}
			<button class="tool-choice" type="button" aria-pressed={selectedId === tool.id} onclick={() => (selectedId = tool.id)}>
				<span class="tool-symbol" aria-hidden="true">{tool.symbol}</span>
				<small>{tool.level}</small>
				<strong>{tool.title}</strong>
				<span>{tool.description}</span>
			</button>
		{/each}
	</div>
	<div class="tool-workbench" aria-label={selected.title}>
		{#key selectedId}<selected.component />{/key}
	</div>
</section>

<section class="tool-section" aria-labelledby="exercise-title">
	<h2 id="exercise-title">Latihan dan bacaan</h2>
	<div class="tool-directory">
		{#each practice as item (item.href)}
			<a href={item.href}>
				<Icon name={item.icon} size={24} />
				<span><strong>{item.title}</strong><small>{item.description}</small></span>
				<Icon name="arrow-right" size={18} />
			</a>
		{/each}
	</div>
</section>
