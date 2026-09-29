<script lang="ts">
	import { resolve } from '$app/paths';
	import DataTable from '@nahu/admin-kit/components/Table/data-table.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import StatCard from '@nahu/admin-kit/components/reports/StatCard.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import * as Tabs from '@nahu/admin-kit/components/ui/tabs/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import { formatETB, formatEthiopianDate } from '@nahu/admin-kit/global';
	import { PURPOSE_CHOICES } from '$lib/schemas/transactions';
	import {
		customerColumns,
		registerColumns,
		withholdingColumns,
		issuedColumns,
		kindColumns,
		splitColumns,
		supplierColumns,
		valuationColumns,
		wasteColumns
	} from './columns';

	let { data } = $props();

	const ANALYSIS = [
		{ href: '/dashboard/reports/slow-moving', label: 'Slow & dead stock' },
		{ href: '/dashboard/reports/abc', label: 'ABC analysis' },
		{ href: '/dashboard/reports/stock-outs', label: 'Stock-outs' },
		{ href: '/dashboard/reports/trend', label: 'Stock trend' },
		{ href: '/dashboard/reports/serials', label: 'Serial lookup' }
	] as const;

	const f = $derived(data.filters);
	// svelte-ignore state_referenced_locally
	let tab = $state(data.tab);
	const ethiopian = (day: string) => formatEthiopianDate(new Date(`${day}T12:00:00+03:00`));
	const period = $derived(`${f.from} to ${f.to}`);
	const select = 'h-9 rounded-md border bg-background px-2 text-sm';

	function href(from: string, to: string) {
		const params = new URLSearchParams({
			from,
			to,
			tab,
			...(f.branchId && { branch: String(f.branchId) })
		});
		return `${resolve('/dashboard/reports')}?${params}`;
	}

	/**
	 * A categorical chart gets at most seven slices and "Other": the palette has eight colours and
	 * they are never reused, so two slices never share one.
	 */
	function topSeven(list: { label: string; value: number }[]) {
		if (list.length <= 8) return list;
		const rest = list.slice(7).reduce((s, x) => s + x.value, 0);
		return [...list.slice(0, 7), { label: 'Other', value: Math.round(rest * 100) / 100 }];
	}
	const slices = (
		key: string,
		title: string,
		list: { label: string; value: number }[],
		description?: string
	): ReportChartData => {
		const top = topSeven(list);
		return {
			key,
			title,
			description,
			group: tab,
			kind: 'doughnut',
			money: true,
			labels: top.map((x) => x.label),
			series: [{ label: 'Value', data: top.map((x) => x.value) }]
		};
	};

	const purposeName = (v: string) =>
		PURPOSE_CHOICES.find((p) => p.value === v)?.name.split(' (')[0] ?? v;

	const wasteTotal = $derived(data.waste.total);
	const received = $derived(data.movements.received.reduce((s, v) => s + v, 0));
	const issued = $derived(data.movements.issued.reduce((s, v) => s + v, 0));

	const stockTiles = $derived<Stat[]>([
		{
			key: 'value',
			label: 'Stock value now',
			value: data.stock.total,
			format: 'money',
			group: 'stock',
			hint: 'On hand at average cost'
		},
		{
			key: 'items',
			label: 'Items in stock',
			value: data.stock.items.length,
			format: 'count',
			group: 'stock'
		},
		{
			key: 'expired',
			label: 'Expired, still held',
			value: data.stock.expiredValue,
			format: 'money',
			group: 'stock',
			tone: data.stock.expiredValue > 0 ? 'negative' : 'neutral',
			hint: 'Quarantine or write it off'
		},
		{
			key: 'waste',
			label: 'Written off in period',
			value: wasteTotal,
			format: 'money',
			group: 'stock',
			tone: wasteTotal > 0 ? 'warning' : 'neutral'
		}
	]);

	const flowTiles = $derived<Stat[]>([
		{
			key: 'in',
			label: 'Received',
			value: received,
			format: 'money',
			group: 'flow',
			tone: 'positive',
			hint: 'Posted receipts, at cost'
		},
		{
			key: 'out',
			label: 'Issued',
			value: issued,
			format: 'money',
			group: 'flow',
			hint: 'Issues, at cost'
		},
		{
			key: 'adj',
			label: 'Adjusted out',
			value: data.movements.adjustedOut.reduce((s, v) => s + v, 0),
			format: 'money',
			group: 'flow',
			tone: 'warning',
			hint: 'Write-offs and count shortages'
		}
	]);

	const flowChart = $derived<ReportChartData>({
		key: 'flow',
		title: 'Stock in and out',
		description: `Value at cost, by ${data.movements.byDay ? 'day' : 'Ethiopian month'}`,
		group: 'flow',
		kind: 'bar',
		money: true,
		wide: true,
		labels: data.movements.labels,
		series: [
			{ label: 'Received', data: data.movements.received },
			{ label: 'Issued', data: data.movements.issued },
			{ label: 'Adjusted out', data: data.movements.adjustedOut }
		]
	});

	const topChart = $derived<ReportChartData>({
		key: 'top',
		title: 'Most issued items',
		description: 'Value at cost over the period',
		group: 'flow',
		kind: 'bar',
		money: true,
		wide: true,
		labels: data.issued.slice(0, 10).map((i) => i.item),
		series: [{ label: 'Issued', data: data.issued.slice(0, 10).map((i) => i.value) }]
	});

	const supplierChart = $derived<ReportChartData>({
		key: 'suppliers',
		title: 'Delivered by supplier',
		description: 'Posted receipts over the period, at cost',
		group: 'purchasing',
		kind: 'bar',
		money: true,
		wide: true,
		labels: data.suppliers.slice(0, 12).map((s) => s.supplier),
		series: [
			{ label: 'Delivered', data: data.suppliers.slice(0, 12).map((s) => s.delivered) },
			{ label: 'Ordered', data: data.suppliers.slice(0, 12).map((s) => s.orderedValue) }
		]
	});

	const moneyChart = $derived<ReportChartData | null>(
		data.money && {
			key: 'money',
			title: 'Money in and out',
			description: `Voided transactions left out · by ${data.movements.byDay ? 'day' : 'Ethiopian month'}`,
			group: 'money',
			kind: 'bar',
			money: true,
			wide: true,
			labels: data.money.labels,
			series: [
				{ label: 'In', data: data.money.moneyIn },
				{ label: 'Out', data: data.money.moneyOut }
			]
		}
	);
