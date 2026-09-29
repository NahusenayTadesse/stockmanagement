<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * A list's or report's filters, sent as a GET form so every view has its own link. The fields
	 * go inside (`FilterField`, `FilterSelect`, `DateRangeFields`); the button is here.
	 */
	let {
		submitLabel = undefined,
		children,
		after = undefined
	}: {
		/** On the button. Defaults to "Show". */
		submitLabel?: string;
		children: Snippet;
		/** Under the fields (quick links such as date presets). */
		after?: Snippet;
	} = $props();
</script>

<Card.Root>
	<Card.Content class="flex flex-col gap-3 pt-6">
		<form method="GET" class="flex flex-wrap items-end gap-3">
			{@render children()}
			<Button type="submit">{submitLabel ?? m.common_show()}</Button>
		</form>
		{@render after?.()}
	</Card.Content>
</Card.Root>
