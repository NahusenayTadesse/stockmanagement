<script lang="ts">
	import Languages from '@lucide/svelte/icons/languages';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { getLocale, setLocale, type Locale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * English ⇄ አማርኛ. The choice is kept in a cookie and the page reloads in it, so everything —
	 * the server's messages included — is in the one language.
	 */
	let { compact = false }: { compact?: boolean } = $props();

	const current = getLocale();
	const other: Locale = current === 'am' ? 'en' : 'am';
	const label = other === 'am' ? m.common_language_am() : m.common_language_en();
</script>

<Button
	variant="ghost"
	size={compact ? 'icon' : 'sm'}
	onclick={() => setLocale(other)}
	aria-label="{m.common_language()}: {label}"
	title="{m.common_language()}: {label}"
	lang={other}
>
	<Languages />
	{#if !compact}{label}{/if}
</Button>
