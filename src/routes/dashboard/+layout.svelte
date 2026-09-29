<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import CircleUser from '@lucide/svelte/icons/circle-user';
	import * as Sidebar from '@nahu/admin-kit/components/ui/sidebar/index.js';
	import * as DropdownMenu from '@nahu/admin-kit/components/ui/dropdown-menu/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import KitProvider from '@nahu/admin-kit/components/KitProvider.svelte';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import Search from '@nahu/admin-kit/components/shell/Search.svelte';
	import DarkMode from '@nahu/admin-kit/components/shell/DarkMode.svelte';
	import { access } from '$lib/access';
	import { ENTITIES, NAVIGATION } from '$lib/navigation';

	let { data, children } = $props();

	let logoutForm = $state<HTMLFormElement>();

	/** An internal store that never sells has no use for the customer list. */
	const navigation = $derived(
		data.organization?.sellsToCustomers
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
	<Sidebar.Provider>
		<AppSidebar
			name={data.organization?.name ?? m.common_dashboard()}
			logo={data.organization?.logo ?? null}
		/>
		<main class="min-w-0 flex-1 px-2">
			<div
				class="sticky top-2 z-50 flex items-center justify-between rounded-lg p-2 shadow-lg backdrop-blur-md"
			>
				<Sidebar.Trigger />
				<div class="flex items-center gap-2">
					<Search />
					<LanguageSwitch />
					<DarkMode />
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="icon" aria-label={m.common_your_account()}>
									<CircleUser />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							<DropdownMenu.Label>
								<p>{data.user.name}</p>
								<p class="text-xs font-normal text-muted-foreground">{data.user.email}</p>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<a {...props} href={resolve('/dashboard/change-password')}
										><KeyRound /> {m.common_change_password()}</a
									>
								{/snippet}
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => logoutForm?.requestSubmit()}>
								<LogOut />
								{m.common_sign_out()}
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</div>
			<div class="p-2 pt-4">
				{@render children()}
			</div>
		</main>
	</Sidebar.Provider>
</KitProvider>

<form bind:this={logoutForm} method="POST" action="/dashboard?/logout" use:enhance hidden></form>
