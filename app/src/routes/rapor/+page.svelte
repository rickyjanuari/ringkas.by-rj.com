<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, apiBlob, downloadBlob, getToken } from "$lib/api";

	/** Event instalasi PWA (tidak ada di lib.dom bawaan). */
	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
	}

	interface LinkedChild {
		id: string;
		name: string;
	}

	let children = $state<LinkedChild[]>([]);
	let childrenLoading = $state(true);
	let downloading = $state<string | null>(null);
	let dlError = $state("");

	// ---- Instal aplikasi (PWA) ----
	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let installState = $state<"unknown" | "available" | "installed" | "manual">("unknown");
	let installNotice = $state("");
	let isIos = $state(false);

	onMount(() => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		// Sudah terinstal? (standalone atau iOS standalone)
		const standalone =
			window.matchMedia("(display-mode: standalone)").matches ||
			(window.navigator as unknown as { standalone?: boolean }).standalone === true;
		if (standalone) {
			installState = "installed";
		} else {
			isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
			// iOS tidak pernah mengirim beforeinstallprompt — langsung
			// tampilkan petunjuk manual.
			if (isIos) installState = "manual";
		}

		function onBeforeInstall(e: Event) {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
			installState = "available";
		}
		window.addEventListener("beforeinstallprompt", onBeforeInstall);
		return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
	});

	onMount(async () => {
		if (!getToken()) return;
		try {
			const data = await api<{ children: LinkedChild[] }>("/api/parent/children");
			children = data.children ?? [];
		} catch {
			// Daftar anak opsional: rapor sendiri tetap bisa diunduh.
			children = [];
		} finally {
			childrenLoading = false;
		}
	});

	/** Unduh rapor PDF — milik sendiri (childId null) atau satu anak. */
	async function unduhRapor(childId: string | null) {
		const key = childId ?? "me";
		if (downloading) return;
		downloading = key;
		dlError = "";
		try {
			const path = childId
				? `/api/rapor?child_id=${encodeURIComponent(childId)}`
				: "/api/rapor";
			const { blob, filename } = await apiBlob(path);
			downloadBlob(blob, filename);
		} catch (e) {
			dlError = e instanceof Error ? e.message : "Gagal mengunduh rapor.";
		} finally {
			downloading = null;
		}
	}

	/** Minta browser menampilkan prompt instalasi (hanya bila tersedia). */
	async function instalAplikasi() {
		if (!deferredPrompt) return;
		installNotice = "";
		try {
			await deferredPrompt.prompt();
			const choice = await deferredPrompt.userChoice;
			if (choice.outcome === "accepted") {
				installNotice = "Terima kasih! Aplikasi Ringkas sedang dipasang ke layar utama.";
				installState = "installed";
			} else {
				installNotice =
					"Tidak apa-apa — kamu tetap bisa memakai Ringkas dari browser seperti biasa.";
				installState = "manual";
			}
		} catch {
			installNotice = "Instalasi belum berhasil — coba lewat petunjuk manual di bawah.";
			installState = "manual";
		} finally {
			deferredPrompt = null;
		}
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/akun")}>
	<Icon name="chevron-left" size={18} /> Kembali ke Akun
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-extrabold leading-snug">
	<Icon name="graduation-cap" size={22} class="shrink-0" /> Rapor Semester
</h1>
<p class="text-sm text-[#5f6b62]">
	Ringkasan belajarmu satu semester dalam satu berkas PDF — siap diunduh dan dibagikan ke orang tua.
</p>

<!-- Rapor saya -->
<div class="card mt-4 p-4">
	<p class="flex items-center gap-1.5 text-sm font-extrabold">
		<Icon name="file-text" size={15} /> Rapor Saya
	</p>
	<p class="mt-1 text-sm text-[#5f6b62]">Isi rapor:</p>
	<ul class="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[#3f4a42]">
		<li>Streak belajar, hari belajar, dan jumlah bab selesai</li>
		<li>Jumlah simulasi SAS yang dikerjakan</li>
		<li>Rata-rata nilai simulasi per mapel + prediksi nilai SAS</li>
		<li>Bab yang perlu diulang + semua nilai simulasi</li>
	</ul>
	<p class="mt-2 text-xs text-[#5f6b62]">
		Prediksi nilai SAS adalah perkiraan dari rata-rata berbobot simulasi — bukan nilai resmi.
	</p>
	<button
		type="button"
		class="btn btn-primary btn-block mt-3"
		disabled={downloading !== null}
		onclick={() => unduhRapor(null)}
	>
		{#if downloading === "me"}Mengunduh...{:else}<Icon name="download" size={16} /> Unduh Rapor Semester (PDF){/if}
	</button>
</div>

{#if dlError}
	<p class="err mt-3">{dlError}</p>
{/if}

<!-- Rapor anak (orang tua terhubung) -->
{#if childrenLoading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat daftar anak...</p>
{:else if children.length > 0}
	<h2 class="mt-6 flex items-center gap-2 text-base font-extrabold">
		<Icon name="users" size={18} /> Rapor Anak
	</h2>
	<p class="text-xs text-[#5f6b62]">
		Anak-anak yang sudah menebus kode Mode Orang Tua darimu.
	</p>
	<div class="mt-2 space-y-3">
		{#each children as child (child.id)}
			<div class="card p-4">
				<div class="flex items-start justify-between gap-2">
					<div>
						<p class="text-sm font-extrabold leading-snug">{child.name}</p>
						<p class="mt-0.5 text-xs text-[#5f6b62]">Rapor semester anakmu dalam berkas PDF.</p>
					</div>
				</div>
				<button
					type="button"
					class="btn btn-outline btn-block mt-3"
					disabled={downloading !== null}
					onclick={() => unduhRapor(child.id)}
				>
					{#if downloading === child.id}Mengunduh...{:else}<Icon name="download" size={16} /> Unduh Rapor {child.name}{/if}
				</button>
			</div>
		{/each}
	</div>
{/if}

<!-- Instal aplikasi (PWA) -->
<div class="card mt-6 p-4">
	<p class="flex items-center gap-1.5 text-sm font-extrabold">
		<Icon name="smartphone" size={15} /> Instal Aplikasi Ringkas
	</p>
	<p class="mt-1 text-sm text-[#5f6b62]">
		Pasang Ringkas di layar utama HP supaya bisa dibuka seperti aplikasi.
	</p>

	{#if installState === "available"}
		<button type="button" class="btn btn-sun btn-block mt-3" onclick={instalAplikasi}>
			<Icon name="download" size={16} /> Instal Aplikasi
		</button>
	{:else if installState === "installed"}
		<p class="ok-msg mt-3">
			<Icon name="check" size={15} class="inline-block align-[-2px]" /> Aplikasi Ringkas sudah terinstal di perangkat ini.
		</p>
	{:else}
		<div class="mt-3 rounded-xl border border-[#e7e2d2] bg-[#f7f5ef] p-3 text-sm">
			<p class="font-bold">Cara manual memasang aplikasi:</p>
			<ul class="mt-1 list-disc space-y-1 pl-5 text-[#3f4a42]">
				<li>
					<strong>Android (Chrome):</strong> ketuk menu titik tiga (⋮) di kanan atas, lalu pilih
					"Tambahkan ke layar utama".
				</li>
				<li>
					<strong>iPhone / iPad (Safari):</strong> ketuk tombol Bagikan, lalu pilih "Tambah ke
					Layar Utama".
				</li>
			</ul>
		</div>
	{/if}

	{#if installNotice}
		<p class="ok-msg mt-3">{installNotice}</p>
	{/if}

	<p class="mt-3 flex items-start gap-1.5 text-xs text-[#5f6b62]">
		<Icon name="info" size={14} class="mt-0.5 shrink-0" />
		<span>
			Catatan offline: materi yang sudah pernah dibuka tetap bisa dibaca tanpa internet. Materi
			yang belum pernah dibuka belum tersedia offline.
		</span>
	</p>
</div>

<p class="mt-6 text-center text-xs text-[#9aa096]">
	Rapor dibuat dari data belajarmu di Ringkas • Semangat belajarnya!
</p>
