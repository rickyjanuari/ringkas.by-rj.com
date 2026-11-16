<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import { api, getToken } from "$lib/api";

	const MAX_SECONDS = 60;

	interface OwnedProduct {
		id: string;
		title: string;
	}

	interface ChapterOption {
		id: string;
		title: string;
		subject: string;
		locked?: boolean;
		free?: boolean;
	}

	interface RecordingItem {
		id: string;
		name: string;
		text_label: string;
		duration_seconds: number;
		stars: number | null;
		created_at: string;
		can_rate?: boolean;
	}

	let products = $state<OwnedProduct[]>([]);
	let productsLoading = $state(true);
	let loadError = $state("");

	let productId = $state("");
	let chapters = $state<ChapterOption[]>([]);
	let chaptersLoading = $state(false);
	let chapterId = $state("");

	let textLabel = $state("");
	let recordings = $state<RecordingItem[]>([]);
	let recordingsLoading = $state(false);
	let listError = $state("");

	// ---- Perekaman ----
	let recorder = $state<MediaRecorder | null>(null);
	let stream = $state<MediaStream | null>(null);
	let recording = $state(false);
	let elapsed = $state(0);
	let timerId = $state<ReturnType<typeof setInterval> | null>(null);
	let audioBlob = $state<Blob | null>(null);
	let audioUrl = $state("");
	let audioMime = $state("audio/webm");
	let micError = $state("");
	let micSupported = $state(true);
	let uploading = $state(false);
	let uploadMsg = $state("");
	let uploadOk = $state(false);

	// ---- Putar rekaman orang lain ----
	let playingId = $state<string | null>(null);
	let playingUrl = $state("");
	let playingLoading = $state<string | null>(null);
	let playError = $state("");
	let ratingBusy = $state<string | null>(null);
	let ratingMsg = $state("");

	onMount(() => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
			micSupported = false;
			micError =
				"Browser ini tidak mendukung perekaman suara. Coba lewat Chrome atau Edge di Android/komputer ya.";
		}
		const qProduct = $page.url.searchParams.get("product") ?? "";
		const qChapter = $page.url.searchParams.get("chapter") ?? "";
		if (qProduct) productId = qProduct;
		if (qChapter) chapterId = qChapter;
		muatProduk().then(() => {
			if (productId) muatBab(productId, chapterId || undefined);
		});
	});

	function formatWaktu(detik: number): string {
		const m = Math.floor(detik / 60);
		const s = detik % 60;
		return `${m}:${String(s).padStart(2, "0")}`;
	}

	function formatTanggal(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
	}

	async function muatProduk() {
		productsLoading = true;
		loadError = "";
		try {
			const data = await api<{
				orders: { status: string; items: { product_id: string; title: string }[] }[];
			}>("/api/orders");
			const map = new Map<string, string>();
			for (const o of data.orders ?? []) {
				if (o.status !== "PAID") continue;
				for (const it of o.items ?? []) {
					if (!map.has(it.product_id)) map.set(it.product_id, it.title);
				}
			}
			products = [...map.entries()].map(([id, title]) => ({ id, title }));
		} catch (e) {
			loadError = e instanceof Error ? e.message : "Gagal memuat produk.";
		} finally {
			productsLoading = false;
		}
	}

	async function muatBab(pid: string, pilihChapter?: string) {
		chaptersLoading = true;
		chapters = [];
		chapterId = "";
		recordings = [];
		try {
			const data = await api<{ chapters: ChapterOption[] }>(`/api/study/${encodeURIComponent(pid)}`);
			chapters = (data.chapters ?? []).filter((ch) => !ch.locked);
			if (pilihChapter && chapters.some((ch) => ch.id === pilihChapter)) {
				chapterId = pilihChapter;
				muatRekaman();
			}
		} catch (e) {
			loadError = e instanceof Error ? e.message : "Gagal memuat daftar bab.";
		} finally {
			chaptersLoading = false;
		}
	}

	function pilihProduk(pid: string) {
		productId = pid;
		hentikanSemua();
		muatBab(pid);
	}

	function pilihBab(cid: string) {
		chapterId = cid;
		hentikanSemua();
		muatRekaman();
	}

	async function muatRekaman() {
		if (!chapterId) return;
		recordingsLoading = true;
		listError = "";
		try {
			const data = await api<{ recordings: RecordingItem[] }>(
				`/api/voice/recordings?chapter_id=${encodeURIComponent(chapterId)}`
			);
			recordings = data.recordings ?? [];
		} catch (e) {
			listError = e instanceof Error ? e.message : "Gagal memuat rekaman.";
		} finally {
			recordingsLoading = false;
		}
	}

	function pilihMime(): string {
		const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
		for (const m of candidates) {
			try {
				if (MediaRecorder.isTypeSupported(m)) return m;
			} catch {
				/* lanjut */
			}
		}
		return "";
	}

	async function mulaiRekam() {
		micError = "";
		uploadMsg = "";
		if (!micSupported) return;
		if (recording) return;
		let s: MediaStream;
		try {
			s = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (e) {
			const name = e instanceof DOMException ? e.name : "";
			micError =
				name === "NotAllowedError" || name === "SecurityError"
					? "Izin mikrofon belum diberikan. Ketuk ikon gembok di bilah alamat browser, izinkan mikrofon, lalu coba lagi ya."
					: "Mikrofon tidak bisa dipakai. Pastikan tidak ada aplikasi lain yang memakai mikrofon, lalu coba lagi.";
			return;
		}
		stream = s;
		const mime = pilihMime();
		audioMime = mime ? mime.split(";")[0] : "audio/webm";
		const chunks: Blob[] = [];
		let rec: MediaRecorder;
		try {
			rec = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
		} catch {
			micError = "Perekaman suara tidak didukung di perangkat ini.";
			s.getTracks().forEach((t) => t.stop());
			return;
		}
		rec.ondataavailable = (ev) => {
			if (ev.data && ev.data.size > 0) chunks.push(ev.data);
		};
		rec.onstop = () => {
			const blob = new Blob(chunks, { type: audioMime });
			audioBlob = blob;
			if (audioUrl) URL.revokeObjectURL(audioUrl);
			audioUrl = URL.createObjectURL(blob);
			s.getTracks().forEach((t) => t.stop());
			stream = null;
		};
		recorder = rec;
		audioBlob = null;
		if (audioUrl) {
			URL.revokeObjectURL(audioUrl);
			audioUrl = "";
		}
		elapsed = 0;
		recording = true;
		rec.start(250);
		timerId = setInterval(() => {
			elapsed += 1;
			if (elapsed >= MAX_SECONDS) berhentiRekam();
		}, 1000);
	}

	function berhentiRekam() {
		if (timerId) {
			clearInterval(timerId);
			timerId = null;
		}
		if (recorder && recorder.state !== "inactive") recorder.stop();
		recording = false;
	}

	function hentikanSemua() {
		if (recording) berhentiRekam();
		if (stream) {
			stream.getTracks().forEach((t) => t.stop());
			stream = null;
		}
	}

	function blobKeBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = String(reader.result ?? "");
				const i = dataUrl.indexOf(",");
				resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl);
			};
			reader.onerror = () => reject(new Error("Gagal membaca rekaman."));
			reader.readAsDataURL(blob);
		});
	}

	async function kirimRekaman() {
		if (!audioBlob || !chapterId || !productId) return;
		if (!textLabel.trim()) {
			uploadMsg = "Tulis dulu teks yang kamu baca.";
			uploadOk = false;
			return;
		}
		uploading = true;
		uploadMsg = "";
		try {
			const audio_base64 = await blobKeBase64(audioBlob);
			const data = await api<{ id: string }>(`/api/voice/recordings`, {
				method: "POST",
				body: JSON.stringify({
					chapter_id: chapterId,
					product_id: productId,
					text_label: textLabel.trim().slice(0, 300),
					audio_base64,
					mime: audioMime,
					duration_seconds: elapsed
				})
			});
			uploadMsg = "Rekamanmu terkirim. Orang tua atau gurumu bisa mendengarkan dan memberi bintang.";
			uploadOk = true;
			audioBlob = null;
			if (audioUrl) {
				URL.revokeObjectURL(audioUrl);
				audioUrl = "";
			}
			textLabel = "";
			elapsed = 0;
			void data;
			muatRekaman();
		} catch (e) {
			uploadMsg = e instanceof Error ? e.message : "Gagal mengirim rekaman.";
			uploadOk = false;
		} finally {
			uploading = false;
		}
	}

	async function putarRekaman(id: string) {
		if (playingId === id) {
			playingId = null;
			playingUrl = "";
			return;
		}
		playingLoading = id;
		playError = "";
		try {
			const data = await api<{ mime: string; audio_base64: string }>(
				`/api/voice/recordings/${encodeURIComponent(id)}/audio`
			);
			playingUrl = `data:${data.mime};base64,${data.audio_base64}`;
			playingId = id;
		} catch (e) {
			playError = e instanceof Error ? e.message : "Gagal memutar rekaman.";
		} finally {
			playingLoading = null;
		}
	}

	async function beriBintang(id: string, stars: number) {
		ratingBusy = id;
		ratingMsg = "";
		try {
			await api(`/api/voice/recordings/${encodeURIComponent(id)}/star`, {
				method: "POST",
				body: JSON.stringify({ stars })
			});
			recordings = recordings.map((r) => (r.id === id ? { ...r, stars } : r));
			ratingMsg = "Bintang tersimpan. Terima kasih";
		} catch (e) {
			ratingMsg = e instanceof Error ? e.message : "Gagal memberi bintang.";
		} finally {
			ratingBusy = null;
		}
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto("/akun")}>
	<Icon name="chevron-left" size={18} /> Kembali ke akun
