import { m } from '$lib/paraglide/messages.js';
import { choices } from '$lib/format';
import { z } from 'zod/v4';
import { STORAGE_CONDITIONS, TAX_CODES } from '$lib/constants';

const flag = z.boolean().default(false);

export const itemAdd = z.object({
	name: z
		.string()
		.trim()
		.min(2, { error: () => m.stock_v_name() })
		.max(160),
	sku: z
		.string()
		.trim()
		.min(1, { error: () => m.stock_v_code() })
		.max(40),
	nameAm: z.string().trim().max(160).default(''),
	categoryId: z.coerce.number().int().min(0).default(0),
	baseUomId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.stock_v_base_unit() }),
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
	/** A kit or recipe: sold as one line, made of components. Never counted in stock itself. */
	isKit: flag,
	/** A variant of another item (0 = none), and what tells it apart: "Red / XL". */
	parentItemId: z.coerce.number().int().min(0).default(0),
	variantLabel: z.string().trim().max(80).default(''),
	warrantyMonths: z
		.number()
		.int({ error: () => m.stock_v_whole_months() })
		.min(0)
		.max(600)
		.nullable()
		.default(null),
	weightKg: z.number().min(0).nullable().default(null),
	status: z.boolean().default(true)
});
export const itemEdit = itemAdd.extend({ id: z.coerce.number() });

export const unitAdd = z.object({
	uomId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.stock_v_unit() }),
	factor: z.coerce.number().positive({ error: () => m.stock_v_factor() })
});
export const unitEdit = unitAdd.extend({ id: z.coerce.number() });

export const barcodeAdd = z.object({
	code: z
		.string()
		.trim()
		.min(3, { error: () => m.stock_v_scan_code() })
		.max(64),
	uomId: z.coerce.number().int().min(0).default(0)
});
export const barcodeEdit = barcodeAdd.extend({ id: z.coerce.number() });

/** One component of a kit or recipe, per one base unit of the kit. */
export const componentAdd = z.object({
	componentItemId: z.coerce
		.number()
		.int()
		.positive({ error: () => m.stock_v_item() }),
	/** 0 means the component's base unit. */
	uomId: z.coerce.number().int().min(0).default(0),
	quantity: z.coerce.number().positive({ error: () => m.stock_v_how_many_in_one() })
});
export const componentEdit = componentAdd.extend({ id: z.coerce.number() });

/** A new variant of an item: what tells it apart, its own code, and optionally its own price and barcode. */
export const variantAdd = z.object({
	variantLabel: z
		.string()
		.trim()
		.min(1, { error: () => m.stock_v_variant_label() })
		.max(80),
	sku: z
		.string()
		.trim()
		.min(1, { error: () => m.stock_v_code() })
		.max(40),
	salePrice: z.number().min(0).nullable().default(null),
	barcode: z.string().trim().max(64).default('')
});

/** Named in the viewer's language when read (`choices` gives each a getter). */
export const TAX_CODE_CHOICES = choices([
	['standard', m.stock_tax_standard_hint],
	['zero', m.stock_tax_zero_hint],
	['exempt', m.stock_tax_exempt_hint]
]);

export const STORAGE_CHOICES = choices([
	['ambient', m.stock_storage_ambient],
	['cool', m.stock_storage_cool],
	['cold', m.stock_storage_cold],
	['frozen', m.stock_storage_frozen]
]);
