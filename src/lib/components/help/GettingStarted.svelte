<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { useKit } from '@nahu/admin-kit/context';
	import { tourById, tourHref } from '$lib/help/tours';
	import { m } from '$lib/paraglide/messages.js';
	import type { GettingStarted } from '$lib/server/gettingStarted';

	/**
	 * The getting-started guide on the Dashboard: seven steps from an empty business to a running
	 * one, each ticked from the business's own data. A step not yet done offers **Show me**, which
	 * opens its screen with a tour pointing at what to click.
	 */
	let { guide }: { guide: GettingStarted } = $props();

	const kit = useKit();

	const TEXT = {
		profile: [m.help_guide_profile, m.help_guide_profile_text],
		items: [m.help_guide_items, m.help_guide_items_text],
		suppliers: [m.help_guide_suppliers, m.help_guide_suppliers_text],
		stock: [m.help_guide_stock, m.help_guide_stock_text],
		sale: [m.help_guide_sale, m.help_guide_sale_text],
		staff: [m.help_guide_staff, m.help_guide_staff_text],
		subscription: [m.help_guide_subscription, m.help_guide_subscription_text]
	} as const;

	const total = $derived(guide.steps.length);
	const allDone = $derived(guide.completed === total);
	/** The first step still to do: the one the guide leads with. */
	const nextId = $derived(guide.steps.find((s) => !s.done)?.id);
</script>

<section class="guide" data-tour="getting-started" aria-labelledby="guide-title">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 id="guide-title" class="guide-title">
				{allDone ? m.help_guide_all_done() : m.help_guide_title()}
			</h2>
			<p class="text-sm text-muted-foreground">
				{allDone ? m.help_guide_all_done_text() : m.help_guide_intro()}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="ghost" size="sm" href="{resolve('/dashboard')}?tour=welcome">
				<Sparkles class="size-4" aria-hidden="true" />
				{m.help_take_welcome_tour()}
			</Button>
			<form method="POST" action="?/hideGuide" use:enhance>
				<Button type="submit" variant="ghost" size="sm">{m.help_guide_hide()}</Button>
			</form>
		</div>
	</div>

	<div class="mt-4 flex items-center gap-3">
		<div
			class="bar"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={total}
			aria-valuenow={guide.completed}
			aria-label={m.help_guide_progress({ done: guide.completed, total })}
		>
			<div class="bar-fill" style:width="{(guide.completed / total) * 100}%"></div>
		</div>
		<span class="text-sm font-medium whitespace-nowrap tabular-nums">
			{m.help_guide_progress({ done: guide.completed, total })}
		</span>
	</div>

	<ol class="steps">
		{#each guide.steps as step, i (step.id)}
			{@const tour = tourById(step.tour)}
			{@const [title, text] = TEXT[step.id]}
			<li class={['step', step.done && 'done', step.id === nextId && 'next']}>
				<span class="mark" aria-hidden="true">
					{#if step.done}<Check class="size-4" />{:else}{i + 1}{/if}
				</span>
				<div class="min-w-0 flex-1">
					<p class="font-medium">
						{title()}
						{#if step.done}<span class="sr-only">— {m.help_guide_done()}</span>{/if}
					</p>
					{#if !step.done}<p class="text-sm text-muted-foreground">{text()}</p>{/if}
				</div>
				{#if !step.done && tour && kit.canOpen(tour.path)}
					<Button
						size="sm"
						variant={step.id === nextId ? 'default' : 'outline'}
						href={tourHref(tour)}
					>
						{m.help_show_me()}
					</Button>
				{/if}
			</li>
		{/each}
	</ol>
</section>

<style>
	.guide {
		padding: 1.25rem;
		border: 1px solid var(--border);
		border-left: 6px solid var(--brand-green);
		border-radius: 10px;
		background: var(--card);
	}
	.guide-title {
		font-family: var(--font-display);
		font-size: 1.6rem;
		font-weight: 600;
		line-height: 1.1;
	}
	.bar {
		flex: 1;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--muted);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: inherit;
		background: var(--brand-green);
		transition: width 0.4s ease;
	}
	.steps {
		display: grid;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	@media (min-width: 64rem) {
		.steps {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.step {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.step.next {
		border-color: var(--foreground);
		box-shadow: inset 4px 0 0 0 var(--brand-green);
	}
	.step.done {
		color: var(--muted-foreground);
	}
	.mark {
		display: grid;
		flex: none;
		width: 1.75rem;
		height: 1.75rem;
		place-items: center;
		border-radius: 999px;
		border: 2px solid var(--border);
		font-size: 0.8rem;
		font-weight: 700;
	}
	.done .mark {
		border-color: var(--brand-green);
		background: var(--brand-green);
		color: var(--brand-navy);
	}
	@media (prefers-reduced-motion: reduce) {
		.bar-fill {
			transition: none;
		}
	}
</style>
