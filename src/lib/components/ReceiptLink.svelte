<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * A stored receipt, opened in a new tab. `base` is the file route that serves it: a business
	 * reads its own under `/dashboard/files`, the site admin reads any under `/admin/files`.
	 */
	let {
		file,
		base = '/dashboard/files'
	}: {
		file: string | null | undefined;
		base?: string;
	} = $props();
</script>

{#if file}
	<!-- A stored file served by a file route, not a page: there is no route id to resolve. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		href="{base}/{encodeURIComponent(file)}"
		target="_blank"
		rel="noopener"
		class="inline-flex items-center gap-1 underline underline-offset-2"
	>
		<Paperclip class="size-4" aria-hidden="true" />{m.billing_receipt_open()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
