<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import UpdateContent from "$lib/info/UpdateContent.svelte";
</script>

<div class="lg:mx-auto lg:max-w-3xl">
	<h1 class="flex items-center gap-2 text-xl font-semibold"><Icon name="sparkles" size={18} /> Update</h1>
	<p class="mt-1 text-sm text-[#5f6b62]">Apa yang baru di Ringkas.</p>

	<UpdateContent />
</div>
