<script lang="ts">
	import { resolve } from '$app/paths';
	import Pencil from '@lucide/svelte/icons/pencil';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import SupplierFields from '$lib/components/SupplierFields.svelte';
	import { supplierEdit } from '$lib/schemas/suppliers';
	import { qty } from '$lib/format';
	import { signed } from '../../transactions/columns';

	let { data } = $props();
	let open = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, delayed, allErrors } = createForm(data.form, supplierEdit, {
		resetForm: false,
		onUpdated({ form }) {
			if (form.message?.type === 'success') open = false;
		}
	});

	const s = $derived(data.supplier);
	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));

	/**
	 * Contact details as a plain list rather than the kit's detail table: that table capitalises
	 * every value, which turns an email address into "Sales@Example.Com". Phone and email are links,
	 * so a tap on a phone calls or writes to the supplier.
	 */
	const details = $derived([
		{
			name: 'Phone',
			value: s.phone || '⚠ Missing — add it',
			href: s.phone ? `tel:${s.phone.replace(/[^+0-9]/g, '')}` : null
		},
		{ name: 'Email', value: s.email ?? '—', href: s.email ? `mailto:${s.email}` : null },
		{ name: 'Address', value: s.address ?? '—', href: null },
		{ name: 'TIN', value: s.tin ?? '—', href: null },
		{ name: 'Contact person', value: s.contactPerson ?? '—', href: null },
		{ name: 'Note', value: s.note ?? '—', href: null }
	]);

	const tiles = $derived<Stat[]>([
		{
			key: 'received',
			label: 'Received',
			value: data.totals.received,
			format: 'money',
			group: 's',
			hint: `${data.deliveries.filter((d) => d.status === 'posted').length} posted deliveries`
		},
		{
			key: 'paid',
			label: 'Paid',
			value: data.totals.paid,
			format: 'money',
			group: 's',
			tone: 'negative'
		},
		{
			key: 'owed',
			label: data.totals.owed >= 0 ? 'Still owed' : 'Paid in advance',
			value: Math.abs(data.totals.owed),
			format: 'money',
			group: 's',
			tone: data.totals.owed > 0 ? 'warning' : 'positive'
		}
	]);
</script>

<svelte:head>
	<title>{s.name}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">Supplier</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				{s.name}
				{#if !s.isActive}<Badge variant="secondary">inactive</Badge>{/if}
			</h1>
		</div>
		{#if data.canManage}
			<DialogComp bind:open title="Edit supplier" variant="outline" IconComp={Pencil}>
				<form
					method="POST"
					action="?/edit"
					use:enhance
					id="edit-supplier"
					class="flex flex-col gap-4"
				>
					<Errors allErrors={$allErrors} />
					<SupplierFields {form} {errors} />
					<InputComp
						{form}
						{errors}
						name="status"
						type="select"
						label="Status"
						items={[
							{ value: true, name: 'Active' },
							{ value: false, name: 'Inactive — hidden from the pickers, history kept' }
						]}
					/>
					<Button type="submit" form="edit-supplier">
						{#if $delayed}<LoadingBtn name="Saving" />{:else}Save{/if}
					</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Contact</Card.Title>
			</Card.Header>
			<Card.Content>
				<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
					{#each details as row (row.name)}
						<dt class="font-semibold">{row.name}</dt>
						<dd class="break-words">
							{#if row.href}
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- tel:/mailto:, not a route -->
								<a class="underline underline-offset-2 hover:no-underline" href={row.href}
									>{row.value}</a
								>
							{:else}
								{row.value}
							{/if}
						</dd>
					{/each}
				</dl>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Items</Card.Title>
				<Card.Description>Items with this supplier as their main supplier.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="divide-y">
					{#each data.items as it (it.id)}
						<li class="flex justify-between gap-2 py-2">
							<a
								class="hover:underline"
								href={resolve('/dashboard/items/[id]', { id: String(it.id) })}>{it.name}</a
							>
							<span class="text-sm text-muted-foreground">{qty(it.onHand, it.unit)} on hand</span>
						</li>
					{:else}
						<li class="py-2 text-muted-foreground">None</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Deliveries</Card.Title>
				<Card.Description
					>At the price paid, VAT included; returns to them count against.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<ul class="divide-y">
					{#each data.deliveries as d (d.id)}
						<li class="flex flex-wrap justify-between gap-2 py-2">
							<a
								class="hover:underline"
								href={resolve('/dashboard/stock/documents/[id]', { id: String(d.id) })}
							>
								{d.number ?? `Draft #${d.id}`}
							</a>
							{#if d.type === 'purchase_return'}<Badge variant="outline">returned to them</Badge
								>{/if}
							<span class="text-sm text-muted-foreground">
								{day(d.docDate)} · {formatETB(d.value)}
								{#if d.status === 'draft'}<Badge variant="secondary">draft</Badge>{/if}
								{#if !d.paymentId && d.status === 'posted'}<Badge variant="outline">unpaid</Badge
									>{/if}
							</span>
						</li>
					{:else}
						<li class="py-2 text-muted-foreground">No deliveries yet.</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Payments</Card.Title>
			</Card.Header>
			<Card.Content>
				<ul class="divide-y">
					{#each data.payments as p (p.id)}
						<li class="flex flex-wrap justify-between gap-2 py-2">
							<a
								class="hover:underline {p.status === 'void'
									? 'text-muted-foreground line-through'
									: ''}"
								href={resolve('/dashboard/transactions/[id]', { id: String(p.id) })}
							>
								{signed(p.direction, p.amount)}
							</a>
							<span class="text-sm text-muted-foreground">
								{day(p.occurredOn)}{p.method ? ` · ${p.method}` : ''}{p.reference
									? ` · ${p.reference}`
									: ''}
							</span>
						</li>
					{:else}
						<li class="py-2 text-muted-foreground">No payments recorded.</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	</div>
</div>
