import type { ColumnDef } from '@tanstack/table-core';
import { renderComponent } from '@nahu/admin-kit/components/ui/data-table/index.js';
import ReceiptLink from '$lib/components/ReceiptLink.svelte';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_BADGE, PAYMENT_STATUS_LABELS } from '$lib/billing';
import { ethiopianDay } from '$lib/format';
import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
import { column, longText, moneyColumn, statusCell } from '$lib/table';
import { m } from '$lib/paraglide/messages.js';
import type { PaymentRow } from '$lib/server/billing/payments';

/** "Meskerem 1 – Tahsas 30": the days a payment covered, once it counted. */
export const periodCell = (start: string | null, end: string | null) =>
	start && end ? `${ethiopianDay(start)} – ${ethiopianDay(end)}` : '';

export const columns: ColumnDef<PaymentRow>[] = [
	// When it counted, for a payment that did; when it was started or sent, for one that has not.
	column<PaymentRow>('createdAt', m.common_date, ({ row }) =>
		ethiopianDateTime(row.original.paidAt ?? row.original.createdAt)
	),
	column<PaymentRow>('packageName', m.billing_package),
	moneyColumn<PaymentRow>('amount', m.sales_amount),
	column<PaymentRow>(
		'method',
		m.sales_method,
		({ row }) => PAYMENT_METHOD_LABELS[row.original.method]
	),
	column<PaymentRow>('status', m.common_status, ({ row }) =>
		statusCell(
			PAYMENT_STATUS_BADGE[row.original.status],
			PAYMENT_STATUS_LABELS[row.original.status]
		)
	),
	column<PaymentRow>('periodEnd', m.billing_col_covers, ({ row }) =>
		periodCell(row.original.periodStart, row.original.periodEnd)
	),
	column<PaymentRow>('receiptFile', m.billing_col_receipt, ({ row }) =>
		renderComponent(ReceiptLink, { file: row.original.receiptFile })
	),
	column<PaymentRow>('reviewNote', m.common_note, longText(40))
];
