<script lang="ts">
	import type { Snippet } from "svelte";
	import Icon from "$lib/Icon.svelte";

	let { title, description, icon, children }: { title: string; description: string; icon: string; children: Snippet } = $props();
	const sections = [
		{ href: "/faq", label: "FAQ" },
		{ href: "/blog", label: "Blog" },
		{ href: "/update", label: "Update" },
		{ href: "/privasi", label: "Kebijakan privasi" },
		{ href: "/syarat", label: "Syarat & ketentuan" }
	];
</script>

<header class="page-heading page-heading-reading">
	<h1><Icon name={icon} size={24} /> {title}</h1>
	<p>{description}</p>
</header>
<div class="info-layout">
	<div class="info-copy">
		{@render children()}
	</div>
	<nav class="info-nav" aria-label="Informasi dan bantuan">
		<h2>Informasi Ringkas</h2>
		{#each sections as section (section.href)}
			<a href={section.href} aria-current={title === section.label ? "page" : undefined}>
				{section.label} <Icon name="arrow-right" size={17} />
			</a>
		{/each}
	</nav>
</div>
