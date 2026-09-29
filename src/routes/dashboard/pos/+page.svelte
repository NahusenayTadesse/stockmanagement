<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import { resolve } from '$app/paths';
	import Banknote from '@lucide/svelte/icons/banknote';
	import Minus from '@lucide/svelte/icons/minus';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import Plus from '@lucide/svelte/icons/plus';
	import Printer from '@lucide/svelte/icons/printer';
	import ScanBarcode from '@lucide/svelte/icons/scan-barcode';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';
	import * as Dialog from '@nahu/admin-kit/components/ui/dialog/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { formatETB } from '@nahu/admin-kit/global';
	import { ethiopianDateTime } from '@nahu/admin-kit/tableCells';
	import { lineAmounts, saleTotRate, saleVatRate, type TaxCode } from '$lib/taxRules';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime';

	let { data, form } = $props();

	type Item = NonNullable<typeof data.items>[number];
	type Line = {
		key: number;
		itemId: number;
		uomId: number;
		quantity: number;
		unitPrice: number;
		/** Typed in by the seller: kept when the customer (and so the price list) changes. */
		manual: boolean;
		serials: string;
	};
	type Payment = { methodId: number; amount: number; reference: string };

	const items = $derived(data.items ?? []);
	/** The Amharic name in the Amharic interface, where the item has one. */
	const amharic = getLocale() === 'am';
	const nameOf = (it: { name: string; nameAm?: string | null }) =>
		amharic && it.nameAm ? it.nameAm : it.name;
	const byId = $derived(new Map(items.map((i) => [i.id, i])));

	// ── Cart ────────────────────────────────────────────────────────────────────────────────
	let cart = $state<Line[]>([]);
	let customerId = $state(0);
	let note = $state('');
	/** A walk-in who wants the receipt by SMS gives a number. */
	let smsTo = $state('');
	let nextKey = 1;

	const customer = $derived(data.customers?.find((c) => c.value === customerId) ?? null);
	const priceKey = $derived(customer?.priceListId ? String(customer.priceListId) : 'list');

	function listPrice(itemId: number, uomId: number) {
		const key = `${itemId}:${uomId}`;
		return data.priceTables?.[priceKey]?.[key] ?? data.priceTables?.list?.[key] ?? null;
	}

	// A new customer may mean a price list: reprice every line the seller did not price by hand.
	$effect(() => {
		void priceKey;
		for (const l of cart) {
			if (!l.manual) l.unitPrice = listPrice(l.itemId, l.uomId) ?? 0;
		}
	});

	function add(it: Item, uomId = it.baseUomId) {
		const same = cart.find((l) => l.itemId === it.id && l.uomId === uomId && !it.trackSerials);
		if (same) {
			same.quantity += 1;
		} else {
			cart.push({
				key: nextKey++,
				itemId: it.id,
				uomId,
				quantity: 1,
				unitPrice: listPrice(it.id, uomId) ?? 0,
				manual: false,
				serials: ''
			});
		}
		result = null;
	}

	function setUnit(l: Line, uomId: number) {
		l.uomId = uomId;
		if (!l.manual) l.unitPrice = listPrice(l.itemId, uomId) ?? 0;
	}

	const serialList = (l: Line) =>
		l.serials
			.split(/[\n,]/)
			.map((s) => s.trim())
			.filter(Boolean);

	// ── Totals, as posting will work them out ─────────────────────────────────────────────
	const rows = $derived(
		cart.map((l) => {
			const it = byId.get(l.itemId)!;
			const qty = it?.trackSerials ? serialList(l).length : l.quantity;
			const vat = saleVatRate(data.tax!, it.taxCode as TaxCode);
			const tot = saleTotRate(data.tax!, it.totRate);
			const list = listPrice(l.itemId, l.uomId);
			const off = list && l.unitPrice < list ? Math.round((1 - l.unitPrice / list) * 1000) / 10 : 0;
			return {
				line: l,
				it,
				qty,
				list,
				off,
				tooMuch:
					off > 0 &&
					!data.canDiscount &&
					data.maxDiscountPercent != null &&
					off > data.maxDiscountPercent,
				...lineAmounts(qty, l.unitPrice, vat, tot)
			};
		})
	);
	const sum = (k: 'net' | 'vat' | 'tot' | 'gross') =>
		Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;
	const totals = $derived({
		net: sum('net'),
		vat: sum('vat'),
		tot: sum('tot'),
		gross: sum('gross')
	});
	const problems = $derived(
		rows.flatMap((r) => [
			...(r.it.trackSerials && r.qty === 0
				? [m.sales_pos_problem_serials({ name: nameOf(r.it) })]
				: []),
			...(r.tooMuch
				? [
						m.sales_pos_problem_discount({
							off: r.off,
							name: nameOf(r.it),
							limit: data.maxDiscountPercent ?? 0
						})
					]
				: []),
			...(r.line.unitPrice === 0 && !data.canDiscount
				? [m.sales_pos_problem_no_price({ name: nameOf(r.it) })]
				: [])
		])
	);

	// ── Finding items ───────────────────────────────────────────────────────────────────────
	let search = $state('');
	let category = $state('');
	let searchBox = $state<HTMLInputElement>();
	const categories = $derived(
		[...new Set(items.map((i) => i.category).filter(Boolean))].sort() as string[]
	);
	const shown = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return items
			.filter((i) => !category || i.category === category)
			.filter(
				(i) =>
					!q ||
					`${i.name} ${i.nameAm ?? ''} ${i.sku}`.toLowerCase().includes(q) ||
					i.barcodes.some((b) => b.code.toLowerCase() === q)
			)
			.slice(0, 60);
	});

	/** Enter in the search box: a scanned barcode or typed code adds at once. */
	function onSearchKey(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const q = search.trim().toLowerCase();
		if (!q) return;
		for (const it of items) {
			const code = it.barcodes.find((b) => b.code.toLowerCase() === q);
			if (code) return (add(it, code.uomId ?? it.baseUomId), (search = ''));
		}
		const bySku = items.find((i) => i.sku.toLowerCase() === q);
		if (bySku) return (add(bySku), (search = ''));
		if (shown.length === 1) return (add(shown[0]), (search = ''));
	}

	// ── Paying ──────────────────────────────────────────────────────────────────────────────
	let payOpen = $state(false);
	let payments = $state<Payment[]>([]);
	let paying = $state(false);
	let result = $state<{
		documentId: number;
		number: string;
		total: number;
		paid: number;
		change: number;
		onCredit: number;
		notes: string[];
		notesFailed: boolean;
	} | null>(null);
	let tendered = $state(0);

	const cashMethod = $derived(data.methods?.find((m) => m.kind === 'cash') ?? data.methods?.[0]);
	const paid = $derived(Math.round(payments.reduce((s, p) => s + (p.amount || 0), 0) * 100) / 100);
	const change = $derived(Math.max(0, Math.round((paid - totals.gross) * 100) / 100));
	const remaining = $derived(Math.max(0, Math.round((totals.gross - paid) * 100) / 100));
	const methodKind = (id: number) => data.methods?.find((m) => m.id === id)?.kind;

	function openPay() {
		if (!cart.length || problems.length) return;
		payments = [{ methodId: cashMethod?.id ?? 0, amount: totals.gross, reference: '' }];
		payOpen = true;
	}
	const quickCash = $derived(
		[
			...new Set([
				totals.gross,
				...[50, 100, 500, 1000].map((n) => Math.ceil(totals.gross / n) * n)
			])
		]
			.filter((v) => v >= totals.gross)
			.slice(0, 5)
	);

	const payload = $derived(
		JSON.stringify({
			customerId: customerId || null,
			note: note || null,
			smsTo: smsTo.trim() || null,
			lines: cart.map((l) => {
				const it = byId.get(l.itemId)!;
				const serials = it.trackSerials ? serialList(l) : [];
				return {
					itemId: l.itemId,
					uomId: l.uomId,
					quantity: it.trackSerials ? serials.length : l.quantity,
					unitPrice: l.unitPrice,
					serials
				};
			}),
			payments: payments.map((p) => ({ ...p, amount: Number(p.amount) || 0 }))
		})
	);

	function newSale() {
		cart = [];
		customerId = 0;
		note = '';
		smsTo = '';
		result = null;
		payOpen = false;
		searchBox?.focus();
	}

	let heldOpen = $state(false);
	let holdLabel = $state('');

	function onKey(e: KeyboardEvent) {
		if (e.key === 'F2') {
			e.preventDefault();
			searchBox?.focus();
		} else if (e.key === 'F9') {
			e.preventDefault();
			openPay();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	<title>{m.sales_pos_title()}</title>
</svelte:head>

{#if !data.shift}
	<div class="mx-auto flex max-w-md flex-col gap-4 py-10">
		<PageHeader
			title={m.sales_pos_open_heading()}
			tabTitle={m.sales_pos_title()}
			description={m.sales_pos_open_intro()}
		/>
		{#if form?.refused}<p class="text-sm text-destructive">{form.refused}</p>{/if}
		<form method="POST" action="?/openShift" use:enhance class="flex flex-col gap-3">
			<label class="flex flex-col gap-1 text-sm">
				{m.sales_pos_sells_from()}
				<select name="locationId" class="h-10 rounded-md border bg-background px-2" required>
					{#each data.locations ?? [] as l (l.value)}
						<option value={l.value}>{l.name}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{m.sales_pos_opening_float()}
				<Input name="openingFloat" type="number" min="0" step="0.01" value="0" />
			</label>
			<Button type="submit"><Play /> {m.sales_pos_open_shift()}</Button>
		</form>
	</div>
{:else}
	<div class="flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
			<p class="text-muted-foreground">
				{m.sales_pos_till_at()} <strong class="text-foreground">{data.shift.location}</strong> · {m.sales_pos_shift_opened(
					{ when: ethiopianDateTime(data.shift.openedAt) }
				)}
			</p>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={() => (heldOpen = true)}>
					<Play />
					{m.sales_pos_held_carts_count({ count: data.held?.length ?? 0 })}
				</Button>
				<Button
					variant="outline"
					size="sm"
					href={resolve('/dashboard/pos/shifts/[id]', { id: String(data.shift.id) })}
					>{m.sales_pos_close_shift()}</Button
				>
			</div>
		</div>

		<div class="grid gap-4 lg:grid-cols-[1fr_440px]">
			<!-- Items -->
			<section class="flex min-w-0 flex-col gap-3">
				<div class="relative">
					<ScanBarcode class="absolute top-2.5 left-3 size-5 text-muted-foreground" />
					<Input
						bind:ref={searchBox}
						bind:value={search}
						onkeydown={onSearchKey}
						placeholder={m.sales_pos_search_placeholder()}
						class="h-10 pl-10 text-base"
						autofocus
					/>
				</div>
				{#if categories.length > 1}
					<div class="flex flex-wrap gap-1">
						<Button
							size="sm"
							variant={category ? 'outline' : 'default'}
							onclick={() => (category = '')}>{m.common_all()}</Button
						>
						{#each categories as c (c)}
							<Button
								size="sm"
								variant={category === c ? 'default' : 'outline'}
								onclick={() => (category = category === c ? '' : c)}>{c}</Button
							>
						{/each}
					</div>
				{/if}
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
					{#each shown as it (it.id)}
						{@const price = listPrice(it.id, it.baseUomId)}
						<button
							type="button"
							onclick={() => add(it)}
							disabled={it.onHand !== null && it.onHand <= 0}
							class="flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition hover:border-primary hover:shadow-sm disabled:opacity-40"
						>
							<span class="line-clamp-2 font-medium">{nameOf(it)}</span>
							<span class="text-xs text-muted-foreground">{it.sku}</span>
							<span class="mt-auto flex w-full items-end justify-between gap-1">
								<span class="font-semibold">{price === null ? '—' : formatETB(price)}</span>
								{#if it.onHand === null}
									<span class="text-xs text-muted-foreground"
										>{it.kind === 'kit' ? m.sales_pos_kit() : m.sales_pos_service()}</span
									>
								{:else}
									<span
										class="text-xs {it.onHand <= 0 ? 'text-destructive' : 'text-muted-foreground'}"
										>{it.onHand} {it.kind === 'kit' ? m.sales_pos_can_be_made() : it.unit}</span
									>
								{/if}
							</span>
						</button>
					{:else}
						<p class="col-span-full py-8 text-center text-muted-foreground">
							{m.sales_pos_nothing_matches()}
						</p>
					{/each}
				</div>
			</section>

			<!-- Cart -->
			<section class="flex flex-col gap-3 rounded-lg border p-3 lg:sticky lg:top-20 lg:self-start">
				{#if data.customers}
					<label class="flex flex-col gap-1 text-sm">
						{m.sales_pos_customer_optional()}
						<select bind:value={customerId} class="h-9 rounded-md border bg-background px-2">
							<option value={0}>{m.sales_pos_walk_in()}</option>
							{#each data.customers as c (c.value)}
								<option value={c.value}>{c.name}</option>
							{/each}
						</select>
					</label>
				{/if}

				<ul class="flex max-h-[45vh] flex-col divide-y overflow-y-auto">
					{#each rows as r (r.line.key)}
						<li class="flex flex-col gap-1 py-2">
							<div class="flex items-start justify-between gap-2">
								<span class="text-sm font-medium">{nameOf(r.it)}</span>
								<button
									type="button"
									aria-label={m.sales_pos_remove_item({ name: nameOf(r.it) })}
									class="text-muted-foreground hover:text-destructive"
									onclick={() => (cart = cart.filter((l) => l.key !== r.line.key))}
									><Trash2 class="size-4" /></button
								>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								{#if r.it.trackSerials}
									<textarea
										bind:value={r.line.serials}
										rows="2"
										placeholder={m.sales_pos_serials_placeholder()}
										aria-label={m.sales_pos_serials_of({ name: nameOf(r.it) })}
										class="w-44 rounded-md border bg-background px-2 py-1 font-mono text-xs"
									></textarea>
								{:else}
									<div class="flex items-center">
										<Button
											size="icon"
											variant="outline"
											class="size-8"
											aria-label={m.sales_pos_one_less()}
											onclick={() => (r.line.quantity = Math.max(0.001, r.line.quantity - 1))}
											><Minus /></Button
										>
										<input
											type="number"
											min="0"
											step="any"
											bind:value={r.line.quantity}
											aria-label={m.sales_pos_quantity_of({ name: nameOf(r.it) })}
											class="h-8 w-16 border-y bg-background text-center"
										/>
										<Button
											size="icon"
											variant="outline"
											class="size-8"
											aria-label={m.sales_pos_one_more()}
											onclick={() => (r.line.quantity += 1)}><Plus /></Button
										>
									</div>
								{/if}
								{#if r.it.units.length > 1}
									<select
										value={r.line.uomId}
										onchange={(e) => setUnit(r.line, Number(e.currentTarget.value))}
										aria-label={m.common_unit()}
										class="h-8 rounded-md border bg-background px-1 text-sm"
									>
										{#each r.it.units as u (u.uomId)}
											<option value={u.uomId}>{u.unit}</option>
										{/each}
									</select>
								{:else}
									<span class="text-xs text-muted-foreground">{r.it.unit}</span>
								{/if}
								<span class="text-xs text-muted-foreground">×</span>
								<input
									type="number"
									min="0"
									step="0.01"
									value={r.line.unitPrice}
									oninput={(e) => {
										r.line.unitPrice = Number(e.currentTarget.value) || 0;
										r.line.manual = true;
									}}
									aria-label={m.sales_pos_price_of({ name: nameOf(r.it) })}
									class="h-8 w-24 rounded-md border bg-background px-2 text-right {r.tooMuch
										? 'border-destructive'
										: ''}"
								/>
								<span class="ml-auto text-sm font-medium">{formatETB(r.gross)}</span>
							</div>
							{#if r.off > 0}
								<span class="text-xs {r.tooMuch ? 'text-destructive' : 'text-muted-foreground'}"
									>{m.sales_pos_percent_off({ off: r.off, list: formatETB(r.list) })}</span
								>
							{/if}
						</li>
					{:else}
						<li class="py-8 text-center text-sm text-muted-foreground">
							{m.sales_pos_cart_empty()}
						</li>
					{/each}
				</ul>

				<dl class="grid grid-cols-2 gap-1 border-t pt-2 text-sm">
					<dt class="text-muted-foreground">{m.sales_pos_before_tax()}</dt>
					<dd class="text-right">{formatETB(totals.net)}</dd>
					{#if totals.vat}
						<dt class="text-muted-foreground">{m.sales_vat()}</dt>
						<dd class="text-right">{formatETB(totals.vat)}</dd>
					{/if}
					{#if totals.tot}
						<dt class="text-muted-foreground">{m.sales_tot()}</dt>
						<dd class="text-right">{formatETB(totals.tot)}</dd>
					{/if}
					<dt class="text-lg font-semibold">{m.common_total()}</dt>
					<dd class="text-right text-lg font-semibold">{formatETB(totals.gross)}</dd>
				</dl>

				{#each problems as p (p)}<p class="text-xs text-destructive">{p}</p>{/each}

				<div class="grid grid-cols-[auto_auto_1fr] gap-2">
					<Button
						variant="outline"
						onclick={newSale}
						disabled={!cart.length}
						aria-label={m.sales_pos_clear_cart()}><X /></Button
					>
					<form
						method="POST"
						action="?/hold"
						use:enhance={() =>
							async ({ result: r, update }) => {
								if (r.type === 'success') newSale();
								await update({ reset: false });
							}}
					>
						<input type="hidden" name="cart" value={JSON.stringify({ cart, customerId, note })} />
						<input type="hidden" name="customerId" value={customerId} />
						<input
							type="hidden"
							name="label"
							value={holdLabel ||
								m.sales_pos_hold_label({
									customer: customer?.name ?? m.sales_pos_walk_in(),
									count: cart.length
								})}
						/>
						<Button type="submit" variant="outline" disabled={!cart.length}
							><Pause /> {m.sales_pos_hold()}</Button
						>
					</form>
					<Button
						size="lg"
						onclick={openPay}
						disabled={!cart.length || problems.length > 0}
						class="text-base"
					>
						<Banknote />
						{m.sales_pos_pay({ amount: formatETB(totals.gross) })}
					</Button>
				</div>
				<Input bind:value={note} placeholder={m.sales_pos_note_placeholder()} class="h-8 text-sm" />
			</section>
		</div>
	</div>

	<!-- Payment -->
	<Dialog.Root bind:open={payOpen}>
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title
					>{result
						? m.sales_pos_sold({ number: result.number })
						: m.sales_pos_take({ amount: formatETB(totals.gross) })}</Dialog.Title
				>
			</Dialog.Header>

			{#if result}
				<div class="flex flex-col gap-3">
					{#if result.change > 0}
						<p class="rounded-md bg-emerald-500/10 p-4 text-center text-2xl font-semibold">
							{m.sales_pos_change({ amount: formatETB(result.change) })}
						</p>
					{/if}
					{#if result.onCredit > 0}
						<p class="text-sm">
							{m.sales_pos_went_on_account({
								amount: formatETB(result.onCredit),
								customer: customer?.name ?? ''
							})}
						</p>
					{/if}
					{#each result.notes as n (n)}
						<p class="text-sm {result.notesFailed ? 'text-destructive' : 'text-muted-foreground'}">
							{n}
						</p>
					{/each}
					<div class="flex gap-2">
						<Button
							href="{resolve('/dashboard/pos/receipt/[id]', {
								id: String(result.documentId)
							})}?tendered={tendered}&change={result.change}"
							target="_blank"
							variant="outline"><Printer /> {m.sales_pos_receipt()}</Button
						>
						<Button class="flex-1" onclick={newSale}>{m.sales_pos_new_sale()}</Button>
					</div>
				</div>
			{:else}
				<form
					method="POST"
					action="?/checkout"
					class="flex flex-col gap-3"
					use:enhance={() => {
						paying = true;
						tendered = paid;
						return async ({ result: r, update }) => {
							paying = false;
							if (r.type === 'success' && r.data?.sale) {
								result = r.data.sale as typeof result;
							}
							await update({ reset: false });
						};
					}}
				>
					<input type="hidden" name="payload" value={payload} />
					{#each payments as p, i (i)}
						<div class="grid grid-cols-[1fr_120px_auto] items-center gap-2">
							<select bind:value={p.methodId} class="h-10 rounded-md border bg-background px-2">
								{#each data.methods ?? [] as method (method.id)}
									<option value={method.id}>{method.name}</option>
								{/each}
							</select>
							<Input
								type="number"
								min="0"
								step="0.01"
								bind:value={p.amount}
								class="h-10 text-right"
							/>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.sales_pos_remove_payment()}
								disabled={payments.length === 1}
								onclick={() => (payments = payments.filter((_, j) => j !== i))}><X /></Button
							>
							{#if methodKind(p.methodId) !== 'cash'}
								<Input
									bind:value={p.reference}
									placeholder={m.sales_reference_placeholder()}
									class="col-span-3 h-9"
								/>
							{/if}
						</div>
					{/each}
					<div class="flex flex-wrap gap-2">
						{#each quickCash as v (v)}
							<Button
								size="sm"
								variant="outline"
								onclick={() => {
									const cash = payments.find((p) => methodKind(p.methodId) === 'cash');
									if (cash) cash.amount = v;
									else payments.push({ methodId: cashMethod?.id ?? 0, amount: v, reference: '' });
								}}>{formatETB(v)}</Button
							>
						{/each}
						<Button
							size="sm"
							variant="ghost"
							onclick={() =>
								payments.push({
									methodId:
										data.methods?.find((method) => method.kind !== 'cash')?.id ??
										cashMethod?.id ??
										0,
									amount: remaining,
									reference: ''
								})}><Plus /> {m.sales_pos_split()}</Button
						>
					</div>

					{#if data.smsReceipts}
						<Input
							bind:value={smsTo}
							type="tel"
							placeholder={m.sales_pos_sms_placeholder()}
							class="h-9"
						/>
					{/if}

					<dl class="grid grid-cols-2 gap-1 text-sm">
						<dt>{m.sales_paid()}</dt>
						<dd class="text-right">{formatETB(paid)}</dd>
						{#if change > 0}
							<dt class="font-semibold">{m.sales_change()}</dt>
							<dd class="text-right text-lg font-semibold">{formatETB(change)}</dd>
						{/if}
						{#if remaining > 0}
							<dt class="font-semibold {customerId ? '' : 'text-destructive'}">
								{customerId ? m.sales_pos_on_account() : m.sales_pos_still_to_collect()}
							</dt>
							<dd class="text-right font-semibold">{formatETB(remaining)}</dd>
						{/if}
					</dl>
					{#if remaining > 0 && !customerId}
						<p class="text-xs text-muted-foreground">
							{m.sales_pos_collect_rest()}
						</p>
					{/if}
					{#if form?.refused}<p class="text-sm text-destructive">{form.refused}</p>{/if}
					<Button
						type="submit"
						size="lg"
						disabled={paying || (remaining > 0 && !customerId)}
						class="text-base">{paying ? m.sales_pos_completing() : m.sales_pos_complete()}</Button
					>
				</form>
			{/if}
		</Dialog.Content>
	</Dialog.Root>

	<!-- Held carts -->
	<Dialog.Root bind:open={heldOpen}>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header><Dialog.Title>{m.sales_pos_held_carts()}</Dialog.Title></Dialog.Header>
			<Input bind:value={holdLabel} placeholder={m.sales_pos_hold_name_placeholder()} />
			<ul class="flex flex-col divide-y">
				{#each data.held ?? [] as h (h.id)}
					<li class="flex items-center justify-between gap-2 py-2 text-sm">
						<span>
							{h.label ?? m.sales_pos_cart_number({ id: h.id })}
							<span class="block text-xs text-muted-foreground"
								>{h.by ?? '—'} · {ethiopianDateTime(h.createdAt)}</span
							>
						</span>
						<form
							method="POST"
							action="?/take"
							use:enhance={() =>
								async ({ result: r, update }) => {
									if (r.type === 'success' && r.data?.taken) {
										const taken = r.data.taken as {
											cart: Line[];
											customerId: number;
											note: string;
										};
										cart = taken.cart.map((l) => ({ ...l, key: nextKey++ }));
										customerId = taken.customerId ?? 0;
										note = taken.note ?? '';
										heldOpen = false;
									}
									await update({ reset: false });
								}}
						>
							<input type="hidden" name="id" value={h.id} />
							<Button type="submit" size="sm" disabled={cart.length > 0}
								>{m.sales_pos_take_cart()}</Button
							>
						</form>
					</li>
				{:else}
					<li class="py-4 text-center text-sm text-muted-foreground">{m.sales_pos_no_held()}</li>
				{/each}
			</ul>
			{#if cart.length}
				<p class="text-xs text-muted-foreground">{m.sales_pos_finish_first()}</p>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}
