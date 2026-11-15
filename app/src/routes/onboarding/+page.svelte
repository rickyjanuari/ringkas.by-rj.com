<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import Avatar from "$lib/Avatar.svelte";
	import Icon from "$lib/Icon.svelte";
	import Mascot from "$lib/Mascot.svelte";
	import { getToken } from "$lib/api";
	import {
		getAvatarStage,
		getOnboardingDone,
		saveAvatarStage,
		setOnboardingDone
	} from "$lib/onboarding";

	const TAHAP_AVATAR = [
		{ stage: 1, nama: "Benih", ket: "Baru mulai tumbuh" },
		{ stage: 2, nama: "Tunas", ket: "Sudah berdaun dua" },
		{ stage: 3, nama: "Bunga", ket: "Mekar dan cerah" },
		{ stage: 4, nama: "Pohon", ket: "Tumbuh besar dan kuat" }
	];

	let memeriksa = $state(true);
	let langkah = $state(1);
	let kelas = $state<number | null>(null);
	let avatarStage = $state(2);
	let menyimpan = $state(false);

	let judulLangkah = $derived(
		langkah === 1
			? "Kamu kelas berapa?"
			: langkah === 2
				? "Pilih teman tanamanmu"
				: "Misi pertamamu"
	);

	onMount(async () => {
		avatarStage = getAvatarStage();
		if (!getToken()) {
			goto("/akun");
			return;
		}
		if (await getOnboardingDone()) {
			goto("/");
			return;
		}
		memeriksa = false;
	});

	function lanjut() {
		if (langkah < 3) langkah += 1;
	}

	function kembali() {
		if (langkah > 1) langkah -= 1;
	}

	async function lewati() {
		if (langkah < 3) {
			langkah += 1;
			return;
		}
		await selesaiDanKeluar("/");
	}

	async function selesaiDanKeluar(tujuan: string) {
		if (menyimpan) return;
		menyimpan = true;
		await setOnboardingDone();
		goto(tujuan);
	}

	function mulaiMisi() {
		selesaiDanKeluar(`/belajar/k${kelas ?? 1}`);
	}
</script>

{#if memeriksa}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat...</p>
{:else}
	<div class="lg:mx-auto lg:max-w-xl">
		<div class="flex flex-col items-center text-center">
			<Mascot expression="semangat" size={88} />
			<h1 class="mt-2 text-xl font-extrabold">Kenalan dulu, yuk!</h1>
			<p class="mt-1 text-sm text-[#5f6b62]">
				Tiga langkah cepat sebelum mulai belajar di Ringkas.
			</p>
		</div>

		<!-- Penanda langkah -->
		<div class="mt-5 flex items-center justify-center gap-2" aria-label="Langkah {langkah} dari 3">
			{#each [1, 2, 3] as n (n)}
				<span
					class="flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold {n === langkah
						? 'bg-[#177245] text-white'
						: n < langkah
							? 'bg-[#ece9dc] text-[#177245]'
							: 'bg-[#ece9dc] text-[#5f6b62]'}"
					aria-current={n === langkah ? "step" : undefined}
				>
					{#if n < langkah}<Icon name="check" size={16} />{:else}{n}{/if}
				</span>
				{#if n < 3}
					<span class="h-0.5 w-8 {n < langkah ? 'bg-[#177245]' : 'bg-[#e7e2d2]'}" aria-hidden="true"></span>
				{/if}
			{/each}
		</div>
		<p class="mt-2 text-center text-xs font-bold text-[#5f6b62]">Langkah {langkah} dari 3</p>

		<h2 class="mt-4 text-center text-lg font-extrabold">{judulLangkah}</h2>

		{#if langkah === 1}
			<p class="mt-1 text-center text-sm text-[#5f6b62]">
				Pilih kelasmu supaya materi yang tampil cocok untukmu.
			</p>
			<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Pilih kelas">
				{#each [1, 2, 3, 4, 5, 6] as k (k)}
					<button
						type="button"
						class="card flex min-h-24 flex-col items-center justify-center gap-1 !rounded-2xl p-4 {kelas === k
							? '!border-[#177245] bg-[#ece9dc]'
							: ''}"
						aria-pressed={kelas === k}
						onclick={() => (kelas = k)}
					>
						<Icon name="graduation-cap" size={28} class="text-[#177245]" />
						<span class="text-base font-extrabold">Kelas {k}</span>
						<span class="text-xs text-[#5f6b62]">SD</span>
					</button>
				{/each}
			</div>
		{:else if langkah === 2}
			<p class="mt-1 text-center text-sm text-[#5f6b62]">
				Tanaman ini akan menemanimu belajar. Bisa diganti nanti di Akun.
			</p>
			<div class="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Pilih avatar tanaman">
				{#each TAHAP_AVATAR as t (t.stage)}
					<button
						type="button"
						class="card flex flex-col items-center gap-1 !rounded-2xl p-4 {avatarStage === t.stage
							? '!border-[#177245] bg-[#ece9dc]'
							: ''}"
						aria-pressed={avatarStage === t.stage}
						onclick={() => {
							avatarStage = t.stage;
							saveAvatarStage(t.stage);
						}}
					>
						<Avatar stage={t.stage} size={72} />
						<span class="text-base font-extrabold">{t.nama}</span>
						<span class="text-center text-xs text-[#5f6b62]">{t.ket}</span>
					</button>
				{/each}
			</div>
		{:else}
			<div class="card mt-4 p-5 text-center">
				<p class="flex justify-center">
					<span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fff8e6] text-[#b45309]">
						<Icon name="target" size={30} />
					</span>
				</p>
				<p class="mt-3 text-base font-extrabold">Selesaikan 1 bab</p>
				<p class="mt-1 text-sm text-[#5f6b62]">
					Buka Ruang Belajar Kelas {kelas ?? 1}, pilih satu bab, dan selesaikan
					kuisnya. Satu bab selesai, satu langkah maju.
				</p>
				<button
					type="button"
					class="btn btn-primary btn-block mt-4"
					disabled={menyimpan}
					onclick={mulaiMisi}
				>
					{#if menyimpan}
						Menyimpan...
					{:else}
						Mulai Misi Pertama <Icon name="arrow-right" size={16} />
					{/if}
				</button>
			</div>
		{/if}

		<div class="mt-4 flex items-center gap-2">
			{#if langkah > 1}
				<button type="button" class="btn btn-ghost" onclick={kembali}>
					<Icon name="chevron-left" size={16} /> Kembali
				</button>
			{/if}
			<span class="flex-1"></span>
			<button type="button" class="btn btn-ghost" disabled={menyimpan} onclick={lewati}>
				Lewati
			</button>
			{#if langkah < 3}
				<button
					type="button"
					class="btn btn-primary"
					disabled={langkah === 1 && kelas === null}
					onclick={lanjut}
				>
					Lanjut <Icon name="chevron-right" size={16} />
				</button>
			{/if}
		</div>
	</div>
{/if}
