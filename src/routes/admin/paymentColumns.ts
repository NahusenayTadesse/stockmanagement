import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import ReceiptLink from '$lib/components/ReceiptLink.svelte';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_BADGE, PAYMENT_STATUS_LABELS } from '$lib/billing';
import { ethiopianDay } from '$lib/format';
import {
	column,
	dateTimeCell,
	linkColumn,
	longText,
	moneyColumn,
	sortable,
	statusCell
} from '$lib/table';
import { m } from '$lib/paraglide/messages.js';
import type { AdminPaymentRow as Row } from '$lib/server/billing/admin';

/** Payments as the site admin lists them. `withBusiness` is off on a business's own page. */
export const paymentColumns = ({ withBusiness = true } = {}): ColumnDef<Row>[] => [
	{
		// When it counted, for a payment that did; when it was started or sent, for one that has not.
		id: 'when',
		accessorFn: (row) => row.paidAt ?? row.createdAt,
		header: sortable<Row>(m.common_date),
		cell: dateTimeCell
	},
	...(withBusiness
		? [
				linkColumn<Row>('business', m.platform_col_business, 'business', (row) => ({
					id: row.orgId,
					name: row.business
				}))
			]
		: []),
	column<Row>('packageName', m.billing_package),
	moneyColumn<Row>('amount', m.sales_amount),
	column<Row>('method', m.sales_method, ({ row }) => PAYMENT_METHOD_LABELS[row.original.method]),
	column<Row>('status', m.common_status, ({ row }) =>
		statusCell(
			PAYMENT_STATUS_BADGE[row.original.status],
			PAYMENT_STATUS_LABELS[row.original.status]
		)
	),
	column<Row>('periodEnd', m.billing_col_covers, ({ row }) =>
		row.original.periodStart && row.original.periodEnd
			? `${ethiopianDay(row.original.periodStart)} – ${ethiopianDay(row.original.periodEnd)}`
			: ''
	),
	column<Row>(
		'txRef',
		m.common_reference,
		({ row }) => row.original.txRef ?? row.original.payerReference ?? ''
	),
	column<Row>('receiptFile', m.billing_col_receipt, ({ row }) =>
		renderComponent(ReceiptLink, { file: row.original.receiptFile, base: '/admin/files' })
	),
	column<Row>('paidBy', m.platform_col_paid_by),
	column<Row>(
		'note',
		m.common_note,
		({ row }) => row.original.reviewNote ?? row.original.note ?? ''
	),
	column<Row>('bank', m.platform_paid_into, longText(24))
];
