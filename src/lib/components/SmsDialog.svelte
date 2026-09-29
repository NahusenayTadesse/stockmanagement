<script lang="ts">
	import { enhance } from '$app/forms';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import { Input } from '@nahu/admin-kit/components/ui/input/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';
	import DialogComp from '@nahu/admin-kit/formComponents/DialogComp.svelte';

	/**
	 * "Send by SMS": a number (prefilled with the one on file) and, when `withText`, a message to
	 * write. Posts `to` (and `text`) to `action`; the page flashes what happened.
	 */
	let {
		action,
		title = 'Send by SMS',
		phone = '',
		withText = false,
		preview = ''
	}: {
		action: string;
		title?: string;
		phone?: string | null;
		/** A message box to write in, rather than a message the system composes. */
		withText?: boolean;
		/** What the system will send, shown so the person knows before sending. */
		preview?: string;
	} = $props();

	let open = $state(false);
	let sending = $state(false);
	let text = $state('');
	const id = $props.id();
</script>

<DialogComp bind:open {title} variant="outline" IconComp={MessageSquare}>
	<form
		method="POST"
		{action}
		class="flex flex-col gap-4"
		use:enhance={() => {
			sending = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				sending = false;
				if (result.type === 'success') {
					open = false;
					text = '';
				}
			};
		}}
	>
		<div class="flex flex-col gap-2">
			<Label for="{id}-to">Mobile number</Label>
			<Input
				id="{id}-to"
				name="to"
				type="tel"
				value={phone ?? ''}
				placeholder="0911 234 567"
				required
			/>
		</div>
		{#if withText}
			<div class="flex flex-col gap-2">
				<Label for="{id}-text">Message</Label>
				<textarea
					id="{id}-text"
					name="text"
					rows="4"
					maxlength="300"
					required
					bind:value={text}
					class="rounded-md border bg-background px-3 py-2 text-sm"></textarea>
				<p class="text-xs text-muted-foreground">{text.length} / 300</p>
			</div>
		{:else if preview}
			<p class="rounded-md bg-muted p-3 text-sm">{preview}</p>
		{/if}
		<Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send'}</Button>
	</form>
</DialogComp>
