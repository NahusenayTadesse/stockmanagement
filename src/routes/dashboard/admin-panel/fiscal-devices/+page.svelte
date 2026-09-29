<script lang="ts">
	import { enhance } from '$app/forms';
	import Activity from '@lucide/svelte/icons/activity';
	import FileClock from '@lucide/svelte/icons/file-clock';
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import { add, edit, KIND_CHOICES } from './schema';

	let { data } = $props();
	let busy = $state<number | null>(null);

	const submitting = (id: number) => () => {
		busy = id;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = null;
		};
	};
</script>

<svelte:head>
	<title>Fiscal devices</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Fiscal devices</h1>
		<p class="text-muted-foreground">
			The MoR-registered sales registers and fiscal printers that print your legal receipts.
			Optional: without one, nothing about fiscal receipts appears anywhere. Every field can be left
			empty and filled in later. Tax groups map rates to the device's groups (e.g. {data.defaultTaxGroups});
			secrets are stored encrypted — leave them empty when editing to keep them.
		</p>
	</div>

	<LookupPage
		{data}
		schemas={{ add, edit }}
		config={{
			entity: 'Fiscal device',
			plural: 'Fiscal devices',
			fields: [
				{ name: 'name', label: 'Name', type: 'text', required: false, placeholder: 'Till 1' },
				{ name: 'kind', label: 'Connection', type: 'select', choices: KIND_CHOICES },
				{
					name: 'branchId',
					label: 'Branch',
					type: 'reference',
					options: 'branches',
					display: 'branch',
					required: false
				},
				{
					name: 'machineCode',
					label: 'MRC (machine code)',
					type: 'text',
					required: false,
					placeholder: 'As printed on its receipts'
				},
				{
					name: 'serialNumber',
					label: 'Serial number',
					type: 'text',
					required: false,
					inTable: false
				},
				{
					name: 'host',
					label: 'Network address (Datecs)',
					type: 'text',
					required: false,
					placeholder: '192.168.1.50',
					inTable: false
				},
				{
					name: 'port',
					label: 'Port (Datecs)',
					type: 'number',
					required: false,
					inTable: false
				},
				{
					name: 'operatorCode',
					label: 'Operator no. (Datecs)',
					type: 'text',
					required: false,
					placeholder: '1',
					inTable: false
				},
				{
					name: 'operatorPassword',
					label: 'Operator password (Datecs)',
					type: 'text',
					required: false,
					placeholder: 'Empty keeps the stored one',
					inTable: false
				},
				{
					name: 'tillNumber',
					label: 'Till no. (Datecs)',
					type: 'number',
					required: false,
					inTable: false
				},
				{
					name: 'bridgeUrl',
					label: 'Bridge URL',
					type: 'text',
					required: false,
					placeholder: 'http://localhost:4444',
					inTable: false
				},
				{
					name: 'bridgeToken',
					label: 'Bridge token',
					type: 'text',
					required: false,
					placeholder: 'Empty keeps the stored one',
					inTable: false
				},
				{
					name: 'taxGroups',
					label: 'Tax groups',
					type: 'text',
					required: false,
					placeholder: '15=A,0=B,exempt=C,tot=D',
					inTable: false
				},
				{ name: 'autoPrint', label: 'Print on posting', type: 'boolean' },
				{ name: 'isActive', label: 'In use', type: 'boolean' }
			]
		}}
	/>

	{#if data.rows.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-lg font-semibold">Check and daily report</h2>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each data.rows as d (d.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
						<div>
							<p class="font-medium">{d.name || `Device #${d.id}`} · {d.branch}</p>
							<p class="text-xs text-muted-foreground">
								{d.lastStatus ?? 'Not checked yet'}{d.lastCheckedAt
									? ` · ${ethiopianDateTime(d.lastCheckedAt)}`
									: ''}{d.lastZReportAt
									? ` · last Z report ${ethiopianDateTime(d.lastZReportAt)}`
									: ''}
							</p>
						</div>
						<div class="flex gap-2">
							<form method="POST" action="?/check" use:enhance={submitting(d.id)}>
								<input type="hidden" name="id" value={d.id} />
								<Button type="submit" size="sm" variant="outline" disabled={busy === d.id}
									><Activity /> Check</Button
								>
							</form>
							{#if d.kind && d.kind !== 'manual'}
								<form method="POST" action="?/zReport" use:enhance={submitting(d.id)}>
									<input type="hidden" name="id" value={d.id} />
									<Button type="submit" size="sm" variant="outline" disabled={busy === d.id}
										><FileClock /> Z report</Button
									>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
