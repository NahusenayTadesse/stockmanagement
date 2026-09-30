<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * The home page's picture: a bin card — the form every storekeeper already keeps on paper —
	 * filled in by the system. Four movements of one item, each with the document that caused it,
	 * and the balance they leave, in the green corner block of the Digital Construct mark.
	 *
	 * The rows arrive one after another when the page opens, the way postings do; with reduced
	 * motion they are simply there.
	 */
	const rows = $derived([
		{
			day: m.site_bin_day({ day: 12 }),
			doc: 'BOL-GRN-2019-00041',
			what: m.site_bin_row_receipt(),
			qtyIn: '400',
			qtyOut: '',
			balance: '520'
		},
		{
			day: m.site_bin_day({ day: 14 }),
			doc: 'BOL-ISS-2019-00388',
			what: m.site_bin_row_sale(),
			qtyIn: '',
			qtyOut: '120',
			balance: '400'
		},
		{
			day: m.site_bin_day({ day: 15 }),
			doc: 'BOL-TRF-2019-00017',
			what: m.site_bin_row_transfer(),
			qtyIn: '',
			qtyOut: '100',
			balance: '300'
		},
		{
			day: m.site_bin_day({ day: 18 }),
			doc: 'BOL-ADJ-2019-00006',
			what: m.site_bin_row_adjustment(),
			qtyIn: '',
			qtyOut: '2',
			balance: '298'
		}
	]);
</script>

<figure class="bin" aria-label={m.site_bin_aria()}>
	<header class="bin-head">
		<div>
			<p class="bin-title">{m.site_bin_title()}</p>
			<p class="bin-item">{m.site_bin_item()}</p>
		</div>
		<p class="bin-place">{m.site_bin_place()}</p>
	</header>

	<table class="bin-table">
		<thead>
			<tr>
				<th scope="col">{m.common_date()}</th>
				<th scope="col">{m.site_bin_col_document()}</th>
				<th scope="col" class="num">{m.site_bin_col_in()}</th>
				<th scope="col" class="num">{m.site_bin_col_out()}</th>
				<th scope="col" class="num">{m.site_bin_col_balance()}</th>
			</tr>
		</thead>
		<tbody>
			<tr class="opening">
				<td></td>
				<td>{m.site_bin_opening()}</td>
				<td class="num"></td>
				<td class="num"></td>
				<td class="num">120</td>
			</tr>
			{#each rows as row, i (row.doc)}
				<tr class="posted" style:--i={i}>
					<td class="day">{row.day}</td>
					<td>
						<span class="what">{row.what}</span>
						<span class="doc">{row.doc}</span>
					</td>
					<td class="num in">{row.qtyIn}</td>
					<td class="num out">{row.qtyOut}</td>
					<td class="num bal">{row.balance}</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<footer class="bin-foot">
		<dl class="bin-value">
			<dt>{m.site_bin_value_label()}</dt>
			<dd>ETB 432,100.00</dd>
		</dl>
		<div class="bin-balance">
			<span class="bin-balance-number">298</span>
			<span class="bin-balance-label">{m.site_bin_on_hand()}</span>
		</div>
	</footer>
</figure>

<style>
	.bin {
		/* The mark's silhouette: square everywhere but the corner the green block sits in. */
		--corner: 7.5rem;
		position: relative;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 6px 6px var(--corner) 6px;
		background: var(--card);
		color: var(--card-foreground);
		box-shadow: 14px 14px 0 0 color-mix(in srgb, var(--brand-navy) 9%, transparent);
	}
	:global(.dark) .bin {
		box-shadow: 14px 14px 0 0 rgb(255 255 255 / 0.04);
	}

	.bin-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: var(--brand-navy);
		color: #fff;
	}
	.bin-title {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1;
	}
	.bin-item {
		margin-top: 0.4rem;
		font-size: 0.875rem;
		line-height: 1.3;
		color: rgb(255 255 255 / 0.82);
	}
	.bin-place {
		flex-shrink: 0;
		border: 1px solid rgb(255 255 255 / 0.35);
		padding: 0.15rem 0.5rem;
		font-size: 0.75rem;
		line-height: 1.4;
	}

	.bin-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}
	th {
		padding: 0.6rem 0.5rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--muted-foreground);
	}
	td {
		padding: 0.6rem 0.5rem;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}
	th:first-child,
	td:first-child {
		padding-left: 1.25rem;
	}
	th:last-child,
	td:last-child {
		padding-right: 1.25rem;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.day {
		white-space: nowrap;
		color: var(--muted-foreground);
	}
	.what {
		display: block;
		font-weight: 500;
	}
	.doc {
		display: block;
		font-size: 0.75rem;
		color: var(--muted-foreground);
		font-variant-numeric: tabular-nums;
	}
	.in {
		color: var(--brand-green-ink);
		font-weight: 600;
	}
	.bal {
		font-weight: 600;
	}
	.opening td {
		color: var(--muted-foreground);
	}

	.bin-foot {
		display: flex;
		align-items: stretch;
		justify-content: space-between;
		gap: 1rem;
		min-height: var(--corner);
	}
	.bin-value {
		align-self: center;
		padding: 1rem 1.25rem;
	}
	.bin-value dt {
		font-size: 0.75rem;
		color: var(--muted-foreground);
	}
	.bin-value dd {
		font-size: 1.05rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	/* The green quarter of the mark, holding what the card is for: the balance. */
	.bin-balance {
		display: flex;
		width: calc(var(--corner) + 2.5rem);
		flex-direction: column;
		justify-content: center;
		padding: 0.75rem 1rem 1rem 1.25rem;
		background: var(--brand-green);
		color: var(--brand-navy);
		transform-origin: bottom right;
	}
	.bin-balance-number {
		font-family: var(--font-display);
		font-size: 3rem;
		font-weight: 700;
		line-height: 0.9;
		font-variant-numeric: tabular-nums;
	}
	.bin-balance-label {
		font-size: 0.8rem;
		font-weight: 600;
		line-height: 1.3;
	}

	@media (max-width: 30rem) {
		.bin {
			--corner: 6rem;
		}
		.bin-balance-number {
			font-size: 2.5rem;
		}
		/* Clear of the rounded corner, which cuts into the block's bottom right. */
		.bin-balance {
			padding-right: 2rem;
		}
		.doc {
			display: none;
		}
		th,
		td {
			padding-inline: 0.35rem;
		}
		th:first-child,
		td:first-child {
			padding-left: 0.85rem;
		}
		th:last-child,
		td:last-child {
			padding-right: 0.85rem;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.posted {
			animation: post 0.45s ease-out both;
			animation-delay: calc(0.5s + var(--i) * 0.55s);
		}
		.bin-balance {
			animation: stamp 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
			animation-delay: 2.9s;
		}
	}
	@keyframes post {
		from {
			opacity: 0;
			background: color-mix(in srgb, var(--brand-green) 28%, transparent);
		}
		to {
			opacity: 1;
			background: transparent;
		}
	}
	@keyframes stamp {
		from {
			transform: scale(0.4);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>
