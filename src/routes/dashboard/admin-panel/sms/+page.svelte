<script lang="ts">
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
		{ value: false, name: 'Off' },
		{ value: true, name: 'On' }
	];
	const signature = $derived(String($form.smsSignature || data.businessName));
	const monthStats = $derived<Stat[]>([
		{
			key: 'sent',
			label: 'Sent, last 30 days',
			value: data.month.sent,
			format: 'count',
			group: 'sms'
		},
		{
			key: 'units',
			label: 'Message units charged',
			value: data.month.units,
			format: 'count',
			group: 'sms',
			hint: 'As GeezSMS reports them'
		},
		{
			key: 'failed',
			label: 'Failed, last 30 days',
			value: data.month.failed,
			format: 'count',
			group: 'sms',
			tone: data.month.failed ? 'warning' : 'neutral'
		}
	]);
</script>

<svelte:head><title>SMS</title></svelte:head>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold">SMS</h1>
		<p class="text-muted-foreground">
			Text messages to customers, suppliers and your own staff, through GeezSMS. Messages start with
			"{signature}:" and are at most 335 characters.
		</p>
	</div>

	{#if !data.server.configured}
		<div class="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
			This server has no SMS account set up (<code>SMS_KEY</code>), so nothing can be sent yet.
		</div>
	{:else if data.server.dryRun}
		<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
			Test mode: messages are written to the log below but not sent (<code>SMS_DRY_RUN</code> is on for
			this server).
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
				<Card.Title>Settings</Card.Title>
				<Card.Description>Nothing is sent until SMS is on.</Card.Description>
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
						label="SMS"
						items={onOff}
						description="On: the messages below go out, and people with the right to may text customers and suppliers (reminders, proformas, orders)."
					/>
					{#if $form.smsEnabled}
						<InputComp
							{form}
							{errors}
							name="smsSales"
							type="select"
							label="Receipt after a sale"
							items={onOff}
							description="A named customer with a mobile number gets the receipt number, total, what they paid and what they owe. At the till a receipt can also be texted to any number the customer gives."
						/>
						<InputComp
							{form}
							{errors}
							name="smsPayments"
							type="select"
							label="Payment confirmation"
							items={onOff}
							description="When money from a customer is recorded: how much, and what they still owe."
						/>
						<InputComp
							{form}
							{errors}
							name="smsAlertPhones"
							label="Staff alert numbers (optional)"
							placeholder="0911 234 567, 0922 345 678"
							description="These numbers hear of approvals waiting, transfers on the way to a branch (the branch's own phone too, if it is a mobile), requisitions submitted, and a short morning digest."
						/>
						<InputComp
							{form}
							{errors}
							name="smsSignature"
							label="Sign messages as (optional)"
							placeholder={data.businessName}
						/>
					{/if}
					<Button type="submit" form="sms-settings">
						{#if $delayed}<LoadingBtn name="Saving" />{:else}<Save /> Save{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Send a test</Card.Title>
				<Card.Description>To your own phone, to see what arrives.</Card.Description>
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
						label="Mobile number"
						placeholder="0911 234 567"
						required
					/>
					<InputComp
						form={testData}
						errors={testErrors}
						name="text"
						type="textarea"
						rows={3}
						label="Message"
						required
					/>
					<Button type="submit" form="sms-test" variant="outline">
						{#if $testDelayed}<LoadingBtn name="Sending" />{:else}<Send /> Send{/if}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>

	<section class="flex flex-col gap-2">
		<h2 class="text-xl font-semibold">Messages</h2>
		<p class="text-sm text-muted-foreground">The last 500, newest first.</p>
		<DataTable data={data.log} {columns} fileName="SMS messages" />
	</section>
</div>
