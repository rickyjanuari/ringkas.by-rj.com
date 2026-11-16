<script lang="ts">
	import Icon from "$lib/Icon.svelte";

	// Tabel perkalian 1–10 × 1–10 untuk Matematika Kelas 3–4. Murni client-side.
	const N = 10;

	let sorotBaris = $state(0);
	let sorotKolom = $state(0);
	let pilih = $state<{ b: number; k: number } | null>(null);

	// Latihan acak.
	let latihan = $state(false);
	let sa = $state(3);
	let sb = $state(4);
	let jawaban = $state("");
	let umpan = $state("");
	let umpanBenar = $state(false);
	let skorBenar = $state(0);
	let skorTotal = $state(0);

	function ketukBaris(b: number) {
		sorotBaris = sorotBaris === b ? 0 : b;
		if (sorotBaris) sorotKolom = 0;
	}

	function ketukKolom(k: number) {
		sorotKolom = sorotKolom === k ? 0 : k;
		if (sorotKolom) sorotBaris = 0;
	}

	function ketukSel(b: number, k: number) {
		pilih = { b, k };
		sorotBaris = b;
		sorotKolom = k;
	}

	function soalBaru() {
		sa = 1 + Math.floor(Math.random() * N);
		sb = 1 + Math.floor(Math.random() * N);
		jawaban = "";
	}

	function mulaiLatihan() {
		latihan = true;
		skorBenar = 0;
		skorTotal = 0;
		umpan = "";
		soalBaru();
	}

	function periksa() {
		const nilai = Number(jawaban);
		if (jawaban.trim() === "" || Number.isNaN(nilai)) {
			umpan = "Tulis dulu jawabanmu, ya.";
			umpanBenar = false;
			return;
		}
		skorTotal += 1;
		if (nilai === sa * sb) {
			skorBenar += 1;
			umpan = `Hebat ${sa} × ${sb} = ${sa * sb}.`;
			umpanBenar = true;
		} else {
			umpan = `Belum tepat — ${sa} × ${sb} = ${sa * sb}. Coba soal baru, yuk`;
			umpanBenar = false;
		}
		soalBaru();
	}
</script>

<div class="card p-4">
	<h3 class="flex items-center gap-1.5 text-base font-semibold text-[#177245]">
		<Icon name="target" size={18} /> Tabel perkalian
	</h3>
	<p class="mt-1 text-sm text-[#5f6b62]">
		Ketuk angka di tepi untuk menyorot satu baris atau kolom. Ketuk kotak di tengah untuk melihat hasilnya.
	</p>

	<div class="mt-3 overflow-x-auto pb-1">
		<table class="tabular-nums mx-auto border-separate border-spacing-0.5 text-center text-sm font-medium">
			<thead>
				<tr>
					<th class="h-9 w-9 rounded-md bg-[#ece9dc] text-[#5f6b62]">×</th>
					{#each Array.from({ length: N }, (_, i) => i + 1) as k (k)}
						<th>
							<button
								type="button"
								class="flex h-9 w-9 items-center justify-center rounded-md {sorotKolom === k
									? 'bg-[#f2b33d] text-[#22302a]'
									: 'bg-[#ece9dc] text-[#177245]'}"
								onclick={() => ketukKolom(k)}
								aria-label="Sorot kolom {k}"
							>
								{k}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each Array.from({ length: N }, (_, i) => i + 1) as b (b)}
					<tr>
						<th>
							<button
								type="button"
								class="flex h-9 w-9 items-center justify-center rounded-md {sorotBaris === b
									? 'bg-[#f2b33d] text-[#22302a]'
									: 'bg-[#ece9dc] text-[#177245]'}"
								onclick={() => ketukBaris(b)}
								aria-label="Sorot baris {b}"
							>
								{b}
							</button>
						</th>
						{#each Array.from({ length: N }, (_, i) => i + 1) as k (`${b}-${k}`)}
							<td>
								<button
									type="button"
									class="flex h-9 w-9 items-center justify-center rounded-md {pilih?.b === b &&
									pilih?.k === k
										? 'bg-[#177245] text-white'
										: sorotBaris === b || sorotKolom === k
											? 'bg-[#dcefe2] text-[#177245]'
											: 'bg-[#fffdf7] text-[#22302a]'} border border-[#e7e2d2]"
									onclick={() => ketukSel(b, k)}
									aria-label="{b} kali {k}"
								>
									{b * k}
								</button>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if pilih}
		<p class="tabular-nums ok-msg mt-3 text-center text-2xl font-semibold">
			{pilih.b} × {pilih.k} = {pilih.b * pilih.k}
		</p>
	{:else}
		<p class="mt-3 text-center text-sm font-medium text-[#5f6b62]">
			Belum ada kotak yang dipilih. Coba ketuk satu kotak, yuk!
		</p>
	{/if}

	<div class="mt-4 border-t border-[#e7e2d2] pt-4">
		{#if !latihan}
			<button type="button" class="btn btn-sun btn-block" onclick={mulaiLatihan}>
				<Icon name="zap" size={16} /> Mulai latihan acak
			</button>
		{:else}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h4 class="flex items-center gap-1.5 text-sm font-semibold">
					<Icon name="star" size={16} /> Latihan Acak
				</h4>
				<span class="badge badge-leaf">
					Skor: {skorBenar} benar dari {skorTotal} soal
				</span>
			</div>
			<p class="tabular-nums mt-3 text-center text-2xl font-semibold">{sa} × {sb} = ?</p>
			<form
				class="mt-3 flex gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					periksa();
				}}
			>
				<input
					class="input text-center text-lg font-semibold"
					type="number"
					min="0"
					inputmode="numeric"
					placeholder="Jawabanmu"
					bind:value={jawaban}
					aria-label="Jawaban perkalian"
				/>
				<button type="submit" class="btn btn-primary shrink-0">
					<Icon name="check" size={16} /> Periksa
				</button>
			</form>
			{#if umpan}
				<p class="mt-3 {umpanBenar ? 'ok-msg' : 'err'}">{umpan}</p>
			{/if}
			<button type="button" class="btn btn-ghost mt-3 text-xs" onclick={() => (latihan = false)}>
				<Icon name="x" size={16} /> Tutup latihan
			</button>
		{/if}
	</div>
</div>
