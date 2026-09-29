<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import LookupPage from '@nahu/admin-kit/components/lookup/LookupPage.svelte';
	import PageHeader from '@nahu/admin-kit/components/PageHeader.svelte';

	/**
	 * One settings list (units, branches, locations…): the page's header, then the kit's lookup
	 * screen — add dialog and table — then anything the page adds below it.
	 */
	let {
		data,
		config,
		schemas,
		description = undefined,
		children = undefined
	}: ComponentProps<typeof LookupPage> & {
		/** A sentence under the title saying what the list is for. */
		description?: string;
		/** More of the page, under the table. */
		children?: Snippet;
	} = $props();
</script>

<div class="flex flex-col gap-6">
	<PageHeader title={config.plural} {description} />
	<div class="flex flex-col gap-2">
		<LookupPage {data} {config} {schemas} tabTitle={false} />
	</div>
	{@render children?.()}
</div>
