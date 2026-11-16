<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import PrivasiContent from "$lib/info/PrivasiContent.svelte";
</script>

<div class="lg:mx-auto lg:max-w-3xl">
	<h1 class="flex items-center gap-2 text-xl font-semibold"><Icon name="lock" size={18} /> Kebijakan privasi</h1>
	<p class="mt-1 text-sm text-[#5f6b62]">Terakhir diperbarui: November 2026.</p>

	<PrivasiContent />
</div>
