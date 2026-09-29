<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';
	import AdminCard from '@nahu/admin-kit/components/shell/AdminCard.svelte';
	import { useKit } from '@nahu/admin-kit/context';
	import { SETTINGS_SECTIONS } from '$lib/navigation';

	const kit = useKit();

	// The same gate the server applies: a screen the viewer cannot open is not offered.
	const sections = $derived(
		SETTINGS_SECTIONS.map((s) => ({
			...s,
			items: s.items.filter((i) => kit.canOpen(i.url))
		})).filter((s) => s.items.length)
	);
</script>

<div class="mx-auto flex max-w-7xl flex-col gap-8 py-6">
	<PageHeader title={m.nav_admin()} description={m.admin_panel_intro()} />

	<div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
		{#each sections as section (section.title)}
			<AdminCard
				title={section.title}
				description={section.description}
				icon={section.icon}
				items={section.items}
			/>
		{/each}
	</div>
</div>
