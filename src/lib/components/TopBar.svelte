<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LogOut from '@lucide/svelte/icons/log-out';
	import CircleUser from '@lucide/svelte/icons/circle-user';
	import * as Sidebar from '@nahu/admin-kit/components/ui/sidebar/index.js';
	import * as DropdownMenu from '@nahu/admin-kit/components/ui/dropdown-menu/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import Search from '@nahu/admin-kit/components/shell/Search.svelte';
	import DarkMode from '@nahu/admin-kit/components/shell/DarkMode.svelte';
	import LanguageSwitch from './LanguageSwitch.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * The bar above every signed-in page — a business's dashboard and the site admin alike: the
	 * menu button, search, language, theme, and the viewer's own menu (change password, whatever
	 * the layout adds, sign out).
	 */
	let {
		user,
		menu = undefined
	}: {
		user: { name: string; email: string };
		/** More `DropdownMenu.Item`s for the viewer's menu, between "Change password" and "Sign out". */
		menu?: Snippet;
	} = $props();

	let logoutForm = $state<HTMLFormElement>();
</script>

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
					<p>{user.name}</p>
					<p class="text-xs font-normal text-muted-foreground">{user.email}</p>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href={resolve('/dashboard/change-password')}
							><KeyRound /> {m.common_change_password()}</a
						>
					{/snippet}
				</DropdownMenu.Item>
				{@render menu?.()}
				<DropdownMenu.Item onSelect={() => logoutForm?.requestSubmit()}>
					<LogOut />
					{m.common_sign_out()}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>

<form bind:this={logoutForm} method="POST" action="/dashboard?/logout" use:enhance hidden></form>
