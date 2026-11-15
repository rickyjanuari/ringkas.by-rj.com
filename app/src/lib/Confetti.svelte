<script lang="ts">
	// Confetti.svelte — konfeti ringan berbasis <canvas>, tanpa dependensi.
	// ~75 potongan warna palet Ringkas, jatuh ~2 detik lalu berhenti dan
	// membersihkan diri. Hormati prefers-reduced-motion: bila aktif, tidak
	// ada yang ditampilkan atau dianimasikan.
	// Pemakaian: <Confetti fire={tampilkan} /> atau bind:this lalu burst().
	import { onDestroy, onMount } from "svelte";

	let {
		fire = false,
		disabled = false
	}: {
		/** Ubah false -> true untuk meledakkan konfeti sekali. */
		fire?: boolean;
		/** Bila true, konfeti tidak pernah tampil. */
		disabled?: boolean;
	} = $props();

	const WARNA = ["#177245", "#f2b33d", "#f7f5ef", "#ffffff"];
	const JUMLAH = 75;
	const DURASI_MS = 2000;

	interface Potongan {
		x: number;
		y: number;
		w: number;
		h: number;
		warna: string;
		vy: number;
		vx: number;
		rot: number;
		vr: number;
		fase: number;
		bulat: boolean;
	}

	let canvas: HTMLCanvasElement | null = $state(null);
	let reduced = $state(false);
	let raf = 0;
	let potongan: Potongan[] = [];
	let mulai = 0;
	let sedangJalan = false;
	// Bukan $state: hanya penanda transisi prop fire, tidak perlu reaktif.
	let fireTerakhir = false;

	function kurangiGerakan(): boolean {
		try {
			return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		} catch {
			return false;
		}
	}

	onMount(() => {
		reduced = kurangiGerakan();
	});

	$effect(() => {
		if (fire && !fireTerakhir) burst();
		fireTerakhir = fire;
	});

	/** Ledakkan konfeti sekali. Aman dipanggil berulang; tidak pernah throw. */
	export function burst(): void {
		try {
			if (disabled || kurangiGerakan() || !canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.floor(window.innerWidth * dpr);
			canvas.height = Math.floor(window.innerHeight * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			const lebar = window.innerWidth;
			potongan = Array.from({ length: JUMLAH }, () => ({
				x: Math.random() * lebar,
				y: -20 - Math.random() * 120,
				w: 6 + Math.random() * 6,
				h: 8 + Math.random() * 6,
				warna: WARNA[Math.floor(Math.random() * WARNA.length)],
				vy: 2.2 + Math.random() * 3,
				vx: -1.4 + Math.random() * 2.8,
				rot: Math.random() * Math.PI * 2,
				vr: -0.12 + Math.random() * 0.24,
				fase: Math.random() * Math.PI * 2,
				bulat: Math.random() < 0.25
			}));
			mulai = performance.now();
			if (!sedangJalan) {
				sedangJalan = true;
				raf = requestAnimationFrame(frame);
			}
		} catch {
			/* Konfeti gagal tidak boleh merusak halaman. */
		}
	}

	function frame(now: number): void {
		try {
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const t = now - mulai;
			const tinggi = window.innerHeight;
			ctx.clearRect(0, 0, window.innerWidth, tinggi);
			for (const p of potongan) {
				p.y += p.vy;
				p.x += p.vx + Math.sin((t + p.fase * 1000) / 300) * 0.6;
				p.rot += p.vr;
			}
			for (const p of potongan) {
				if (p.y > tinggi + 30) continue;
				ctx.save();
				ctx.translate(p.x, p.y);
				ctx.rotate(p.rot);
				ctx.fillStyle = p.warna;
				if (p.bulat) {
					ctx.beginPath();
					ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
					ctx.fill();
				} else {
					ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
				}
				ctx.restore();
			}
			if (t < DURASI_MS) {
				raf = requestAnimationFrame(frame);
			} else {
				// Berhenti dan bersihkan diri.
				ctx.clearRect(0, 0, window.innerWidth, tinggi);
				potongan = [];
				sedangJalan = false;
			}
		} catch {
			sedangJalan = false;
		}
	}

	onDestroy(() => {
		cancelAnimationFrame(raf);
		sedangJalan = false;
	});
</script>

{#if !reduced && !disabled}
	<canvas bind:this={canvas} class="confetti-canvas" aria-hidden="true"></canvas>
{/if}

<style>
	.confetti-canvas {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 80;
	}

	@media (prefers-reduced-motion: reduce) {
		.confetti-canvas {
			display: none;
		}
	}
</style>
