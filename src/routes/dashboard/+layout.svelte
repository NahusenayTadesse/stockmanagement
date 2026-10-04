<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import { ethiopianDay } from '$lib/format';
	import * as Sidebar from '@nahu/admin-kit/components/ui/sidebar/index.js';
	import * as DropdownMenu from '@nahu/admin-kit/components/ui/dropdown-menu/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import KitProvider from '@nahu/admin-kit/components/KitProvider.svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import WorkContext from '$lib/components/WorkContext.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import HelpButton from '$lib/components/help/HelpButton.svelte';
	import TourRunner from '$lib/components/help/TourRunner.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { access } from '$lib/access';
	import { ENTITIES, NAVIGATION } from '$lib/navigation';

	let { data, children } = $props();

	/**
	 * The subscription line above every page: a trial in its last days, a period about to end, a
	 * payment that is late. Not on the Subscription page itself, which says all of it in full.
	 */
	const billing = $derived.by(() => {
		const sub = data.subscription;
		if (!sub || !sub.paymentDue || page.url.pathname.startsWith('/dashboard/subscription')) {
			return null;
		}
		const date = ethiopianDay(sub.paidUntil);
		if (sub.status === 'trial') {
			return { tone: 'info' as const, text: m.billing_banner_trial({ days: sub.daysLeft, date }) };
		}
		if (sub.status === 'active') {
			return { tone: 'info' as const, text: m.billing_banner_renew({ days: sub.daysLeft, date }) };
		}
		if (sub.status === 'due') {
			return {
				tone: 'warning' as const,
				text: m.billing_banner_due({
					date,
					until: sub.graceEndsOn ? ethiopianDay(sub.graceEndsOn) : date
				})
			};
		}
		return null;
	});

	/**
	 * An internal store that never sells has no use for the customer list. A business whose
	 * subscription has lapsed has no menu at all: every page would only lead back to Subscription.
	 */
	const navigation = $derived(
		data.subscription && !data.subscription.allowed
			? []
			: data.organization?.sellsToCustomers
				? NAVIGATION
				: NAVIGATION.filter((entry) => entry.url !== '/dashboard/customers')
	);
</script>

<KitProvider
	{access}
	{navigation}
	entities={ENTITIES}
	permList={data.permList}
	isSuperAdmin={data.isSuperAdmin}
>
	<a href="#dashboard-content" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-primary focus:p-3 focus:text-primary-foreground">{m.site_skip_to_content()}</a>
	<Sidebar.Provider>
		<AppSidebar
			name={data.organization?.name ?? m.common_dashboard()}
			logo={data.organization?.logo ?? null}
		/>
		<main class="min-w-0 flex-1 px-2">
			<TopBar user={data.user}>
				{#snippet menu()}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={resolve('/dashboard/subscription')}
								><CreditCard /> {m.billing_title()}</a
							>
						{/snippet}
					</DropdownMenu.Item>
					{#if data.siteAdmin}
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a {...props} href={resolve('/admin')}><ShieldCheck /> {m.platform_title()}</a>
							{/snippet}
						</DropdownMenu.Item>
					{/if}
				{/snippet}
			</TopBar>
			<!-- Room at the bottom, so the help button never sits on a table's last row. -->
			<div id="dashboard-content" tabindex="-1" class="p-2 pt-4 pb-20">
				<WorkContext name={data.organization?.name ?? ''} userId={data.user.id} />
				{#if billing}
					<Notice tone={billing.tone} class="mb-4">
						{billing.text}
						{#snippet actions()}
							<Button size="sm" variant="outline" href={resolve('/dashboard/subscription')}>
								{m.billing_banner_open()}
							</Button>
						{/snippet}
					</Notice>
				{/if}
				{@render children()}
				<p class="mt-8 text-xs text-muted-foreground">{m.common_calendar_hint()}</p>
			</div>
		</main>
	</Sidebar.Provider>
	<HelpButton />
	<TourRunner />
</KitProvider>
