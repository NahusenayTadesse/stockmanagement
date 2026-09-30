<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import PriceList from '$lib/components/site/PriceList.svelte';
	import { GRACE_DAYS, RENEWAL_NOTICE_DAYS } from '$lib/billing';
	import { pageTitle } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	const trialDays = $derived(
		data.packages.length ? Math.min(...data.packages.map((p) => p.trialDays)) : 0
	);

	/** What every package opens: the whole application. */
	const included = $derived([
		m.site_incl_stock(),
		m.site_incl_selling(),
		m.site_incl_buying(),
		m.site_incl_money(),
		m.site_incl_control(),
		m.site_incl_reports(),
		m.site_incl_local(),
		m.site_incl_import()
	]);

	/** Paying, in the order it happens. */
	const steps = $derived([
		{ title: m.site_pay_step1_title(), text: m.site_pay_step1_text({ days: trialDays }) },
		{
			title: m.site_pay_step2_title(),
			text: data.payOnline
				? data.payByBank
					? m.site_pay_step2_both()
					: m.site_pay_step2_online()
				: m.site_pay_step2_bank()
		},
		{
			title: m.site_pay_step3_title(),
			text: m.site_pay_step3_text({ notice: RENEWAL_NOTICE_DAYS, grace: GRACE_DAYS })
		}
	]);

	const questions = $derived([
		{ q: m.site_faq_trial_q(), a: m.site_faq_trial_a() },
		{ q: m.site_faq_late_q(), a: m.site_faq_late_a({ grace: GRACE_DAYS }) },
		{ q: m.site_faq_change_q(), a: m.site_faq_change_a() },
		{ q: m.site_faq_limit_q(), a: m.site_faq_limit_a() },
		{ q: m.site_faq_data_q(), a: m.site_faq_data_a() },
		{ q: m.site_faq_setup_q(), a: m.site_faq_setup_a() }
	]);
</script>

<svelte:head>
	<title>{pageTitle(m.site_nav_pricing())}</title>
	<meta name="description" content={m.site_pricing_intro()} />
</svelte:head>

<section class="site-wrap pt-12 pb-10 sm:pt-16">
	<div class="max-w-2xl">
		<h1 class="display-1">{m.site_pricing_title()}</h1>
		<p class="site-lede mt-5">{m.site_pricing_intro()}</p>
	</div>

	<div class="mt-10">
		{#if data.packages.length}
			<PriceList packages={data.packages} />
		{:else}
			<p class="border bg-card p-6 text-muted-foreground">{m.site_pricing_none()}</p>
		{/if}
	</div>
	<p class="mt-4 text-sm text-muted-foreground">{m.site_pricing_note()}</p>
</section>

<section class="border-y bg-card">
	<div class="site-wrap grid gap-8 py-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
		<div>
			<h2 class="display-2">{m.site_incl_title()}</h2>
			<p class="mt-3 text-muted-foreground">{m.site_incl_intro()}</p>
			<Button href="{resolve('/')}#features" variant="outline" class="mt-6">
				{m.site_incl_more()}
			</Button>
		</div>
		<ul class="grid content-start gap-x-8 gap-y-3 sm:grid-cols-2">
			{#each included as line (line)}
				<li class="site-square">{line}</li>
			{/each}
		</ul>
	</div>
</section>

<section class="site-wrap py-14">
	<h2 class="display-2">{m.site_pay_title()}</h2>
	<ol class="mt-8 grid gap-8 md:grid-cols-3">
		{#each steps as step, i (step.title)}
			<li>
				<span class="site-number" aria-hidden="true">{i + 1}</span>
				<h3 class="display-3">{step.title}</h3>
				<p class="mt-2 text-muted-foreground">{step.text}</p>
			</li>
		{/each}
	</ol>
</section>

<section class="border-t bg-card">
	<div class="site-wrap grid gap-8 py-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
		<h2 class="display-2">{m.site_faq_title()}</h2>
		<div>
			{#each questions as item (item.q)}
				<details class="faq">
					<summary>{item.q}</summary>
					<p>{item.a}</p>
				</details>
			{/each}
		</div>
	</div>
</section>

<section class="site-wrap py-14">
	<div class="flex flex-wrap items-center justify-between gap-6">
		<h2 class="display-2 max-w-xl">{m.site_pricing_close()}</h2>
		<div class="flex flex-wrap gap-3">
			<Button href={resolve('/register')} size="lg">{m.site_cta_trial()}</Button>
			<Button href={resolve('/contact')} size="lg" variant="outline">{m.site_close_talk()}</Button>
		</div>
	</div>
</section>

<style>
	.faq {
		border-top: 1px solid var(--border);
	}
	.faq:last-child {
		border-bottom: 1px solid var(--border);
	}
	.faq summary {
		padding-block: 1rem;
		font-weight: 600;
		cursor: pointer;
	}
	.faq summary:hover {
		color: var(--brand-green-ink);
	}
	.faq p {
		max-width: 44rem;
		padding-bottom: 1.25rem;
		color: var(--muted-foreground);
	}
</style>
