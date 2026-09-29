<script lang="ts">
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
	<title>Labels & barcodes</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Labels & barcodes</h1>
		<p class="text-muted-foreground">
			Shelf labels show the name, the price the customer pays and the barcode. Item labels are
			small, for sticking on the goods. Items with no barcode print their SKU as a Code 128 barcode,
			which a scanner reads too.
		</p>
		{#if bare}
			<p class="mt-2 text-sm">
				{bare} item(s) have no barcode.
				{#if data.canManage}
					<a
						class="text-primary underline-offset-4 hover:underline"
						href={resolve('/dashboard/items')}>Give them in-store barcodes</a
					> on the items page first, so they print scannable EAN-13 codes.
				{/if}
			</p>
		{/if}
	</div>

	<fieldset class="flex flex-wrap gap-2">
		<legend class="mb-2 text-sm font-medium">Label</legend>
		<label
			class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5"
		>
			<input type="radio" name="type" value="shelf" bind:group={type} /> Shelf label (63.5 × 38.1 mm,
			21 per A4)
		</label>
		<label
			class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5"
		>
			<input type="radio" name="type" value="item" bind:group={type} /> Item label (38.1 × 21.2 mm, 65
			per A4)
		</label>
	</fieldset>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Choose items</Card.Title>
				<Card.Description
					>Search, then give each item the number of labels it needs.</Card.Description
				>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<Input placeholder="Name or SKU" bind:value={search} aria-label="Search items" />
				<ul class="flex max-h-96 flex-col divide-y overflow-y-auto rounded-md border">
					{#each matches as i (i.id)}
						<li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
							<span>
								{i.name}{i.variantLabel ? ` — ${i.variantLabel}` : ''}
								<span class="text-muted-foreground">· {i.sku}</span>
								{#if !i.hasBarcode}<span class="text-xs text-muted-foreground">
										· no barcode</span
									>{/if}
							</span>
							<Input
								type="number"
								min="0"
								max="500"
								class="w-20"
								aria-label="Labels for {i.name}"
								value={copies[i.id] ?? 0}
								oninput={(e) => setCopies(i.id, e.currentTarget.value)}
							/>
						</li>
					{:else}
						<li class="px-3 py-6 text-center text-sm text-muted-foreground">No item matches.</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		<div class="flex flex-col gap-4">
			<Card.Root>
				<Card.Header>
					<Card.Title>To print</Card.Title>
					<Card.Description>
						{chosen.length
							? `${total} label(s) for ${chosen.length} item(s)`
							: 'Nothing chosen yet.'}
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
										aria-label="Remove {i.name}"
										onclick={() => setCopies(i.id, '0')}
									>
										<X class="size-4" />
									</Button>
								</li>
							{/each}
						</ul>
						<div>
							<Button href={printUrl} target="_blank"><Printer class="size-4" /> Print sheet</Button
							>
						</div>
					</Card.Content>
				{/if}
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Or label a delivery</Card.Title>
					<Card.Description>One label for every unit a posted receipt brought in.</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3">
					<div class="flex flex-col gap-2">
						<Label for="receipt">Receipt</Label>
						<select
							id="receipt"
							bind:value={receipt}
							class="h-9 rounded-md border bg-background px-3 text-sm"
						>
							<option value="">— Choose a receipt —</option>
							{#each data.receipts as r (r.id)}
								<option value={String(r.id)}>{r.number} · {r.docDate} · {r.supplier ?? ''}</option>
							{/each}
						</select>
					</div>
					<div>
						<Button href={receipt ? receiptUrl : undefined} disabled={!receipt} target="_blank">
							<Printer class="size-4" /> Print its labels
						</Button>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
