<script lang="ts">
	/**
	 * A cell of a few lines: the first as it is, the rest under it in small type — an item and
	 * its code, a lot and its expiry. Empty lines are left out.
	 */
	let { lines }: { lines: (string | null | undefined | false)[] } = $props();

	const shown = $derived(lines.filter((line): line is string => Boolean(line)));
</script>

{#each shown as line, i (i)}
	<span class={i ? 'block text-xs' : 'block'}>{line}</span>
{/each}
