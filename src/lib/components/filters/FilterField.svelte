<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';

	/** One filter: its label over its control. */
	let { label, for: forId, children }: { label: string; for: string; children: Snippet } = $props();
</script>

<div class="flex flex-col gap-1">
	<Label for={forId}>{label}</Label>
	{@render children()}
</div>
