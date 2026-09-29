import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import type { LookupRow } from '@nahu/admin-kit/components/lookup/types';
import { qty } from '$lib/format';

/** How an item is tracked, in a few words. */
function tracking(row: LookupRow): string {
	if (row.isKit) return 'Kit / recipe';
	if (!row.stockTracked) return 'Service';
	const parts = [
		row.trackSerials && 'Serial',
		row.trackExpiry ? 'Lot + expiry' : row.trackLots && 'Lot',
		row.leasable && 'Rentable',
		row.controlledSubstance && 'Controlled'
	].filter(Boolean);
	return parts.length ? parts.join(' · ') : 'Quantity';
}

export const extraColumns: ColumnDef<LookupRow>[] = [
	{ accessorKey: 'tracking', header: 'Tracking', cell: ({ row }) => tracking(row.original) },
	{
		accessorKey: 'onHand',
		header: 'On hand',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: qty(row.original.onHand as number, row.original.unitSymbol as string),
				entity: 'item'
			})
	}
];
