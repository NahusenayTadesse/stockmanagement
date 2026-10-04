<script lang="ts">
	let { text }: { text: string | null } = $props();
</script>
<span class="block min-w-36 max-w-80 whitespace-normal break-words" title={text ?? undefined}>{text ?? ''}</span>
