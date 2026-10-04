<script lang="ts">
	import { SITE, pageTitle, telNumber } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';
</script>
<svelte:head><title>{pageTitle(m.site_support())}</title><meta name="description" content={m.site_support_intro()} /></svelte:head>
<section class="site-wrap site-section"><div class="max-w-2xl"><h1 class="display-2">{m.site_support()}</h1><p class="site-lede mt-5">{m.site_support_intro()}</p><ul class="my-6 space-y-3"><li><a class="underline" href="mailto:{SITE.email}">{SITE.email}</a></li>{#each SITE.phones as phone (phone)}<li><a class="underline" href="tel:{telNumber(phone)}">{phone}</a></li>{/each}</ul><p class="my-5">{m.site_support_reference()}</p><p class="my-5">{m.site_payment_expectation()}</p><p class="my-5">{m.site_support_data()}</p></div></section>
