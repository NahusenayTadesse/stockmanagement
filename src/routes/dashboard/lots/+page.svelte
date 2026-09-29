<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import LookupSection from '@nahu/admin-kit/components/lookup/LookupSection.svelte';
	import type { LookupConfig } from '@nahu/admin-kit/components/lookup/types';
	import { lotEdit } from '$lib/schemas/stock';
	import { extraColumns } from './columns';

	let { data } = $props();

	const config: LookupConfig = {
		entity: m.stock_lot(),
		plural: m.stock_lots(),
		fixedRows: true,
		fields: [
			{ name: 'lotNumber', label: m.stock_lot(), type: 'text', inForm: false },
			{
				name: 'status',
				label: m.common_status(),
				type: 'select',
				choices: [
					{ value: 'available', name: m.stock_lot_available() },
					{ value: 'quarantine', name: m.stock_lot_quarantine_held() },
					{ value: 'recalled', name: m.stock_lot_recalled() }
				]
			},
			{
				name: 'note',
				label: m.common_note(),
				type: 'text',
				required: false,
				placeholder: m.stock_lot_note_placeholder()
			}
		],
		extraColumns
	};
</script>

<svelte:head>
	<title>{m.stock_lots_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">{m.stock_lots_title()}</h1>
		<p class="text-muted-foreground">
			{m.stock_lots_intro()}
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
