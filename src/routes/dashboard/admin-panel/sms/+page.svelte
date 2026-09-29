<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import Save from '@lucide/svelte/icons/save';
	import Send from '@lucide/svelte/icons/send';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { smsSettingsSchema, smsWriteSchema } from '$lib/schemas/sms';
	import type { Stat } from '@nahu/admin-kit/components/reports/types';
	import { columns } from './columns';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const settings = createForm(data.form, smsSettingsSchema, { resetForm: false });
	const form = settings.form;
	const errors = settings.errors;
	const allErrors = settings.allErrors;
	const delayed = settings.delayed;

	// svelte-ignore state_referenced_locally
	const test = createForm(data.testForm, smsWriteSchema, { resetForm: false });
	const testData = test.form;
	const testErrors = test.errors;
	const testDelayed = test.delayed;

	const onOff = [
		{ value: false, name: m.common_off() },
		{ value: true, name: m.common_on() }
	];
	const signature = $derived(String($form.smsSignature || data.businessName));
	const monthStats = $derived<Stat[]>([
		{
			key: 'sent',
			label: m.admin_sms_stat_sent(),
			value: data.month.sent,
			format: 'count',
			group: 'sms'
		},
		{
			key: 'units',
			label: m.admin_sms_stat_units(),
			value: data.month.units,
			format: 'count',
			group: 'sms',
			hint: m.admin_sms_stat_units_hint()
		},
		{
			key: 'failed',
			label: m.admin_sms_stat_failed(),
			value: data.month.failed,
			format: 'count',
			group: 'sms',
			tone: data.month.failed ? 'warning' : 'neutral'
		}
	]);
</script>

<svelte:head><title>{m.admin_sms_title()}</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold">{m.admin_sms_title()}</h1>
		<p class="text-muted-foreground">
			{m.admin_sms_intro({ signature })}
		</p>
	</div>

	{#if !data.server.configured}
		<div class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
			{m.admin_sms_no_key()}
		</div>
	{:else if data.server.dryRun}
		<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
			{m.admin_sms_dry_run()}
		</div>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		{#each monthStats as stat (stat.key)}
			<StatCard {stat} />
		{/each}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.admin_sms_settings()}</Card.Title>
				<Card.Description>{m.admin_sms_settings_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/save"
					use:settings.enhance
					id="sms-settings"
					class="flex flex-col gap-4"
				>
					<Errors allErrors={$allErrors} />
					<InputComp
						{form}
						{errors}
						name="smsEnabled"
						type="select"
						label={m.admin_sms_title()}
						items={onOff}
						description={m.admin_sms_enabled_desc()}
					/>
					{#if $form.smsEnabled}
						<InputComp
							{form}
							{errors}
							name="smsSales"
							type="select"
							label={m.admin_sms_sales()}
							items={onOff}
							description={m.admin_sms_sales_desc()}
						/>
						<InputComp
							{form}
							{errors}
							name="smsPayments"
							type="select"
							label={m.admin_sms_payments()}
							items={onOff}
							description={m.admin_sms_payments_desc()}
						/>
						<InputComp
							{form}
							{errors}
							name="smsAlertPhones"
							label={m.admin_sms_alert_phones()}
							placeholder="0911 234 567, 0922 345 678"
							description={m.admin_sms_alert_phones_desc()}
						/>
						<InputComp
							{form}
							{errors}
							name="smsSignature"
							label={m.admin_sms_signature()}
							placeholder={data.businessName}
						/>
					{/if}
					<Button type="submit" form="sms-settings">
						{#if $delayed}<LoadingBtn name={m.common_saving()} />{:else}<Save />
							{m.common_save()}{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>{m.admin_sms_test_title()}</Card.Title>
				<Card.Description>{m.admin_sms_test_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/test"
					use:test.enhance
					id="sms-test"
					class="flex flex-col gap-4"
				>
					<InputComp
						form={testData}
						errors={testErrors}
						name="to"
						type="tel"
						label={m.admin_sms_mobile()}
						placeholder="0911 234 567"
						required
					/>
					<InputComp
						form={testData}
						errors={testErrors}
						name="text"
						type="textarea"
						rows={3}
						label={m.admin_sms_message()}
						required
					/>
					<Button type="submit" form="sms-test" variant="outline">
						{#if $testDelayed}<LoadingBtn name={m.common_sending()} />{:else}<Send />
							{m.common_send()}{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">{m.admin_sms_messages()}</h2>
		<p class="text-sm text-muted-foreground">{m.admin_sms_last_500()}</p>
		<DataTable data={data.log} {columns} fileName={m.admin_sms_export_name()} />
	</section>
</div>
