/**
 * `$env/dynamic/private` outside SvelteKit: the scripts run under tsx, where the variables come
 * from `--env-file`. Mapped in by `scripts/tsconfig.json`, so the app's own modules (the database
 * client among them) load unchanged.
 */
export const env = process.env as Record<string, string | undefined>;
