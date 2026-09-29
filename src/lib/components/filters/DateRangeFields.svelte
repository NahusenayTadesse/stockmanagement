<script lang="ts">
	import DateInput from '@nahu/admin-kit/formComponents/DateInput.svelte';
	import FilterField from './FilterField.svelte';
	import { m } from '$lib/paraglide/messages.js';

	/** A period: from and to, each switchable between calendars, sent as Gregorian `from`/`to`. */
	let {
		from,
		to,
		fromLabel = undefined,
		toLabel = undefined
	}: {
		from: string | null | undefined;
		to: string | null | undefined;
		fromLabel?: string;
		toLabel?: string;
	} = $props();
</script>

<FilterField label={fromLabel ?? m.common_from()} for="from">
	<DateInput id="from" name="from" value={from ?? ''} />
</FilterField>
<FilterField label={toLabel ?? m.common_to()} for="to">
	<DateInput id="to" name="to" value={to ?? ''} />
</FilterField>
