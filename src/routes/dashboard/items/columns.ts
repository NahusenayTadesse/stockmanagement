import { m } from '$lib/paraglide/messages.js';
import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import type { LookupRow } from '@nahu/admin-kit/components/lookup/types';
import { qty } from '$lib/format';

/** How an item is tracked, in a few words. */
function tracking(row: LookupRow): string {
	if (row.isKit) return m.stock_t_kit();
	if (!row.stockTracked) return m.stock_t_service();
	const parts = [
		row.trackSerials && m.stock_t_serial(),
		row.trackExpiry ? m.stock_t_lot_expiry() : row.trackLots && m.stock_t_lot(),
		row.leasable && m.stock_t_rentable(),
		row.controlledSubstance && m.stock_t_controlled()
	].filter(Boolean);
	return parts.length ? parts.join(' · ') : m.stock_t_quantity();
}

export const extraColumns: ColumnDef<LookupRow>[] = [
	{
		accessorKey: 'tracking',
		get header() {
			return m.stock_tracking();
		},
		cell: ({ row }) => tracking(row.original)
	},
	{
		accessorKey: 'onHand',
		get header() {
			return m.stock_on_hand();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: qty(row.original.onHand as number, row.original.unitSymbol as string),
				entity: 'item'
			})
	}
];
