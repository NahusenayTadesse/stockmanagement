<script lang="ts">
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Globe from '@lucide/svelte/icons/globe';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import Errors from '@nahu/admin-kit/formComponents/Errors.svelte';
	import InputComp from '@nahu/admin-kit/formComponents/InputComp.svelte';
	import LoadingBtn from '@nahu/admin-kit/formComponents/LoadingBtn.svelte';
	import Notice from '@nahu/admin-kit/components/Notice.svelte';
	import { createForm } from '@nahu/admin-kit/forms/createForm';
	import { contactSchema } from '$lib/schemas/site';
	import { SITE, pageTitle, telNumber } from '$lib/site';
	import { m } from '$lib/paraglide/messages.js';

	let { data } = $props();

	/** Stays on the page after the toast has gone, so the visitor knows it went. */
	let sent = $state(false);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, allErrors, delayed } = createForm(data.form, contactSchema, {
		resetForm: true,
		onUpdated({ form }) {
			if (form.message?.type === 'success') sent = true;
		}
	});
</script>

<svelte:head>
	<title>{pageTitle(m.site_nav_contact())}</title>
	<meta name="description" content={m.site_contact_intro()} />
</svelte:head>

<section
	class="site-wrap grid gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
>
	<div>
		<h1 class="display-1">{m.site_contact_title()}</h1>
		<p class="site-lede mt-5">{m.site_contact_intro()}</p>

		<ul class="mt-10 grid gap-5">
			<li class="reach">
				<Mail aria-hidden="true" />
				<div>
					<p class="reach-label">{m.common_email()}</p>
					<a href="mailto:{SITE.email}" class="break-all">{SITE.email}</a>
				</div>
			</li>
			<li class="reach">
				<Phone aria-hidden="true" />
				<div>
					<p class="reach-label">{m.common_phone()}</p>
					{#each SITE.phones as phone (phone)}
						<a href="tel:{telNumber(phone)}" class="block tabular-nums">{phone}</a>
					{/each}
				</div>
			</li>
			<li class="reach">
				<MapPin aria-hidden="true" />
				<div>
					<p class="reach-label">{m.site_contact_where()}</p>
					<p>{SITE.city}</p>
				</div>
			</li>
			<li class="reach">
				<Globe aria-hidden="true" />
				<div>
					<p class="reach-label">{m.site_contact_website()}</p>
					<a href={SITE.websiteUrl} target="_blank" rel="noopener external">{SITE.website}</a>
				</div>
			</li>
		</ul>
	</div>

	<div class="border bg-card p-5 sm:p-8">
		<h2 class="display-3">{m.site_contact_form_title()}</h2>
		<p class="mt-1 mb-6 text-sm text-muted-foreground">{m.site_contact_form_hint()}</p>

		{#if sent}
			<Notice tone="success" title={m.site_contact_sent_title()} class="mb-6">
				{m.site_contact_sent()}
			</Notice>
		{/if}

		<form method="POST" action="?/send" use:enhance class="flex flex-col gap-4">
			<Errors allErrors={$allErrors} />
			<div class="grid gap-4 sm:grid-cols-2">
				<InputComp {form} {errors} name="name" label={m.admin_register_your_name()} required />
				<InputComp {form} {errors} name="email" type="email" label={m.common_email()} required />
				<InputComp {form} {errors} name="phone" type="tel" label={m.common_phone()} />
				<InputComp {form} {errors} name="company" label={m.admin_register_business_name()} />
			</div>
			<InputComp {form} {errors} name="subject" label={m.site_contact_subject()} required />
			<InputComp
				{form}
				{errors}
				name="message"
				type="textarea"
				rows={6}
				label={m.site_contact_message()}
				required
			/>
			<!-- A trap for scripts: off-screen, out of the tab order, and named like a field they fill. -->
			<div class="trap" aria-hidden="true">
				<label for="website">Website</label>
				<input
					id="website"
					name="website"
					type="text"
					tabindex="-1"
					autocomplete="off"
					bind:value={$form.website}
				/>
			</div>
			<Button type="submit" size="lg" class="self-start">
				{#if $delayed}<LoadingBtn name={m.common_sending()} />{:else}{m.site_contact_send()}{/if}
			</Button>
		</form>
	</div>
</section>

<style>
	.reach {
		display: grid;
		grid-template-columns: 2.5rem 1fr;
		gap: 1rem;
		align-items: start;
	}
	.reach :global(svg) {
		width: 2.5rem;
		height: 2.5rem;
		padding: 0.6rem;
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.reach-label {
		font-size: 0.8rem;
		color: var(--muted-foreground);
	}
	.reach a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.trap {
		position: absolute;
		left: -200vw;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}
</style>
