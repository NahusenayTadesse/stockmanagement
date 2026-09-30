<script lang="ts">
	import { branchesText, periodText, priceText, usersText } from '$lib/billing';
	import { m } from '$lib/paraglide/messages.js';

	/** A package as `packagesOnSale` returns it; only what the row shows. */
	type Package = {
		id: number;
		name: string;
		price: number;
		billingMonths: number;
		maxUsers: number | null;
		maxBranches: number | null;
		isFeatured: boolean;
	};

	/**
	 * Choosing a package: one row each, with its limits and its price, the chosen one marked with
	 * the green edge. Used where a business is registered and where it pays, so a package reads
	 * the same in both. Posts `packageId`.
	 */
	let {
		packages,
		value = $bindable(),
		current = undefined,
		name = 'packageId'
	}: {
		packages: Package[];
		value: number | undefined;
		/** The package the business is on now, marked so. */
		current?: number;
		name?: string;
	} = $props();
</script>

<div class="grid gap-2">
	{#each packages as pkg (pkg.id)}
		<label class="package">
			<input type="radio" {name} value={pkg.id} bind:group={value} />
			<span class="package-body">
				<span class="package-name">
					{pkg.name}
					{#if pkg.id === current}
						<span class="package-tag current">{m.billing_current_package()}</span>
					{:else if pkg.isFeatured}
						<span class="package-tag">{m.site_price_popular()}</span>
					{/if}
				</span>
				<span class="package-limits">
					{usersText(pkg.maxUsers)} · {branchesText(pkg.maxBranches)}
				</span>
			</span>
			<span class="package-price">
				<strong>{priceText(pkg.price)}</strong>
				<span>{m.site_price_per({ period: periodText(pkg.billingMonths) })}</span>
			</span>
		</label>
	{/each}
</div>

<style>
	.package {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.85rem;
		align-items: center;
		padding: 0.8rem 1rem;
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
	}
	.package:hover {
		border-color: var(--foreground);
	}
	/* The chosen package takes the mark's green edge. */
	.package:has(input:checked) {
		border-color: var(--foreground);
		box-shadow: inset 0.4rem 0 0 0 var(--brand-green);
		background: var(--accent);
	}
	.package:has(input:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.package input {
		width: 1.1rem;
		height: 1.1rem;
		accent-color: var(--primary);
	}
	.package-body,
	.package-price {
		display: flex;
		flex-direction: column;
		line-height: 1.35;
	}
	.package-name {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
	}
	.package-tag {
		background: var(--brand-green);
		color: var(--brand-navy);
		padding: 0 0.4rem;
		font-size: 0.7rem;
		font-weight: 600;
	}
	.package-tag.current {
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.package-limits,
	.package-price span {
		font-size: 0.8rem;
		color: var(--muted-foreground);
	}
	.package-price {
		align-items: flex-end;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