</script>

<svelte:head>
	<title>Reports</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="text-2xl font-semibold">Reports</h1>
		<p class="text-muted-foreground">
			Stock value as it stands now; everything else for {ethiopian(f.from)} – {ethiopian(f.to)}.
			Every table exports to CSV or PDF, and every chart shows its numbers as a table.
		</p>
	</div>

	<Card.Root>
		<Card.Content class="flex flex-wrap items-center gap-2 pt-6">
			<span class="mr-2 text-sm text-muted-foreground">Stock analysis:</span>
			{#each ANALYSIS as a (a.href)}
				<Button href={resolve(a.href)} size="sm" variant="outline">{a.label}</Button>
			{/each}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content class="flex flex-col gap-4 pt-6">
			<div class="flex flex-wrap gap-2">
				{#each data.presets as p (p.key)}
					<Button
						href={href(p.from, p.to)}
						size="sm"
						variant={p.from === f.from && p.to === f.to ? 'default' : 'outline'}>{p.label}</Button
					>
				{/each}
			</div>
			<form method="GET" class="flex flex-wrap items-end gap-3">
				<input type="hidden" name="tab" value={tab} />
				<div class="flex flex-col gap-1">
					<Label for="from">From</Label>
					<Input id="from" name="from" type="date" value={f.from} />
				</div>
				<div class="flex flex-col gap-1">
					<Label for="to">To</Label>
					<Input id="to" name="to" type="date" value={f.to} />
				</div>
				{#if data.branches.length > 1}
					<div class="flex flex-col gap-1">
						<Label for="branch">Branch</Label>
						<select id="branch" name="branch" class={select} value={f.branchId}>
							<option value={0}>All branches</option>
							{#each data.branches as b (b.value)}
								<option value={b.value}>{b.name}</option>
							{/each}
						</select>
					</div>
				{/if}
				<Button type="submit">Show</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Tabs.Root bind:value={tab}>
		<Tabs.List class="flex h-auto flex-wrap">
			<Tabs.Trigger value="stock">Stock value</Tabs.Trigger>
			<Tabs.Trigger value="flow">Movements</Tabs.Trigger>
			<Tabs.Trigger value="purchasing">Purchasing</Tabs.Trigger>
			<Tabs.Trigger value="waste">Wastage</Tabs.Trigger>
			{#if data.money}<Tabs.Trigger value="money">Money</Tabs.Trigger>{/if}
			{#if data.vat}<Tabs.Trigger value="tax">VAT & withholding</Tabs.Trigger>{/if}
		</Tabs.List>

		<Tabs.Content value="stock" class="flex flex-col gap-4 pt-2">
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each stockTiles as stat (stat.key)}<StatCard {stat} />{/each}
			</div>
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportChart
					chart={slices(
						'category',
						'Stock value by category',
						data.stock.byCategory,
						'At average cost'
					)}
				/>
				<ReportChart
					chart={slices(
						'location',
						'Stock value by location',
						data.stock.byLocation,
						'At average cost'
					)}
				/>
			</div>
			<DataTable
				data={data.stock.items}
				columns={valuationColumns}
				fileName="Stock valuation {f.to}"
				facetKeys={['category']}
			/>
		</Tabs.Content>

		<Tabs.Content value="flow" class="flex flex-col gap-4 pt-2">
			<div class="grid gap-4 sm:grid-cols-3">
				{#each flowTiles as stat (stat.key)}<StatCard {stat} />{/each}
			</div>
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportChart chart={flowChart} />
				<ReportChart chart={topChart} />
			</div>
			<h2 class="text-lg font-semibold">Most issued items</h2>
			<DataTable
				data={data.issued}
				columns={issuedColumns}
				fileName="Most issued {period}"
				height="auto"
			/>
			<h2 class="text-lg font-semibold">By kind of movement</h2>
			<DataTable
				data={data.movements.byKind}
				columns={kindColumns}
				fileName="Movements {period}"
				height="auto"
			/>
			{#if data.byCustomer}
				<h2 class="text-lg font-semibold">Issued by customer</h2>
				<div class="grid gap-4 lg:grid-cols-2">
					<ReportChart
						chart={slices(
							'customers',
							'Issued by customer',
							data.byCustomer.map((c) => ({ label: c.customer, value: c.value })),
							'At cost. Walk-in sales and internal issues have no customer named.'
						)}
					/>
					<DataTable
						data={data.byCustomer}
						columns={customerColumns}
						fileName="Issued by customer {period}"
						height="auto"
					/>
				</div>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="purchasing" class="flex flex-col gap-4 pt-2">
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportChart chart={supplierChart} />
			</div>
			<p class="text-sm text-muted-foreground">
				"Arrived so far" is the share of the quantity ordered, on orders placed in the period, that
				has been received.
			</p>
			<DataTable
				data={data.suppliers}
				columns={supplierColumns}
				fileName="Purchases by supplier {period}"
				height="auto"
			/>
		</Tabs.Content>

		<Tabs.Content value="waste" class="flex flex-col gap-4 pt-2">
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportChart
					chart={slices(
						'reason',
						'Written off by reason',
						data.waste.byReason,
						'Adjustments out, at cost'
					)}
				/>
				<StatCard
					stat={{
						key: 'waste-total',
						label: 'Written off in period',
						value: wasteTotal,
						format: 'money',
						group: 'waste',
						tone: wasteTotal > 0 ? 'warning' : 'neutral',
						hint: `${data.waste.rows.length} line${data.waste.rows.length === 1 ? '' : 's'}`
					}}
				/>
			</div>
			<DataTable
				data={data.waste.rows}
				columns={wasteColumns}
				fileName="Wastage {period}"
				facetKeys={['reasonName', 'location']}
			/>
		</Tabs.Content>

		{#if data.money && moneyChart}
			<Tabs.Content value="money" class="flex flex-col gap-4 pt-2">
				<div class="grid gap-4 sm:grid-cols-3">
					<StatCard
						stat={{
							key: 'in',
							label: 'Money in',
							value: data.money.totalIn,
							format: 'money',
							group: 'money',
							tone: 'positive'
						}}
					/>
					<StatCard
						stat={{
							key: 'out',
							label: 'Money out',
							value: data.money.totalOut,
							format: 'money',
							group: 'money',
							tone: 'negative'
						}}
					/>
					<StatCard
						stat={{
							key: 'net',
							label: 'Net',
							value: data.money.totalIn - data.money.totalOut,
							format: 'money',
							group: 'money'
						}}
					/>
				</div>
				<div class="grid gap-4 lg:grid-cols-2">
					<ReportChart chart={moneyChart} />
					<ReportChart
						chart={slices(
							'purpose',
							'Money out by purpose',
							data.money.byPurpose
								.filter((p) => p.out > 0)
								.map((p) => ({ label: purposeName(p.label), value: p.out }))
						)}
					/>
					<ReportChart
						chart={slices(
							'method',
							'Money in by method',
							data.money.byMethod
								.filter((m) => m.in > 0)
								.map((m) => ({ label: m.label, value: m.in }))
						)}
					/>
				</div>
				<h2 class="text-lg font-semibold">By purpose</h2>
				<DataTable
					data={data.money.byPurpose.map((p) => ({ ...p, label: purposeName(p.label) }))}
					columns={splitColumns('Purpose')}
					fileName="Money by purpose {period}"
					height="auto"
				/>
				<h2 class="text-lg font-semibold">By method</h2>
				<DataTable
					data={data.money.byMethod}
					columns={splitColumns('Method')}
					fileName="Money by method {period}"
					height="auto"
				/>
				<p class="text-sm text-muted-foreground">
					Every transaction behind these numbers is on the <a
						class="underline underline-offset-4"
						href={resolve('/dashboard/transactions')}>Transactions</a
					> page.
				</p>
			</Tabs.Content>
		{/if}
		{#if data.vat && data.withholding}
			{@const v = data.vat.totals}
			{@const w = data.withholding.totals}
			<Tabs.Content value="tax" class="flex flex-col gap-4 pt-2">
				<p class="text-sm text-muted-foreground">
					From posted documents dated in the period. Returns reduce the register they correct. Check
					the figures against your invoices before filing.
				</p>
				<div class="grid gap-4 sm:grid-cols-3">
					<StatCard
						stat={{
							key: 'out',
							label: 'Output VAT (on sales)',
							value: v.outputVat,
							format: 'money',
							group: 'tax',
							hint: `On ${formatETB(v.salesNet)} of sales before VAT`
						}}
					/>
					<StatCard
						stat={{
							key: 'in',
							label: 'Input VAT (on purchases)',
							value: v.inputVat,
							format: 'money',
							group: 'tax',
							hint: `On ${formatETB(v.purchasesNet)} of deliveries before VAT`
						}}
					/>
					<StatCard
						stat={{
							key: 'payable',
							label: v.payable >= 0 ? 'VAT payable' : 'VAT to carry forward',
							value: Math.abs(v.payable),
							format: 'money',
							group: 'tax',
							tone: v.payable > 0 ? 'negative' : 'positive',
							hint: 'Output less input VAT'
						}}
					/>
				</div>
				{#if v.tot}
					<StatCard
						stat={{
							key: 'tot',
							label: 'Turnover tax (TOT) on sales',
							value: v.tot,
							format: 'money',
							group: 'tax',
							tone: 'negative',
							hint: 'Payable instead of VAT by a business that is not VAT-registered'
						}}
					/>
				{/if}
				<h2 class="text-lg font-semibold">Sales register</h2>
				<DataTable
					data={data.vat.sales}
					columns={registerColumns}
					fileName="VAT sales register {period}"
					height="auto"
				/>
				<h2 class="text-lg font-semibold">Purchase register</h2>
				<DataTable
					data={data.vat.purchases}
					columns={registerColumns}
					fileName="VAT purchase register {period}"
					height="auto"
				/>

				<div class="grid gap-4 sm:grid-cols-3">
					<StatCard
						stat={{
							key: 'byUs',
							label: 'Withheld by you',
							value: w.byUs,
							format: 'money',
							group: 'tax',
							tone: w.byUs ? 'warning' : 'neutral',
							hint: 'Kept back from suppliers: pay it to the tax office'
						}}
					/>
					<StatCard
						stat={{
							key: 'fromUs',
							label: 'Withheld from you',
							value: w.fromUs,
							format: 'money',
							group: 'tax',
							tone: 'positive',
							hint: 'Kept back by customers: a credit against your tax'
						}}
					/>
					<StatCard
						stat={{
							key: 'missing',
							label: 'Missing withholding receipts',
							value: w.missingReceipts,
							format: 'count',
							group: 'tax',
							tone: w.missingReceipts ? 'negative' : 'neutral'
						}}
					/>
				</div>
				<h2 class="text-lg font-semibold">Withheld by you</h2>
				<DataTable
					data={data.withholding.byUs}
					columns={withholdingColumns}
					fileName="Withholding by us {period}"
					height="auto"
				/>
				<h2 class="text-lg font-semibold">Withheld from you</h2>
				<DataTable
					data={data.withholding.fromUs}
					columns={withholdingColumns}
					fileName="Withholding from us {period}"
					height="auto"
				/>
			</Tabs.Content>
		{/if}
	</Tabs.Root>
</div>
