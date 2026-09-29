<script lang="ts">
	import { page } from '$app/state';
	import { getFlash } from 'sveltekit-flash-message';
	import { toast } from 'svelte-sonner';
	import { Toaster } from 'svelte-sonner';
	import { ModeWatcher } from 'mode-watcher';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setKitLabels } from '@nahu/admin-kit/labels';
	import { kitLabels } from '$lib/kitLabels';

	let { children } = $props();

	// The admin-kit's own words (tables, dialogs, pickers) in the viewer's language — for every
	// page, sign-in and print sheets included. A function, read as each component renders.
	setKitLabels(kitLabels);

	// Messages set on a redirect (`redirect(url, { type, message }, cookies)`), shown once.
	const flash = getFlash(page, { clearAfterMs: 5000 });

	$effect(() => {
		if (!$flash) return;
		if ($flash.type === 'error') toast.error($flash.message);
		else toast.success($flash.message);
		$flash = undefined;
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher />
<Toaster richColors closeButton position="bottom-right" />

{@render children()}
