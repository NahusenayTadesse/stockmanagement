/**
 * Arithmetic on calendar days (`YYYY-MM-DD`), done in UTC so no time zone or daylight shift moves
 * a day. For "today" and adding days in Addis Ababa time, see the kit's `time` module.
 */

/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
