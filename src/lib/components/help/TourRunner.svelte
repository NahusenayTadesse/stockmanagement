<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { say } from '$lib/help/content';
	import { tourById, type TourStep } from '$lib/help/tours';
	import { m } from '$lib/paraglide/messages.js';
	import RichText from './RichText.svelte';

	/**
	 * Plays the tour named in the address (`?tour=<id>`) on the screen it belongs to: the page is
	 * dimmed around the thing a step is about, which is outlined and pulses, and a card beside it
	 * says what it is, with Back, Next and Close. The page underneath stays usable — the tour
	 * never blocks what it points at.
	 *
	 * Positioned from the target's measured box rather than CSS anchor positioning, which Chrome
	 * and Firefox do not have yet: the fallback modern-web guidance gives for tours. The card is a
	 * dialog with a labelled heading, and focus moves into it at each step.
	 */

	const tour = $derived(tourById(page.url.searchParams.get('tour')));
	const onItsPage = $derived(Boolean(tour) && page.url.pathname.replace(/\/+$/, '') === tour!.path);

	let index = $state(0);
	/** The steps still to show, with the ones whose optional target is missing taken out. */
	let steps = $state<TourStep[]>([]);
	let target = $state<HTMLElement | null>(null);
	let box = $state<DOMRect | null>(null);
	let card = $state<HTMLElement>();
	let cardHeight = $state(0);
	let viewport = $state({ width: 0, height: 0 });

	const step = $derived(steps[index]);

	/** The element a step points at, if it is on the screen and visible. */
	function find(s: TourStep): HTMLElement | null {
		const marked = document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`);
		const el = s.within ? (marked?.querySelector<HTMLElement>(s.within) ?? null) : marked;
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0 ? el : null;
	}

	/** Waits a moment for the page to finish drawing before deciding a target is missing. */
	async function waitFor(s: TourStep): Promise<HTMLElement | null> {
		for (let frame = 0; frame < 45; frame++) {
			const el = find(s);
			if (el) return el;
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
		return null;
	}

	const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	async function show(i: number) {
		index = i;
		const s = steps[i];
		if (!s) return;
		target = await waitFor(s);
		if (target) {
			target.scrollIntoView({
				block: 'center',
				inline: 'nearest',
				behavior: reducedMotion() ? 'auto' : 'smooth'
			});
			// The scroll is smooth: measure again once it has had time to land.
			measure();
			setTimeout(measure, reducedMotion() ? 0 : 350);
		} else {
			box = null;
		}
		await tick();
		card?.querySelector<HTMLElement>('[data-tour-next]')?.focus();
	}

	function measure() {
		viewport = { width: window.innerWidth, height: window.innerHeight };
		box = target?.isConnected ? target.getBoundingClientRect() : null;
		cardHeight = card?.offsetHeight ?? 0;
	}

	/** Starts (or restarts) when the address names a tour for this page. */
	$effect(() => {
		if (!tour || !onItsPage) {
			steps = [];
			return;
		}
		const all = tour.steps;
		// Optional steps whose target never appears are dropped, so "2 of 3" counts what is shown.
		(async () => {
			const present = await Promise.all(
				all.map(async (s) => (s.optional ? (await waitFor(s)) !== null : true))
			);
			steps = all.filter((_, i) => present[i]);
			if (!steps.length) return end();
			await show(0);
		})();
	});

	/** Ends the tour by taking it out of the address, leaving the page where it is. */
	function end() {
		steps = [];
		target = null;
		box = null;
		// Back to the tour's own page without `?tour=`. Tours are only ever started with that one
		// parameter, so there is nothing else in the address to keep.
		if (tour)
			goto(resolve(tour.path as '/dashboard'), {
				replaceState: true,
				noScroll: true,
				keepFocus: true
			});
	}

	function next() {
		if (index < steps.length - 1) show(index + 1);
		else end();
	}

	const PAD = 6;
	const GAP = 14;
	/** The outline stays this far inside the screen, even round something wider than it. */
	const EDGE = 4;

	/** The outlined area: the target with a little room, kept on the screen. */
	const ring = $derived.by(() => {
		if (!box) return null;
		const left = Math.max(EDGE, box.left - PAD);
		const top = Math.max(EDGE, box.top - PAD);
		const right = Math.min(viewport.width - EDGE, box.right + PAD);
		const bottom = Math.min(viewport.height - EDGE, box.bottom + PAD);
		return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
	});

	/** Below the target when there is room, else above, else over the middle of the screen. */
	const cardStyle = $derived.by(() => {
		const width = Math.min(352, viewport.width - 32);
		if (!box) {
			return `width:${width}px; left:50%; top:50%; transform:translate(-50%,-50%);`;
		}
		const left = Math.min(Math.max(16, box.left), viewport.width - width - 16);
		const below = box.bottom + PAD + GAP;
		if (below + cardHeight < viewport.height - 16)
			return `width:${width}px; left:${left}px; top:${below}px;`;
		const above = box.top - PAD - GAP - cardHeight;
		if (above > 16) return `width:${width}px; left:${left}px; top:${above}px;`;
		return `width:${width}px; left:${left}px; bottom:16px;`;
	});
</script>

<svelte:window
	onresize={measure}
	onscrollcapture={measure}
	onkeydown={(e) => {
		if (steps.length && e.key === 'Escape') end();
	}}
/>

{#if steps.length && step}
	{#if ring}
		<div
			class="spotlight"
			aria-hidden="true"
			style:left="{ring.left}px"
			style:top="{ring.top}px"
			style:width="{ring.width}px"
			style:height="{ring.height}px"
		></div>
	{:else}
		<div class="scrim" aria-hidden="true"></div>
	{/if}

	<div
		bind:this={card}
		class="tour-card"
		style={cardStyle}
		role="dialog"
		aria-modal="false"
		aria-labelledby="tour-title"
		aria-describedby="tour-body"
	>
		<div class="flex items-start justify-between gap-3">
			<p class="text-xs font-medium text-muted-foreground">
				{m.help_tour_step({ n: index + 1, total: steps.length })}
			</p>
			<button
				type="button"
				class="-m-1 rounded p-1 text-muted-foreground hover:text-foreground"
				aria-label={m.help_tour_close()}
				onclick={end}
			>
				<X class="size-4" />
			</button>
		</div>
		<h2 id="tour-title" class="tour-title">{say(step.title)}</h2>
		<p id="tour-body" class="text-sm leading-relaxed text-muted-foreground">
			<RichText text={say(step.body)} />
		</p>
		<div class="mt-4 flex items-center justify-between gap-2">
			<Button variant="ghost" size="sm" onclick={end}>{m.help_tour_skip()}</Button>
			<div class="flex gap-2">
				{#if index > 0}
					<Button variant="outline" size="sm" onclick={() => show(index - 1)}>
						{m.help_tour_back()}
					</Button>
				{/if}
				<Button size="sm" data-tour-next onclick={next}>
					{index < steps.length - 1 ? m.help_tour_next() : m.help_tour_done()}
				</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* The page is dimmed everywhere but the target: one shadow, so nothing covers what it points at. */
	.spotlight {
		position: fixed;
		z-index: 90;
		border-radius: 10px;
		outline: 3px solid var(--brand-green);
		box-shadow: 0 0 0 9999px rgb(4 8 36 / 0.5);
		pointer-events: none;
		transition:
			left 0.25s ease,
			top 0.25s ease,
			width 0.25s ease,
			height 0.25s ease;
	}
	/* The cue: a second outline that moves out a few pixels and fades. It grows by a fixed
	   distance, not a scale, so a full-width target does not throw it across the page. */
	.spotlight::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		outline: 3px solid var(--brand-green);
		outline-offset: 0;
		animation: pulse 1.6s ease-out infinite;
	}
	@keyframes pulse {
		from {
			opacity: 0.9;
			outline-offset: 0;
		}
		to {
			opacity: 0;
			outline-offset: 12px;
		}
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgb(4 8 36 / 0.5);
		pointer-events: none;
	}
	.tour-card {
		position: fixed;
		z-index: 91;
		padding: 1rem 1.1rem;
		border: 1px solid var(--border);
		border-left: 4px solid var(--brand-green);
		border-radius: 8px;
		background: var(--popover);
		color: var(--popover-foreground);
		box-shadow: 0 12px 32px rgb(4 8 36 / 0.28);
	}
	.tour-title {
		margin: 0.35rem 0 0.4rem;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 600;
		line-height: 1.15;
	}
	@media (prefers-reduced-motion: reduce) {
		.spotlight {
			transition: none;
		}
		.spotlight::after {
			animation: none;
		}
	}
</style>
