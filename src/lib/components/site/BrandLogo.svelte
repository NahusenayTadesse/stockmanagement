<script lang="ts">
	import { asset } from '$app/paths';
	import { SITE } from '$lib/site';

	/**
	 * The Digital Construct lockup, and beside it the product's name. Two files, because the logo is
	 * navy: `dc-logo-on-dark.png` is the same artwork with the navy turned white, for the dark theme
	 * and for the footer, which is navy in both themes. Both are cut from
	 * `static/digital-construct-logo.png`.
	 */
	let {
		onDark = false,
		product = true,
		class: className = 'h-9'
	}: {
		/** Always the light-on-dark artwork: for a surface that is dark in both themes. */
		onDark?: boolean;
		/** Show the product's short name after the logo. */
		product?: boolean;
		/** The logo's height. */
		class?: string;
	} = $props();
</script>

<span class="inline-flex items-center gap-3">
	{#if onDark}
		<img
			src={asset('/brand/dc-logo-on-dark.png')}
			alt={SITE.company}
			width="657"
			height="200"
			class="w-auto {className}"
		/>
	{:else}
		<img
			src={asset('/brand/dc-logo.png')}
			alt={SITE.company}
			width="657"
			height="200"
			class="w-auto dark:hidden {className}"
		/>
		<img
			src={asset('/brand/dc-logo-on-dark.png')}
			alt={SITE.company}
			width="657"
			height="200"
			class="hidden w-auto dark:block {className}"
		/>
	{/if}
	{#if product}
		<span
			class="border-l pl-3 font-display text-2xl leading-none font-semibold {onDark
				? 'border-white/30 text-white'
				: 'border-foreground/25'}"
		>
			{SITE.productShort}
		</span>
	{/if}
</span>
