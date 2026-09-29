<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';

	/**
	 * Quick periods (today, this month, this fiscal year…) as links, the one on screen filled in.
	 * `href` builds each link, so a page can keep its other filters; by default only the period.
	 */
	let {
		presets,
		from,
		to,
		href = (from: string, to: string) => `?from=${from}&to=${to}`,
		children = undefined
	}: {
		presets: { key: string; label: string; from: string; to: string }[];
		from: string;
		to: string;
		href?: (from: string, to: string) => string;
		/** More buttons after the periods (a reset). */
		children?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap gap-2">
	{#each presets as p (p.key)}
		<Button
			href={href(p.from, p.to)}
			size="sm"
			variant={p.from === from && p.to === to ? 'default' : 'outline'}>{p.label}</Button
		>
	{/each}
	{@render children?.()}
</div>
