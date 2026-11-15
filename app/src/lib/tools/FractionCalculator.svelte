<script lang="ts">
	import Icon from "$lib/Icon.svelte";

	// Kalkulator pecahan untuk Matematika Kelas 5–6. Murni client-side.
	// FPB dihitung dengan algoritma Euclid.

	function fpb(a: number, b: number): number {
		let x = Math.abs(a);
		let y = Math.abs(b);
		while (y !== 0) {
			const sisa = x % y;
			x = y;
			y = sisa;
		}
		return x === 0 ? 1 : x;
	}

	function sederhanakan(n: number, d: number): { n: number; d: number } {
		const p = fpb(n, d);
		return { n: n / p, d: d / p };
	}

	function teksPecahan(n: number, d: number): string {
		return `${n}/${d}`;
	}

	let n1 = $state(1);
	let d1 = $state(2);
	let n2 = $state(1);
	let d2 = $state(4);
	let op = $state<"+" | "−" | "×" | "÷">("+");

	// Hasil sebelum disederhanakan (penyebut selalu positif).
	let hasilMentah = $derived.by(() => {
		if (op === "+") return { n: n1 * d2 + n2 * d1, d: d1 * d2 };
		if (op === "−") return { n: n1 * d2 - n2 * d1, d: d1 * d2 };
		if (op === "×") return { n: n1 * n2, d: d1 * d2 };
		return { n: n1 * d2, d: d1 * n2 }; // pembagian
	});

	let bagiNol = $derived(op === "÷" && n2 === 0);
	let hasil = $derived(bagiNol ? null : sederhanakan(hasilMentah.n, hasilMentah.d));

	// Pecahan campuran bila |pembilang| > penyebut.
	let campuran = $derived.by(() => {
		if (!hasil) return null;
		const absN = Math.abs(hasil.n);
		if (absN <= hasil.d) return null;
		const bulat = Math.trunc(hasil.n / hasil.d);
		const sisa = absN % hasil.d;
		if (sisa === 0) return { bulat, sisa: 0, d: hasil.d };
		return { bulat, sisa, d: hasil.d };
	});

	// Sisa di luar 2 lingkaran bila hasil > 2.
	let sisaLingkaran = $derived.by(() => {
		if (!hasil || hasil.n <= 2 * hasil.d) return null;
		const sisaN = hasil.n - 2 * hasil.d;
		const s = sederhanakan(sisaN, hasil.d);
		return teksPecahan(s.n, s.d);
	});

	/** Nilai desimal pecahan (untuk gambar lingkaran). */
	function nilai(n: number, d: number): number {
		return n / d;
	}

	/** Path potongan lingkaran sebesar `bagian` (0–1) dari atas, searah jarum jam. */
	function potongan(bagian: number): string {
		if (bagian <= 0) return "";
		if (bagian >= 1) return "M50,5 A45,45 0 1,1 49.9,5 Z";
		const sudut = bagian * 2 * Math.PI;
		const x = 50 + 45 * Math.sin(sudut);
		const y = 50 - 45 * Math.cos(sudut);
		const besar = bagian > 0.5 ? 1 : 0;
		return `M50,50 L50,5 A45,45 0 ${besar},1 ${x.toFixed(2)},${y.toFixed(2)} Z`;
	}
</script>

