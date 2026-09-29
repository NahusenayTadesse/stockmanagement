<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import { m } from '$lib/paraglide/messages.js';

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
		allLocationsLabel = undefined,
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
					<Label for="from">{m.reports_from()}</Label>
					<Input id="from" name="from" type="date" value={from} />
				</div>
				<div class="flex flex-col gap-1">
					<Label for="to">{m.reports_to()}</Label>
					<Input id="to" name="to" type="date" value={to} />
				</div>
			{/if}
			{#if branches.length > 1}
				<div class="flex flex-col gap-1">
					<Label for="branch">{m.common_branch()}</Label>
					<select id="branch" name="branch" class={select} value={branchId}>
						<option value={0}>{m.reports_all_branches()}</option>
						{#each branches as b (b.value)}
							<option value={b.value}>{b.name}</option>
						{/each}
					</select>
				</div>
			{/if}
			<div class="flex flex-col gap-1">
				<Label for="location">{m.common_location()}</Label>
				<select id="location" name="location" class={select} value={locationId}>
					<option value={0}>{allLocationsLabel ?? m.reports_all_locations()}</option>
					{#each locations as l (l.value)}
						<option value={l.value}>{l.name}</option>
					{/each}
				</select>
			</div>
			{@render children?.()}
			<Button type="submit">{m.reports_show()}</Button>
		</form>
	</Card.Content>
</Card.Root>
