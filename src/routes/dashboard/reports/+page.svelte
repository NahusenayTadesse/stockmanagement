<script lang="ts">
	import PageSection from '@nahu/admin-kit/components/PageSection.svelte';
	import DatePresets from '$lib/components/filters/DatePresets.svelte';
	import { resolve } from '$app/paths';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import ReportChart from '@nahu/admin-kit/components/reports/ReportChart.svelte';
	import type { ReportChartData, Stat } from '@nahu/admin-kit/components/reports/types';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import * as Tabs from '@nahu/admin-kit/components/ui/tabs/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { PURPOSE_CHOICES } from '$lib/schemas/transactions';
	import { cents } from '$lib/money';
	import { m } from '$lib/paraglide/messages.js';
	import ReportFilterBar from './ReportFilterBar.svelte';
	import ReportTable from './ReportTable.svelte';
	import StatGrid from './StatGrid.svelte';
	import { ethiopianDay as ethiopian } from '$lib/format';
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
		{ href: '/dashboard/reports/slow-moving', label: m.nav_slow_moving },
		{ href: '/dashboard/reports/abc', label: m.nav_abc },
		{ href: '/dashboard/reports/stock-outs', label: m.nav_stock_outs },
		{ href: '/dashboard/reports/trend', label: m.nav_trend },
		{ href: '/dashboard/reports/serials', label: m.nav_serials }
	] as const;

	const f = $derived(data.filters);
	// svelte-ignore state_referenced_locally
	let tab = $state(data.tab);
	const period = $derived(m.reports_period({ from: f.from, to: f.to }));

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
		return [...list.slice(0, 7), { label: m.reports_other(), value: cents(rest) }];
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
			series: [{ label: m.reports_value(), data: top.map((x) => x.value) }]
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
			label: m.reports_stock_value_now(),
			value: data.stock.total,
			format: 'money',
			group: 'stock',
			hint: m.reports_stock_value_now_hint()
		},
		{
			key: 'items',
			label: m.reports_items_in_stock(),
			value: data.stock.items.length,
			format: 'count',
			group: 'stock'
		},
		{
			key: 'expired',
			label: m.reports_expired_held(),
			value: data.stock.expiredValue,
			format: 'money',
			group: 'stock',
			tone: data.stock.expiredValue > 0 ? 'negative' : 'neutral',
			hint: m.reports_expired_held_hint()
		},
		{
			key: 'waste',
			label: m.reports_written_off(),
			value: wasteTotal,
			format: 'money',
			group: 'stock',
			tone: wasteTotal > 0 ? 'warning' : 'neutral'
		}
	]);

	const flowTiles = $derived<Stat[]>([
		{
			key: 'in',
			label: m.common_move_receipt(),
			value: received,
			format: 'money',
			group: 'flow',
			tone: 'positive',
			hint: m.reports_received_hint()
		},
		{
			key: 'out',
			label: m.common_move_issue(),
			value: issued,
			format: 'money',
			group: 'flow',
			hint: m.reports_issued_hint()
		},
		{
			key: 'adj',
			label: m.common_move_adjustment_out(),
			value: data.movements.adjustedOut.reduce((s, v) => s + v, 0),
			format: 'money',
			group: 'flow',
			tone: 'warning',
			hint: m.reports_adjusted_hint()
		}
	]);

	const flowChart = $derived<ReportChartData>({
		key: 'flow',
		title: m.reports_flow_title(),
		description: data.movements.byDay ? m.reports_flow_desc_day() : m.reports_flow_desc_month(),
		group: 'flow',
		kind: 'bar',
		money: true,
		wide: true,
		labels: data.movements.labels,
		series: [
			{ label: m.common_move_receipt(), data: data.movements.received },
			{ label: m.common_move_issue(), data: data.movements.issued },
			{ label: m.common_move_adjustment_out(), data: data.movements.adjustedOut }
		]
	});

	const topChart = $derived<ReportChartData>({
		key: 'top',
		title: m.reports_top_issued(),
		description: m.reports_top_issued_desc(),
		group: 'flow',
		kind: 'bar',
		money: true,
		wide: true,
		labels: data.issued.slice(0, 10).map((i) => i.item),
		series: [{ label: m.common_move_issue(), data: data.issued.slice(0, 10).map((i) => i.value) }]
	});

	const supplierChart = $derived<ReportChartData>({
		key: 'suppliers',
		title: m.reports_by_supplier(),
		description: m.reports_by_supplier_desc(),
		group: 'purchasing',
		kind: 'bar',
		money: true,
		wide: true,
		labels: data.suppliers.slice(0, 12).map((s) => s.supplier),
		series: [
			{ label: m.reports_delivered(), data: data.suppliers.slice(0, 12).map((s) => s.delivered) },
			{ label: m.reports_ordered(), data: data.suppliers.slice(0, 12).map((s) => s.orderedValue) }
		]
	});

	const wasteTiles = $derived<Stat[]>([
		{
			key: 'waste-total',
			label: m.reports_written_off(),
			value: wasteTotal,
			format: 'money',
			group: 'waste',
			tone: wasteTotal > 0 ? 'warning' : 'neutral',
			hint: (data.waste.rows.length === 1 ? m.reports_line_one : m.reports_line_many)({
				count: data.waste.rows.length
			})
		}
	]);

	const moneyTiles = $derived<Stat[]>(
		data.money
			? [
					{
						key: 'in',
						label: m.reports_money_in(),
						value: data.money.totalIn,
						format: 'money',
						group: 'money',
						tone: 'positive'
					},
					{
						key: 'out',
						label: m.reports_money_out(),
						value: data.money.totalOut,
						format: 'money',
						group: 'money',
						tone: 'negative'
					},
					{
						key: 'net',
						label: m.reports_net(),
						value: data.money.totalIn - data.money.totalOut,
						format: 'money',
						group: 'money'
					}
				]
			: []
	);

	const vat = $derived(data.vat?.totals);
	const vatTiles = $derived<Stat[]>(
		vat
			? [
					{
						key: 'out',
						label: m.reports_output_vat(),
						value: vat.outputVat,
						format: 'money',
						group: 'tax',
						hint: m.reports_output_vat_hint({ amount: formatETB(vat.salesNet) })
					},
					{
						key: 'in',
						label: m.reports_input_vat(),
						value: vat.inputVat,
						format: 'money',
						group: 'tax',
						hint: m.reports_input_vat_hint({ amount: formatETB(vat.purchasesNet) })
					},
					{
						key: 'payable',
						label: vat.payable >= 0 ? m.reports_vat_payable() : m.reports_vat_carry(),
						value: Math.abs(vat.payable),
						format: 'money',
						group: 'tax',
						tone: vat.payable > 0 ? 'negative' : 'positive',
						hint: m.reports_vat_payable_hint()
					}
				]
			: []
	);
	const totTiles = $derived<Stat[]>(
		vat?.tot
			? [
					{
						key: 'tot',
						label: m.reports_tot(),
						value: vat.tot,
						format: 'money',
						group: 'tax',
						tone: 'negative',
						hint: m.reports_tot_hint()
					}
				]
			: []
	);

	const withheld = $derived(data.withholding?.totals);
	const withholdingTiles = $derived<Stat[]>(
		withheld
			? [
					{
						key: 'byUs',
						label: m.reports_withheld_by_you(),
						value: withheld.byUs,
						format: 'money',
						group: 'tax',
						tone: withheld.byUs ? 'warning' : 'neutral',
						hint: m.reports_withheld_by_you_hint()
					},
					{
						key: 'fromUs',
						label: m.reports_withheld_from_you(),
						value: withheld.fromUs,
						format: 'money',
						group: 'tax',
						tone: 'positive',
						hint: m.reports_withheld_from_you_hint()
					},
					{
						key: 'missing',
						label: m.reports_missing_receipts(),
						value: withheld.missingReceipts,
						format: 'count',
						group: 'tax',
						tone: withheld.missingReceipts ? 'negative' : 'neutral'
					}
				]
			: []
	);

	const moneyChart = $derived<ReportChartData | null>(
		data.money && {
			key: 'money',
			title: m.reports_money_title(),
			description: data.movements.byDay ? m.reports_money_desc_day() : m.reports_money_desc_month(),
			group: 'money',
			kind: 'bar',
			money: true,
			wide: true,
			labels: data.money.labels,
			series: [
				{ label: m.reports_in(), data: data.money.moneyIn },
				{ label: m.reports_out(), data: data.money.moneyOut }
			]
		}
	);
