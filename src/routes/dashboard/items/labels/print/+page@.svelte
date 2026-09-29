<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { resolve } from '$app/paths';
	import Printer from '@lucide/svelte/icons/printer';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { formatETB } from '@nahu/admin-kit/global';

	let { data } = $props();

	/** Every copy as its own label, in item order. */
	const sheet = $derived(
		data.labels.flatMap((l) =>
			Array.from({ length: l.copies }, (_, i) => ({ ...l, key: `${l.id}-${i}` }))
		)
	);
</script>

<svelte:head>
	<title>{m.stock_labels_word()}{data.source ? ` · ${data.source}` : ''}</title>
</svelte:head>

<div class="flex flex-wrap items-center gap-3 p-4 print:hidden">
	<Button onclick={() => window.print()}><Printer class="size-4" /> {m.common_print()}</Button>
	<a
		class="text-sm text-primary underline-offset-4 hover:underline"
		href={resolve('/dashboard/items/labels')}>{m.stock_back_to_labels()}</a
	>
	<span class="text-sm text-muted-foreground">
		{data.source
			? m.stock_labels_sheet_hint_for({ count: sheet.length, source: data.source })
			: m.stock_labels_sheet_hint({ count: sheet.length })}
		{#if data.truncated}{m.stock_labels_truncated()}{/if}
	</span>
</div>

{#if !sheet.length}
	<p class="p-8 text-center text-muted-foreground">{m.stock_no_labels()}</p>
{:else}
	<div class="sheet {data.type}">
		{#each sheet as l (l.key)}
			<div class="label">
				{#if data.type === 'shelf'}
					<div class="name">{l.name}</div>
					{#if l.nameAm}<div class="name-am">{l.nameAm}</div>{/if}
					<div class="price">
						{#if l.price !== null}
							{formatETB(l.price)}<span class="per"> / {l.unit}</span>
							{#if l.taxNote}<span class="tax">{l.taxNote}</span>{/if}
						{/if}
					</div>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG drawn on the server by bwip-js from the code -->
					<div class="code">{@html l.svg}</div>
				{:else}
					<div class="small-name">{l.name}</div>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG drawn on the server by bwip-js from the code -->
					<div class="code">{@html l.svg}</div>
					<div class="sku">{l.sku}</div>
				{/if}
				{#if !l.svg}<div class="sku">{l.code}</div>{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	/* Label stock sizes: shelf 63.5 × 38.1 mm, 3 × 7 (L7160); item 38.1 × 21.2 mm, 5 × 13 (L7651). */
	@page {
		size: A4;
		margin: 0;
	}
	.sheet {
		display: grid;
		width: 210mm;
		margin: 0 auto;
		background: white;
		color: black;
	}
	.sheet.shelf {
		grid-template-columns: repeat(3, 63.5mm);
		grid-auto-rows: 38.1mm;
		column-gap: 2.5mm;
		padding: 15.1mm 7.2mm;
	}
	.sheet.item {
		grid-template-columns: repeat(5, 38.1mm);
		grid-auto-rows: 21.2mm;
		column-gap: 2.5mm;
		padding: 10.7mm 4.7mm;
	}
	.label {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 1.5mm 2.5mm;
		break-inside: avoid;
		outline: 1px dashed #ddd;
	}
	.shelf .label {
		gap: 0.5mm;
	}
	.name {
		font-size: 9pt;
		font-weight: 600;
		line-height: 1.15;
		max-height: 2.3em;
		overflow: hidden;
	}
	.name-am {
		font-size: 8pt;
		line-height: 1.1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.price {
		font-size: 14pt;
		font-weight: 700;
		line-height: 1.1;
	}
	.per,
	.tax {
		font-size: 7pt;
		font-weight: 400;
	}
	.tax {
		margin-left: 1mm;
	}
	.code {
		flex: 1;
		min-height: 0;
	}
	.code :global(svg) {
		width: 100%;
		height: 100%;
	}
	.small-name {
		font-size: 6.5pt;
		line-height: 1.1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sku {
		font-size: 6pt;
		text-align: center;
	}
	@media print {
		.label {
			outline: none;
		}
	}
</style>
