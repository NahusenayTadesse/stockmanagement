<script lang="ts">
	/** A link to what an approval is about. `href` is built on the server from the subject's id. */
	let { href, label }: { href: string; label: string } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a class="font-medium underline-offset-4 hover:underline" {href}>{label}</a>
