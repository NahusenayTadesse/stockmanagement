<script lang="ts">
	import { resolve } from '$app/paths';
	import Warehouse from '@lucide/svelte/icons/warehouse';
	import Globe from '@lucide/svelte/icons/globe';
	import * as Sidebar from '@nahu/admin-kit/components/ui/sidebar/index.js';
	import * as DropdownMenu from '@nahu/admin-kit/components/ui/dropdown-menu/index.js';
	import KitProvider from '@nahu/admin-kit/components/KitProvider.svelte';
	import KitSidebar from '@nahu/admin-kit/components/shell/AppSidebar.svelte';
	import BrandLogo from '$lib/components/site/BrandLogo.svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import { adminAccess, SITE_ADMIN } from '$lib/access';
	import { ADMIN_ENTITIES, ADMIN_NAVIGATION } from '$lib/navigation';
	import { SITE } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';

	let { data, children } = $props();
</script>

<!-- Everyone who reaches this layout is a site admin: the one permission the menu asks for. -->
<KitProvider
	access={adminAccess}
	navigation={ADMIN_NAVIGATION}
	entities={ADMIN_ENTITIES}
	permList={[SITE_ADMIN]}
>
	<Sidebar.Provider>
		<KitSidebar footer={m.platform_title()}>
			{#snippet logo()}
				<a href={resolve('/admin')} aria-label={SITE.product}><BrandLogo class="h-8" /></a>
			{/snippet}
		</KitSidebar>
		<main class="min-w-0 flex-1 px-2">
			<TopBar user={data.user}>
				{#snippet menu()}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={resolve('/dashboard')}><Warehouse /> {m.platform_open_stock()}</a>
						{/snippet}
					</DropdownMenu.Item>
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={resolve('/')}><Globe /> {m.platform_open_site()}</a>
						{/snippet}
					</DropdownMenu.Item>
				{/snippet}
			</TopBar>
			<div class="p-2 pt-4">
				{@render children()}
			</div>
		</main>
	</Sidebar.Provider>
</KitProvider>
