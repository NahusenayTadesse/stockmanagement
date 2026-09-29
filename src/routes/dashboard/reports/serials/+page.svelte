<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import FilterBar from '$lib/components/filters/FilterBar.svelte';
	import FilterField from '$lib/components/filters/FilterField.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { ethiopianDay as day, labels } from '$lib/format';
	import { eventColumns } from './columns';

	let { data } = $props();

	const STATUS: Record<string, string> = labels({
		in_stock: m.reports_serial_status_in_stock,
		issued: m.reports_serial_status_issued,
		leased: m.reports_serial_status_leased,
		maintenance: m.reports_serial_status_maintenance,
		disposed: m.reports_serial_status_disposed,
		returned: m.reports_serial_status_returned
	});

	type Unit = (typeof data.units)[number];

	function warrantyText({ warranty: w }: Unit) {
		if (w.state === 'none') return m.reports_warranty_none();
		if (w.state === 'not_sold') return m.reports_warranty_not_sold({ months: w.months });
		return (w.state === 'active' ? m.reports_warranty_active : m.reports_warranty_ended)({
			months: w.months,
			sold: day(w.soldOn),
			until: day(w.until)
		});
	}

	/** Where the unit is, where it came from, its lot and warranty, and who bought it. */
	const details = (u: Unit) => [
		{
			name: m.reports_where_it_is(),
			value: u.location ?? (u.status === 'in_stock' ? '—' : m.reports_not_in_business())
		},
		{
			name: m.reports_supplied_by(),
			value: u.supplier ?? '—',
			href: u.supplierId ? resolve('/dashboard/suppliers/[id]', { id: String(u.supplierId) }) : null
		},
		{
			name: m.reports_col_lot(),
			value:
				(u.lotNumber ?? '—') +
				(u.expiryDate ? ` · ${m.reports_expires({ date: day(u.expiryDate) })}` : '')
		},
		{ name: m.reports_warranty(), value: warrantyText(u) },
		...(u.soldTo || u.saleDocumentId
			? [{ name: m.reports_sold_to(), value: u.soldTo ?? m.reports_walk_in_customer() }]
			: []),
		...(u.saleDocumentId
			? [
					{
						name: m.reports_col_document(),
						value: u.saleNumber ?? `#${u.saleDocumentId}`,
						href: resolve('/dashboard/stock/documents/[id]', { id: String(u.saleDocumentId) })
					}
				]
			: [])
	];
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={m.nav_serials()} description={m.reports_serials_intro()} />

	<FilterBar submitLabel={m.reports_find()}>
		<FilterField label={m.reports_serial_number()} for="q">
			<Input
				id="q"
				name="q"
				value={data.q}
				placeholder={m.reports_serial_placeholder()}
				class="min-w-64"
				autofocus
			/>
		</FilterField>
	</FilterBar>

	{#if data.q && !data.units.length}
		<p class="text-muted-foreground">{m.reports_serial_none({ q: data.q })}</p>
	{/if}
	{#if data.units.length === 25}
		<p class="text-sm text-muted-foreground">{m.reports_serial_first_25()}</p>
	{/if}

	{#each data.units as u (u.id)}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex flex-wrap items-center gap-2">
					<span class="font-mono">{u.serialNumber}</span>
					<Badge variant="secondary">{STATUS[u.status] ?? u.status}</Badge>
					{#if u.warranty.state === 'active'}
						<Badge class="bg-green-600 text-white"
							>{m.reports_warranty_until_badge({ date: day(u.warranty.until) })}</Badge
						>
					{:else if u.warranty.state === 'expired'}
						<Badge class="bg-red-600 text-white"
							>{m.reports_warranty_expired_badge({ date: day(u.warranty.until) })}</Badge
						>
					{/if}
				</Card.Title>
				<Card.Description>
					<a class="underline" href={resolve('/dashboard/items/[id]', { id: String(u.itemId) })}
						>{u.item}</a
					>
					· {u.sku}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<SingleTable singleTable={details(u)} />

				{#if u.events.length}
					<DataTable
						data={u.events}
						columns={eventColumns}
						fileName={u.serialNumber}
						variant="compact"
					/>
				{:else}
					<p class="text-sm text-muted-foreground">{m.reports_no_movements()}</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/each}
</div>
