<script lang="ts">
	import { ethiopianDay } from '$lib/format';
	import { m } from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import Printer from '@lucide/svelte/icons/printer';
	import X from '@lucide/svelte/icons/x';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB } from '@nahu/admin-kit/global';
	import { countFound } from '$lib/schemas/counts';
	import ApprovalBanner from '$lib/components/ApprovalBanner.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import ConfirmAction from '@nahu/admin-kit/components/ConfirmAction.svelte';
	import StatCard from '$lib/components/StatCard.svelte';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import CountSheet from './CountSheet.svelte';

	let { data } = $props();

	const count = $derived(data.count);
	const isOpen = $derived(count.status === 'open');
	const editable = $derived(isOpen && data.canCount);

	let search = $state('');
	let foundOpen = $state(false);

	// svelte-ignore state_referenced_locally
	const found = createForm(data.foundForm, countFound, {
		resetForm: true,
		onUpdated({ form }) {
			if (form.message?.type === 'success') foundOpen = false;
		}
	});
	const foundData = found.form;
	const foundErrors = found.errors;
	const foundAll = found.allErrors;

	const shown = $derived(
		search.trim()
			? data.lines.filter((l) =>
					`${l.item} ${l.sku} ${l.lotNumber ?? ''}`
						.toLowerCase()
						.includes(search.trim().toLowerCase())
				)
			: data.lines
	);
	const countedLines = $derived(data.lines.filter((l) => l.counted !== null).length);
	const differences = $derived(data.lines.filter((l) => l.variance !== null && l.variance !== 0));
	const net = $derived(differences.reduce((s, l) => s + (l.varianceValue ?? 0), 0));
	const stats = $derived<Stat[]>([
		{
			key: 'counted',
			label: m.stock_counted(),
			value: countedLines,
			hint: m.stock_counted_of({ total: data.lines.length }),
			format: 'count',
			group: 'count'
		},
		...(data.showExpected
			? ([
					{
						key: 'differences',
						label: m.stock_differences(),
						value: differences.length,
						format: 'count',
						group: 'count'
					},
					{
						key: 'net',
						label: m.stock_net_value_differences(),
						value: net,
						format: 'money',
						group: 'count',
						tone: net < 0 ? 'negative' : 'neutral'
					}
				] satisfies Stat[])
			: [])
	]);
	const day = ethiopianDay;
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		eyebrow={m.stock_count_label()}
		title={m.stock_count_number({ id: count.id })}
		description="{data.names.location}{data.names.category
			? ` · ${data.names.category}`
			: ''} · {day(count.countDate)} · {m.stock_opened_by_who({
			who: data.names.openedBy ?? '—'
		})}"
	>
		{#snippet badges()}
			<Badge
				variant={count.status === 'posted'
					? 'default'
					: count.status === 'cancelled'
						? 'destructive'
						: 'secondary'}
			>
				{count.status === 'open'
					? m.stock_count_status_open()
					: count.status === 'posted'
						? m.stock_count_status_posted()
						: m.stock_count_status_cancelled()}
			</Badge>
			{#if count.blind}<Badge variant="outline">{m.stock_blind()}</Badge>{/if}
		{/snippet}
		{#snippet actions()}
			<Button
				href={resolve('/dashboard/stock/counts/[id]/print', { id: String(count.id) })}
				target="_blank"
				variant="outline"><Printer /> {m.stock_count_sheet()}</Button
			>
			{#if isOpen && data.canPost}
				<form method="POST" action="?/cancel" use:enhance>
					<Button type="submit" variant="outline"><X /> {m.stock_cancel_count()}</Button>
				</form>
				<ConfirmAction
					action="?/post"
					label={m.stock_post_count()}
					confirmLabel={m.stock_post()}
					cancelLabel={m.stock_not_yet()}
					icon={Check}
					title={m.stock_post_count_title()}
					description="{differences.length
						? differences.length === 1
							? m.stock_post_count_one({ net: formatETB(net) })
							: m.stock_post_count_many({ count: differences.length, net: formatETB(net) })
						: m.stock_post_count_none()} {m.stock_save_counts_first()}"
				/>
			{/if}
			{#if count.adjustmentId}
				<Button
					href={resolve('/dashboard/stock/documents/[id]', { id: String(count.adjustmentId) })}
					variant="outline"
				>
					{m.stock_adjustment_number({ number: data.names.adjustment ?? '' })}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<ApprovalBanner approval={data.approval} />

	{#if data.moved > 0 && isOpen}
		<Notice tone="warning">
			{data.moved === 1
				? m.stock_moved_since_one()
				: m.stock_moved_since_many({ count: data.moved })}
		</Notice>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		{#each stats as stat (stat.key)}<StatCard {stat} />{/each}
	</div>

	<div class="flex flex-wrap items-center justify-between gap-2">
		<Input bind:value={search} placeholder={m.stock_find_placeholder()} class="max-w-sm" />
		{#if editable}
			<DialogComp
				bind:open={foundOpen}
				title={m.stock_found_not_listed()}
				variant="outline"
				IconComp={PackagePlus}
			>
				<form
					method="POST"
					action="?/addFound"
					use:found.enhance
					id="add-found"
					class="flex flex-col gap-4"
				>
					<Errors allErrors={$foundAll} />
					<InputComp
						form={foundData}
						errors={foundErrors}
						name="itemId"
						type="combo"
						label={m.common_item()}
						items={data.items}
						required
					/>
					<InputComp
						form={foundData}
						errors={foundErrors}
						name="lotId"
						type="combo"
						label={m.stock_lot_for_tracked()}
						items={data.lots}
					/>
					<InputComp
						form={foundData}
						errors={foundErrors}
						name="counted"
						type="number"
						label={m.stock_qty_found_base()}
						step="any"
						required
					/>
					<Button type="submit" form="add-found">{m.stock_add_to_count()}</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<CountSheet lines={shown} {editable} showExpected={data.showExpected} />
</div>
