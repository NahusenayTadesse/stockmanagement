<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import DarkMode from '@nahu/admin-kit/components/shell/DarkMode.svelte';
	import { resolve } from '$app/paths';
	import LanguageSwitch from './LanguageSwitch.svelte';
	import BrandLogo from './site/BrandLogo.svelte';
	import { SITE, pageTitle } from '$lib/site';

	/**
	 * The signed-out screens (sign in, forgot and reset password): the Digital Construct lockup —
	 * which leads back to the public site — over one card in the middle of the page, its title
	 * beside the language and theme switches, and a line of links under it.
	 */
	let {
		title,
		tabTitle = undefined,
		description = undefined,
		wide = false,
		children,
		footer
	}: {
		title: string;
		/** The browser tab, when it should differ from the title. */
		tabTitle?: string;
		description?: string;
		/** A longer form gets a wider card. */
		wide?: boolean;
		children: Snippet;
		footer: Snippet;
	} = $props();
</script>

<svelte:head>
	<title>{pageTitle(tabTitle ?? title)}</title>
</svelte:head>

<div class="flex min-h-dvh w-full flex-col items-center justify-center gap-6 px-4 py-8">
	<a href={resolve('/')} aria-label={SITE.product}><BrandLogo class="h-10" /></a>
	<Card.Root class={wide ? 'w-full max-w-lg' : 'w-full max-w-md'}>
		<Card.Header>
			<Card.Title class="flex flex-row items-center justify-between text-2xl">
				{title}
				<span class="flex items-center gap-1"><LanguageSwitch compact /><DarkMode /></span>
			</Card.Title>
			{#if description}<Card.Description>{description}</Card.Description>{/if}
		</Card.Header>
		<Card.Content>
			{@render children()}
		</Card.Content>
		<Card.Footer class="text-sm text-muted-foreground">
			{@render footer()}
		</Card.Footer>
	</Card.Root>
</div>
