<script lang="ts">
	import FilterField from './FilterField.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/**
	 * A choice among options, with an "any" first that sends `anyValue` (0 or empty): the filter
	 * is off.
	 */
	let {
		name,
		label,
		value,
		options,
		anyLabel = undefined,
		anyValue = ''
	}: {
		name: string;
		label: string;
		value: string | number | null | undefined;
		options: { value: string | number; name: string }[];
		/** Defaults to "Any". Pass null to offer no "any". */
		anyLabel?: string | null;
		anyValue?: string | number;
	} = $props();
</script>

<FilterField {label} for={name}>
	<select
		id={name}
		{name}
		class="h-9 rounded-md border bg-background px-2 text-sm"
		value={String(value ?? anyValue)}
	>
		{#if anyLabel !== null}
			<option value={String(anyValue)}>{anyLabel ?? m.common_any()}</option>
		{/if}
		{#each options as option (option.value)}
			<option value={String(option.value)}>{option.name}</option>
		{/each}
	</select>
</FilterField>
