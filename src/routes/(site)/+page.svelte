<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import ProductPreview from '$lib/components/site/ProductPreview.svelte';
	import PriceList from '$lib/components/site/PriceList.svelte';
	import { pageTitle } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	/** The shortest trial on offer: what "free for the first N days" can promise for any package. */
	const trialDays = $derived(
		data.packages.length ? Math.min(...data.packages.map((p) => p.trialDays)) : 0
	);

	const audiences = $derived([
		m.site_for_pharmacy(),
		m.site_for_hardware(),
		m.site_for_supermarket(),
		m.site_for_electronics(),
		m.site_for_wholesale(),
		m.site_for_stores()
	]);

	/** What the system does, module by module: the long answer to "what can it do?". */
	const features = $derived([
		{
			id: 'stock',
			title: m.site_feat_stock_title(),
			lede: m.site_feat_stock_lede(),
			points: [
				m.site_feat_stock_1(),
				m.site_feat_stock_2(),
				m.site_feat_stock_3(),
				m.site_feat_stock_4(),
				m.site_feat_stock_5(),
				m.site_feat_stock_6(),
				m.site_feat_stock_7()
			]
		},
		{
			id: 'selling',
			title: m.site_feat_sell_title(),
			lede: m.site_feat_sell_lede(),
			points: [
				m.site_feat_sell_1(),
				m.site_feat_sell_2(),
				m.site_feat_sell_3(),
				m.site_feat_sell_4(),
				m.site_feat_sell_5(),
				m.site_feat_sell_6(),
				m.site_feat_sell_7()
			]
		},
		{
			id: 'buying',
			title: m.site_feat_buy_title(),
			lede: m.site_feat_buy_lede(),
			points: [
				m.site_feat_buy_1(),
				m.site_feat_buy_2(),
				m.site_feat_buy_3(),
				m.site_feat_buy_4(),
				m.site_feat_buy_5(),
				m.site_feat_buy_6()
			]
		},
		{
			id: 'money',
			title: m.site_feat_money_title(),
			lede: m.site_feat_money_lede(),
			points: [
				m.site_feat_money_1(),
				m.site_feat_money_2(),
				m.site_feat_money_3(),
				m.site_feat_money_4(),
				m.site_feat_money_5(),
				m.site_feat_money_6()
			]
		},
		{
			id: 'control',
			title: m.site_feat_control_title(),
			lede: m.site_feat_control_lede(),
			points: [
				m.site_feat_control_1(),
				m.site_feat_control_2(),
				m.site_feat_control_3(),
				m.site_feat_control_4(),
				m.site_feat_control_5(),
				m.site_feat_control_6()
			]
		},
		{
			id: 'reports',
			title: m.site_feat_reports_title(),
			lede: m.site_feat_reports_lede(),
			points: [
				m.site_feat_reports_1(),
				m.site_feat_reports_2(),
				m.site_feat_reports_3(),
				m.site_feat_reports_4(),
				m.site_feat_reports_5(),
				m.site_feat_reports_6()
			]
		}
	]);

	const local = $derived([
		{ title: m.site_local_calendar_title(), text: m.site_local_calendar_text() },
		{ title: m.site_local_language_title(), text: m.site_local_language_text() },
		{ title: m.site_local_tax_title(), text: m.site_local_tax_text() },
		{ title: m.site_local_device_title(), text: m.site_local_device_text() }
	]);

	/** A working day, in the order it happens — which is why these are numbered. */
	const day = $derived([
		{ when: m.site_day_morning(), text: m.site_day_morning_text() },
		{ when: m.site_day_selling(), text: m.site_day_selling_text() },
		{ when: m.site_day_closing(), text: m.site_day_closing_text() },
		{ when: m.site_day_month(), text: m.site_day_month_text() }
	]);
</script>

<svelte:head>
	<title>{pageTitle(m.site_home_tab())}</title>
	<meta name="description" content={m.site_hero_lede()} />
</svelte:head>

