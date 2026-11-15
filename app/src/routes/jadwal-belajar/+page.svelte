<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { api, getToken } from "$lib/api";

	const HARI = [
		{ value: 1, label: "Senin" },
		{ value: 2, label: "Selasa" },
		{ value: 3, label: "Rabu" },
		{ value: 4, label: "Kamis" },
		{ value: 5, label: "Jumat" },
		{ value: 6, label: "Sabtu" },
		{ value: 0, label: "Minggu" }
	];

	interface LinkedChild {
		id: string;
		name: string;
	}

	interface Schedule {
		id: string;
		parent_user_id: string;
		parent_name: string | null;
		child_user_id: string;
		child_name: string | null;
		weekday: number;
		time: string;
		enabled: number;
		created_at: string;
	}

	// ---- Status push ----
	let pushSupported = $state(true);
	let pushAlasan = $state("");
	let permission = $state<NotificationPermission>("default");
	let subscribed = $state(false);
	let pushBusy = $state(false);
	let pushMsg = $state("");
	let pushOk = $state(false);

	// ---- Jadwal ----
	let children = $state<LinkedChild[]>([]);
	let childrenLoading = $state(true);
	let schedules = $state<Schedule[]>([]);
	let schedulesLoading = $state(true);
	let jadwalError = $state("");
	let pilihAnak = $state("");
	let pilihHari = $state(1);
	let pilihJam = $state("16:00");
	let simpanBusy = $state(false);
	let simpanMsg = $state("");
	let hapusBusy = $state<string | null>(null);

	onMount(() => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
			pushSupported = false;
			pushAlasan =
				"Browser ini belum mendukung pengingat push. Coba lewat Chrome atau Edge di Android/komputer, dan pastikan Ringkas dibuka lewat HTTPS.";
			return;
		}
		if (!("Notification" in window)) {
			pushSupported = false;
			pushAlasan =
				"Browser ini belum mendukung notifikasi. Jadwal belajar tetap bisa dibuat di bawah — pengingat push akan aktif setelah kamu membuka Ringkas di browser yang mendukung notifikasi.";
		}
		permission = Notification.permission;
		cekLangganan();
		muatAnak();
		muatJadwal();
	});

	function namaHari(weekday: number): string {
		return HARI.find((h) => h.value === weekday)?.label ?? `Hari ${weekday}`;
	}

	function bufferKeBase64url(buf: ArrayBuffer | null): string {
		if (!buf) return "";
		const bytes = new Uint8Array(buf);
		let bin = "";
		const CHUNK = 0x8000;
		for (let i = 0; i < bytes.length; i += CHUNK) {
			bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
		}
		return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}

	function urlBase64KeUint8(base64: string): Uint8Array<ArrayBuffer> {
		const pad = "=".repeat((4 - (base64.length % 4)) % 4);
		const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
		const raw = atob(b64);
		const out = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
		return out;
	}

	async function ambilRegistrasi(): Promise<ServiceWorkerRegistration | undefined> {
		try {
			return (await navigator.serviceWorker.ready) ?? undefined;
		} catch {
			return await navigator.serviceWorker.getRegistration();
		}
	}

	async function cekLangganan() {
		try {
			const reg = await ambilRegistrasi();
			if (!reg) return;
			const sub = await reg.pushManager.getSubscription();
			subscribed = !!sub;
		} catch {
			// Status langganan tidak bisa dibaca — biarkan tombol mencoba lagi.
			subscribed = false;
		}
	}

	async function aktifkanPengingat() {
		pushBusy = true;
		pushMsg = "";
		pushOk = false;
		try {
			const hasil = await Notification.requestPermission();
			permission = hasil;
			if (hasil !== "granted") {
				pushMsg =
					"Izin notifikasi belum diberikan. Ketuk ikon gembok di bilah alamat browser, izinkan notifikasi, lalu coba lagi ya.";
				return;
			}
			const reg = await ambilRegistrasi();
			if (!reg) {
				pushMsg = "Service worker belum siap. Muat ulang halaman lalu coba lagi.";
				return;
			}
			const { publicKey } = await api<{ publicKey: string | null }>("/api/push/vapid-key");
			if (!publicKey) {
				pushMsg =
					"Pengingat push belum disiapkan di server. Jadwal belajar di bawah tetap tersimpan dan akan aktif setelah server selesai disiapkan.";
				return;
			}
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64KeUint8(publicKey)
			});
			await api("/api/push/subscribe", {
				method: "POST",
				body: JSON.stringify({
					endpoint: sub.endpoint,
					keys: {
						p256dh: bufferKeBase64url(sub.getKey("p256dh")),
						auth: bufferKeBase64url(sub.getKey("auth"))
					}
				})
			});
			subscribed = true;
			pushOk = true;
			pushMsg = "Pengingat aktif. Kamu akan mendapat notifikasi saat jadwal belajar tiba.";
		} catch (e) {
			pushMsg =
				e instanceof Error
					? `Tidak bisa mengaktifkan pengingat: ${e.message}`
					: "Tidak bisa mengaktifkan pengingat. Coba lagi ya.";
		} finally {
			pushBusy = false;
		}
	}

	async function nonaktifkanPengingat() {
		pushBusy = true;
		pushMsg = "";
		pushOk = false;
		try {
			const reg = await ambilRegistrasi();
			const sub = reg ? await reg.pushManager.getSubscription() : null;
			if (sub) {
				const endpoint = sub.endpoint;
				await sub.unsubscribe();
				await api("/api/push/unsubscribe", {
					method: "POST",
					body: JSON.stringify({ endpoint })
				});
			}
			subscribed = false;
			pushOk = true;
			pushMsg = "Pengingat dimatikan. Jadwal belajar yang tersimpan tidak ikut terhapus.";
		} catch (e) {
			pushMsg = e instanceof Error ? e.message : "Gagal mematikan pengingat.";
		} finally {
			pushBusy = false;
		}
	}

	async function muatAnak() {
		childrenLoading = true;
		try {
			const data = await api<{ children: LinkedChild[] }>("/api/parent/children");
			children = data.children ?? [];
			if (children.length > 0 && !pilihAnak) pilihAnak = children[0].id;
		} catch {
			children = [];
		} finally {
			childrenLoading = false;
		}
	}

	async function muatJadwal() {
		schedulesLoading = true;
		jadwalError = "";
		try {
			const data = await api<{ schedules: Schedule[] }>("/api/push/schedules");
			schedules = data.schedules ?? [];
		} catch (e) {
			jadwalError = e instanceof Error ? e.message : "Gagal memuat jadwal.";
		} finally {
			schedulesLoading = false;
		}
	}

	async function simpanJadwal() {
		if (!pilihAnak) {
			simpanMsg = "Pilih dulu anak yang dibuatkan jadwal.";
			return;
		}
		if (!pilihJam) {
			simpanMsg = "Pilih dulu jam belajarnya.";
			return;
		}
		simpanBusy = true;
		simpanMsg = "";
		try {
			await api("/api/push/schedules", {
				method: "POST",
				body: JSON.stringify({
					child_user_id: pilihAnak,
					weekday: pilihHari,
					time: pilihJam,
					enabled: true
				})
			});
			simpanMsg = "Jadwal tersimpan. Pengingat terkirim ke perangkat ini bila pengingat aktif.";
			muatJadwal();
		} catch (e) {
			simpanMsg = e instanceof Error ? e.message : "Gagal menyimpan jadwal.";
		} finally {
			simpanBusy = false;
		}
	}

	async function hapusJadwal(id: string) {
		hapusBusy = id;
		try {
			await api(`/api/push/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
			schedules = schedules.filter((s) => s.id !== id);
		} catch (e) {
			jadwalError = e instanceof Error ? e.message : "Gagal menghapus jadwal.";
		} finally {
			hapusBusy = null;
		}
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/akun")}>
	<Icon name="chevron-left" size={18} /> Kembali ke Akun
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-extrabold leading-snug">
	<Icon name="alarm-clock" size={22} class="shrink-0" /> Jadwal Belajar & Pengingat
</h1>
<p class="text-sm text-[#5f6b62]">
	Atur jam belajar tiap anak, lalu Ringkas mengingatkan lewat notifikasi saat waktunya tiba.
</p>

<!-- Kartu langganan push -->
<div class="card mt-4 p-4">
	<p class="flex items-center gap-2 text-sm font-bold">
		<Icon name="alarm-clock" size={18} /> Pengingat di perangkat ini
	</p>
	{#if !pushSupported}
		<p class="mt-2 flex items-start gap-2 text-sm text-[#5f6b62]">
			<Icon name="info" size={16} class="mt-0.5 shrink-0" /> {pushAlasan}
		</p>
	{:else}
		<p class="mt-2 text-sm text-[#5f6b62]">
			{#if subscribed}
				Pengingat <span class="font-bold text-[#177245]">aktif</span> di perangkat ini. Notifikasi
				akan muncul saat jadwal belajar tiba, walau Ringkas sedang tidak dibuka.
			{:else if permission === "denied"}
				Notifikasi <span class="font-bold text-[#b91c1c]">diblokir</span> di browser ini. Ketuk ikon
				gembok di bilah alamat, izinkan notifikasi, lalu muat ulang halaman.
			{:else}
				Pengingat <span class="font-bold">belum aktif</span> di perangkat ini. Aktifkan supaya
				jadwal belajar mengingatkanmu tepat waktu.
			{/if}
		</p>
		<div class="mt-3">
			{#if subscribed}
				<button type="button" class="btn btn-outline" onclick={nonaktifkanPengingat} disabled={pushBusy}>
					<Icon name="x" size={18} />
					{pushBusy ? "Memproses..." : "Nonaktifkan Pengingat"}
				</button>
			{:else}
				<button type="button" class="btn btn-primary" onclick={aktifkanPengingat} disabled={pushBusy}>
					<Icon name="check" size={18} />
					{pushBusy ? "Memproses..." : "Aktifkan Pengingat"}
				</button>
			{/if}
		</div>
		{#if pushMsg}
			<p class="mt-2 text-sm {pushOk ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{pushMsg}</p>
		{/if}
	{/if}
</div>

<!-- Editor jadwal -->
<div class="card mt-4 p-4">
	<p class="flex items-center gap-2 text-sm font-bold">
		<Icon name="calendar" size={18} /> Buat jadwal belajar
	</p>
	{#if childrenLoading}
		<p class="mt-2 text-sm text-[#5f6b62]">Memuat daftar anak...</p>
	{:else if children.length === 0}
		<p class="mt-2 text-sm text-[#5f6b62]">
			Belum ada anak terhubung. Hubungkan dulu lewat <a
				class="font-bold text-[#177245] underline"
				href="/akun">Mode Orang Tua di halaman Akun</a
			>, lalu kembali ke sini.
		</p>
	{:else}
		<label class="lbl mt-3" for="anak">Anak</label>
		<select id="anak" class="input" bind:value={pilihAnak}>
			{#each children as c (c.id)}
				<option value={c.id}>{c.name}</option>
			{/each}
		</select>
		<div class="mt-3 grid grid-cols-2 gap-3">
			<div>
				<label class="lbl" for="hari">Hari</label>
				<select id="hari" class="input" bind:value={pilihHari}>
					{#each HARI as h (h.value)}
						<option value={h.value}>{h.label}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="lbl" for="jam">Jam (WIB)</label>
				<input id="jam" class="input" type="time" bind:value={pilihJam} />
			</div>
		</div>
		<button
			type="button"
			class="btn btn-primary btn-block mt-4"
			onclick={simpanJadwal}
			disabled={simpanBusy}
		>
			<Icon name="check" size={18} />
			{simpanBusy ? "Menyimpan..." : "Simpan Jadwal"}
		</button>
		{#if simpanMsg}
			<p class="mt-2 text-sm text-[#5f6b62]">{simpanMsg}</p>
		{/if}
	{/if}
</div>

<!-- Daftar jadwal -->
<div class="card mt-4 p-4">
	<p class="flex items-center gap-2 text-sm font-bold">
		<Icon name="clock" size={18} /> Jadwal yang sudah ada
	</p>
	{#if schedulesLoading}
		<p class="mt-2 text-sm text-[#5f6b62]">Memuat jadwal...</p>
	{:else if jadwalError}
		<p class="err mt-2">{jadwalError}</p>
	{:else if schedules.length === 0}
		<p class="mt-2 text-sm text-[#5f6b62]">
			Belum ada jadwal. Buat jadwal pertama di atas — pengingat dikirim tiap minggu di hari dan jam
			itu.
		</p>
	{:else}
		<div class="mt-3 space-y-2">
			{#each schedules as s (s.id)}
				<div class="flex items-center gap-3 rounded-xl border border-[#e7e2d2] bg-[#fffdf7] p-3">
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9dc] text-[#177245]"
					>
						<Icon name="calendar" size={20} />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block font-bold">{s.child_name ?? "Anak"}</span>
						<span class="block text-sm text-[#5f6b62]">
							Setiap {namaHari(s.weekday)} pukul {s.time} WIB
						</span>
					</span>
					<button
						type="button"
						class="btn btn-danger shrink-0"
						onclick={() => hapusJadwal(s.id)}
						disabled={hapusBusy === s.id}
						aria-label="Hapus jadwal"
					>
						<Icon name="trash" size={16} />
					</button>
				</div>
			{/each}
		</div>
	{/if}
	<p class="mt-3 text-xs text-[#5f6b62]">
		Notifikasi dikirim ke perangkat orang tua yang mengaktifkan pengingat. Bila perangkat tidak
		mendukung push, jadwal tetap tersimpan dan bisa dilihat di sini.
	</p>
</div>
