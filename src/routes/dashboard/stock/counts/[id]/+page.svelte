<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import PackagePlus from '@lucide/svelte/icons/package-plus';
	import Printer from '@lucide/svelte/icons/printer';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import * as AlertDialog from '@nahu/admin-kit/components/ui/alert-dialog/index.js';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button, buttonVariants } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { countFound } from '$lib/schemas/counts';
	import { qty } from '$lib/format';

	let { data } = $props();

	const count = $derived(data.count);
	const isOpen = $derived(count.status === 'open');
	const editable = $derived(isOpen && data.canCount);

	let search = $state('');
	let foundOpen = $state(false);
	let saving = $state(false);

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
	const day = (d: string) => formatEthiopianDate(new Date(`${d}T12:00:00+03:00`));
</script>

<svelte:head>
	<title>Count #{count.id}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-1">
			<p class="text-sm text-muted-foreground">Stock count</p>
			<h1 class="flex items-center gap-2 text-2xl font-semibold">
				Count #{count.id}
				<Badge
					variant={count.status === 'posted'
						? 'default'
						: count.status === 'cancelled'
							? 'destructive'
							: 'secondary'}
				>
					{count.status}
				</Badge>
				{#if count.blind}<Badge variant="outline">blind</Badge>{/if}
			</h1>
			<p class="text-muted-foreground">
				{data.names.location}{data.names.category ? ` · ${data.names.category}` : ''} · {day(
					count.countDate
				)}
				· opened by {data.names.openedBy ?? '—'}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button
				href={resolve('/dashboard/stock/counts/[id]/print', { id: String(count.id) })}
				target="_blank"
				variant="outline"><Printer /> Count sheet</Button
			>
			{#if isOpen && data.canPost}
				<form method="POST" action="?/cancel" use:enhance>
					<Button type="submit" variant="outline"><X /> Cancel count</Button>
				</form>
				<AlertDialog.Root>
					<AlertDialog.Trigger class={buttonVariants({ variant: 'default' })}
						><Check /> Post count</AlertDialog.Trigger
					>
					<AlertDialog.Content>
						<AlertDialog.Header>
							<AlertDialog.Title>Post this count?</AlertDialog.Title>
							<AlertDialog.Description>
								{differences.length
									? `${differences.length} difference${differences.length === 1 ? '' : 's'} (net ${formatETB(net)}) will be posted as one stock adjustment.`
									: 'Every line matches; nothing will be adjusted.'}
								Save any counts you typed first.
							</AlertDialog.Description>
						</AlertDialog.Header>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Not yet</AlertDialog.Cancel>
							<form method="POST" action="?/post" use:enhance>
								<AlertDialog.Action type="submit">Post</AlertDialog.Action>
							</form>
						</AlertDialog.Footer>
					</AlertDialog.Content>
				</AlertDialog.Root>
			{/if}
			{#if count.adjustmentId}
				<Button
					href={resolve('/dashboard/stock/documents/[id]', { id: String(count.adjustmentId) })}
					variant="outline"
				>
					Adjustment {data.names.adjustment}
				</Button>
			{/if}
		</div>
	</div>

	{#if data.moved > 0 && isOpen}
		<div
			class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
		>
			<TriangleAlert class="mt-0.5 size-4 shrink-0" />
			<p>
				{data.moved} movement{data.moved === 1 ? '' : 's'} of these items happened at this location after
				the count was opened. Differences are measured against the snapshot, so make sure what moved was
				counted the same way — or cancel and start a fresh count.
			</p>
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-lg border p-4">
			<p class="text-sm text-muted-foreground">Counted</p>
			<p class="text-2xl font-semibold">{countedLines} / {data.lines.length}</p>
		</div>
		{#if data.showExpected}
			<div class="rounded-lg border p-4">
				<p class="text-sm text-muted-foreground">Differences</p>
				<p class="text-2xl font-semibold">{differences.length}</p>
			</div>
			<div class="rounded-lg border p-4">
				<p class="text-sm text-muted-foreground">Net value of differences</p>
				<p class="text-2xl font-semibold {net < 0 ? 'text-destructive' : ''}">{formatETB(net)}</p>
			</div>
		{/if}
	</div>

	<div class="flex flex-wrap items-center justify-between gap-2">
		<Input bind:value={search} placeholder="Find an item, code or lot…" class="max-w-sm" />
		{#if editable}
			<DialogComp
				bind:open={foundOpen}
				title="Found something not on the list"
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
						label="Item"
						items={data.items}
						required
					/>
					<InputComp
						form={foundData}
						errors={foundErrors}
						name="lotId"
						type="combo"
						label="Lot (for lot-tracked items)"
						items={data.lots}
					/>
					<InputComp
						form={foundData}
						errors={foundErrors}
						name="counted"
						type="number"
						label="Quantity found (base units)"
						step="any"
						required
					/>
					<Button type="submit" form="add-found">Add to the count</Button>
				</form>
			</DialogComp>
		{/if}
	</div>

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
			};
		}}
		class="flex flex-col gap-3"
	>
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead class="bg-muted/50 text-left">
					<tr>
						<th class="px-3 py-2">Item</th>
						<th class="px-3 py-2">Lot</th>
						{#if data.showExpected}<th class="px-3 py-2 text-right">Expected</th>{/if}
						<th class="px-3 py-2 text-right">Counted</th>
						{#if data.showExpected}
							<th class="px-3 py-2 text-right">Difference</th>
							<th class="px-3 py-2 text-right">Value</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each shown as line (line.id)}
						<tr class="border-t {line.variance ? 'bg-amber-500/5' : ''}">
							<td class="px-3 py-2">
								<p class="font-medium">{line.item}</p>
								<p class="text-xs text-muted-foreground">
									{line.sku}{line.added ? ' · found during count' : ''}
								</p>
							</td>
							<td class="px-3 py-2 text-xs">
								{line.lotNumber ?? '—'}{line.expiryDate ? ` · exp ${line.expiryDate}` : ''}
							</td>
							{#if data.showExpected}<td class="px-3 py-2 text-right"
									>{qty(line.expected, line.unit)}</td
								>{/if}
							<td class="px-3 py-2 text-right">
								{#if editable}
									<input
										name="counted_{line.id}"
										type="number"
										min="0"
										step="any"
										inputmode="decimal"
										value={line.counted ?? ''}
										aria-label="Counted {line.item} {line.lotNumber ?? ''}"
										class="h-9 w-28 rounded-md border bg-background px-2 text-right"
									/>
									<span class="ml-1 text-xs text-muted-foreground">{line.unit}</span>
								{:else}
									{qty(line.counted, line.unit)}
								{/if}
							</td>
							{#if data.showExpected}
								<td
									class="px-3 py-2 text-right font-medium {line.variance && line.variance < 0
										? 'text-destructive'
										: ''}"
								>
									{line.variance === null
										? ''
										: line.variance > 0
											? `+${qty(line.variance)}`
											: qty(line.variance)}
								</td>
								<td class="px-3 py-2 text-right"
									>{line.varianceValue ? formatETB(line.varianceValue) : ''}</td
								>
							{/if}
						</tr>
					{:else}
						<tr
							><td colspan="6" class="px-3 py-6 text-center text-muted-foreground"
								>Nothing to count here.</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
		{#if editable}
			<Button type="submit" class="self-start" disabled={saving}
				><Save /> {saving ? 'Saving…' : 'Save counts'}</Button
			>
		{/if}
	</form>
</div>
