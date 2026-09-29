import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { MOVEMENT_LABELS, qty } from '$lib/format';
import type { PageData } from './$types';

const etb = (v: unknown) => formatETB(Number(v));

export const valuationColumns: ColumnDef<PageData['stock']['items'][number]>[] = [
	{
		accessorKey: 'item',
		header: 'Item',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.itemId,
				name: row.original.item,
				entity: 'item'
			})
	},
	{ accessorKey: 'sku', header: 'Code' },
	{ accessorKey: 'category', header: 'Category' },
	{
		accessorKey: 'onHand',
		header: 'On hand',
		cell: ({ row }) => qty(row.original.onHand, row.original.unit)
	},
	{ accessorKey: 'avgCost', header: 'Average cost', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'value', header: 'Value', cell: (i) => etb(i.getValue()) }
];

export const issuedColumns: ColumnDef<PageData['issued'][number]>[] = [
	{
		accessorKey: 'item',
		header: 'Item',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.itemId,
				name: row.original.item,
				entity: 'item'
			})
	},
	{ accessorKey: 'sku', header: 'Code' },
	{
		accessorKey: 'quantity',
		header: 'Issued',
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{ accessorKey: 'documents', header: 'Documents' },
	{ accessorKey: 'value', header: 'Value at cost', cell: (i) => etb(i.getValue()) }
];

export const kindColumns: ColumnDef<PageData['movements']['byKind'][number]>[] = [
	{ accessorKey: 'kind', header: 'Movement', cell: (i) => MOVEMENT_LABELS[i.getValue() as string] },
	{ accessorKey: 'lines', header: 'Lines' },
	{ accessorKey: 'value', header: 'Value at cost', cell: (i) => etb(i.getValue()) }
];

export const customerColumns: ColumnDef<NonNullable<PageData['byCustomer']>[number]>[] = [
	{
		accessorKey: 'customer',
		header: 'Customer',
		cell: ({ row }) =>
			row.original.customerId
				? renderComponent(DataTableLinks, {
						id: row.original.customerId,
						name: row.original.customer,
						entity: 'customer'
					})
				: row.original.customer
	},
	{ accessorKey: 'documents', header: 'Issues' },
	{ accessorKey: 'value', header: 'Value at cost', cell: (i) => etb(i.getValue()) }
];

export const supplierColumns: ColumnDef<PageData['suppliers'][number]>[] = [
	{
		accessorKey: 'supplier',
		header: 'Supplier',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.supplierId,
				name: row.original.supplier,
				entity: 'supplier'
			})
	},
	{ accessorKey: 'deliveries', header: 'Deliveries' },
	{ accessorKey: 'delivered', header: 'Delivered (cost)', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'orders', header: 'Orders placed' },
	{ accessorKey: 'orderedValue', header: 'Ordered value', cell: (i) => etb(i.getValue()) },
	{
		accessorKey: 'fillRate',
		header: 'Arrived so far',
		cell: (i) => (i.getValue() == null ? '—' : `${i.getValue()}%`)
	}
];

export const wasteColumns: ColumnDef<PageData['waste']['rows'][number]>[] = [
	{ accessorKey: 'docDate', header: 'Date', cell: (i) => ethiopianDate(i.getValue()) },
	{
		accessorKey: 'number',
		header: 'Document',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.documentId,
				name: row.original.number ?? `#${row.original.documentId}`,
				entity: 'document'
			})
	},
	{ accessorKey: 'reasonName', header: 'Reason' },
	{ accessorKey: 'item', header: 'Item' },
	{ accessorKey: 'lotNumber', header: 'Lot', cell: (i) => i.getValue() ?? '—' },
	{ accessorKey: 'location', header: 'Location' },
	{
		accessorKey: 'quantity',
		header: 'Quantity',
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{ accessorKey: 'value', header: 'Value at cost', cell: (i) => etb(i.getValue()) }
];

type Split = { label: string; in: number; out: number; net: number };
export const splitColumns = (first: string): ColumnDef<Split>[] => [
	{ accessorKey: 'label', header: first },
	{ accessorKey: 'in', header: 'In', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'out', header: 'Out', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'net', header: 'Net', cell: (i) => etb(i.getValue()) }
];

export const registerColumns: ColumnDef<NonNullable<PageData['vat']>['sales'][number]>[] = [
	{ accessorKey: 'docDate', header: 'Date', cell: (i) => ethiopianDate(i.getValue()) },
	{
		accessorKey: 'number',
		header: 'Document',
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.number ?? `#${row.original.id}`,
				entity: 'document'
			})
	},
	{ accessorKey: 'kind', header: 'Kind' },
	{ accessorKey: 'party', header: 'Customer / supplier' },
	{ accessorKey: 'tin', header: 'TIN', cell: (i) => i.getValue() ?? '—' },
	{ accessorKey: 'net', header: 'Before VAT', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'vat', header: 'VAT', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'tot', header: 'TOT', cell: (i) => etb(i.getValue()) },
	{ accessorKey: 'gross', header: 'Total', cell: (i) => etb(i.getValue()) }
];

export const withholdingColumns: ColumnDef<NonNullable<PageData['withholding']>['byUs'][number]>[] =
	[
		{ accessorKey: 'occurredOn', header: 'Date', cell: (i) => ethiopianDate(i.getValue()) },
		{
			accessorKey: 'id',
			header: 'Transaction',
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: `#${row.original.id}`,
					entity: 'transaction'
				})
		},
		{ accessorKey: 'party', header: 'Paid to / by' },
		{ accessorKey: 'tin', header: 'TIN', cell: (i) => i.getValue() ?? '— none' },
		{ accessorKey: 'amount', header: 'Cash', cell: (i) => etb(i.getValue()) },
		{ accessorKey: 'withheld', header: 'Withheld', cell: (i) => etb(i.getValue()) },
		{ accessorKey: 'receipt', header: 'Receipt no.', cell: (i) => i.getValue() ?? '⚠ missing' }
	];
