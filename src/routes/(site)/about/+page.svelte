<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { SITE, pageTitle } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';

	/** What we hold the product to. */
	const principles = $derived([
		{ title: m.site_about_p1_title(), text: m.site_about_p1_text() },
		{ title: m.site_about_p2_title(), text: m.site_about_p2_text() },
		{ title: m.site_about_p3_title(), text: m.site_about_p3_text() },
		{ title: m.site_about_p4_title(), text: m.site_about_p4_text() }
	]);

	const otherWork = $derived([
		m.site_about_work_1(),
		m.site_about_work_2(),
		m.site_about_work_3(),
		m.site_about_work_4()
	]);
</script>

<svelte:head>
	<title>{pageTitle(m.site_nav_about())}</title>
	<meta name="description" content={m.site_about_intro()} />
</svelte:head>

<section class="site-wrap pt-12 pb-14 sm:pt-16">
	<div class="max-w-3xl">
		<h1 class="display-1">{m.site_about_title()}</h1>
		<p class="site-lede mt-5">{m.site_about_intro()}</p>
	</div>
</section>

<section class="border-y bg-card">
	<div class="site-wrap grid gap-8 py-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
		<h2 class="display-2">{m.site_about_why_title()}</h2>
		<div class="flex max-w-2xl flex-col gap-4 text-lg leading-relaxed">
			<p>{m.site_about_why_1()}</p>
			<p>{m.site_about_why_2()}</p>
			<p>{m.site_about_why_3()}</p>
		</div>
	</div>
</section>

<section class="site-wrap site-section">
	<h2 class="display-2 max-w-2xl">{m.site_about_principles_title()}</h2>
	<dl class="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
		{#each principles as principle (principle.title)}
			<div class="border-t-4 border-brand-green pt-4">
				<dt class="display-3">{principle.title}</dt>
				<dd class="mt-2 text-muted-foreground">{principle.text}</dd>
			</div>
		{/each}
	</dl>
</section>

<section class="bg-brand-navy text-white">
	<div class="site-wrap grid gap-8 py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
		<div>
			<h2 class="display-2">{m.site_about_work_title()}</h2>
			<p class="mt-4 text-white/80">{m.site_about_work_intro({ company: SITE.company })}</p>
			<Button
				href={SITE.websiteUrl}
				target="_blank"
				rel="noopener external"
				variant="secondary"
				class="mt-6"
			>
				{SITE.website}
			</Button>
		</div>
		<ul class="grid content-start gap-3 text-lg">
			{#each otherWork as line (line)}
				<li class="site-square">{line}</li>
			{/each}
		</ul>
	</div>
</section>

<section class="site-wrap site-section">
	<div class="flex flex-wrap items-center justify-between gap-6">
		<h2 class="display-2 max-w-xl">{m.site_about_close()}</h2>
		<div class="flex flex-wrap gap-3">
			<Button href={resolve('/contact')} size="lg">{m.site_close_talk()}</Button>
			<Button href={resolve('/register')} size="lg" variant="outline">
				{m.site_cta_trial()}
			</Button>
		</div>
	</div>
</section>
