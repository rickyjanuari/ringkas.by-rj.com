<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, formatTanggal, getToken } from "$lib/api";

	interface TryoutListItem {
		id: string;
		grade: number;
		title: string;
		starts_at: string;
		ends_at: string;
		duration_minutes: number;
		question_count: number;
		is_free: number;
		status: string;
		phase: "upcoming" | "live" | "ended";
		participants: number;
		submissions: number;
		registered?: boolean;
		submitted?: boolean;
		my_score?: number;
		my_max_score?: number;
	}

	let tryouts = $state<TryoutListItem[]>([]);
	let loading = $state(true);
	let error = $state("");
	let loggedIn = $state(false);

	// Hitung mundur diperbarui tiap menit.
	let nowMs = $state(Date.now());
	let tick: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		loggedIn = !!getToken();
		tick = setInterval(() => (nowMs = Date.now()), 60000);
		void muat();
		return () => clearInterval(tick);
	});

	async function muat() {
		loading = true;
		error = "";
		try {
			const data = await api<{ tryouts: TryoutListItem[] }>("/api/tryouts");
			tryouts = data.tryouts ?? [];
		} catch (e) {
			// Token basi: api() sudah menghapusnya — coba sekali lagi tanpa token.
			if (e instanceof Error && e.message.startsWith("Sesi habis")) {
				try {
					const data = await api<{ tryouts: TryoutListItem[] }>("/api/tryouts");
					tryouts = data.tryouts ?? [];
					loading = false;
					return;
				} catch {
					/* jatuh ke error di bawah */
				}
			}
			error = e instanceof Error ? e.message : "Gagal memuat tryout.";
		} finally {
			loading = false;
		}
	}

	function hitungMundur(t: TryoutListItem): string {
		const start = new Date(t.starts_at).getTime();
		const end = new Date(t.ends_at).getTime();
		if (nowMs >= end) return "Sudah berakhir";
		if (nowMs >= start) {
			const sisa = end - nowMs;
			const j = Math.floor(sisa / 3600000);
			const m = Math.floor((sisa % 3600000) / 60000);
			return j > 0 ? `Berlangsung — berakhir dalam ${j} jam ${m} mnt` : `Berlangsung — berakhir dalam ${m} mnt`;
		}
		const sisa = start - nowMs;
		const h = Math.floor(sisa / 3600000);
		const d = Math.floor(h / 24);
		const m = Math.floor((sisa % 3600000) / 60000);
		if (d > 0) return `Mulai dalam ${d} hari ${h % 24} jam`;
		if (h > 0) return `Mulai dalam ${h} jam ${m} mnt`;
		return `Mulai dalam ${m} mnt`;
	}

	function faseLabel(t: TryoutListItem): string {
		if (t.phase === "live") return "Berlangsung";
		if (t.phase === "upcoming") return "Mendatang";
		return "Selesai";
	}

	function faseBadge(t: TryoutListItem): string {
		if (t.phase === "live") return "badge badge-leaf";
		if (t.phase === "upcoming") return "badge badge-sun";
		return "badge badge-gray";
	}

	let live = $derived(tryouts.filter((t) => t.phase === "live"));
	let upcoming = $derived(tryouts.filter((t) => t.phase === "upcoming"));
	let ended = $derived(tryouts.filter((t) => t.phase === "ended"));
	let groups = $derived(
		[
			{ label: "Sedang Berlangsung", items: live },
			{ label: "Tryout Mendatang", items: upcoming },
			{ label: "Tryout Selesai", items: ended }
		].filter((g) => g.items.length > 0)
	);
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/")}>
	<Icon name="chevron-left" size={18} /> Kembali ke Beranda
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-extrabold">
	<Icon name="trophy" size={22} /> Tryout Terjadwal
</h1>
<p class="mt-1 text-sm text-[#5f6b62]">
	Ujian bersama per kelas — soal acak lintas mapel dari bank simulasi. Daftar dulu, kerjakan saat
	waktunya tiba, dan lihat peringkatmu setelah selesai.
</p>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat tryout...</p>
{:else if error}
	<p class="err mt-6">{error}</p>
	<button type="button" class="btn btn-primary mt-3" onclick={muat}>Coba lagi</button>
{:else if tryouts.length === 0}
	<div class="card mt-4 p-5 text-center">
		<p class="text-sm font-bold">Belum ada tryout yang dijadwalkan.</p>
		<p class="mt-1 text-sm text-[#5f6b62]">Cek lagi nanti ya — tryout baru diumumkan di Beranda.</p>
	</div>
{:else}
	{#each groups as g (g.label)}
		<h2 class="mt-5 text-base font-extrabold">{g.label}</h2>
		<div class="mt-2 space-y-3">
			{#each g.items as t (t.id)}
				<div class="card p-4">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0">
							<p class="flex flex-wrap items-center gap-1.5">
								<span class={faseBadge(t)}>{faseLabel(t)}</span>
								<span class="badge {t.is_free ? 'badge-leaf' : 'badge-gray'}">
									{t.is_free ? "Gratis" : "Pemilik Kelas " + t.grade}
								</span>
							</p>
							<h3 class="mt-1.5 text-base font-extrabold leading-snug">{t.title}</h3>
							<p class="mt-0.5 text-sm text-[#5f6b62]">Kelas {t.grade}</p>
						</div>
						{#if t.submitted}
							<span class="rounded-lg bg-[#ecfdf5] px-2.5 py-1.5 text-xs font-extrabold text-[#065f46]">
								Skormu: {t.my_score} / {t.my_max_score}
							</span>
						{/if}
					</div>
					<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[#3f4a42]">
						<span class="flex items-center gap-1"><Icon name="calendar" size={14} /> {formatTanggal(t.starts_at)}</span>
						<span class="flex items-center gap-1"><Icon name="timer" size={14} /> {t.duration_minutes} menit</span>
						<span class="flex items-center gap-1"><Icon name="file-text" size={14} /> {t.question_count} soal</span>
						<span class="flex items-center gap-1"><Icon name="users" size={14} /> {t.participants} peserta • {t.submissions} sudah mengerjakan</span>
					</div>
					<p class="mt-1.5 text-xs font-bold text-[#177245]"><Icon name="clock" size={13} class="inline-block align-[-2px]" /> {hitungMundur(t)}</p>
					<div class="mt-3 flex flex-wrap gap-2">
						<a href="/tryout/{t.id}" class="btn {t.phase === 'live' ? 'btn-primary' : 'btn-outline'} text-xs">
							{#if t.phase === "live"}
								<Icon name="play" size={15} /> {t.registered ? (t.submitted ? "Lihat Hasil & Peringkat" : "Kerjakan Tryout") : "Lihat & Daftar"}
							{:else if t.phase === "upcoming"}
								<Icon name="calendar" size={15} /> {t.registered ? "Sudah Terdaftar — Lihat Detail" : "Lihat & Daftar"}
							{:else}
								<Icon name="trophy" size={15} /> Lihat Peringkat
							{/if}
						</a>
						{#if t.phase !== "ended" && !loggedIn}
							<a href="/akun" class="btn btn-ghost text-xs">Masuk untuk ikut tryout</a>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/each}
{/if}
