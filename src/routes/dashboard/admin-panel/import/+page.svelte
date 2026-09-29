<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import { Badge } from '@nahu/admin-kit/components/ui/badge/index.js';
	import { Button } from '@nahu/admin-kit/components/ui/button/index.js';
	import * as Card from '@nahu/admin-kit/components/ui/card/index.js';
	import { Label } from '@nahu/admin-kit/components/ui/label/index.js';

	let { data, form } = $props();

	let chosen = $state<string | null>(null);
	const kind = $derived(chosen ?? data.kinds[0]?.value ?? 'items');
	const current = $derived(data.kinds.find((k) => k.value === kind));
	let busy = $state(false);

	const preview = $derived(form && 'preview' in form ? form.preview : null);
	const imported = $derived(form && 'imported' in form ? form.imported : null);
	const problem = $derived(form && 'error' in form ? form.error : null);

	/** Rows with problems first, then warnings, then the rest; at most 500 shown. */
	const shown = $derived(
		preview
			? [...preview.plan.rows]
					.sort(
						(a, b) =>
							Number(b.errors.length > 0) - Number(a.errors.length > 0) ||
							Number(b.warnings.length > 0) - Number(a.warnings.length > 0) ||
							a.row - b.row
					)
					.slice(0, 500)
			: []
	);

	const submitting = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<svelte:head>
	<title>{m.admin_imp_title()}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">{m.admin_imp_heading()}</h1>
		<p class="text-muted-foreground">
			{m.admin_imp_intro()}
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>{m.admin_imp_step1()}</Card.Title>
			<Card.Description>
				{m.admin_imp_step1_desc({ max: data.maxRows })}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/preview"
				enctype="multipart/form-data"
				class="flex flex-col gap-4"
				use:enhance={submitting}
			>
				<fieldset class="flex flex-wrap gap-2">
					<legend class="mb-2 text-sm font-medium">{m.admin_imp_what_holds()}</legend>
					{#each data.kinds as k (k.value)}
						<label
							class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5"
						>
							<input
								type="radio"
								name="kind"
								value={k.value}
								checked={k.value === kind}
								onchange={() => (chosen = k.value)}
							/>
							{k.name}
						</label>
					{/each}
				</fieldset>

				{#if current}
					<div class="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="font-medium"
								>{m.admin_imp_columns_for({ kind: current.name.toLowerCase() })}</span
							>
							<a
								href={resolve('/dashboard/admin-panel/import/template/[kind]', { kind })}
								download
								class="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
							>
								<Download class="size-4" />
								{m.admin_imp_download()}
							</a>
						</div>
						<ul class="flex flex-wrap gap-x-4 gap-y-1">
							{#each current.columns as c (c.label)}
								<li>
									<span class="font-mono">{c.label}</span>
									{#if c.note}<span class="text-muted-foreground"> — {c.note}</span>{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div class="flex flex-col gap-2">
					<Label for="import-file">{m.admin_imp_file()}</Label>
					<input
						id="import-file"
						name="file"
						type="file"
						accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
						required
						class="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
					/>
				</div>
				<div>
					<Button type="submit" disabled={busy}>
						<Upload class="size-4" />
						{busy ? m.admin_imp_reading() : m.admin_imp_preview()}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	{#if problem}
		<p
			class="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
		>
			{problem}
		</p>
	{/if}

	{#if imported}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.admin_imp_imported()}</Card.Title>
				<Card.Description>
					{m.admin_imp_imported_desc({ created: imported.created, updated: imported.updated })}
				</Card.Description>
			</Card.Header>
			{#if imported.documents.length}
				<Card.Content class="flex flex-wrap gap-2 text-sm">
					{m.admin_imp_opening_as()}
					{#each imported.documents as d (d.id)}
						<a
							class="font-medium text-primary underline-offset-4 hover:underline"
							href={resolve('/dashboard/stock/documents/[id]', { id: String(d.id) })}>{d.number}</a
						>
					{/each}
				</Card.Content>
			{/if}
		</Card.Root>
	{/if}

	{#if preview}
		{@const counts = preview.plan.counts}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.admin_imp_step2()}</Card.Title>
				<Card.Description>
					{m.admin_imp_summary({
						file: preview.fileName,
						rows: preview.plan.rows.length,
						create: counts.create,
						update: counts.update
					})}{#if counts.errors},
						<strong class="text-destructive"
							>{m.admin_imp_with_problems({ count: counts.errors })}</strong
						>{/if}.
					{#if preview.ignored.length}
						{m.admin_imp_ignored({ columns: preview.ignored.join(', ') })}
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead class="bg-muted/50 text-left">
							<tr>
								<th class="px-3 py-2">{m.admin_imp_th_row()}</th>
								<th class="px-3 py-2">{m.admin_imp_th_what()}</th>
								<th class="px-3 py-2">{m.admin_imp_th_will()}</th>
								<th class="px-3 py-2">{m.admin_imp_th_notes()}</th>
							</tr>
						</thead>
						<tbody>
							{#each shown as r (r.row)}
								<tr class="border-t align-top">
									<td class="px-3 py-2 tabular-nums">{r.row}</td>
									<td class="px-3 py-2">{r.label || '—'}</td>
									<td class="px-3 py-2">
										{#if r.errors.length}
											<Badge variant="destructive">{m.admin_imp_fix_first()}</Badge>
										{:else if r.action === 'update'}
											<Badge variant="secondary">{m.admin_imp_update()}</Badge>
										{:else}
											<Badge>{m.admin_imp_add()}</Badge>
										{/if}
									</td>
									<td class="px-3 py-2">
										{#each r.errors as e, i (i)}
											<p class="text-destructive">{e}</p>
										{/each}
										{#each r.warnings as w, i (i)}
											<p class="text-muted-foreground">{w}</p>
										{/each}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if preview.plan.rows.length > shown.length}
					<p class="text-sm text-muted-foreground">
						{m.admin_imp_showing({ shown: shown.length, total: preview.plan.rows.length })}
					</p>
				{/if}

				{#if counts.errors}
					<p class="text-sm">
						{m.admin_imp_fix_rows()}
					</p>
				{:else}
					<form method="POST" action="?/import" use:enhance={submitting}>
						<input type="hidden" name="kind" value={preview.kind} />
						<input type="hidden" name="rows" value={JSON.stringify(preview.rows)} />
						<Button type="submit" disabled={busy}>
							{busy
								? m.admin_imp_importing()
								: m.admin_imp_import_n({ count: counts.create + counts.update })}
						</Button>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
