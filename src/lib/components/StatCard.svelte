<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import KitStatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import { getLocale } from '$lib/paraglide/runtime';

	/** The kit's stat tile, with money written the viewer's way: ብር in Amharic, ETB in English. */
	let {
		stat,
		onselect = undefined
	}: Omit<ComponentProps<typeof KitStatCard>, 'amharicMoney'> = $props();
</script>

<KitStatCard {stat} {onselect} amharicMoney={getLocale() === 'am'} />
