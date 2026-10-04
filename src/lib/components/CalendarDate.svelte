<script lang="ts">
	import { ethiopianDate } from '@nahu/admin-kit/tableCells';
	let { value }: { value: unknown } = $props();
	const gregorian = $derived.by(() => {
		if (!value) return '';
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
		const date = value instanceof Date ? value : new Date(String(value));
		return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
	});
</script>
{#if gregorian}<span class="block whitespace-nowrap">{ethiopianDate(value)} E.C.</span><span class="block whitespace-nowrap text-xs text-muted-foreground">{gregorian} G.C.</span>{/if}
