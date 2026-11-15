<script lang="ts">
	// PageFade.svelte — pembungkus transisi halaman yang halus: fade +
	// sedikit slide vertikal (~180ms, ease-out) saat halaman berganti.
	// Dipasang koordinator di +layout.svelte membungkus {@render children()}
	// dengan prop key = $page.url.pathname, misal:
	//   <PageFade key={$page.url.pathname}>{@render children()}</PageFade>
	// Bila prefers-reduced-motion aktif → tanpa transisi sama sekali.
	import { cubicOut } from "svelte/easing";
	import type { Snippet } from "svelte";

	let { key, children }: { key: string; children: Snippet } = $props();

	let reduced = $state(false);

	$effect(() => {
		try {
			reduced =
				typeof window !== "undefined" &&
				window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		} catch {
			reduced = false;
		}
	});

	// Transisi kustom: opacity 0 -> 1 + geser vertikal 8px -> 0.
	function fadeSlide(
		node: Element,
		{ duration = 180 }: { duration?: number } = {}
	): { duration: number; easing: (t: number) => number; css: (t: number) => string } {
		return {
			duration: reduced ? 0 : duration,
			easing: cubicOut,
			css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * 8}px);`
		};
	}
</script>

{#key key}
	{#if reduced}
		<div class="page-fade">
			{@render children()}
		</div>
	{:else}
		<div class="page-fade" transition:fadeSlide={{ duration: 180 }}>
			{@render children()}
		</div>
	{/if}
{/key}

<style>
	.page-fade {
		min-height: inherit;
	}

	@media (prefers-reduced-motion: reduce) {
		.page-fade {
			transition: none !important;
			animation: none !important;
		}
	}
</style>
