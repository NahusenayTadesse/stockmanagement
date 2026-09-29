<script lang="ts">
	import { enhance } from '$app/forms';
	import Check from '@lucide/svelte/icons/check';
	import type { ColumnDef } from '@tanstack/table-core';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import { renderSnippet } from '@nahu/admin-kit/components/ui/data-table/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { round4 } from '$lib/money';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * A transfer from another branch: what was sent, and — for the receiving branch — boxes for
	 * what arrived (serials for serial items). Once received, what arrived and what went missing.
	 */
	type Line = {
		id: number;
		item: string;
		unit: string;
		sent: number;
		received: number | null;
		serials: string | null;
		receivedSerials: string;
		trackSerials: boolean;
	};
	let { lines, canReceive }: { lines: Line[]; canReceive: boolean } = $props();

	/** What arrived, as typed, before it is sent. */
	const arrived = $state<Record<number, number>>({});
	const got = (l: Line) => (canReceive ? (arrived[l.id] ?? l.sent) : (l.received ?? l.sent));

	const columns: ColumnDef<Line>[] = [
		{ accessorKey: 'item', header: m.common_item() },
		{
			accessorKey: 'sent',
			header: m.stock_sent(),
			cell: ({ row }) => `${row.original.sent} ${row.original.unit}`
		},
		{
			id: 'arrived',
			header: m.stock_arrived(),
			cell: ({ row }) => renderSnippet(arrivedCell, row.original)
		},
		{
			id: 'missing',
			header: m.stock_missing(),
			cell: ({ row }) => renderSnippet(missingCell, row.original)
		}
	];
</script>

{#snippet arrivedCell(l: Line)}
	{#if canReceive && l.trackSerials}
		<textarea
			name="serials_{l.id}"
			rows={Math.min(6, (l.serials ?? '').split('\n').length)}
			aria-label={m.stock_serials_arrived_aria({ item: l.item })}
			class="w-48 rounded-md border bg-background px-2 py-1 font-mono text-xs">{l.serials}</textarea
		>
	{:else if canReceive}
		<input
			name="qty_{l.id}"
			type="number"
			min="0"
			max={l.sent}
			step="any"
			value={l.sent}
			oninput={(e) => (arrived[l.id] = Number(e.currentTarget.value))}
			aria-label={m.stock_qty_arrived_aria({ item: l.item })}
			class="h-9 w-24 rounded-md border bg-background px-2 text-right"
		/>
		<span class="ml-1 text-xs text-muted-foreground">{l.unit}</span>
	{:else}
		{l.received ?? '—'}
		{l.unit}
		{#if l.trackSerials && l.receivedSerials}
			<div class="font-mono text-xs text-muted-foreground">
				{l.receivedSerials.split('\n').join(', ')}
			</div>
		{/if}
	{/if}
{/snippet}

{#snippet missingCell(l: Line)}
	{#if !l.trackSerials}
		<span class={l.sent - got(l) > 0 ? 'text-destructive' : ''}
			>{round4(l.sent - got(l))} {l.unit}</span
		>
	{/if}
{/snippet}

<form
	method="POST"
	action="?/receive"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
	class="flex flex-col gap-3"
>
	<DataTable variant="sheet" data={lines} {columns} />
	{#if canReceive}
		<Input name="note" placeholder={m.stock_delivery_note_placeholder()} class="max-w-xl" />
		<Button type="submit" class="self-start"><Check /> {m.stock_receive()}</Button>
	{/if}
</form>
