<script lang="ts">
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import ReceiptReview from '../ReceiptReview.svelte';
	import { paymentColumns } from '../paymentColumns';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const columns = paymentColumns();
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={m.platform_payments_title()} description={m.platform_payments_intro()} />

	<PageSection title={m.platform_receipts_title()} hint={m.platform_receipts_hint()}>
		{#if data.receipts.length}
			<ReceiptReview receipts={data.receipts} />
		{:else}
			<Notice tone="info">{m.platform_receipts_none()}</Notice>
		{/if}
	</PageSection>

	<PageSection title={m.platform_all_payments()}>
		<DataTable
			data={data.payments}
			{columns}
			variant="list"
			fileName={m.platform_payments_title()}
		/>
	</PageSection>
</div>
