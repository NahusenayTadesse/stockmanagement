<script lang="ts">
	import ProductPreview from '$lib/components/site/ProductPreview.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { pageTitle } from '$lib/site';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
</script>
<svelte:head><title>{pageTitle(m.site_demo_title())}</title><meta name="description" content={m.site_demo_note()} /></svelte:head>
<section class="site-wrap site-section"><h1 class="display-2">{m.site_demo_title()}</h1><p class="site-lede my-5">{m.site_local_short()}</p><div class="max-w-3xl"><ProductPreview /></div><div class="mt-6"><Button href="/register">{m.site_cta_trial()}</Button></div></section>
