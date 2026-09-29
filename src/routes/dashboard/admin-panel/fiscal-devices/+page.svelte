<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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
	<title>{m.admin_fd_title()}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">{m.admin_fd_title()}</h1>
		<p class="text-muted-foreground">
			{m.admin_fd_intro({ groups: data.defaultTaxGroups })}
		</p>
	</div>

	<LookupPage
		{data}
		schemas={{ add, edit }}
		config={{
			entity: m.admin_fd_entity(),
			plural: m.admin_fd_title(),
			fields: [
				{
					name: 'name',
					label: m.common_name(),
					type: 'text',
					required: false,
					placeholder: m.admin_fd_name_placeholder()
				},
				{ name: 'kind', label: m.admin_fd_connection(), type: 'select', choices: KIND_CHOICES },
				{
					name: 'branchId',
					label: m.common_branch(),
					type: 'reference',
					options: 'branches',
					display: 'branch',
					required: false
				},
				{
					name: 'machineCode',
					label: m.admin_fd_mrc(),
					type: 'text',
					required: false,
					placeholder: m.admin_fd_mrc_placeholder()
				},
				{
					name: 'serialNumber',
					label: m.admin_fd_serial(),
					type: 'text',
					required: false,
					inTable: false
				},
				{
					name: 'host',
					label: m.admin_fd_host(),
					type: 'text',
					required: false,
					placeholder: '192.168.1.50',
					inTable: false
				},
				{
					name: 'port',
					label: m.admin_fd_port(),
					type: 'number',
					required: false,
					inTable: false
				},
				{
					name: 'operatorCode',
					label: m.admin_fd_operator(),
					type: 'text',
					required: false,
					placeholder: '1',
					inTable: false
				},
				{
					name: 'operatorPassword',
					label: m.admin_fd_operator_password(),
					type: 'text',
					required: false,
					placeholder: m.admin_fd_keep_stored(),
					inTable: false
				},
				{
					name: 'tillNumber',
					label: m.admin_fd_till(),
					type: 'number',
					required: false,
					inTable: false
				},
				{
					name: 'bridgeUrl',
					label: m.admin_fd_bridge_url(),
					type: 'text',
					required: false,
					placeholder: 'http://localhost:4444',
					inTable: false
				},
				{
					name: 'bridgeToken',
					label: m.admin_fd_bridge_token(),
					type: 'text',
					required: false,
					placeholder: m.admin_fd_keep_stored(),
					inTable: false
				},
				{
					name: 'taxGroups',
					label: m.admin_fd_tax_groups(),
					type: 'text',
					required: false,
					placeholder: '15=A,0=B,exempt=C,tot=D',
					inTable: false
				},
				{ name: 'autoPrint', label: m.admin_fd_auto_print(), type: 'boolean' },
				{ name: 'isActive', label: m.admin_fd_in_use(), type: 'boolean' }
			]
		}}
	/>

	{#if data.rows.length}
		<section class="flex flex-col gap-2">
			<h2 class="text-lg font-semibold">{m.admin_fd_check_title()}</h2>
			<ul class="flex flex-col divide-y rounded-md border">
				{#each data.rows as d (d.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
						<div>
							<p class="font-medium">{d.name || m.admin_fd_device_n({ id: d.id })} · {d.branch}</p>
							<p class="text-xs text-muted-foreground">
								{d.lastStatus ?? m.admin_fd_not_checked()}{d.lastCheckedAt
									? ` · ${ethiopianDateTime(d.lastCheckedAt)}`
									: ''}{d.lastZReportAt
									? ` · ${m.admin_fd_last_z({ when: ethiopianDateTime(d.lastZReportAt) })}`
									: ''}
							</p>
						</div>
						<div class="flex gap-2">
							<form method="POST" action="?/check" use:enhance={submitting(d.id)}>
								<input type="hidden" name="id" value={d.id} />
								<Button type="submit" size="sm" variant="outline" disabled={busy === d.id}
									><Activity /> {m.admin_fd_check()}</Button
								>
							</form>
							{#if d.kind && d.kind !== 'manual'}
								<form method="POST" action="?/zReport" use:enhance={submitting(d.id)}>
									<input type="hidden" name="id" value={d.id} />
									<Button type="submit" size="sm" variant="outline" disabled={busy === d.id}
										><FileClock /> {m.admin_fd_z()}</Button
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
