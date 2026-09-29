import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import DataTableLinks from '@nahu/admin-kit/components/Table/data-table-links.svelte';
import { formatETB } from '@nahu/admin-kit/global';
import { ethiopianDate } from '@nahu/admin-kit/tableCells';
import { MOVEMENT_LABELS, qty } from '$lib/format';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import { longText, NAME_LENGTH } from '$lib/cells';

const etb = (v: unknown) => formatETB(Number(v));

export const valuationColumns: ColumnDef<PageData['stock']['items'][number]>[] = [
	{
		accessorKey: 'item',
		get header() {
			return m.common_item();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.itemId,
				name: row.original.item,
				entity: 'item'
			})
	},
	{
		accessorKey: 'sku',
		get header() {
			return m.reports_col_code();
		}
	},
	{
		accessorKey: 'category',
		get header() {
			return m.reports_col_category();
		}
	},
	{
		accessorKey: 'onHand',
		get header() {
			return m.reports_col_on_hand();
		},
		cell: ({ row }) => qty(row.original.onHand, row.original.unit)
	},
	{
		accessorKey: 'avgCost',
		get header() {
			return m.reports_col_average_cost();
		},
		cell: (i) => etb(i.getValue())
	},
	{
		accessorKey: 'value',
		get header() {
			return m.reports_col_value();
		},
		cell: (i) => etb(i.getValue())
	}
];

export const issuedColumns: ColumnDef<PageData['issued'][number]>[] = [
	{
		accessorKey: 'item',
		get header() {
			return m.common_item();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.itemId,
				name: row.original.item,
				entity: 'item'
			})
	},
	{
		accessorKey: 'sku',
		get header() {
			return m.reports_col_code();
		}
	},
	{
		accessorKey: 'quantity',
		get header() {
			return m.reports_col_issued();
		},
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{
		accessorKey: 'documents',
		get header() {
			return m.reports_col_documents();
		}
	},
	{
		accessorKey: 'value',
		get header() {
			return m.reports_col_value_at_cost();
		},
		cell: (i) => etb(i.getValue())
	}
];

export const kindColumns: ColumnDef<PageData['movements']['byKind'][number]>[] = [
	{
		accessorKey: 'kind',
		get header() {
			return m.reports_col_movement();
		},
		cell: (i) => MOVEMENT_LABELS[i.getValue() as string]
	},
	{
		accessorKey: 'lines',
		get header() {
			return m.reports_col_lines();
		}
	},
	{
		accessorKey: 'value',
		get header() {
			return m.reports_col_value_at_cost();
		},
		cell: (i) => etb(i.getValue())
	}
];

export const customerColumns: ColumnDef<NonNullable<PageData['byCustomer']>[number]>[] = [
	{
		accessorKey: 'customer',
		get header() {
			return m.reports_col_customer();
		},
		cell: ({ row }) =>
			row.original.customerId
				? renderComponent(DataTableLinks, {
						id: row.original.customerId,
						name: row.original.customer,
						entity: 'customer'
					})
				: row.original.customer
	},
	{
		accessorKey: 'documents',
		get header() {
			return m.reports_col_issues();
		}
	},
	{
		accessorKey: 'value',
		get header() {
			return m.reports_col_value_at_cost();
		},
		cell: (i) => etb(i.getValue())
	}
];

export const supplierColumns: ColumnDef<PageData['suppliers'][number]>[] = [
	{
		accessorKey: 'supplier',
		get header() {
			return m.reports_col_supplier();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.supplierId,
				name: row.original.supplier,
				entity: 'supplier'
			})
	},
	{
		accessorKey: 'deliveries',
		get header() {
			return m.reports_col_deliveries();
		}
	},
	{
		accessorKey: 'delivered',
		get header() {
			return m.reports_col_delivered_cost();
		},
		cell: (i) => etb(i.getValue())
	},
	{
		accessorKey: 'orders',
		get header() {
			return m.reports_col_orders();
		}
	},
	{
		accessorKey: 'orderedValue',
		get header() {
			return m.reports_col_ordered_value();
		},
		cell: (i) => etb(i.getValue())
	},
	{
		accessorKey: 'fillRate',
		get header() {
			return m.reports_col_fill_rate();
		},
		cell: (i) => (i.getValue() == null ? '—' : `${i.getValue()}%`)
	}
];

