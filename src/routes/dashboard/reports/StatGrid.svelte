<script lang="ts">
	import StatCard from '$lib/components/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';

	/** A report's figures, as a row of stat tiles: two, three or four across on wide screens. */
	let { stats, columns = 4 }: { stats: Stat[]; columns?: 1 | 2 | 3 | 4 } = $props();

	const GRID = {
		1: 'grid gap-4',
		2: 'grid gap-4 sm:grid-cols-2',
		3: 'grid gap-4 sm:grid-cols-3',
		4: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
	} as const;
</script>

{#if stats.length}
	<div class={GRID[columns]}>
		{#each stats as stat (stat.key)}<StatCard {stat} />{/each}
	</div>
{/if}
