<script lang="ts">
	import Icon from "$lib/Icon.svelte";
	import SyaratContent from "$lib/info/SyaratContent.svelte";
</script>

<div class="lg:mx-auto lg:max-w-3xl">
	<h1 class="flex items-center gap-2 text-xl font-extrabold"><Icon name="scroll" size={22} /> Syarat &amp; Ketentuan</h1>
	<p class="mt-1 text-sm text-[#5f6b62]">Terakhir diperbarui: November 2026.</p>

	<SyaratContent />
</div>
