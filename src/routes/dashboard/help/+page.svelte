<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Lock from '@lucide/svelte/icons/lock';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Switch } from '@nahu/admin-kit/components/ui/switch/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import { useKit } from '@nahu/admin-kit/context';
	import RichText from '$lib/components/help/RichText.svelte';
	import {
		HELP_ROLES,
		HELP_SECTIONS,
		HELP_TOPICS,
		say,
		searchText,
		type HelpRole
	} from '$lib/help/content';
	import { tourById, tourHref } from '$lib/help/tours';
	import { SITE, telNumber } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * The help centre: every article, searchable in either language, narrowed by area, by role,
	 * and to the screens the viewer can actually open. Each article can open its screen, and
	 * where there is a tour, show you around it.
	 */
	let { data } = $props();

	const kit = useKit();

	// A search can arrive from the help button's panel (`?q=`).
	let query = $state(page.url.searchParams.get('q') ?? '');
	let section = $state<string>('');
	let role = $state<HelpRole | ''>('');
	let mine = $state(false);
	let open = $state<Record<string, boolean>>({});

	const ROLE_LABELS: Record<HelpRole, () => string> = {
		owner: m.help_role_owner,
		manager: m.help_role_manager,
		cashier: m.help_role_cashier,
		storekeeper: m.help_role_storekeeper,
		clerk: m.help_role_clerk,
		department: m.help_role_department
	};

	// Built once: an article's text never changes, only what is being looked for.
	const haystacks = new Map(HELP_TOPICS.map((topic) => [topic.id, searchText(topic)]));

	/** Every word must appear somewhere in the article, in any order. */
	const words = $derived(query.trim().toLowerCase().split(/\s+/).filter(Boolean));

	const canOpen = (path?: string) => !path || kit.canOpen(path);

	/** What matches everything but the area, so each area chip can say how many it would show. */
	const beforeSection = $derived(
		HELP_TOPICS.filter(
			(topic) =>
				words.every((w) => haystacks.get(topic.id)!.includes(w)) &&
				(!role || topic.roles.includes(role)) &&
				(!mine || canOpen(topic.path))
		)
	);
	const results = $derived(
		section ? beforeSection.filter((topic) => topic.section === section) : beforeSection
	);
	const grouped = $derived(
		HELP_SECTIONS.map((s) => ({ ...s, topics: results.filter((t) => t.section === s.id) })).filter(
			(s) => s.topics.length
		)
	);
	const countIn = (id: string) => beforeSection.filter((t) => t.section === id).length;

	const filtering = $derived(Boolean(words.length || section || role || mine));
	/** While searching every match is open: hunting through closed results defeats the search. */
	const isOpen = (id: string) => words.length > 0 || Boolean(open[id]);

	function clearAll() {
		query = '';
		section = '';
		role = '';
		mine = false;
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6">
	<PageHeader title={m.help_title()} description={m.help_intro()}>
		{#snippet actions()}
			<Button variant="outline" href="{resolve('/dashboard')}?tour=welcome">
				<Sparkles class="size-4" aria-hidden="true" />
				{m.help_take_welcome_tour()}
			</Button>
		{/snippet}
	</PageHeader>

	{#if data.guideHidden}
		<Notice tone="info" title={m.help_guide_title()}>
			{m.help_guide_hidden_note()}
			{#snippet actions()}
				<form method="POST" action="?/showGuide" use:enhance>
					<Button type="submit" size="sm" variant="outline">{m.help_guide_show()}</Button>
				</form>
			{/snippet}
		</Notice>
	{/if}

	<div class="filters">
		<div class="relative">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
			<Input
				type="search"
				bind:value={query}
				placeholder={m.help_search_placeholder()}
				aria-label={m.help_search_label()}
				class="h-11 pr-10 pl-9"
			/>
			{#if query}
				<button
					type="button"
					class="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label={m.help_search_clear()}
					onclick={() => (query = '')}
				>
					<X class="size-4" />
				</button>
			{/if}
		</div>

		<div class="flex flex-wrap gap-2" role="group" aria-label={m.help_filter_area()}>
			<button
				type="button"
				class="chip"
				aria-pressed={section === ''}
				onclick={() => (section = '')}
			>
				{m.help_filter_all()} <span class="count">{beforeSection.length}</span>
			</button>
			{#each HELP_SECTIONS as s (s.id)}
				<button
					type="button"
					class="chip"
					aria-pressed={section === s.id}
					disabled={!countIn(s.id)}
					onclick={() => (section = section === s.id ? '' : s.id)}
				>
					<s.icon class="size-4" aria-hidden="true" />
					{say(s.title)} <span class="count">{countIn(s.id)}</span>
				</button>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-x-6 gap-y-3">
			<label class="flex items-center gap-2 text-sm">
				{m.help_filter_role()}
				<select bind:value={role} class="h-9 rounded-md border bg-background px-2 text-sm">
					<option value="">{m.help_filter_role_any()}</option>
					{#each HELP_ROLES as r (r)}
						<option value={r}>{ROLE_LABELS[r]()}</option>
					{/each}
				</select>
			</label>
			<div class="flex items-center gap-2">
				<Switch id="help-mine" bind:checked={mine} />
				<Label for="help-mine" class="text-sm font-normal">{m.help_filter_mine()}</Label>
			</div>
			{#if filtering}
				<Button variant="ghost" size="sm" onclick={clearAll}>{m.help_filter_clear()}</Button>
			{/if}
		</div>
		<p class="text-sm text-muted-foreground" aria-live="polite">
			{m.help_result_count({ count: results.length })}
		</p>
	</div>

	{#each grouped as group (group.id)}
		<section class="flex flex-col gap-3" aria-labelledby="help-{group.id}">
			<div class="flex items-center gap-2">
				<group.icon class="size-5 text-brand-green-ink" aria-hidden="true" />
				<h2 id="help-{group.id}" class="text-lg font-semibold">{say(group.title)}</h2>
			</div>
			<p class="-mt-2 text-sm text-muted-foreground">{say(group.blurb)}</p>

			{#each group.topics as topic (topic.id)}
				{@const tour = tourById(topic.tour)}
				{@const reachable = canOpen(topic.path)}
				<article class="topic" id="topic-{topic.id}">
					<button
						type="button"
						class="topic-head"
						aria-expanded={isOpen(topic.id)}
						aria-controls="topic-body-{topic.id}"
						onclick={() => (open[topic.id] = !open[topic.id])}
					>
						<span class="min-w-0">
							<span class="block font-semibold">{say(topic.title)}</span>
							<span class="block text-sm text-muted-foreground">{say(topic.summary)}</span>
						</span>
						<span class="chevron" aria-hidden="true"></span>
					</button>

					{#if isOpen(topic.id)}
						<div class="topic-body" id="topic-body-{topic.id}">
							{#if topic.steps?.length}
								<ol class="flex list-decimal flex-col gap-2 ps-5">
									{#each topic.steps as stepText, i (i)}
										<li><RichText text={say(stepText)} /></li>
									{/each}
								</ol>
							{/if}
							{#if topic.notes?.length}
								<ul class="notes">
									{#each topic.notes as note, i (i)}
										<li><RichText text={say(note)} /></li>
									{/each}
								</ul>
							{/if}

							<div class="flex flex-wrap items-center gap-2">
								{#if topic.path && reachable}
									{#if tour}
										<Button size="sm" href={tourHref(tour)}>
											<Sparkles class="size-4" aria-hidden="true" />
											{m.help_show_me()}
										</Button>
									{/if}
									<Button size="sm" variant="outline" href={resolve(topic.path as '/dashboard')}>
										{m.help_open_screen()}
										<ArrowUpRight class="size-4" aria-hidden="true" />
									</Button>
								{:else if topic.path}
									<span class="flex items-center gap-1.5 text-sm text-muted-foreground">
										<Lock class="size-4" aria-hidden="true" />
										{m.help_not_your_role()}
									</span>
								{/if}
								<span class="ms-auto flex flex-wrap gap-1">
									{#each topic.roles as r (r)}
										<span class="role">{ROLE_LABELS[r]()}</span>
									{/each}
								</span>
							</div>
						</div>
					{/if}
				</article>
			{/each}
		</section>
	{:else}
		<div class="empty">
			<p class="font-semibold">{m.help_none_title()}</p>
			<p class="text-sm text-muted-foreground">{m.help_none_text()}</p>
			<div class="mt-3 flex flex-wrap justify-center gap-2">
				<Button variant="outline" size="sm" onclick={clearAll}>{m.help_filter_clear()}</Button>
				<Button variant="ghost" size="sm" href="mailto:{SITE.email}">{SITE.email}</Button>
			</div>
		</div>
	{/each}

	<p class="border-t pt-4 text-sm text-muted-foreground">
		{m.help_still_stuck()}
		<a class="underline" href="mailto:{SITE.email}">{SITE.email}</a> ·
		{#each SITE.phones as phone, i (phone)}{#if i}
				·
			{/if}<a class="underline" href="tel:{telNumber(phone)}">{phone}</a>{/each}
	</p>
</div>

<style>
	.filters {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--card);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.875rem;
	}
	.chip:hover:not(:disabled) {
		border-color: var(--foreground);
	}
	.chip[aria-pressed='true'] {
		border-color: var(--primary);
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.chip:disabled {
		opacity: 0.45;
	}
	.chip:focus-visible,
	.topic-head:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	.count {
		font-size: 0.75rem;
		opacity: 0.75;
		font-variant-numeric: tabular-nums;
	}
	.topic {
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--card);
	}
	.topic-head {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 1rem;
		text-align: start;
	}
	.chevron {
		flex: none;
		width: 0.6rem;
		height: 0.6rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(45deg);
		opacity: 0.6;
		transition: transform 0.2s ease;
	}
	[aria-expanded='true'] .chevron {
		transform: rotate(225deg);
	}
	.topic-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 0 1rem 1rem;
		border-top: 1px solid var(--border);
		padding-top: 1rem;
		font-size: 0.925rem;
		line-height: 1.55;
	}
	.notes {
		display: grid;
		gap: 0.4rem;
		padding: 0.75rem 0.9rem;
		border-left: 4px solid var(--brand-green);
		border-radius: 6px;
		background: var(--muted);
		font-size: 0.875rem;
	}
	.role {
		padding: 0.1rem 0.45rem;
		border-radius: 4px;
		background: var(--muted);
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}
	.empty {
		padding: 2.5rem 1rem;
		border: 1px dashed var(--border);
		border-radius: 10px;
		text-align: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
