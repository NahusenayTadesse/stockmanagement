import type { ColumnDef } from '@tanstack/table-core';
import { SUBSCRIPTION_STATUS_BADGE, SUBSCRIPTION_STATUS_LABELS } from '$lib/billing';
import {
	column,
	dateCell,
	dateTimeCell,
	linkColumn,
	moneyColumn,
	RIGHT,
	sortable,
	stackedCell,
	statusCell
} from '$lib/table';
import { m } from '$lib/paraglide/messages.js';
import type { BusinessRow as Row } from '$lib/server/billing/admin';

/** A subscription's state as a badge; a dash for a business that has none yet. */
export const subscriptionCell = (status: Row['status']) =>
	status ? statusCell(SUBSCRIPTION_STATUS_BADGE[status], SUBSCRIPTION_STATUS_LABELS[status]) : '—';

/** Businesses as the site admin lists them. `brief` keeps to what the overview's table needs. */
export const businessColumns = ({ brief = false } = {}): ColumnDef<Row>[] => [
	linkColumn<Row>('name', m.platform_col_business, 'business', (row) => ({
		id: row.id,
		name: row.name
	})),
	column<Row>('owner', m.platform_col_owner, ({ row }) =>
		stackedCell(row.original.owner, row.original.ownerEmail)
	),
	column<Row>('packageName', m.billing_package, (info) => info.getValue() ?? '—'),
	{
		accessorKey: 'status',
		header: sortable<Row>(m.common_status),
		cell: ({ row }) => subscriptionCell(row.original.status)
	},
	{ accessorKey: 'paidUntil', header: sortable<Row>(m.platform_col_paid_until), cell: dateCell },
	...(brief
		? []
		: [
				column<Row>(
					'users',
					m.platform_col_users,
					({ row }) =>
						row.original.maxUsers === null
							? String(row.original.users)
							: `${row.original.users} / ${row.original.maxUsers}`,
					RIGHT
				),
				moneyColumn<Row>('totalPaid', m.platform_col_total_paid),
				column<Row>('lastPaidAt', m.billing_last_payment, dateTimeCell),
				column<Row>('phone', m.common_phone, (info) => info.getValue() ?? ''),
				column<Row>('createdAt', m.platform_col_registered, dateTimeCell)
			])
];
