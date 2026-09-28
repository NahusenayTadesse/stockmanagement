<script lang="ts">
	import LayoutMenu from '@nahu/admin-kit/components/shell/LayoutMenu.svelte';
	import { page } from '$app/state';
	import { SETTINGS_SECTIONS } from '$lib/navigation';

	let { children } = $props();

	const items = SETTINGS_SECTIONS.flatMap((s) =>
		s.items.map((i) => ({ title: i.title, href: i.url, match: 'prefix' as const }))
	);
</script>

{#if page.url.pathname !== '/dashboard/admin-panel'}
	<LayoutMenu {items} />
{/if}

{@render children()}
