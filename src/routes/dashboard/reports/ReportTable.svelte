<script lang="ts" generics="TData, TValue">
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';

	/**
	 * One table of a report, with its heading: the kit's DataTable in the report's usual shape —
	 * `compact` (as tall as its rows, pages of 10) for the tables that sit under a chart, `list` for
	 * a report's one main table.
	 */
	let {
		title = undefined,
		data,
		columns,
		fileName,
		variant = 'compact',
		search = true,
		facetKeys = [],
		facetLabels = {}
	}: {
		title?: string;
		data: TData[];
		columns: ColumnDef<TData, TValue>[];
		/** For the CSV and PDF export. */
		fileName: string;
		variant?: 'list' | 'compact';
		/** Search, columns and export above the rows. On for every report table but a few short ones. */
		search?: boolean;
		facetKeys?: string[];
		facetLabels?: Record<string, string>;
	} = $props();
</script>

{#snippet table()}
	<DataTable {data} {columns} {fileName} {variant} {search} {facetKeys} {facetLabels} />
{/snippet}

{#if title}
	<PageSection {title}>{@render table()}</PageSection>
{:else}
	{@render table()}
{/if}
