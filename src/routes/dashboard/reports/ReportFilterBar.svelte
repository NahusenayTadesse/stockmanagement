<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';

	/**
	 * The filters of an analysis report, sent as a GET form so every view has its own link: the
	 * period (when the report has one), the branch and location, and whatever else the report asks.
	 */
	let {
		branches,
		locations,
		branchId,
		locationId,
		from = null,
		to = null,
		allLocationsLabel = 'All locations',
		children
	}: {
		branches: { value: number; name: string }[];
		locations: { value: number; name: string }[];
		branchId: number;
		locationId: number;
		from?: string | null;
		to?: string | null;
		allLocationsLabel?: string;
		children?: Snippet;
	} = $props();

	const select = 'h-9 rounded-md border bg-background px-2 text-sm';
</script>

<Card.Root>
	<Card.Content class="pt-6">
		<form method="GET" class="flex flex-wrap items-end gap-3">
			{#if from !== null && to !== null}
				<div class="flex flex-col gap-1">
					<Label for="from">From</Label>
					<Input id="from" name="from" type="date" value={from} />
				</div>
				<div class="flex flex-col gap-1">
					<Label for="to">To</Label>
					<Input id="to" name="to" type="date" value={to} />
				</div>
			{/if}
			{#if branches.length > 1}
				<div class="flex flex-col gap-1">
					<Label for="branch">Branch</Label>
					<select id="branch" name="branch" class={select} value={branchId}>
						<option value={0}>All branches</option>
						{#each branches as b (b.value)}
							<option value={b.value}>{b.name}</option>
						{/each}
					</select>
				</div>
			{/if}
			<div class="flex flex-col gap-1">
				<Label for="location">Location</Label>
				<select id="location" name="location" class={select} value={locationId}>
					<option value={0}>{allLocationsLabel}</option>
					{#each locations as l (l.value)}
						<option value={l.value}>{l.name}</option>
					{/each}
				</select>
			</div>
			{@render children?.()}
			<Button type="submit">Show</Button>
		</form>
	</Card.Content>
</Card.Root>