<section class="hero">
	<div class="site-wrap hero-grid">
		<div class="hero-copy">
			<h1 class="display-1">{m.site_hero_title()}</h1>
			<p class="site-lede">{m.site_hero_lede()}</p>
			<p class="text-sm font-medium text-brand-green-ink">{m.site_local_short()}</p>
			<div class="flex flex-wrap gap-3">
				<Button href={resolve('/register')} size="lg">{m.site_cta_trial()}</Button>
				<Button href="/demo" size="lg" variant="outline">{m.site_demo()}</Button
				>
			</div>
			{#if trialDays}
				<p class="text-sm text-muted-foreground">{m.site_hero_note({ days: trialDays })}</p>
			{/if}
		</div>
		<div class="hero-art">
			<span class="blocks" aria-hidden="true"><i></i><i></i><i></i></span>
			<ProductPreview />
		</div>
	</div>
</section>

<section class="border-y bg-card">
	<div class="site-wrap py-8">
		<h2 class="text-sm font-semibold text-muted-foreground">{m.site_for_title()}</h2>
		<ul class="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
			{#each audiences as audience (audience)}
				<li class="site-square">{audience}</li>
			{/each}
		</ul>
	</div>
</section>

<section id="features" class="site-wrap site-section">
	<div class="max-w-2xl">
		<h2 class="display-2">{m.site_feat_title()}</h2>
		<p class="site-lede mt-4">{m.site_feat_intro()}</p>
	</div>

	<ul class="mt-8 grid gap-5 sm:grid-cols-3"><li class="site-square">{m.site_outcome_stock()}</li><li class="site-square">{m.site_outcome_sales()}</li><li class="site-square">{m.site_outcome_control()}</li></ul>
	<details class="mt-8"><summary class="cursor-pointer py-3 font-semibold">{m.site_feature_details()}</summary>
	<div class="mt-6">
		{#each features as group (group.id)}
			<article class="feature">
				<div>
					<h3 class="display-3">{group.title}</h3>
					<p class="mt-2 text-muted-foreground">{group.lede}</p>
				</div>
				<ul class="feature-points">
					{#each group.points as point (point)}
						<li class="site-square">{point}</li>
					{/each}
				</ul>
			</article>
		{/each}
	</div>
	</details>
</section>

<section class="bg-brand-navy text-white">
	<div class="site-wrap site-section">
		<h2 class="display-2 max-w-2xl">{m.site_local_title()}</h2>
		<dl class="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
			{#each local as fact (fact.title)}
				<div class="border-t-4 border-brand-green pt-4">
					<dt class="display-3">{fact.title}</dt>
					<dd class="mt-2 text-sm leading-relaxed text-white/80">{fact.text}</dd>
				</div>
			{/each}
		</dl>
	</div>
</section>

<section class="site-wrap site-section">
	<h2 class="display-2 max-w-2xl">{m.site_day_title()}</h2>
	<ol class="day">
		{#each day as step, i (step.when)}
			<li>
				<span class="site-number" aria-hidden="true">{i + 1}</span>
				<h3 class="display-3">{step.when}</h3>
				<p class="mt-2 text-muted-foreground">{step.text}</p>
			</li>
		{/each}
	</ol>
</section>

{#if data.packages.length}
	<section class="border-t bg-card">
		<div class="site-wrap site-section">
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div class="max-w-2xl">
					<h2 class="display-2">{m.site_prices_title()}</h2>
					<p class="site-lede mt-4">{m.site_prices_intro()}</p>
				</div>
				<Button href={resolve('/pricing')} variant="outline">{m.site_prices_more()}</Button>
			</div>
			<div class="mt-10">
				<PriceList packages={data.packages} />
			</div>
		</div>
	</section>
{/if}

<section class="site-wrap site-section">
	<div class="closing">
		<div class="max-w-xl">
			<h2 class="display-2">{m.site_close_title()}</h2>
			<p class="site-lede mt-4">{m.site_close_text()}</p>
		</div>
		<div class="flex flex-wrap gap-3">
			<Button href={resolve('/register')} size="lg">{m.site_footer_register()}</Button>
			<Button href={resolve('/contact')} size="lg" variant="outline">{m.site_close_talk()}</Button>
		</div>
	</div>
</section>

<style>
	.hero {
		padding-block: clamp(2.5rem, 6vw, 5rem) clamp(3.5rem, 8vw, 6rem);
	}
	.hero-grid {
		display: grid;
		gap: 3rem;
		align-items: center;
	}
	@media (min-width: 64rem) {
		.hero-grid {
			grid-template-columns: minmax(0, 6fr) minmax(0, 6fr);
			gap: 4rem;
		}
	}
	.hero-copy {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.hero-art {
		position: relative;
		/* Room for the card's offset shadow, so it never touches the page edge. */
		padding: 0 14px 14px 0;
	}
	/* The three loose blocks of the wordmark, above the card's corner. */
	.blocks {
		position: absolute;
		top: -4.4rem;
		right: 2.5rem;
		display: none;
		width: 4.4rem;
		height: 3.4rem;
	}
	@media (min-width: 64rem) {
		.blocks {
			display: block;
		}
	}
	.blocks i {
		position: absolute;
		display: block;
		background: var(--foreground);
	}
	.blocks i:nth-child(1) {
		top: 0;
		left: 0;
		width: 2rem;
		height: 2rem;
	}
	.blocks i:nth-child(2) {
		top: 1.5rem;
		left: 2.4rem;
		width: 1.1rem;
		height: 1.1rem;
		background: var(--brand-green);
	}
	.blocks i:nth-child(3) {
		top: 2.3rem;
		left: 1.4rem;
		width: 1.1rem;
		height: 1.1rem;
	}

	.feature {
		display: grid;
		gap: 1.25rem;
		padding-block: 2rem;
		border-top: 1px solid var(--border);
	}
	.feature:last-child {
		border-bottom: 1px solid var(--border);
	}
	.feature-points {
		display: grid;
		gap: 0.7rem 2rem;
		align-content: start;
	}
	@media (min-width: 40rem) {
		.feature-points {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 64rem) {
		.feature {
			grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
			gap: 3rem;
		}
	}

	.day {
		display: grid;
		gap: 2rem;
		margin-top: 2.5rem;
		counter-reset: none;
	}
	@media (min-width: 40rem) {
		.day {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (min-width: 64rem) {
		.day {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	.closing {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		padding: clamp(1.5rem, 4vw, 3rem);
		border: 1px solid var(--border);
		border-left: 0.75rem solid var(--brand-green);
		background: var(--card);
	}
</style>
