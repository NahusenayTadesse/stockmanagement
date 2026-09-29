import { z } from 'zod/v4';
import { FISCAL_DEVICE_KINDS } from '$lib/constants';

/** Every field is optional: a device can be listed with nothing but its kind, and filled in later. */
export const add = z.object({
	name: z.string().trim().max(100).default(''),
	kind: z.enum(FISCAL_DEVICE_KINDS).default('manual'),
	/** 0 = any branch. */
	branchId: z.coerce.number().int().min(0).default(0),
	machineCode: z.string().trim().max(30).default(''),
	serialNumber: z.string().trim().max(40).default(''),
	host: z.string().trim().max(120).default(''),
	port: z.number().int().min(1).max(65535).nullable().default(null),
	bridgeUrl: z.url('Enter a URL, e.g. http://localhost:4444').or(z.literal('')).default(''),
	/** Empty on edit keeps what is stored. */
	bridgeToken: z.string().trim().max(200).default(''),
	operatorCode: z.string().trim().max(10).default(''),
	operatorPassword: z.string().trim().max(60).default(''),
	tillNumber: z.number().int().min(1).max(999).nullable().default(null),
	taxGroups: z
		.string()
		.trim()
		.max(120)
		.regex(/^(\s*[\w.]+\s*=\s*\w+\s*)?(,\s*[\w.]+\s*=\s*\w+\s*)*$/, 'Like 15=A,0=B,exempt=C,tot=D')
		.default(''),
	autoPrint: z.boolean().default(false),
	isActive: z.boolean().default(true)
});
export const edit = add.extend({ id: z.coerce.number() });

export const KIND_CHOICES = [
	{ value: 'manual', name: 'Manual — ring up on the device, type the FS No. here' },
	{ value: 'datecs_tcp', name: 'Datecs protocol over the network (FP-/DP- series)' },
	{ value: 'http_bridge', name: 'HTTP bridge (vendor service for USB/serial devices)' }
];
