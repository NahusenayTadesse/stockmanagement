/** Operational metrics contain route templates, never customer data, query values or bodies. */
export function requestMetric(input: { requestId: string; route: string | null; method: string; status: number; durationMs: number; action: string | null }) {
	return { event: 'request', timestamp: new Date().toISOString(), ...input, durationMs: Math.round(input.durationMs) };
}
