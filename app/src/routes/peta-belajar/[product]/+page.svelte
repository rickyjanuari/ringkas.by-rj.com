<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import { gradeOfProduct, gradeTheme } from "$lib/gradeTheme";
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { api, getToken, type StudyPack, type FullChapter } from "$lib/api";

	let productId = $derived($page.params.product);
	/** Warna kelas produk ini — dipakai cincin node "saat ini" + legenda. */
	let gtPeta = $derived(gradeTheme(gradeOfProduct(productId)));
	let pack = $state<StudyPack | null>(null);
	let doneSet = $state<Set<string>>(new Set());
	let loading = $state(true);
	let error = $state("");
	let lockedChapter = $state<FullChapter | null>(null);
	let wrapW = $state(0);

	// ---- Geometri peta ----
	// Jalur berkelok (sinus) vertikal: satu node per bab, dalam urutan
	// yang sama seperti getStudyPack (sort_order). Posisi dihitung dari
	// lebar wadah sehingga peta menyesuaikan mobile maupun desktop.
	const TOP_PAD = 46;
	const BOTTOM_PAD = 54;

	type NodeState = "done" | "current" | "todo" | "locked";
	type MapNode = { ch: FullChapter; i: number; x: number; y: number; state: NodeState };

	let rowH = $derived(124);
	let nodeR = $derived(wrapW >= 1024 ? 30 : 26);
	let amp = $derived(Math.min(Math.max((wrapW || 360) * 0.3, 84), 250));
	let cx = $derived((wrapW || 360) / 2);
	let labelW = $derived(Math.min(Math.max((wrapW || 360) * 0.42, 140), 230));

	let nodes = $derived.by((): MapNode[] => {
		if (!pack) return [];
		const firstOpen = pack.chapters.findIndex((c) => !doneSet.has(c.id) && !c.locked);
		return pack.chapters.map((ch, i) => {
			const x = cx + amp * Math.sin(i * 0.9);
			const y = TOP_PAD + i * rowH;
			const state: NodeState = doneSet.has(ch.id)
				? "done"
				: ch.locked
					? "locked"
					: i === firstOpen
						? "current"
						: "todo";
			return { ch, i, x, y, state };
		});
	});

	let mapH = $derived(
		pack ? TOP_PAD + Math.max(pack.chapters.length - 1, 0) * rowH + BOTTOM_PAD : 0
	);
	let doneCount = $derived(pack ? pack.chapters.filter((c) => doneSet.has(c.id)).length : 0);
	let totalCount = $derived(pack ? pack.chapters.length : 0);
	let pct = $derived(totalCount ? Math.round((doneCount / totalCount) * 100) : 0);
	let currentNode = $derived(nodes.find((n) => n.state === "current") ?? null);
	let hasLockedLeft = $derived(nodes.some((n) => n.state === "locked"));

	// Panjang jejak emerald: sampai node "saat ini"; 100% bila semua selesai.
	let trailPct = $derived.by(() => {
		if (!pack || totalCount === 0) return 0;
		if (doneCount === totalCount) return 100;
		if (totalCount <= 1) return 0;
		if (currentNode) return (currentNode.i / (totalCount - 1)) * 100;
		return (doneCount / totalCount) * 100;
	});

	// Kurva halus (Catmull-Rom -> Bezier) yang melewati tepat di tengah
	// setiap node.
	function smoothPath(pts: { x: number; y: number }[]): string {
		if (pts.length === 0) return "";
		if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
		let d = `M ${pts[0].x} ${pts[0].y}`;
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[Math.max(0, i - 1)];
			const p1 = pts[i];
			const p2 = pts[i + 1];
			const p3 = pts[Math.min(pts.length - 1, i + 2)];
			const c1x = p1.x + (p2.x - p0.x) / 6;
			const c1y = p1.y + (p2.y - p0.y) / 6;
			const c2x = p2.x - (p3.x - p1.x) / 6;
			const c2y = p2.y - (p3.y - p1.y) / 6;
			d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
		}
		return d;
	}

	let pathD = $derived(smoothPath(nodes.map((n) => ({ x: n.x, y: n.y }))));

	// Posisi label: di sisi node (kiri/kanan, mengikuti sisi jalur) bila
	// muat; bila sempit, di bawah node.
	type LabelPos = { left: number; top: number; align: "left" | "right" | "center"; below: boolean };
	function labelPos(n: MapNode): LabelPos {
		const W = wrapW || 360;
		const r = nodeR;
		const leftFits = n.x - r - 12 - labelW >= 0;
		const rightFits = n.x + r + 12 + labelW <= W;
		if (n.x >= cx && rightFits) {
			return { left: n.x + r + 12, top: n.y, align: "left", below: false };
		}
		if (n.x < cx && leftFits) {
			return { left: n.x - r - 12 - labelW, top: n.y, align: "right", below: false };
		}
		if (leftFits) {
			return { left: n.x - r - 12 - labelW, top: n.y, align: "right", below: false };
		}
		if (rightFits) {
			return { left: n.x + r + 12, top: n.y, align: "left", below: false };
		}
		return {
			left: Math.max(4, Math.min(n.x - labelW / 2, W - labelW - 4)),
			top: n.y + r + 8,
			align: "center",
			below: true
		};
	}

	onMount(async () => {
		if (!getToken()) {
			goto("/akun");
			return;
		}
		try {
			pack = await api<StudyPack>(`/api/study/${productId}`);
			// Bab yang sudah selesai (dari tracker) — sama seperti Ruang belajar.
			try {
				const t = await api<{ doneChapters: { chapter_id: string }[] }>("/api/tracker");
				doneSet = new Set((t.doneChapters ?? []).map((d) => d.chapter_id));
			} catch {
				/* tracker opsional */
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Gagal memuat Peta belajar.";
		} finally {
			loading = false;
		}
	});

	function bukaNode(n: MapNode) {
		if (n.state === "locked") {
			lockedChapter = n.ch;
			return;
		}
		goto(`/belajar/${productId}/${n.ch.id}`);
	}
</script>

<button type="button" class="btn btn-ghost" onclick={() => goto(`/belajar/${productId}`)}>
	<Icon name="chevron-left" size={18} /> Kembali ke ruang belajar
</button>

{#if loading}
	<p class="mt-6 text-center text-sm font-semibold text-[#5f6b62]">Memuat peta...</p>
{:else if error || !pack}
	<p class="err mt-6">{error || "Peta belajar tidak ditemukan."}</p>
{:else}
	<h1 class="mt-3 flex items-center gap-2 text-xl font-semibold leading-snug">
		<Icon name="map" size={18} class="shrink-0" /> Peta <span class="u-pencil">belajar</span>
	</h1>
	<p class="text-sm text-[#5f6b62]">
		{pack.product.title} • {pack.chapters.length} bab
	</p>

	<!-- Ringkasan progres -->
	<div class="card mt-3 p-4">
		<div class="flex items-center justify-between gap-2">
			<p class="text-sm font-semibold">Progresmu</p>
			<p class="tabular-nums text-sm font-semibold text-[#177245]">{doneCount} dari {totalCount} bab selesai</p>
		</div>
		<div class="mt-2 h-2.5 overflow-hidden rounded-full bg-[#e7e2d2]">
			<div class="h-full w-full origin-left bg-[#177245] transition-transform duration-300 ease-signature" style="transform: scaleX({pct / 100})"></div>
		</div>
		{#if totalCount > 0 && doneCount === totalCount}
			<p class="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#065f46]">
				<Icon name="trophy" size={16} /> Semua bab selesai, hebat
			</p>
		{:else if currentNode}
			<p class="mt-2 text-sm text-[#5f6b62]">
				Lanjut ke <b>{currentNode.ch.title}</b>, yuk
			</p>
			<a href="/belajar/{productId}/{currentNode.ch.id}" class="btn btn-sun btn-block mt-3">
				<Icon name="play" size={16} /> Lanjut: Bab {currentNode.i + 1}
			</a>
		{:else if hasLockedLeft}
			<p class="mt-2 text-sm text-[#5f6b62]">
				Bab berikutnya terkunci — beli produk untuk melanjutkan perjalananmu.
			</p>
			<a href="/produk/{productId}" class="btn btn-sun btn-block mt-3">
				<Icon name="lock" size={16} /> Beli untuk membuka
			</a>
		{/if}
	</div>

	<!-- Pemberitahuan node terkunci (perilaku sama seperti di Ruang belajar) -->
	{#if lockedChapter}
		<div class="err mt-3">
			<div class="flex items-start justify-between gap-2">
				<p class="flex items-center gap-1.5 font-semibold">
					<Icon name="lock" size={16} /> Bab ini terkunci
				</p>
				<button
					type="button"
					class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#b91c1c] hover:bg-[#fee2e2]"
					aria-label="Tutup pemberitahuan"
					onclick={() => (lockedChapter = null)}
				>
					<Icon name="x" size={16} />
				</button>
			</div>
			<p class="mt-1 text-sm">
				<b>{lockedChapter.title}</b> hanya terbuka untuk pemilik produk. Beli produk untuk
				membuka semua bab.
			</p>
			<a href="/produk/{productId}" class="btn btn-sun mt-2 w-full text-xs">
				<Icon name="lock" size={16} /> Beli untuk membuka
			</a>
		</div>
	{/if}

	{#if pack.chapters.length === 0}
		<p class="mt-6 text-center text-sm text-[#5f6b62]">Bab untuk produk ini akan segera hadir.</p>
	{:else}
		<!-- Peta: jalur + node + label -->
		<div class="relative mt-2" bind:clientWidth={wrapW} style="height: {mapH}px">
			<svg
				class="absolute left-0 top-0"
				width={wrapW || 360}
				height={mapH}
				viewBox="0 0 {wrapW || 360} {mapH}"
				aria-hidden="true"
			>
				<!-- Jejak dasar (putus-putus) -->
				<path
					d={pathD}
					fill="none"
					stroke="#ddd6c2"
					stroke-width="7"
					stroke-linecap="round"
					stroke-dasharray="1 12"
				/>
				<!-- Jejak yang sudah dilewati (emerald) -->
				{#if trailPct > 0}
					<path
						d={pathD}
						fill="none"
						stroke="#177245"
						stroke-width="7"
						stroke-linecap="round"
						pathLength={100}
						stroke-dasharray="{trailPct} 100"
						opacity="0.85"
					/>
				{/if}
			</svg>

			{#each nodes as n (n.ch.id)}
				{@const lp = labelPos(n)}
				<!-- Node -->
				<div
					class="absolute"
					style="left: {n.x}px; top: {n.y}px; width: {nodeR * 2}px; height: {nodeR * 2}px; transform: translate(-50%, -50%);"
				>
					{#if n.state === "locked"}
						<button
							type="button"
							aria-label="Bab {n.i + 1} terkunci: {n.ch.title}"
							class="relative flex h-full w-full items-center justify-center rounded-full border-2 border-[#d8d2bd] bg-[#efead9] text-[#6e675c] shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
							onclick={() => bukaNode(n)}
						>
							<Icon name="lock" size={18} />
						</button>
					{:else}
						<a
							href="/belajar/{productId}/{n.ch.id}"
							aria-label="Bab {n.i + 1}: {n.ch.title}"
							style={n.state === "current"
								? `border-color: ${gtPeta.accent}; background: ${gtPeta.soft}; color: ${gtPeta.text}`
								: undefined}
							class="relative flex h-full w-full items-center justify-center rounded-full border-2 shadow-[0_1px_2px_rgb(0_0_0/0.05)] {n.state ===
							'done'
								? 'border-[#115c39] bg-[#177245] text-white'
								: n.state === 'current'
									? 'ring-2 ring-[#f2b33d]'
									: 'border-[#e7e2d2] bg-[#fffdf7] text-[#5f6b62]'}"
						>
							{#if n.state === "done"}
								<Icon name="check" size={18} class="relative" />
							{:else}
								<span class="tabular-nums relative text-base font-semibold lg:text-lg">{n.i + 1}</span>
							{/if}
						</a>
					{/if}
				</div>
				<!-- Label: ringkas bila di bawah node (status sudah terlihat di node-nya) -->
				<div
					class="absolute rounded-md bg-[#f7f5ef] px-1.5 py-0.5"
					style="left: {lp.left}px; top: {lp.top}px; width: {labelW}px; text-align: {lp.align}; {lp.below
						? ''
						: 'transform: translateY(-50%);'}"
				>
					<p class="text-xs font-medium text-[#5f6b62]">Bab {n.i + 1} • {n.ch.subject}</p>
					<p class="text-sm font-medium leading-snug {lp.below ? 'line-clamp-1' : 'line-clamp-2'}">
						{n.ch.title}
					</p>
					{#if !lp.below}
						<p class="text-xs font-medium">
							{#if n.state === "done"}
								<span class="inline-flex items-center gap-1 text-[#065f46]">
									<Icon name="check" size={16} /> Selesai
								</span>
							{:else if n.state === "locked"}
								<span class="inline-flex items-center gap-1 text-[#5f6b62]">
									<Icon name="lock" size={16} /> Terkunci
								</span>
							{:else if n.state === "current"}
								<span style="color: {gtPeta.text}">Lanjutkan di sini</span>
							{/if}
						</p>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Keterangan -->
		<div class="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-[#5f6b62]">
			<span class="inline-flex items-center gap-1.5">
				<span class="flex h-5 w-5 items-center justify-center rounded-full bg-[#177245] text-white"><Icon name="check" size={16} /></span>
				Selesai
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span
					class="flex h-5 w-5 items-center justify-center rounded-full border-2"
					style="background: {gtPeta.soft}; border-color: {gtPeta.accent}; color: {gtPeta.text}"
				>
					1
				</span>
				Lanjutkan di sini
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="flex h-5 w-5 items-center justify-center rounded-full border border-[#e7e2d2] bg-[#fffdf7]">2</span>
				Belum dikerjakan
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="flex h-5 w-5 items-center justify-center rounded-full bg-[#efead9] text-[#6e675c]"><Icon name="lock" size={16} /></span>
				Terkunci
			</span>
		</div>

		<a href="/belajar/{productId}" class="btn btn-outline btn-block mt-6">
			<Icon name="trophy" size={16} /> Lihat simulasi SAS di ruang belajar
		</a>
	{/if}
{/if}
