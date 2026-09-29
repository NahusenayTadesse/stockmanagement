<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import { formatEthiopianDate } from '@nahu/admin-kit/global';
	import { labels, MOVEMENT_LABELS } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));
	const STATUS: Record<string, string> = labels({
		in_stock: m.reports_serial_status_in_stock,
		issued: m.reports_serial_status_issued,
		leased: m.reports_serial_status_leased,
		maintenance: m.reports_serial_status_maintenance,
		disposed: m.reports_serial_status_disposed,
		returned: m.reports_serial_status_returned
	});
	const kindName = (k: string) => MOVEMENT_LABELS[k] ?? k;
</script>

<svelte:head>
	<title>{m.nav_serials()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.nav_serials()}</h1>
		<p class="text-muted-foreground">{m.reports_serials_intro()}</p>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			<form method="GET" class="flex flex-wrap items-end gap-3">
				<div class="flex min-w-64 flex-col gap-1">
					<Label for="q">{m.reports_serial_number()}</Label>
					<Input
						id="q"
						name="q"
						value={data.q}
						placeholder={m.reports_serial_placeholder()}
						autofocus
					/>
				</div>
				<Button type="submit">{m.reports_find()}</Button>
			</form>
		</Card.Content>
	</Card.Root>

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
				<dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
					<div>
						<dt class="text-muted-foreground">{m.reports_where_it_is()}</dt>
						<dd>{u.location ?? (u.status === 'in_stock' ? '—' : m.reports_not_in_business())}</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">{m.reports_supplied_by()}</dt>
						<dd>
							{#if u.supplierId}
								<a
									class="underline"
									href={resolve('/dashboard/suppliers/[id]', { id: String(u.supplierId) })}
									>{u.supplier}</a
								>
							{:else}—{/if}
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">{m.reports_col_lot()}</dt>
						<dd>
							{u.lotNumber ?? '—'}{u.expiryDate
								? ` · ${m.reports_expires({ date: day(u.expiryDate) })}`
								: ''}
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">{m.reports_warranty()}</dt>
						<dd>
							{#if u.warranty.state === 'none'}
								{m.reports_warranty_none()}
							{:else if u.warranty.state === 'not_sold'}
								{m.reports_warranty_not_sold({ months: u.warranty.months })}
							{:else}
								{(u.warranty.state === 'active'
									? m.reports_warranty_active
									: m.reports_warranty_ended)({
									months: u.warranty.months,
									sold: day(u.warranty.soldOn),
									until: day(u.warranty.until)
								})}
							{/if}
						</dd>
					</div>
					{#if u.soldTo || u.saleDocumentId}
						<div>
							<dt class="text-muted-foreground">{m.reports_sold_to()}</dt>
							<dd>
								{u.soldTo ?? m.reports_walk_in_customer()}
								{#if u.saleDocumentId}
									·
									<a
										class="underline"
										href={resolve('/dashboard/stock/documents/[id]', {
											id: String(u.saleDocumentId)
										})}>{u.saleNumber ?? `#${u.saleDocumentId}`}</a
									>
								{/if}
							</dd>
						</div>
					{/if}
				</dl>

				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="text-left text-muted-foreground">
							<tr>
								<th class="py-1 pr-4 font-medium">{m.common_date()}</th>
								<th class="py-1 pr-4 font-medium">{m.reports_what_happened()}</th>
								<th class="py-1 pr-4 font-medium">{m.reports_where()}</th>
								<th class="py-1 pr-4 font-medium">{m.reports_from_to()}</th>
								<th class="py-1 font-medium">{m.reports_col_document()}</th>
							</tr>
						</thead>
						<tbody>
							{#each u.events as e (e.id)}
								<tr class="border-t">
									<td class="py-1 pr-4 whitespace-nowrap">{day(e.day)}</td>
									<td class="py-1 pr-4">{kindName(e.kind)}</td>
									<td class="py-1 pr-4">{e.location}</td>
									<td class="py-1 pr-4">{e.who ?? ''}</td>
									<td class="py-1">
										<a
											class="underline"
											href={resolve('/dashboard/stock/documents/[id]', {
												id: String(e.documentId)
											})}>{e.documentNumber ?? `#${e.documentId}`}</a
										>
									</td>
								</tr>
							{:else}
								<tr
									><td colspan="5" class="py-1 text-muted-foreground">{m.reports_no_movements()}</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
