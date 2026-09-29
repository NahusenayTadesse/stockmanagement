<script lang="ts">
	import { resolve } from '$app/paths';
	import Pencil from '@lucide/svelte/icons/pencil';
	import StatCard from '$lib/components/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import SingleTable from '@nahu/admin-kit/components/SingleTable.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	import SupplierFields from '$lib/components/SupplierFields.svelte';
	import { supplierEdit } from '$lib/schemas/suppliers';
	import { DOCUMENT_STATUS_LABELS, qty, signedAmount } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';

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
	/** Contact details. The phone can be copied; the email opens a message to the supplier. */
	const details = $derived([
		s.phone
			? { name: m.common_phone(), value: s.phone, kind: 'phone' as const }
			: { name: m.common_phone(), value: m.purchasing_phone_missing_add() },
		{ name: m.common_email(), value: s.email ?? '—', href: s.email ? `mailto:${s.email}` : null },
		{ name: m.common_address(), value: s.address ?? '—', long: 60 },
		{ name: m.purchasing_f_tin(), value: s.tin ?? '—' },
		{ name: m.purchasing_f_contact_person(), value: s.contactPerson ?? '—', long: 40 },
		{
			name: m.purchasing_f_lead_time(),
			value:
				s.leadTimeDays === null
					? '—'
					: s.leadTimeDays === 1
						? m.purchasing_n_day_one()
						: m.purchasing_n_days({ n: s.leadTimeDays })
		},
		{ name: m.common_note(), value: s.note ?? '—', long: 120 }
	]);

	const tiles = $derived<Stat[]>([
		{
			key: 'received',
			label: m.purchasing_col_received_value(),
			value: data.totals.received,
			format: 'money',
			group: 's',
			hint: m.purchasing_n_posted_deliveries({
				n: data.deliveries.filter((d) => d.status === 'posted').length
			})
		},
		{
			key: 'paid',
			label: m.purchasing_col_paid(),
			value: data.totals.paid,
			format: 'money',
			group: 's',
			tone: 'negative'
		},
		{
			key: 'owed',
			label: data.totals.owed >= 0 ? m.purchasing_sup_owed_tile() : m.purchasing_paid_in_advance(),
			value: Math.abs(data.totals.owed),
			format: 'money',
			group: 's',
			tone: data.totals.owed > 0 ? 'warning' : 'positive'
		}
	]);
</script>

<div class="flex flex-col gap-6">
	<PageHeader eyebrow={m.purchasing_supplier()} title={s.name}>
		{#snippet badges()}
			{#if !s.isActive}<Badge variant="secondary">{m.purchasing_inactive_badge()}</Badge>{/if}
		{/snippet}
		{#snippet actions()}
			{#if data.canManage}
				<DialogComp
					bind:open
					title={m.purchasing_edit_supplier()}
					variant="outline"
					IconComp={Pencil}
				>
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
							label={m.common_status()}
							items={[
								{ value: true, name: m.common_active() },
								{ value: false, name: m.purchasing_status_inactive_hint() }
							]}
						/>
						<Button type="submit" form="edit-supplier">
							{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}{m.common_save()}{/if}
						</Button>
					</form>
				</DialogComp>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-4 sm:grid-cols-3">
		{#each tiles as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.purchasing_contact()}</Card.Title>
			</Card.Header>
			<Card.Content>
				<SingleTable singleTable={details} />
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.common_items()}</Card.Title>
				<Card.Description>{m.purchasing_items_main_supplier()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="divide-y">
					{#each data.items as it (it.id)}
						<li class="flex justify-between gap-2 py-2">
							<a
								class="hover:underline"
								href={resolve('/dashboard/items/[id]', { id: String(it.id) })}>{it.name}</a
							>
							<span class="text-sm text-muted-foreground"
								>{m.purchasing_n_on_hand({ quantity: qty(it.onHand, it.unit) })}</span
							>
						</li>
					{:else}
						<li class="py-2 text-muted-foreground">{m.common_none()}</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.purchasing_deliveries()}</Card.Title>
				<Card.Description>{m.purchasing_deliveries_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="divide-y">
					{#each data.deliveries as d (d.id)}
						<li class="flex flex-wrap justify-between gap-2 py-2">
							<a
								class="hover:underline"
								href={resolve('/dashboard/stock/documents/[id]', { id: String(d.id) })}
							>
								{d.number ?? m.purchasing_draft_number({ id: d.id })}
							</a>
							{#if d.type === 'purchase_return'}<Badge variant="outline"
									>{m.purchasing_returned_to_them()}</Badge
								>{/if}
							<span class="text-sm text-muted-foreground">
								{ethiopianDate(d.docDate)} · {formatETB(d.value)}
								{#if d.status === 'draft'}<Badge variant="secondary"
										>{DOCUMENT_STATUS_LABELS.draft}</Badge
									>{/if}
								{#if !d.paymentId && d.status === 'posted'}<Badge variant="outline"
										>{m.purchasing_unpaid()}</Badge
									>{/if}
							</span>
						</li>
					{:else}
						<li class="py-2 text-muted-foreground">{m.purchasing_no_deliveries()}</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.purchasing_payments()}</Card.Title>
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
								{signedAmount(p.direction, p.amount)}
							</a>
							<span class="text-sm text-muted-foreground">
								{ethiopianDate(p.occurredOn)}{p.method ? ` · ${p.method}` : ''}{p.reference
									? ` · ${p.reference}`
									: ''}
							</span>
						</li>
					{:else}
						<li class="py-2 text-muted-foreground">{m.purchasing_no_payments()}</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	</div>
</div>
