<script lang="ts">
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import {
		branchesText,
		frequencyText,
		monthlyPrice,
		periodText,
		priceText,
		usersText
	} from '$lib/billing';
	import { m } from '$lib/paraglide/messages.js';

	/** A package as the site shows it (`packagesOnSale`). */
	type Package = {
		id: number;
		name: string;
		slug: string;
		description: string | null;
		price: number;
		billingMonths: number;
		maxUsers: number | null;
		maxBranches: number | null;
		trialDays: number;
		highlights: string[];
		isFeatured: boolean;
	};

	/**
	 * The packages as one price list: a joined strip of columns rather than separate cards, because
	 * they are the same product at different sizes and are read across. The featured package is the
	 * filled column.
	 */
	let { packages }: { packages: Package[] } = $props();
</script>

<ul class="prices">
	{#each packages as pkg (pkg.id)}
		<li class={['price', pkg.isFeatured && 'featured']}>
			<div class="price-top">
				<h3 class="display-3">{pkg.name}</h3>
				{#if pkg.isFeatured}<span class="badge">{m.site_price_popular()}</span>{/if}
			</div>
			<p class="price-for">{pkg.description ?? ''}</p>

			<p class="price-amount">
				<span class="price-figure">{priceText(pkg.price)}</span>
				<span class="price-per">
					{m.site_price_per({ period: periodText(pkg.billingMonths) })}{#if pkg.billingMonths > 1}
						<span class="price-month">
							{m.site_price_works_out({
								amount: priceText(monthlyPrice(pkg.price, pkg.billingMonths))
							})}
						</span>
					{/if}
				</span>
			</p>

			<ul class="price-facts">
				<li><Check aria-hidden="true" />{usersText(pkg.maxUsers)}</li>
				<li><Check aria-hidden="true" />{branchesText(pkg.maxBranches)}</li>
				<li><Check aria-hidden="true" />{frequencyText(pkg.billingMonths)}</li>
				<li><Check aria-hidden="true" />{m.site_price_everything()}</li>
				{#each pkg.highlights as line (line)}
					<li><Check aria-hidden="true" />{line}</li>
				{/each}
			</ul>

			<Button
				href="{resolve('/register')}?package={pkg.slug}"
				class={[
					'w-full self-end',
					// On the filled column the button takes the mark's green, in both themes.
					pkg.isFeatured && 'bg-brand-green text-brand-navy hover:bg-brand-green/90'
				]}
			>
				{m.site_price_start({ days: pkg.trialDays })}
			</Button>
		</li>
	{/each}
</ul>

<style>
	.prices {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--card);
		overflow: hidden;
	}
	/*
	 * Each package is a column of the list's own rows (subgrid), so names, prices, the lists of
	 * what is included and the buttons line up across packages however long a description runs.
	 */
	.price {
		display: grid;
		grid-row: span 5;
		grid-template-rows: subgrid;
		row-gap: 0.75rem;
		padding: 1.5rem 1.35rem;
		/* Rules between the columns, whichever way they wrap: each cell draws its right and bottom. */
		box-shadow:
			1px 0 0 0 var(--border),
			0 1px 0 0 var(--border);
	}
	.featured {
		background: var(--brand-navy);
		color: #fff;
	}
	/* On the dark page the navy column would vanish into the others: it takes the green edge. */
	:global(.dark) .featured {
		background: #131b57;
		box-shadow: inset 0 0 0 2px var(--brand-green);
	}
	.price-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.badge {
		background: var(--brand-green);
		color: var(--brand-navy);
		padding: 0.1rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
	}
	.price-for {
		font-size: 0.875rem;
		line-height: 1.45;
		color: var(--muted-foreground);
	}
	.featured .price-for,
	.featured .price-per {
		color: rgb(255 255 255 / 0.78);
	}
	.price-amount {
		display: flex;
		flex-direction: column;
		line-height: 1.1;
	}
	.price-figure {
		font-family: var(--font-display);
		font-size: 2.4rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.price-per {
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--muted-foreground);
	}
	/* "per 3 months" and, after it, what that is a month. */
	.price-month::before {
		content: '·';
		margin-inline: 0.35em;
	}
	.price-facts {
		display: grid;
		gap: 0.55rem;
		align-content: start;
		margin-block: 0.5rem 1rem;
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.price-facts li {
		display: grid;
		grid-template-columns: 1.1rem 1fr;
		gap: 0.5rem;
	}
	.price-facts :global(svg) {
		width: 1.1rem;
		height: 1.1rem;
		margin-top: 0.1rem;
		color: var(--brand-green-ink);
	}
	.featured .price-facts :global(svg) {
		color: var(--brand-green);
	}
</style>
