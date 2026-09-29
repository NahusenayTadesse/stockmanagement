import { z } from 'zod/v4';
import { STORAGE_CONDITIONS, TAX_CODES } from '$lib/constants';

const flag = z.boolean().default(false);

export const itemAdd = z.object({
	name: z.string().trim().min(2, 'Enter a name').max(160),
	sku: z.string().trim().min(1, 'Enter a code').max(40),
	nameAm: z.string().trim().max(160).default(''),
	categoryId: z.coerce.number().int().min(0).default(0),
	baseUomId: z.coerce.number().int().positive('Choose the unit stock is counted in'),
	/** Required for stock-tracked items (checked on the server); services may leave it at 0. */
	supplierId: z.coerce.number().int().min(0).default(0),
	salePrice: z.number().min(0).nullable().default(null),
	taxCode: z.enum(TAX_CODES).default('standard'),
	/** TOT on this item, overriding the business's rate. Optional. */
	totRate: z.number().min(0).max(100).nullable().default(null),
	reorderLevel: z.number().min(0).nullable().default(null),
	storageCondition: z.enum(STORAGE_CONDITIONS).default('ambient'),
	description: z.string().trim().max(2000).default(''),
	stockTracked: z.boolean().default(true),
	trackLots: flag,
	trackExpiry: flag,
	trackSerials: flag,
	sellable: z.boolean().default(true),
	purchasable: z.boolean().default(true),
	leasable: flag,
	consumable: flag,
	perishable: flag,
	prescriptionOnly: flag,
	controlledSubstance: flag,
	status: z.boolean().default(true)
});
export const itemEdit = itemAdd.extend({ id: z.coerce.number() });

export const unitAdd = z.object({
	uomId: z.coerce.number().int().positive('Choose a unit'),
	factor: z.coerce.number().positive('How many base units is one of these?')
});
export const unitEdit = unitAdd.extend({ id: z.coerce.number() });

export const barcodeAdd = z.object({
	code: z.string().trim().min(3, 'Scan or type the code').max(64),
	uomId: z.coerce.number().int().min(0).default(0)
});
export const barcodeEdit = barcodeAdd.extend({ id: z.coerce.number() });

export const TAX_CODE_CHOICES = [
	{ value: 'standard', name: 'Standard VAT' },
	{ value: 'zero', name: 'Zero-rated (0%) — exports, some basic foods' },
	{ value: 'exempt', name: 'Exempt — medicines, bread, some services' }
];

export const STORAGE_CHOICES = [
	{ value: 'ambient', name: 'Room temperature' },
	{ value: 'cool', name: 'Cool (8–15 °C)' },
	{ value: 'cold', name: 'Cold chain (2–8 °C)' },
	{ value: 'frozen', name: 'Frozen' }
];