</script>

<div class="flex flex-col gap-6">
	<PageHeader
		title={m.nav_reports()}
		description={m.reports_intro({ from: ethiopian(f.from), to: ethiopian(f.to) })}
	/>

	<Card.Root>
		<Card.Content class="flex flex-wrap items-center gap-2 pt-6">
			<span class="mr-2 text-sm text-muted-foreground">{m.reports_analysis()}</span>
			{#each ANALYSIS as a (a.href)}
				<Button href={resolve(a.href)} size="sm" variant="outline">{a.label()}</Button>
			{/each}
		</Card.Content>
	</Card.Root>

	<ReportFilterBar branches={data.branches} branchId={f.branchId} from={f.from} to={f.to}>
		<input type="hidden" name="tab" value={tab} />
		{#snippet after()}
			<DatePresets presets={data.presets} from={f.from} to={f.to} {href} />
		{/snippet}
	</ReportFilterBar>

	<Tabs.Root bind:value={tab}>
		<Tabs.List class="flex h-auto flex-wrap">
			<Tabs.Trigger value="stock">{m.reports_tab_stock()}</Tabs.Trigger>
			<Tabs.Trigger value="flow">{m.reports_tab_flow()}</Tabs.Trigger>
			<Tabs.Trigger value="purchasing">{m.nav_purchasing()}</Tabs.Trigger>
			<Tabs.Trigger value="waste">{m.reports_tab_waste()}</Tabs.Trigger>
			{#if data.money}<Tabs.Trigger value="money">{m.reports_tab_money()}</Tabs.Trigger>{/if}
			{#if data.vat}<Tabs.Trigger value="tax">{m.reports_tab_tax()}</Tabs.Trigger>{/if}
		</Tabs.List>

		<Tabs.Content value="stock" class="flex flex-col gap-4 pt-2">
			<StatGrid stats={stockTiles} />
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportChart
					chart={slices(
						'category',
						m.reports_by_category_title(),
						data.stock.byCategory,
						m.reports_at_average_cost()
					)}
				/>
				<ReportChart
					chart={slices(
						'location',
						m.reports_by_location_title(),
						data.stock.byLocation,
						m.reports_at_average_cost()
					)}
				/>
			</div>
			<ReportTable
				data={data.stock.items}
				columns={valuationColumns}
				variant="list"
				fileName={m.reports_file_valuation({ date: f.to })}
				facetKeys={['category']}
			/>
		</Tabs.Content>

		<Tabs.Content value="flow" class="flex flex-col gap-4 pt-2">
			<StatGrid stats={flowTiles} columns={3} />
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportChart chart={flowChart} />
				<ReportChart chart={topChart} />
			</div>
			<ReportTable
				title={m.reports_top_issued()}
				data={data.issued}
				columns={issuedColumns}
				fileName={m.reports_file_most_issued({ period })}
			/>
			<ReportTable
				title={m.reports_by_kind()}
				data={data.movements.byKind}
				columns={kindColumns}
				fileName={m.reports_file_movements({ period })}
			/>
			{#if data.byCustomer}
				<PageSection title={m.reports_by_customer()}>
					<div class="grid gap-4 lg:grid-cols-2">
						<ReportChart
							chart={slices(
								'customers',
								m.reports_by_customer(),
								data.byCustomer.map((c) => ({ label: c.customer, value: c.value })),
								m.reports_by_customer_desc()
							)}
						/>
						<ReportTable
							data={data.byCustomer}
							columns={customerColumns}
							fileName={m.reports_file_by_customer({ period })}
						/>
					</div>
				</PageSection>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="purchasing" class="flex flex-col gap-4 pt-2">
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportChart chart={supplierChart} />
			</div>
			<p class="text-sm text-muted-foreground">{m.reports_fill_rate_note()}</p>
			<ReportTable
				data={data.suppliers}
				columns={supplierColumns}
				fileName={m.reports_file_suppliers({ period })}
			/>
		</Tabs.Content>

		<Tabs.Content value="waste" class="flex flex-col gap-4 pt-2">
			<div class="grid gap-4 lg:grid-cols-2">
				<ReportChart
					chart={slices(
						'reason',
						m.reports_by_reason(),
						data.waste.byReason,
						m.reports_by_reason_desc()
					)}
				/>
				<StatGrid stats={wasteTiles} columns={1} />
			</div>
			<ReportTable
				data={data.waste.rows}
				columns={wasteColumns}
				variant="list"
				fileName={m.reports_file_wastage({ period })}
				facetKeys={['reasonName', 'location']}
			/>
		</Tabs.Content>

		{#if data.money && moneyChart}
			<Tabs.Content value="money" class="flex flex-col gap-4 pt-2">
				<StatGrid stats={moneyTiles} columns={3} />
				<div class="grid gap-4 lg:grid-cols-2">
					<ReportChart chart={moneyChart} />
					<ReportChart
						chart={slices(
							'purpose',
							m.reports_out_by_purpose(),
							data.money.byPurpose
								.filter((p) => p.out > 0)
								.map((p) => ({ label: purposeName(p.label), value: p.out }))
						)}
					/>
					<ReportChart
						chart={slices(
							'method',
							m.reports_in_by_method(),
							data.money.byMethod
								.filter((x) => x.in > 0)
								.map((x) => ({ label: x.label, value: x.in }))
						)}
					/>
				</div>
				<ReportTable
					title={m.reports_by_purpose()}
					data={data.money.byPurpose.map((p) => ({ ...p, label: purposeName(p.label) }))}
					columns={splitColumns(m.reports_col_purpose)}
					fileName={m.reports_file_money_purpose({ period })}
				/>
				<ReportTable
					title={m.reports_by_method()}
					data={data.money.byMethod}
					columns={splitColumns(m.reports_col_method)}
					fileName={m.reports_file_money_method({ period })}
				/>
				<p class="text-sm text-muted-foreground">
					{m.reports_money_note_before()}
					<a class="underline underline-offset-4" href={resolve('/dashboard/transactions')}
						>{m.nav_transactions()}</a
					>
					{m.reports_money_note_after()}
				</p>
			</Tabs.Content>
		{/if}
		{#if data.vat && data.withholding}
			<Tabs.Content value="tax" class="flex flex-col gap-4 pt-2">
				<p class="text-sm text-muted-foreground">{m.reports_tax_note()}</p>
				<StatGrid stats={vatTiles} columns={3} />
				<StatGrid stats={totTiles} columns={1} />
				<ReportTable
					title={m.reports_sales_register()}
					data={data.vat.sales}
					columns={registerColumns}
					fileName={m.reports_file_vat_sales({ period })}
				/>
				<ReportTable
					title={m.reports_purchase_register()}
					data={data.vat.purchases}
					columns={registerColumns}
					fileName={m.reports_file_vat_purchases({ period })}
				/>
				<StatGrid stats={withholdingTiles} columns={3} />
				<ReportTable
					title={m.reports_withheld_by_you()}
					data={data.withholding.byUs}
					columns={withholdingColumns}
					fileName={m.reports_file_wh_by_us({ period })}
				/>
				<ReportTable
					title={m.reports_withheld_from_you()}
					data={data.withholding.fromUs}
					columns={withholdingColumns}
					fileName={m.reports_file_wh_from_us({ period })}
				/>
			</Tabs.Content>
		{/if}
	</Tabs.Root>
</div>
