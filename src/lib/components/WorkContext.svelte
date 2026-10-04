<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { useKit } from '@nahu/admin-kit/context';
	import { NAVIGATION } from '$lib/navigation';
	import { m } from '$lib/paraglide/messages.js';
	let { name, userId }: { name: string; userId: string } = $props();
	const kit = useKit();
	let remembered = $state<Record<string, string>>({});
	const entries = $derived([...NAVIGATION, ...NAVIGATION.flatMap((entry) => entry.items ?? [])]);
	const crumbs = $derived(entries.filter((entry, i, all) => entry.url && all.findIndex((other) => other.url === entry.url) === i && kit.canOpen(entry.url) && (page.url.pathname === entry.url || page.url.pathname.startsWith(entry.url + '/'))).sort((a, b) => (a.url?.length ?? 0) - (b.url?.length ?? 0)));
	onMount(() => { try { remembered = JSON.parse(sessionStorage.getItem(`stock:lists:${userId}`) ?? '{}'); } catch { remembered = {}; } });
	beforeNavigate(() => {
		if (entries.some((entry) => entry.url === page.url.pathname)) {
			remembered = { ...remembered, [page.url.pathname]: page.url.pathname + page.url.search };
			try { sessionStorage.setItem(`stock:lists:${userId}`, JSON.stringify(remembered)); } catch { /* Navigation still works when storage is unavailable. */ }
		}
	});
	const href = (path: string) => remembered[path]?.startsWith(path + '?') ? remembered[path] : path;
</script>
<div class="my-3 flex flex-wrap items-center justify-between gap-2 text-sm">
	<nav aria-label={m.common_breadcrumbs()}><ol class="flex flex-wrap items-center gap-2">{#each crumbs as crumb (crumb.url)}<li><a class="underline-offset-4 hover:underline" aria-current={page.url.pathname === crumb.url ? 'page' : undefined} href={href(crumb.url!)}>{crumb.title}</a></li>{#if crumb !== crumbs.at(-1)}<li aria-hidden="true">/</li>{/if}{/each}</ol></nav>
	<span class="max-w-full break-words text-muted-foreground">{name}</span>
</div>
