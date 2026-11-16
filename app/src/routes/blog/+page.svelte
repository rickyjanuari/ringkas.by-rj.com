<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import BlogContent from "$lib/info/BlogContent.svelte";
</script>

<div class="lg:mx-auto lg:max-w-3xl">
	<h1 class="flex items-center gap-2 text-xl font-semibold"><Icon name="file-text" size={18} /> Blog</h1>
	<p class="mt-1 text-sm text-[#5f6b62]">Cerita dan tips belajar dari Ringkas.</p>

	<BlogContent />
</div>
