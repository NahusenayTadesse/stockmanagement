<script lang="ts">
	import type { SuperForm } from 'sveltekit-superforms';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';

	/** A requisition's header, shared by "new requisition" and the draft's edit dialog. */
	let {
		form,
		errors,
		locations,
		departments
	}: {
		form: SuperForm<Record<string, unknown>>['form'];
		errors: SuperForm<Record<string, unknown>>['errors'];
		locations: { value: number; name: string }[];
		/** Departments that have asked before, offered as suggestions. */
		departments: string[];
	} = $props();
</script>

<div class="flex flex-col gap-1">
	<InputComp
		{form}
		{errors}
		name="department"
		label="Department"
		placeholder="Ward, kitchen, site or project asking"
		required
	/>
	{#if departments.length}
		<div class="flex flex-wrap gap-1">
			{#each departments as d (d)}
				<button
					type="button"
					class="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
					onclick={() => ($form.department = d)}>{d}</button
				>
			{/each}
		</div>
	{/if}
</div>
<InputComp
	{form}
	{errors}
	name="locationId"
	type="combo"
	label="From store"
	items={locations}
	required
/>
<InputComp {form} {errors} name="requestDate" type="date" label="Date" year required />
<InputComp
	{form}
	{errors}
	name="neededBy"
	type="date"
	label="Needed by (optional)"
	year
	futureDays
/>
<InputComp {form} {errors} name="note" type="textarea" rows={3} label="Note (optional)" />