</button>

<h1 class="mt-3 flex items-center gap-2 text-xl font-semibold leading-snug">
	<Icon name="book-open" size={18} class="shrink-0" /> Rekam suara baca nyaring
</h1>
<p class="text-sm text-[#5f6b62]">
	Baca nyaring satu bagian bab, rekam suaramu (maksimal 60 detik), lalu kirim. Orang tua atau
	gurumu bisa mendengarkan dan memberi bintang.
</p>

{#if loadError}
	<p class="err mt-3">{loadError}</p>
{/if}

<!-- Pilih produk & bab -->
<div class="card mt-4 p-4">
	<label class="lbl" for="produk">Produk yang kamu miliki</label>
	{#if productsLoading}
		<p class="text-sm text-[#5f6b62]">Memuat produk...</p>
	{:else if products.length === 0}
		<p class="text-sm text-[#5f6b62]">
			Belum ada produk yang dibeli. Bab pertama tiap produk bisa dicoba gratis — buka dulu satu bab
			dari <a class="font-medium text-[#177245] underline" href="/belajar">Ruang belajar</a>.
		</p>
	{:else}
		<select
			id="produk"
			class="input"
			value={productId}
			onchange={(e) => pilihProduk((e.currentTarget as HTMLSelectElement).value)}
		>
			<option value="">— Pilih produk —</option>
			{#each products as p (p.id)}
				<option value={p.id}>{p.title}</option>
			{/each}
		</select>
	{/if}

	{#if productId}
		<label class="lbl mt-4" for="bab">Bab</label>
		{#if chaptersLoading}
			<p class="text-sm text-[#5f6b62]">Memuat bab...</p>
		{:else if chapters.length === 0}
			<p class="text-sm text-[#5f6b62]">Tidak ada bab terbuka di produk ini.</p>
		{:else}
			<select
				id="bab"
				class="input"
				value={chapterId}
				onchange={(e) => pilihBab((e.currentTarget as HTMLSelectElement).value)}
			>
				<option value="">— Pilih bab —</option>
				{#each chapters as ch (ch.id)}
					<option value={ch.id}>{ch.subject} — {ch.title}</option>
				{/each}
			</select>
		{/if}
	{/if}
</div>

{#if chapterId}
	<!-- Perekam -->
	<div class="card mt-4 p-4">
		<p class="text-sm font-medium">Rekam bacaanmu</p>
		<label class="lbl mt-3" for="teks">Teks yang dibaca (maks. 300 karakter)</label>
		<textarea
			id="teks"
			class="input"
			rows="3"
			maxlength="300"
			placeholder="Contoh: Bilangan 11 sampai 20..."
			bind:value={textLabel}
		></textarea>
		<p class="mt-1 text-right text-xs text-[#5f6b62]">{textLabel.length}/300</p>

		<div class="mt-2 flex flex-wrap items-center gap-2">
			{#if !recording}
				<button type="button" class="btn btn-primary" onclick={mulaiRekam} disabled={!micSupported}>
					<Icon name="play" size={18} /> Mulai merekam
				</button>
			{:else}
				<button type="button" class="btn btn-danger" onclick={berhentiRekam}>
					<Icon name="x" size={18} /> Berhenti ({formatWaktu(elapsed)} / 1:00)
				</button>
			{/if}
			{#if recording}
				<span class="flex items-center gap-2 text-sm font-medium text-[#b91c1c]">
					<span class="inline-block h-3 w-3 animate-pulse rounded-full bg-[#b91c1c]"></span>
					Merekam... {formatWaktu(elapsed)}
				</span>
			{/if}
		</div>
		<p class="mt-2 text-xs text-[#5f6b62]">
			Rekaman berhenti sendiri setelah 60 detik. Suara hanya tersimpan bila kamu menekan "Kirim
			Rekaman".
		</p>
		{#if micError}
			<p class="err mt-2">{micError}</p>
		{/if}

		{#if audioBlob && audioUrl}
			<div class="mt-3 rounded-xl bg-[#f7f5ef] p-3">
				<p class="text-sm font-medium">Dengarkan dulu hasil rekamanmu ({formatWaktu(elapsed)})</p>
				<audio class="mt-2 w-full" controls src={audioUrl}></audio>
				<button
					type="button"
					class="btn btn-primary btn-block mt-3"
					onclick={kirimRekaman}
					disabled={uploading}
				>
					<Icon name="upload" size={18} />
					{uploading ? "Mengirim..." : "Kirim Rekaman"}
				</button>
			</div>
		{/if}
		{#if uploadMsg}
			<p class="mt-2 text-sm {uploadOk ? 'text-[#065f46]' : 'text-[#b91c1c]'}">{uploadMsg}</p>
		{/if}
	</div>

	<!-- Daftar rekaman -->
	<div class="card mt-4 p-4">
		<p class="text-sm font-medium">Rekaman di bab ini</p>
		{#if recordingsLoading}
			<p class="mt-2 text-sm text-[#5f6b62]">Memuat rekaman...</p>
		{:else if listError}
			<p class="err mt-2">{listError}</p>
		{:else if recordings.length === 0}
			<p class="mt-2 text-sm text-[#5f6b62]">
				Belum ada rekaman di bab ini. Jadilah yang pertama merekam!
			</p>
		{:else}
			<div class="mt-3 space-y-3">
				{#each recordings as r (r.id)}
					<div class="rounded-xl border border-[#e7e2d2] bg-[#fffdf7] p-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="font-medium">{r.name}</p>
								<p class="text-sm text-[#5f6b62]">{r.text_label}</p>
								<p class="mt-1 text-xs text-[#5f6b62]">
									{formatWaktu(r.duration_seconds)} · {formatTanggal(r.created_at)}
								</p>
							</div>
							{#if r.stars}
								<span
									class="flex shrink-0 items-center gap-1 rounded-full bg-[#fbeecd] px-2 py-1 text-xs font-semibold"
								>
									<Icon name="star" size={16} class="text-[#f2b33d]" />
									{r.stars}/5
								</span>
							{/if}
						</div>
						<div class="mt-2 flex flex-wrap items-center gap-2">
							<button
								type="button"
								class="btn btn-outline"
								onclick={() => putarRekaman(r.id)}
								disabled={playingLoading === r.id}
							>
								<Icon name={playingId === r.id ? "x" : "play"} size={16} />
								{playingLoading === r.id
									? "Memuat..."
									: playingId === r.id
										? "Tutup"
										: "Putar"}
							</button>
							{#if r.can_rate}
								<span class="flex items-center gap-1" aria-label="Beri bintang 1 sampai 5">
									{#each [1, 2, 3, 4, 5] as n (n)}
										<button
											type="button"
											class="rounded p-0.5"
											title={`Beri ${n} bintang`}
											disabled={ratingBusy === r.id}
											onclick={() => beriBintang(r.id, n)}
										>
											<Icon
												name="star"
												size={18}
												class={r.stars && n <= r.stars ? "text-[#f2b33d]" : "text-[#c9c2ae]"}
											/>
										</button>
									{/each}
								</span>
							{/if}
						</div>
						{#if playingId === r.id && playingUrl}
							<audio class="mt-2 w-full" controls autoplay src={playingUrl}></audio>
						{/if}
					</div>
				{/each}
			</div>
			{#if playError}
				<p class="err mt-2">{playError}</p>
			{/if}
			{#if ratingMsg}
				<p class="mt-2 text-xs text-[#5f6b62]">{ratingMsg}</p>
			{/if}
		{/if}
	</div>
{/if}
