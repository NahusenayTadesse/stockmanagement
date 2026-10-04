import { z } from 'zod/v4';

export const posDraft = z.object({
	version: z.literal(1),
	savedAt: z.number(),
	requestKey: z.uuid(),
	pendingPayload: z.string().max(200_000).nullable(),
	customerId: z.number().int().nonnegative(),
	note: z.string().max(255),
	smsTo: z.string().max(30),
	payments: z.array(z.object({ methodId: z.number().int(), amount: z.number().nonnegative(), reference: z.string().max(100) })).max(10),
	cart: z.array(z.object({ key: z.number(), itemId: z.number().int().positive(), uomId: z.number().int().positive(), quantity: z.number().positive().max(1_000_000), unitPrice: z.number().nonnegative(), manual: z.boolean(), serials: z.string().max(31_000) })).max(300)
});
export type PosDraft = z.infer<typeof posDraft>;
export function readPosDraft(raw: string | null, now = Date.now()): PosDraft | null {
	try {
		const result = posDraft.safeParse(JSON.parse(raw ?? 'null'));
		if (!result.success || now - result.data.savedAt > 86_400_000 || result.data.savedAt > now + 60_000) return null;
		return result.data;
	} catch { return null; }
}
export const draftKey = (orgId: number, userId: string, shiftId: number) => `stock:cart:${orgId}:${userId}:${shiftId}`;
