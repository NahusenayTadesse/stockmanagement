<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
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

<svelte:head>
	<title>{m.nav_admin()}</title>
</svelte:head>

<div class="mx-auto flex max-w-7xl flex-col gap-8 py-6">
	<div class="flex flex-col gap-2">
		<h1 class="text-3xl font-bold tracking-tight">{m.nav_admin()}</h1>
		<p class="max-w-2xl text-muted-foreground">
			{m.admin_panel_intro()}
		</p>
	</div>

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
