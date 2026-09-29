<script lang="ts">
	import * as Sidebar from '@nahu/admin-kit/components/ui/sidebar/index.js';
	import { useSidebar } from '@nahu/admin-kit/components/ui/sidebar/index.js';
	import NavMain from '@nahu/admin-kit/components/shell/NavMain.svelte';
	import { useKit } from '@nahu/admin-kit/context';
	import { visibleNavigation } from '@nahu/admin-kit/navigation';
	import { appSurface } from '@nahu/admin-kit/global';
	import { fileUrl } from '@nahu/admin-kit/files';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * The kit's sidebar, with two things it cannot express: the business's own logo at the top,
	 * and the "Prepared by Digital Construct" credit at the bottom. The kit's footer takes a string
	 * only; the credit is an image and a link, and is fixed for this product rather than configured.
	 */
	let { name, logo }: { name: string; logo: string | null } = $props();

	const kit = useKit();
	const sidebar = useSidebar();

	const items = $derived(visibleNavigation(kit.navigation, kit.canOpen));

	function closeSidebar() {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	}
</script>

<Sidebar.Root collapsible="offcanvas">
	<Sidebar.Content class="h-full [scrollbar-width:thin] overflow-y-auto pt-4 {appSurface}">
		<Sidebar.Group>
			<div class="flex items-center gap-2 px-2 pb-2">
				{#if logo}
					<img
						src={fileUrl(logo)}
						alt=""
						class="h-9 w-9 shrink-0 rounded bg-white object-contain p-0.5"
					/>
				{/if}
				<span class="truncate text-lg font-bold" title={name}>{name}</span>
			</div>
			<Sidebar.GroupContent class="my-4">
				<NavMain {closeSidebar} {items} />
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer class="border-t bg-sidebar">
		<a
			href="https://digitalconstruct.io"
			target="_blank"
			rel="noopener"
			class="flex items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-sidebar-accent"
			title="Digital Construct — digitalconstruct.io"
		>
			<span class="text-xs text-muted-foreground">{m.common_prepared_by()}</span>
			<!-- White tile: the logo is navy on white and would vanish on the dark sidebar. -->
			<span class="rounded bg-white px-1">
				<img src="/digital-construct-logo.png" alt="Digital Construct" class="h-12 w-auto" />
			</span>
		</a>
	</Sidebar.Footer>
</Sidebar.Root>
