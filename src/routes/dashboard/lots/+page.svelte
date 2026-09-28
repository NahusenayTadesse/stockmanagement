<script lang="ts">
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupConfig } from '@nahu/admin-kit/components/lookup/types';
	import { lotEdit } from '$lib/schemas/stock';
	import { extraColumns } from './columns';

	let { data } = $props();

	const config: LookupConfig = {
		entity: 'Lot',
		plural: 'Lots',
		fixedRows: true,
		fields: [
			{ name: 'lotNumber', label: 'Lot', type: 'text', inForm: false },
			{
				name: 'status',
				label: 'Status',
				type: 'select',
				choices: [
					{ value: 'available', name: 'Available' },
					{ value: 'quarantine', name: 'Quarantine — held back' },
					{ value: 'recalled', name: 'Recalled' }
				]
			},
			{
				name: 'note',
				label: 'Note',
				type: 'text',
				required: false,
				placeholder: 'Why, e.g. EFDA recall notice no.'
			}
		],
		extraColumns
	};
</script>

<svelte:head>
	<title>Lots & expiry</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Lots & expiry</h1>
		<p class="text-muted-foreground">
			Soonest expiry first. Quarantined and recalled lots, and expired ones, are never issued — move
			them to a quarantine location or write them off with an adjustment.
		</p>
	</div>

	{#if data.canManage}
		<LookupPage {data} {config} schemas={{ edit: lotEdit }} />
	{:else}
		<LookupSection
			{config}
			rows={data.rows}
			addForm={data.addForm}
			editForm={data.editForm}
			actions={{ add: '?/add', edit: '?/edit', delete: '?/delete' }}
			readonly
		/>
	{/if}
</div>