export const wasteColumns: ColumnDef<PageData['waste']['rows'][number]>[] = [
	{
		accessorKey: 'docDate',
		get header() {
			return m.common_date();
		},
		cell: (i) => ethiopianDate(i.getValue())
	},
	{
		accessorKey: 'number',
		get header() {
			return m.reports_col_document();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.documentId,
				name: row.original.number ?? `#${row.original.documentId}`,
				entity: 'document'
			})
	},
	{
		accessorKey: 'reasonName',
		get header() {
			return m.reports_col_reason();
		}
	},
	{
		accessorKey: 'item',
		get header() {
			return m.common_item();
		}
	},
	{
		accessorKey: 'lotNumber',
		get header() {
			return m.reports_col_lot();
		},
		cell: (i) => i.getValue() ?? '—'
	},
	{
		accessorKey: 'location',
		get header() {
			return m.common_location();
		}
	},
	{
		accessorKey: 'quantity',
		get header() {
			return m.common_quantity();
		},
		cell: ({ row }) => qty(row.original.quantity, row.original.unit)
	},
	{
		accessorKey: 'value',
		get header() {
			return m.reports_col_value_at_cost();
		},
		cell: (i) => etb(i.getValue())
	}
];

type Split = { label: string; in: number; out: number; net: number };
export const splitColumns = (first: string): ColumnDef<Split>[] => [
	{ accessorKey: 'label', header: first },
	{
		accessorKey: 'in',
		get header() {
			return m.reports_in();
		},
		cell: (i) => etb(i.getValue())
	},
	{
		accessorKey: 'out',
		get header() {
			return m.reports_out();
		},
		cell: (i) => etb(i.getValue())
	},
	{
		accessorKey: 'net',
		get header() {
			return m.reports_net();
		},
		cell: (i) => etb(i.getValue())
	}
];

export const registerColumns: ColumnDef<NonNullable<PageData['vat']>['sales'][number]>[] = [
	{
		accessorKey: 'docDate',
		get header() {
			return m.common_date();
		},
		cell: (i) => ethiopianDate(i.getValue())
	},
	{
		accessorKey: 'number',
		get header() {
			return m.reports_col_document();
		},
		cell: ({ row }) =>
			renderComponent(DataTableLinks, {
				id: row.original.id,
				name: row.original.number ?? `#${row.original.id}`,
				entity: 'document'
			})
	},
	{
		accessorKey: 'kind',
		get header() {
			return m.reports_col_kind();
		}
	},
	{
		accessorKey: 'party',
		get header() {
			return m.reports_col_party();
		},
		cell: longText(NAME_LENGTH)
	},
	{
		accessorKey: 'tin',
		get header() {
			return m.reports_col_tin();
		},
		cell: (i) => i.getValue() ?? '—'
	},
	{
		accessorKey: 'net',
		get header() {
			return m.reports_col_before_vat();
		},
		cell: (i) => etb(i.getValue())
	},
	{
		accessorKey: 'vat',
		get header() {
			return m.reports_col_vat();
		},
		cell: (i) => etb(i.getValue())
	},
	{
		accessorKey: 'tot',
		get header() {
			return m.reports_col_tot();
		},
		cell: (i) => etb(i.getValue())
	},
	{
		accessorKey: 'gross',
		get header() {
			return m.common_total();
		},
		cell: (i) => etb(i.getValue())
	}
];

export const withholdingColumns: ColumnDef<NonNullable<PageData['withholding']>['byUs'][number]>[] =
	[
		{
			accessorKey: 'occurredOn',
			get header() {
				return m.common_date();
			},
			cell: (i) => ethiopianDate(i.getValue())
		},
		{
			accessorKey: 'id',
			get header() {
				return m.reports_col_transaction();
			},
			cell: ({ row }) =>
				renderComponent(DataTableLinks, {
					id: row.original.id,
					name: `#${row.original.id}`,
					entity: 'transaction'
				})
		},
		{
			accessorKey: 'party',
			get header() {
				return m.reports_col_paid_to_by();
			},
			cell: longText(NAME_LENGTH)
		},
		{
			accessorKey: 'tin',
			get header() {
				return m.reports_col_tin();
			},
			cell: (i) => i.getValue() ?? m.reports_no_tin()
		},
		{
			accessorKey: 'amount',
			get header() {
				return m.reports_col_cash();
			},
			cell: (i) => etb(i.getValue())
		},
		{
			accessorKey: 'withheld',
			get header() {
				return m.reports_col_withheld();
			},
			cell: (i) => etb(i.getValue())
		},
		{
			accessorKey: 'receipt',
			get header() {
				return m.reports_col_receipt_no();
			},
			cell: (i) => i.getValue() ?? m.reports_receipt_missing()
		}
	];
