<script lang="ts">
	import type { Component } from 'svelte';
	import type { IconProps } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { Button, type ButtonVariant } from '@nahu/admin-kit/components/ui/button/index.js';

	/**
	 * A button that posts to a form action straight away (no question first) and says it is busy
	 * until the answer comes back: email a statement, text the reminders.
	 */
	let {
		action,
		label,
		busyLabel = undefined,
		icon: Icon = undefined,
		variant = 'outline',
		disabled = false
	}: {
		action: string;
		label: string;
		/** While it posts. Defaults to the label. */
		busyLabel?: string;
		icon?: Component<IconProps>;
		variant?: ButtonVariant;
		disabled?: boolean;
	} = $props();

	let busy = $state(false);
</script>

<form
	method="POST"
	{action}
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<Button type="submit" {variant} disabled={disabled || busy}>
		{#if Icon}<Icon />{/if}
		{busy ? (busyLabel ?? label) : label}
	</Button>
</form>