{#snippet lingkaran(nilaiDesimal: number, label: string, warna: string)}
	<figure class="flex flex-col items-center gap-1">
		<div class="flex gap-1">
			{#each Array.from({ length: nilaiDesimal <= 0 ? 1 : Math.min(Math.ceil(nilaiDesimal), 2) }, (_, i) => i) as i (i)}
				{@const penuh = Math.floor(nilaiDesimal)}
				{@const bagian = i < penuh ? 1 : nilaiDesimal - penuh}
				<svg viewBox="0 0 100 100" class="h-20 w-20" role="img" aria-label={label}>
					<circle cx="50" cy="50" r="45" fill="#ece9dc" />
					{#if bagian > 0}
						<path d={potongan(bagian)} fill={warna} />
					{/if}
					<circle cx="50" cy="50" r="45" fill="none" stroke="#e7e2d2" stroke-width="1.5" />
				</svg>
			{/each}
		</div>
		<figcaption class="text-center text-xs font-bold text-[#5f6b62]">{label}</figcaption>
	</figure>
{/snippet}

<div class="card p-4">
	<h3 class="flex items-center gap-1.5 text-base font-extrabold text-[#177245]">
		<Icon name="target" size={18} /> Kalkulator Pecahan
	</h3>
	<p class="mt-1 text-sm text-[#5f6b62]">
		Pilih dua pecahan dan satu operasi. Hasilnya langsung disederhanakan, lengkap dengan gambarnya.
	</p>

	<div class="mt-4 flex flex-wrap items-end justify-center gap-2 sm:gap-3">
		<!-- Pecahan pertama -->
		<div class="flex items-end gap-1.5">
			<div>
				<label class="lbl text-center" for="pk-n1">Pembilang</label>
				<select id="pk-n1" class="input !w-[4.5rem] text-center text-lg font-extrabold" bind:value={n1}>
					{#each Array.from({ length: 13 }, (_, i) => i) as n (n)}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</div>
			<span class="pb-3 text-xl font-extrabold text-[#5f6b62]">/</span>
			<div>
				<label class="lbl text-center" for="pk-d1">Penyebut</label>
				<select id="pk-d1" class="input !w-[4.5rem] text-center text-lg font-extrabold" bind:value={d1}>
					{#each Array.from({ length: 12 }, (_, i) => i + 1) as d (d)}
						<option value={d}>{d}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Operasi -->
		<div>
			<label class="lbl text-center" for="pk-op">Operasi</label>
			<select id="pk-op" class="input !w-[4.5rem] text-center text-lg font-extrabold" bind:value={op}>
				<option value="+">+</option>
				<option value="−">−</option>
				<option value="×">×</option>
				<option value="÷">÷</option>
			</select>
		</div>

		<!-- Pecahan kedua -->
		<div class="flex items-end gap-1.5">
			<div>
				<label class="lbl text-center" for="pk-n2">Pembilang</label>
				<select id="pk-n2" class="input !w-[4.5rem] text-center text-lg font-extrabold" bind:value={n2}>
					{#each Array.from({ length: 13 }, (_, i) => i) as n (n)}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</div>
			<span class="pb-3 text-xl font-extrabold text-[#5f6b62]">/</span>
			<div>
				<label class="lbl text-center" for="pk-d2">Penyebut</label>
				<select id="pk-d2" class="input !w-[4.5rem] text-center text-lg font-extrabold" bind:value={d2}>
					{#each Array.from({ length: 12 }, (_, i) => i + 1) as d (d)}
						<option value={d}>{d}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	{#if bagiNol}
		<p class="err mt-4 text-center">Tidak bisa membagi dengan nol, yuk pilih pecahan lain!</p>
	{:else if hasil}
		<p class="ok-msg mt-4 text-center text-2xl font-extrabold">
			{n1}/{d1} {op} {n2}/{d2} = {hasil.n}/{hasil.d}
		</p>
		{#if campuran}
			<p class="mt-2 text-center text-base font-bold text-[#177245]">
				{#if campuran.sisa === 0}
					Sebagai bilangan bulat: {campuran.bulat}
				{:else}
					Sebagai pecahan campuran: {campuran.bulat} {campuran.sisa}/{campuran.d}
				{/if}
			</p>
		{/if}

		<div class="mt-4 flex flex-wrap items-start justify-center gap-4">
			{@render lingkaran(nilai(n1, d1), `${n1}/${d1}`, "#177245")}
			{@render lingkaran(nilai(n2, d2), `${n2}/${d2}`, "#115c39")}
			{#if hasil.n < 0}
				<p class="err max-w-[16rem] text-center">
					Hasilnya negatif, jadi tidak bisa digambar sebagai potongan lingkaran. Coba pecahan lain, yuk!
				</p>
			{:else}
				{@render lingkaran(nilai(hasil.n, hasil.d), `Hasil ${hasil.n}/${hasil.d}`, "#f2b33d")}
			{/if}
		</div>
		{#if sisaLingkaran}
			<p class="mt-2 text-center text-xs font-bold text-[#5f6b62]">
				Hasilnya lebih dari 2 lingkaran — masih ada {sisaLingkaran} lagi di luar gambar.
			</p>
		{/if}
	{/if}
</div>
