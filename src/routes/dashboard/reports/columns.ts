import type { ColumnDef } from '@tanstack/table-core';
import { MOVEMENT_LABELS } from '$lib/format';
import { longText, NAME_LENGTH } from '$lib/table';
import { m } from '$lib/paraglide/messages.js';
import type { PageData } from './$types';
import {
	column,
	date,
	documentColumn,
	itemColumn,
	link,
	money,
	percent,
	quantity,
	skuColumn
} from './columnKit';

type Valuation = PageData['stock']['items'][number];
export const valuationColumns: ColumnDef<Valuation>[] = [
	itemColumn(),
	skuColumn(),
	column('category', m.reports_col_category),
	quantity('onHand', m.reports_col_on_hand),
	money('avgCost', m.reports_col_average_cost),
	money('value', m.reports_col_value)
];

type Issued = PageData['issued'][number];
export const issuedColumns: ColumnDef<Issued>[] = [
	itemColumn(),
	skuColumn(),
	quantity('quantity', m.reports_col_issued),
	column('documents', m.reports_col_documents),
	money('value', m.reports_col_value_at_cost)
];

type Kind = PageData['movements']['byKind'][number];
export const kindColumns: ColumnDef<Kind>[] = [
	column('kind', m.reports_col_movement, (i) => MOVEMENT_LABELS[i.getValue() as string]),
	column('lines', m.reports_col_lines),
	money('value', m.reports_col_value_at_cost)
];

type Customer = NonNullable<PageData['byCustomer']>[number];
export const customerColumns: ColumnDef<Customer>[] = [
	link('customer', m.reports_col_customer, 'customer', (r) => ({
		id: r.customerId,
		name: r.customer
	})),
	column('documents', m.reports_col_issues),
	money('value', m.reports_col_value_at_cost)
];

type Supplier = PageData['suppliers'][number];
export const supplierColumns: ColumnDef<Supplier>[] = [
	link('supplier', m.reports_col_supplier, 'supplier', (r) => ({
		id: r.supplierId,
		name: r.supplier
	})),
	column('deliveries', m.reports_col_deliveries),
	money('delivered', m.reports_col_delivered_cost),
	column('orders', m.reports_col_orders),
	money('orderedValue', m.reports_col_ordered_value),
	percent('fillRate', m.reports_col_fill_rate)
];

type Waste = PageData['waste']['rows'][number];
export const wasteColumns: ColumnDef<Waste>[] = [
	date('docDate', m.common_date),
	documentColumn('number', (r) => ({ id: r.documentId, number: r.number })),
	column('reasonName', m.reports_col_reason),
	column('item', m.common_item),
	column('lotNumber', m.reports_col_lot, (i) => i.getValue() ?? '—'),
	column('location', m.common_location),
	quantity('quantity', m.common_quantity),
	money('value', m.reports_col_value_at_cost)
];

type Split = { label: string; in: number; out: number; net: number };
/** Money in, out and net, by `first` (purpose, method). */
export const splitColumns = (first: () => string): ColumnDef<Split>[] => [
	column('label', first),
	money('in', m.reports_in),
	money('out', m.reports_out),
	money('net', m.reports_net)
];

type Register = NonNullable<PageData['vat']>['sales'][number];
export const registerColumns: ColumnDef<Register>[] = [
	date('docDate', m.common_date),
	documentColumn('number', (r) => ({ id: r.id, number: r.number })),
	column('kind', m.reports_col_kind),
	column('party', m.reports_col_party, longText(NAME_LENGTH)),
	column('tin', m.reports_col_tin, (i) => i.getValue() ?? '—'),
	money('net', m.reports_col_before_vat),
	money('vat', m.reports_col_vat),
	money('tot', m.reports_col_tot),
	money('gross', m.common_total)
];

type Withholding = NonNullable<PageData['withholding']>['byUs'][number];
export const withholdingColumns: ColumnDef<Withholding>[] = [
	date('occurredOn', m.common_date),
	link('id', m.reports_col_transaction, 'transaction', (r) => ({ id: r.id, name: `#${r.id}` })),
	column('party', m.reports_col_paid_to_by, longText(NAME_LENGTH)),
	column('tin', m.reports_col_tin, (i) => i.getValue() ?? m.reports_no_tin()),
	money('amount', m.reports_col_cash),
	money('withheld', m.reports_col_withheld),
	column('receipt', m.reports_col_receipt_no, (i) => i.getValue() ?? m.reports_receipt_missing())
];
