<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import LifeBuoy from '@lucide/svelte/icons/life-buoy';
	import Search from '@lucide/svelte/icons/search';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import * as Sheet from '@nahu/admin-kit/components/ui/sheet/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { useKit } from '@nahu/admin-kit/context';
	import { say, topicsForPath } from '$lib/help/content';
	import { tourById, tourHref } from '$lib/help/tours';
	import { SITE, telNumber } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';
	import RichText from './RichText.svelte';

	/**
	 * The round Help button in the corner of every dashboard page, and the panel it opens: help
	 * for the screen you are on, a tour of it when there is one, and the way to the help centre.
	 *
	 * Until someone has opened it once it pulses and says "click me": the one thing on the page
	 * that moves by itself, so a newcomer finds help without being told where it is. Whether it
	 * has been opened is remembered in this browser only, which is all a hint needs.
	 */

	const SEEN_KEY = 'stock-help-seen';

	let open = $state(false);
	let seen = $state(true);

	const kit = useKit();

	// Read once the page is in the browser: storage does not exist while it renders on the server.
	onMount(() => {
		try {
			seen = localStorage.getItem(SEEN_KEY) === '1';
		} catch {
			seen = true;
		}
	});

	function markSeen() {
		seen = true;
		try {
			localStorage.setItem(SEEN_KEY, '1');
		} catch {
			// Private windows and blocked storage: the hint just shows again next time.
		}
	}

	const topics = $derived(topicsForPath(page.url.pathname));
	/** A tour of this very screen, from the first article that has one. */
	const tour = $derived(
		topics
			.map((topic) => tourById(topic.tour))
			.find((t) => t && t.path === page.url.pathname.replace(/\/+$/, ''))
	);
	const tourRunning = $derived(page.url.searchParams.has('tour'));
</script>

