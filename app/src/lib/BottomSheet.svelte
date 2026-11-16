<script lang="ts">
	import type { Snippet } from "svelte";
	import Icon from "./Icon.svelte";

	let {
		open,
		title,
		onClose,
		children
	}: {
		open: boolean;
		title: string;
		onClose: () => void;
		children?: Snippet;
	} = $props();
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6"
		role="dialog"
		aria-modal="true"
		aria-label={title}
	>
		<button
			type="button"
			class="absolute inset-0 bg-black/50"
			aria-label="Tutup"
			onclick={onClose}
		></button>
		<div
			class="relative max-h-[80dvh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-[#fffdf7] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_8px_24px_rgb(0_0_0/0.06)] lg:max-h-[85dvh] lg:max-w-2xl lg:rounded-2xl lg:pb-5"
		>
			<div class="mb-3 flex items-center justify-between gap-2">
				<h2 class="text-lg font-semibold">{title}</h2>
				<button
					type="button"
					class="btn btn-ghost shrink-0 !px-2 !py-2"
					aria-label="Tutup"
					onclick={onClose}
				>
					<Icon name="x" size={18} />
				</button>
			</div>
			{@render children?.()}
		</div>
	</div>
{/if}
