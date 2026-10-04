<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
</script>
<svelte:head><title>{page.status}</title><meta name="robots" content="noindex" /></svelte:head>
<main class="mx-auto max-w-lg p-8">
	<h1>{page.status}</h1><p class="mt-4" role="alert">{page.error?.message}</p>
	{#if page.error?.requestId}<p class="mt-4 text-sm">{m.common_reference_id()}: <code>{page.error.requestId}</code></p>{/if}
	<a class="mt-6 inline-block underline" href="/dashboard">{m.common_dashboard()}</a>
</main>
