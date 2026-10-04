<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { afterNavigate } from '$app/navigation';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import DarkMode from '@nahu/admin-kit/components/shell/DarkMode.svelte';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import BrandLogo from '$lib/components/site/BrandLogo.svelte';
	import { SITE, telNumber, pageTitle } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * The public site's frame: the header with the Digital Construct lockup and the way in, the
	 * page, and the footer — a navy slab in both themes, as the logo's own ground.
	 */
	let { data, children } = $props();

	let menuOpen = $state(false);
	afterNavigate(() => (menuOpen = false));

	const links = $derived([
		{ path: '/', label: m.site_nav_home() },
		{ path: '/pricing', label: m.site_nav_pricing() },
		{ path: '/about', label: m.site_nav_about() },
		{ path: '/contact', label: m.site_nav_contact() }
	] as const);
	const current = (path: (typeof links)[number]['path']) => page.url.pathname === resolve(path);

	/** Where a signed-in visitor works: the site admin's console, or their business. */
	const home = $derived(data.viewer?.siteAdmin ? resolve('/admin') : resolve('/dashboard'));
</script>

<svelte:head>
	<link rel="canonical" href={data.canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={SITE.product} />
	<meta property="og:title" content={pageTitle(links.find((link) => current(link.path))?.label)} />
	<meta property="og:description" content={m.site_hero_lede()} />
	<meta property="og:url" content={data.canonical} />
	<meta property="og:image" content={`${data.origin}/brand/product-preview.png`} />
	<meta property="og:image:alt" content={m.site_demo_note()} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>
<div class="flex min-h-dvh flex-col">
	<a
		href="#content"
		class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
	>
		{m.site_skip_to_content()}
	</a>

	<header class="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
		<div class="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
			<a href={resolve('/')} aria-label={SITE.product} class="shrink-0">
				<BrandLogo class="h-8 sm:h-9" />
			</a>

			<nav aria-label={m.site_nav_label()} class="hidden items-center gap-1 md:flex">
				{#each links as link (link.path)}
					<a
						href={resolve(link.path)}
						aria-current={current(link.path) ? 'page' : undefined}
						class="nav-link">{link.label}</a
					>
				{/each}
			</nav>

			<div class="flex items-center gap-1">
				<LanguageSwitch compact />
				<DarkMode />
				<div class="hidden items-center gap-2 pl-2 sm:flex">
					{#if data.viewer}
						<Button href={home}>{m.site_open_dashboard()}</Button>
					{:else}
						<Button href={resolve('/login')} variant="ghost">{m.admin_login_title()}</Button>
						<Button href={resolve('/register')}>{m.site_cta_trial_short()}</Button>
					{/if}
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="md:hidden"
					aria-expanded={menuOpen}
					aria-controls="site-menu"
					aria-label={menuOpen ? m.site_menu_close() : m.site_menu_open()}
					onclick={() => (menuOpen = !menuOpen)}
				>
					{#if menuOpen}<X />{:else}<Menu />{/if}
				</Button>
			</div>
		</div>

		{#if menuOpen}
			<nav id="site-menu" aria-label={m.site_nav_label()} class="border-t md:hidden">
				<div class="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
					{#each links as link (link.path)}
						<a
							href={resolve(link.path)}
							aria-current={current(link.path) ? 'page' : undefined}
							class="nav-link">{link.label}</a
						>
					{/each}
					<div class="mt-2 grid gap-2 border-t pt-3 sm:hidden">
						{#if data.viewer}
							<Button href={home}>{m.site_open_dashboard()}</Button>
						{:else}
							<Button href={resolve('/register')}>{m.site_cta_trial_short()}</Button>
							<Button href={resolve('/login')} variant="outline">{m.admin_login_title()}</Button>
						{/if}
					</div>
				</div>
			</nav>
		{/if}
	</header>

	<main id="content" class="flex-1">
		{@render children()}
	</main>

	<footer class="bg-brand-navy text-white">
		<div
			class="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]"
		>
			<div class="flex flex-col gap-4">
				<BrandLogo onDark class="h-10" />
				<p class="max-w-xs text-sm text-white/75">{m.site_footer_blurb()}</p>
			</div>

			<div>
				<h2 class="footer-title">{m.site_footer_product()}</h2>
				<ul class="footer-list">
					<li><a href="{resolve('/')}#features">{m.site_footer_features()}</a></li>
					<li><a href={resolve('/pricing')}>{m.site_nav_pricing()}</a></li>
					<li><a href={resolve('/register')}>{m.site_footer_register()}</a></li>
					<li><a href={resolve('/login')}>{m.admin_login_title()}</a></li>
				</ul>
			</div>

			<div>
				<h2 class="footer-title">{m.site_footer_company()}</h2>
				<ul class="footer-list">
					<li><a href={resolve('/about')}>{m.site_nav_about()}</a></li>
					<li><a href={resolve('/contact')}>{m.site_nav_contact()}</a></li>
					<li><a href="/support">{m.site_support()}</a></li>
					<li><a href="/demo">{m.site_demo()}</a></li>
					<li>
						<a href={SITE.websiteUrl} target="_blank" rel="noopener external">{SITE.website}</a>
					</li>
				</ul>
			</div>

			<div>
				<h2 class="footer-title">{m.site_footer_reach()}</h2>
				<ul class="footer-list">
					<li><a href="mailto:{SITE.email}" class="break-all">{SITE.email}</a></li>
					{#each SITE.phones as phone (phone)}
						<li><a href="tel:{telNumber(phone)}">{phone}</a></li>
					{/each}
					<li>{SITE.city}</li>
				</ul>
			</div>
		</div>
		<div class="border-t border-white/15">
			<p class="mx-auto max-w-6xl px-4 py-4 text-xs text-white/65 sm:px-6">
				{m.site_footer_rights({ year: new Date().getFullYear(), company: SITE.company })}
			</p>
		</div>
	</footer>
</div>

<style>
	.nav-link {
		padding: 0.45rem 0.75rem;
		font-size: 0.925rem;
		font-weight: 500;
		color: var(--muted-foreground);
		/* A block under the current page, not an underline: the mark is made of blocks. */
		box-shadow: inset 0 -3px 0 0 transparent;
	}
	.nav-link:hover {
		color: var(--foreground);
	}
	.nav-link[aria-current='page'] {
		color: var(--foreground);
		box-shadow: inset 0 -3px 0 0 var(--brand-green);
	}

	.footer-title {
		font-family: var(--font-body);
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.4;
		color: #fff;
	}
	.footer-list {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.85rem;
		font-size: 0.875rem;
		color: rgb(255 255 255 / 0.75);
	}
	.footer-list a:hover {
		color: #fff;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
