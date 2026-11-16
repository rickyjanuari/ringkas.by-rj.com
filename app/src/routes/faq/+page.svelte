<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import FaqContent from "$lib/info/FaqContent.svelte";
</script>

<div class="lg:mx-auto lg:max-w-3xl">
	<h1 class="flex items-center gap-2 text-xl font-semibold"><Icon name="help-circle" size={18} /> FAQ</h1>
	<p class="mt-1 text-sm text-[#5f6b62]">Pertanyaan yang sering ditanyakan tentang Ringkas.</p>

	<FaqContent />
</div>
