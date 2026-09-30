<script lang="ts">
	/**
	 * The light markup the help is written in: `**bold**` for what you click or read on screen.
	 * Parsed into real elements rather than injected as HTML, so help text can never become markup.
	 * From dana's help.
	 */
	let { text }: { text: string } = $props();

	type Token = { strong: boolean; value: string };

	const tokens = $derived.by((): Token[] => {
		const out: Token[] = [];
		const pattern = /\*\*([^*]+)\*\*/g;
		let last = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(text)) !== null) {
			if (match.index > last) out.push({ strong: false, value: text.slice(last, match.index) });
			out.push({ strong: true, value: match[1] });
			last = match.index + match[0].length;
		}
		if (last < text.length) out.push({ strong: false, value: text.slice(last) });
		return out;
	});
</script>

{#each tokens as token, i (i)}{#if token.strong}<strong class="font-semibold text-foreground"
			>{token.value}</strong
		>{:else}{token.value}{/if}{/each}
