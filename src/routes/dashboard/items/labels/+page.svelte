<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import Printer from '@lucide/svelte/icons/printer';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import { formatETB } from '@nahu/admin-kit/global';

	let { data } = $props();

	let type = $state<'shelf' | 'item'>('shelf');
	let search = $state('');
	/** Copies per item id; an item is chosen while it has any. */
	let copies = $state<Record<number, number>>({});
	let receipt = $state('');

	const matches = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = q
			? data.items.filter(
					(i) =>
						i.name.toLowerCase().includes(q) ||
						i.sku.toLowerCase().includes(q) ||
						(i.variantLabel ?? '').toLowerCase().includes(q)
				)
			: data.items;
		return list.slice(0, 50);
	});
	const chosen = $derived(data.items.filter((i) => (copies[i.id] ?? 0) > 0));
	const total = $derived(chosen.reduce((s, i) => s + copies[i.id], 0));
	const bare = $derived(data.items.filter((i) => !i.hasBarcode).length);

	const printUrl = $derived(
		`${resolve('/dashboard/items/labels/print')}?type=${type}&pick=${chosen
			.map((i) => `${i.id}:${copies[i.id]}`)
			.join(',')}`
	);
	const receiptUrl = $derived(
		`${resolve('/dashboard/items/labels/print')}?type=${type}&document=${receipt}`
	);

	const setCopies = (id: number, value: string) => {
		const n = Math.max(0, Math.min(500, Math.floor(Number(value) || 0)));
		copies = { ...copies, [id]: n };
	};
</script>

<svelte:head>
	<title>{m.stock_labels_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">{m.stock_labels_title()}</h1>
		<p class="text-muted-foreground">
			{m.stock_labels_intro()}
		</p>
		{#if bare}
			<p class="mt-2 text-sm">
				{m.stock_labels_bare({ count: bare })}
				{#if data.canManage}
					<a
						class="text-primary underline-offset-4 hover:underline"
						href={resolve('/dashboard/items')}>{m.stock_labels_give()}</a
					>
					{m.stock_labels_give_after()}
				{/if}
			</p>
		{/if}
	</div>

	<fieldset class="flex flex-wrap gap-2">
		<legend class="mb-2 text-sm font-medium">{m.stock_label()}</legend>
		<label
			class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5"
		>
			<input type="radio" name="type" value="shelf" bind:group={type} />
			{m.stock_shelf_label()}
		</label>
		<label
			class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5"
		>
			<input type="radio" name="type" value="item" bind:group={type} />
			{m.stock_item_label()}
		</label>
	</fieldset>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.stock_choose_items()}</Card.Title>
				<Card.Description>{m.stock_choose_items_hint()}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Input
					placeholder={m.stock_name_or_sku()}
					bind:value={search}
					aria-label={m.stock_search_items()}
				/>
				<ul class="flex max-h-96 flex-col divide-y overflow-y-auto rounded-md border">
					{#each matches as i (i.id)}
						<li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
							<span>
								{i.name}{i.variantLabel ? ` — ${i.variantLabel}` : ''}
								<span class="text-muted-foreground">· {i.sku}</span>
								{#if !i.hasBarcode}<span class="text-xs text-muted-foreground">
										{m.stock_no_barcode()}</span
									>{/if}
							</span>
							<Input
								type="number"
								min="0"
								max="500"
								class="w-20"
								aria-label={m.stock_labels_for({ item: i.name })}
								value={copies[i.id] ?? 0}
								oninput={(e) => setCopies(i.id, e.currentTarget.value)}
							/>
						</li>
					{:else}
						<li class="px-3 py-6 text-center text-sm text-muted-foreground">
							{m.stock_no_item_matches()}
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		<div class="flex flex-col gap-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.stock_to_print()}</Card.Title>
					<Card.Description>
						{chosen.length
							? m.stock_labels_summary({ labels: total, items: chosen.length })
							: m.stock_nothing_chosen()}
					</Card.Description>
				</Card.Header>
				{#if chosen.length}
					<Card.Content class="flex flex-col gap-3">
						<ul class="flex flex-col divide-y rounded-md border text-sm">
							{#each chosen as i (i.id)}
								<li class="flex items-center justify-between gap-2 px-3 py-1.5">
									<span
										>{copies[i.id]} × {i.name}{#if i.salePrice !== null}
											<span class="text-muted-foreground">· {formatETB(i.salePrice)}</span
											>{/if}</span
									>
									<Button
										variant="ghost"
										size="icon"
										aria-label={m.stock_remove_item({ item: i.name })}
										onclick={() => setCopies(i.id, '0')}
									>
										<X class="size-4" />
									</Button>
								</li>
							{/each}
						</ul>
						<div>
							<Button href={printUrl} target="_blank"
								><Printer class="size-4" /> {m.stock_print_sheet()}</Button
							>
						</div>
					</Card.Content>
				{/if}
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>{m.stock_label_delivery()}</Card.Title>
					<Card.Description>{m.stock_label_delivery_hint()}</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3">
					<div class="flex flex-col gap-2">
						<Label for="receipt">{m.stock_receipt()}</Label>
						<select
							id="receipt"
							bind:value={receipt}
							class="h-9 rounded-md border bg-background px-3 text-sm"
						>
							<option value="">{m.stock_choose_receipt()}</option>
							{#each data.receipts as r (r.id)}
								<option value={String(r.id)}>{r.number} · {r.docDate} · {r.supplier ?? ''}</option>
							{/each}
						</select>
					</div>
					<div>
						<Button href={receipt ? receiptUrl : undefined} disabled={!receipt} target="_blank">
							<Printer class="size-4" />
							{m.stock_print_its_labels()}
						</Button>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
