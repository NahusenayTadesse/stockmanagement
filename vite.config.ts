import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => {
					config.include.push('../drizzle.config.ts', '../scripts/**/*.ts');
				}
			}
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// The language lives in a cookie (the switcher sets it), else the browser's preference.
			// No /am/ URLs: every link and bookmark works in both languages.
			strategy: ['cookie', 'preferredLanguage', 'baseLocale']
		})
	],
	/**
	 * What the server bundle must carry itself.
	 *
	 * The deploy ships `build/` alone — there are no `node_modules` on the
	 * server — so a dependency Vite leaves as a bare import is a 500 on every
	 * route whose chunk reaches it, and on no others. `npm run verify:build`
	 * names whatever is still unresolved; the rule for this list is: add what
	 * it prints, until it prints nothing. CommonJS packages need their whole
	 * subtree named, because inlining one exposes the `require` calls inside it.
	 */
	ssr: {
		noExternal: [
			/* Outgoing mail (password resets, expiry digest). */
			'nodemailer',
			/* Barcodes on labels and documents. */
			'bwip-js',
			/* QR codes on invoices, and its CommonJS subtree. */
			'qrcode',
			'pngjs',
			'dijkstrajs',
			'encode-utf8',
			/* The Excel importer. */
			'read-excel-file'
		],
		/* CommonJS packages inlined above are pre-bundled to ESM so the dev
		   server evaluates them the way the production build does. */
		optimizeDeps: { include: ['nodemailer', 'bwip-js', 'qrcode', 'read-excel-file'] }
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					// One real database, each test in a rolled-back transaction: files running side by
					// side deadlock on the same unique-index gaps (stock_balance), so they run in turn.
					fileParallelism: false,
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
