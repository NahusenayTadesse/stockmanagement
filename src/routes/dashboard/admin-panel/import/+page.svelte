<script lang="ts">
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
	<title>Import</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="text-2xl font-semibold">Import from a spreadsheet</h1>
		<p class="text-muted-foreground">
			Bring in what you already keep in Excel. Import suppliers first, then items (they name their
			main supplier), then opening stock (it names items by SKU). Nothing is written until you have
			seen the preview, and a file with any bad row imports nothing at all.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>1. Choose a file</Card.Title>
			<Card.Description>
				A .csv or .xlsx file whose first row names the columns, up to {data.maxRows} rows. Start from
				the template: column names are matched loosely, and columns you do not need may be left out.
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
					<legend class="mb-2 text-sm font-medium">What the file holds</legend>
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
							<span class="font-medium">Columns for {current.name.toLowerCase()}</span>
							<a
								href={resolve('/dashboard/admin-panel/import/template/[kind]', { kind })}
								download
								class="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
							>
								<Download class="size-4" /> Download the template
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
					<Label for="import-file">File</Label>
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
						{busy ? 'Reading…' : 'Preview'}
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
				<Card.Title>Imported</Card.Title>
				<Card.Description>
					{imported.created} added, {imported.updated} updated.
				</Card.Description>
			</Card.Header>
			{#if imported.documents.length}
				<Card.Content class="flex flex-wrap gap-2 text-sm">
					Opening stock posted as
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
				<Card.Title>2. Check the preview</Card.Title>
				<Card.Description>
					{preview.fileName}: {preview.plan.rows.length} rows — {counts.create} to add, {counts.update}
					to update{#if counts.errors}, <strong class="text-destructive"
							>{counts.errors} with problems</strong
						>{/if}.
					{#if preview.ignored.length}
						Columns not used: {preview.ignored.join(', ')}.
					{/if}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="overflow-x-auto rounded-md border">
					<table class="w-full text-sm">
						<thead class="bg-muted/50 text-left">
							<tr>
								<th class="px-3 py-2">Row</th>
								<th class="px-3 py-2">What</th>
								<th class="px-3 py-2">Will</th>
								<th class="px-3 py-2">Notes</th>
							</tr>
						</thead>
						<tbody>
							{#each shown as r (r.row)}
								<tr class="border-t align-top">
									<td class="px-3 py-2 tabular-nums">{r.row}</td>
									<td class="px-3 py-2">{r.label || '—'}</td>
									<td class="px-3 py-2">
										{#if r.errors.length}
											<Badge variant="destructive">Fix first</Badge>
										{:else if r.action === 'update'}
											<Badge variant="secondary">Update</Badge>
										{:else}
											<Badge>Add</Badge>
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
						Showing {shown.length} of {preview.plan.rows.length} rows, problems first.
					</p>
				{/if}

				{#if counts.errors}
					<p class="text-sm">
						Fix the rows marked “Fix first” in your spreadsheet and preview it again. Nothing is
						imported while any row has a problem.
					</p>
				{:else}
					<form method="POST" action="?/import" use:enhance={submitting}>
						<input type="hidden" name="kind" value={preview.kind} />
						<input type="hidden" name="rows" value={JSON.stringify(preview.rows)} />
						<Button type="submit" disabled={busy}>
							{busy ? 'Importing…' : `Import ${counts.create + counts.update} rows`}
						</Button>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
