<script lang="ts">
	import Icon from "$lib/Icon.svelte";

	// Garis bilangan 0–20 untuk Matematika Kelas 1–2. Murni client-side.
	const MAKS = 20;

	let awal = $state(7);
	let langkah = $state(3);
	let arah = $state<1 | -1>(1);
	let posisi = $state(7);
	let bergerak = $state(false);
	let pesan = $state("");
	let kalimat = $state("");

	let timer: ReturnType<typeof setInterval> | null = null;

	function bersihkanTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	function pilihAwal(nilai: number) {
		const n = Math.max(0, Math.min(MAKS, Math.round(nilai) || 0));
		awal = n;
		ulangi();
	}

	function lompat() {
		if (bergerak) return;
		const target = awal + arah * langkah;
		if (target < 0 || target > MAKS) {
			pesan = "Coba langkah yang lebih kecil, yuk!";
			kalimat = "";
			return;
		}
		pesan = "";
		kalimat = "";
		bergerak = true;
		posisi = awal;
		timer = setInterval(() => {
			posisi += arah;
			if (posisi === target) {
				bersihkanTimer();
				bergerak = false;
				kalimat = `${awal} ${arah > 0 ? "+" : "−"} ${langkah} = ${target}`;
			}
		}, 350);
	}

	function acak() {
		bersihkanTimer();
		bergerak = false;
		pesan = "";
		kalimat = "";
		// Pilih awal dan langkah acak yang hasilnya tetap di 0–20.
		for (let i = 0; i < 50; i++) {
			const a = Math.floor(Math.random() * (MAKS + 1));
			const l = 1 + Math.floor(Math.random() * 10);
			const d = Math.random() < 0.5 ? 1 : -1;
			if (a + d * l >= 0 && a + d * l <= MAKS) {
				awal = a;
				langkah = l;
				arah = d as 1 | -1;
				posisi = a;
				return;
			}
		}
		awal = 0;
		langkah = 1;
		arah = 1;
		posisi = 0;
	}

	function ulangi() {
		bersihkanTimer();
		bergerak = false;
		pesan = "";
		kalimat = "";
		posisi = awal;
	}
</script>

<div class="card p-4">
	<h3 class="flex items-center gap-1.5 text-base font-extrabold text-[#177245]">
		<Icon name="target" size={18} /> Garis Bilangan
	</h3>
	<p class="mt-1 text-sm text-[#5f6b62]">
		Pilih bilangan awal dan langkah, lalu tekan Lompat dan lihat penandanya bergerak.
	</p>

	<div class="mt-3 flex flex-wrap items-end gap-3">
		<div>
			<label class="lbl" for="gl-awal">Bilangan awal (0–20)</label>
			<input
				id="gl-awal"
				class="input !w-24 text-center text-lg font-extrabold"
				type="number"
				min="0"
				max="20"
				value={awal}
				disabled={bergerak}
				onchange={(e) => pilihAwal(Number(e.currentTarget.value))}
			/>
		</div>
		<div>
			<label class="lbl" for="gl-langkah">Langkah</label>
			<select
				id="gl-langkah"
				class="input !w-24 text-center text-lg font-extrabold"
				bind:value={langkah}
				disabled={bergerak}
				onchange={ulangi}
			>
				{#each Array.from({ length: 10 }, (_, i) => i + 1) as n (n)}
					<option value={n}>{n}</option>
				{/each}
			</select>
		</div>
		<div>
			<span class="lbl">Arah</span>
			<div class="flex gap-2">
				<button
					type="button"
					class="chip !px-4 !py-2 !text-base"
					class:active={arah === 1}
					disabled={bergerak}
					onclick={() => {
						arah = 1;
						ulangi();
					}}
				>
					<Icon name="plus" size={16} /> Maju
				</button>
				<button
					type="button"
					class="chip !px-4 !py-2 !text-base"
					class:active={arah === -1}
					disabled={bergerak}
					onclick={() => {
						arah = -1;
						ulangi();
					}}
				>
					− Mundur
				</button>
			</div>
		</div>
	</div>

	<!-- Garis bilangan -->
	<div class="mt-5 overflow-x-auto pb-1">
		<div class="relative min-w-[420px] px-1 pt-9">
			<!-- Garis -->
			<div class="absolute right-1 left-1 top-[52px] h-1 rounded-full bg-[#177245]"></div>
			<!-- Penanda -->
			<div
				class="absolute top-[34px] z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-[#f2b33d] text-base font-extrabold text-[#22302a] shadow transition-all duration-300"
				style="left: calc({(posisi / MAKS) * 100}% )"
				aria-label="Posisi {posisi}"
			>
				{posisi}
			</div>
			<!-- Angka 0–20 -->
			<div class="relative flex justify-between">
				{#each Array.from({ length: MAKS + 1 }, (_, i) => i) as n (n)}
					<button
						type="button"
						class="flex w-5 flex-col items-center gap-1 text-xs font-bold {n === posisi
							? 'text-[#177245]'
							: 'text-[#5f6b62]'}"
						disabled={bergerak}
						onclick={() => pilihAwal(n)}
						aria-label="Pilih {n}"
					>
						<span class="block h-2.5 w-0.5 rounded bg-[#177245]"></span>
						{n}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if pesan}
		<p class="err mt-3">{pesan}</p>
	{/if}
	{#if kalimat}
		<p class="ok-msg mt-3 text-center text-xl font-extrabold">{kalimat}</p>
	{:else if !pesan}
		<p class="mt-3 text-center text-sm font-bold text-[#5f6b62]">
			Sekarang di {posisi}. Tekan Lompat untuk bergerak {langkah} langkah {arah > 0 ? "maju" : "mundur"}.
		</p>
	{/if}

	<div class="mt-4 flex flex-wrap gap-2">
		<button type="button" class="btn btn-primary flex-1" disabled={bergerak} onclick={lompat}>
			<Icon name="chevron-right" size={16} /> Lompat
		</button>
		<button type="button" class="btn btn-sun" disabled={bergerak} onclick={acak}>
			<Icon name="refresh" size={16} /> Acak
		</button>
		<button type="button" class="btn btn-outline" disabled={bergerak} onclick={ulangi}>
			Ulangi
		</button>
	</div>
</div>