<div class="help-dock">
	{#if !seen && !open && !tourRunning}
		<div class="hint" role="note">
			<span>{m.help_button_hint()}</span>
			<button type="button" aria-label={m.help_button_hint_dismiss()} onclick={markSeen}>
				<X class="size-3.5" />
			</button>
		</div>
	{/if}
	<button
		type="button"
		class={['help-button', !seen && 'cue']}
		data-tour="help-button"
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={() => {
			open = true;
			markSeen();
		}}
	>
		<LifeBuoy class="size-5" aria-hidden="true" />
		<span class="label">{m.help_button()}</span>
	</button>
</div>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
		<Sheet.Header class="border-b p-5">
			<Sheet.Title class="flex items-center gap-2 text-lg">
				<LifeBuoy class="size-5" aria-hidden="true" />
				{m.help_panel_title()}
			</Sheet.Title>
			<Sheet.Description>{m.help_panel_intro()}</Sheet.Description>
		</Sheet.Header>

		<div class="flex flex-col gap-5 p-5">
			{#if tour}
				<Button
					href={tourHref(tour)}
					class="justify-start"
					onclick={() => (open = false)}
					data-sveltekit-replacestate
					data-sveltekit-noscroll
				>
					<Sparkles class="size-4" aria-hidden="true" />
					{m.help_show_me_this_page()}
				</Button>
			{/if}

			{#if topics.length}
				<section class="flex flex-col gap-3">
					<h3 class="text-sm font-semibold text-muted-foreground">{m.help_on_this_page()}</h3>
					{#each topics as topic (topic.id)}
						<details class="panel-topic" open={topics.length === 1}>
							<summary>{say(topic.title)}</summary>
							<p class="mt-2 text-sm text-muted-foreground">{say(topic.summary)}</p>
							{#if topic.steps?.length}
								<ol class="mt-3 flex list-decimal flex-col gap-1.5 ps-5 text-sm">
									{#each topic.steps as stepText, i (i)}
										<li><RichText text={say(stepText)} /></li>
									{/each}
								</ol>
							{/if}
						</details>
					{/each}
				</section>
			{:else}
				<p class="text-sm text-muted-foreground">{m.help_nothing_for_page()}</p>
			{/if}

			<!-- A plain GET form: the help centre reads `?q=` and opens on the results. -->
			<form
				class="flex flex-col gap-2"
				method="GET"
				action={resolve('/dashboard/help')}
				onsubmit={() => (open = false)}
			>
				<label for="help-panel-search" class="text-sm font-semibold text-muted-foreground">
					{m.help_search_label()}
				</label>
				<div class="flex gap-2">
					<Input
						id="help-panel-search"
						type="search"
						name="q"
						placeholder={m.help_search_placeholder_short()}
					/>
					<Button type="submit" variant="outline" size="icon" aria-label={m.common_search()}>
						<Search class="size-4" />
					</Button>
				</div>
			</form>

			<div class="flex flex-col gap-2 border-t pt-5">
				<Button
					variant="outline"
					href={resolve('/dashboard/help')}
					class="justify-start"
					onclick={() => (open = false)}
				>
					{m.help_open_centre()}
				</Button>
				{#if kit.canOpen('/dashboard')}
					<Button
						variant="ghost"
						href="{resolve('/dashboard')}?tour=welcome"
						class="justify-start"
						onclick={() => (open = false)}
					>
						{m.help_take_welcome_tour()}
					</Button>
				{/if}
			</div>

			<p class="text-xs text-muted-foreground">
				{m.help_still_stuck()}
				<a class="underline" href="mailto:{SITE.email}">{SITE.email}</a> ·
				<a class="underline" href="tel:{telNumber(SITE.phones[0])}">{SITE.phones[0]}</a>
			</p>
		</div>
	</Sheet.Content>
</Sheet.Root>

<style>
	.help-dock {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 40;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
		pointer-events: none;
	}
	.help-dock > :global(*) {
		pointer-events: auto;
	}
	.help-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		height: 3rem;
		padding: 0 1.1rem 0 0.95rem;
		border-radius: 999px;
		background: var(--primary);
		color: var(--primary-foreground);
		font-weight: 600;
		box-shadow: 0 8px 24px rgb(4 8 36 / 0.25);
		position: relative;
	}
	.help-button:hover {
		filter: brightness(1.1);
	}
	.help-button:focus-visible {
		outline: 3px solid var(--ring);
		outline-offset: 3px;
	}
	/* The cue: a green ring that swells and fades, until the button has been opened once. */
	.help-button.cue::after {
		content: '';
		position: absolute;
		inset: -4px;
		border-radius: inherit;
		border: 3px solid var(--brand-green);
		animation: cue 1.8s ease-out infinite;
		pointer-events: none;
	}
	@keyframes cue {
		from {
			opacity: 1;
			transform: scale(1);
		}
		to {
			opacity: 0;
			transform: scale(1.35);
		}
	}
	/* The "click me" bubble, pointing down at the button. */
	.hint {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 15rem;
		padding: 0.45rem 0.5rem 0.45rem 0.8rem;
		border-radius: 8px;
		background: var(--brand-green);
		color: var(--brand-navy);
		font-size: 0.85rem;
		font-weight: 600;
		line-height: 1.3;
		box-shadow: 0 6px 18px rgb(4 8 36 / 0.2);
	}
	.hint::after {
		content: '';
		position: absolute;
		right: 1.6rem;
		bottom: -6px;
		width: 12px;
		height: 12px;
		background: var(--brand-green);
		transform: rotate(45deg);
	}
	.hint button {
		display: grid;
		place-items: center;
		padding: 0.15rem;
		border-radius: 4px;
	}
	.hint button:hover {
		background: rgb(7 16 70 / 0.12);
	}
	.panel-topic {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.75rem 0.9rem;
	}
	.panel-topic summary {
		cursor: pointer;
		font-weight: 600;
	}
	@media (max-width: 40rem) {
		.label {
			display: none;
		}
		.help-button {
			width: 3rem;
			justify-content: center;
			padding: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.help-button.cue::after {
			animation: none;
			opacity: 1;
		}
	}
</style>
