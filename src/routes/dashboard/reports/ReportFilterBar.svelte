<script lang="ts">
	import type { Snippet } from 'svelte';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import FilterSelect from '$lib/components/filters/FilterSelect.svelte';
	import DateRangeFields from '$lib/components/filters/DateRangeFields.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * The filters of a report, sent as a GET form so every view has its own link: the period (when
	 * the report has one), the branch (when there is more than one) and the location (when the
	 * report is by location), and whatever else the report asks (`children`).
	 */
	let {
		branches,
		branchId,
		locations = undefined,
		locationId = 0,
		from = null,
		to = null,
		allLocationsLabel = undefined,
		children = undefined,
		after = undefined
	}: {
		branches: { value: number; name: string }[];
		branchId: number;
		/** Leave out for a report that is not by location. */
		locations?: { value: number; name: string }[];
		locationId?: number;
		from?: string | null;
		to?: string | null;
		allLocationsLabel?: string;
		children?: Snippet;
		/** Under the fields: period presets. */
		after?: Snippet;
	} = $props();
</script>

<FilterBar submitLabel={m.reports_show()} {after}>
	{#if from !== null && to !== null}
		<DateRangeFields {from} {to} fromLabel={m.reports_from()} toLabel={m.reports_to()} />
	{/if}
	{#if branches.length > 1}
		<FilterSelect
			name="branch"
			label={m.common_branch()}
			value={branchId}
			options={branches}
			anyLabel={m.reports_all_branches()}
			anyValue={0}
		/>
	{/if}
	{#if locations}
		<FilterSelect
			name="location"
			label={m.common_location()}
			value={locationId}
			options={locations}
			anyLabel={allLocationsLabel ?? m.reports_all_locations()}
			anyValue={0}
		/>
	{/if}
	{@render children?.()}
</FilterBar>
