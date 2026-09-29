/**
 * Bulk import from a spreadsheet: items (with a pack unit and barcodes), suppliers, customers and
 * opening stock — what a business has in Excel on the day it starts using the system.
 *
 * Two steps. `planImport` reads every row and says what would happen to it (create, update, skip)
 * and what is wrong with it, writing nothing. `runImport` plans again inside the transaction —
 * the preview is never trusted — and writes everything or nothing: one bad row stops the lot, so
 * a half-imported catalogue never has to be untangled.
 *
 * Opening stock becomes one posted adjustment per location (reason: opening), through the ordinary
 * posting service, so lots, expiry dates, serials and average cost come out as any receipt would.
 *
 * Plain database code.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { readSheet } from 'read-excel-file/node';
import { db } from '$lib/server/db';
import {
	barcode,
	branch,
	category,
	customer,
	item,
	itemUnit,
	location,
	organization,
	stockBalance,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	uom
} from '$lib/server/db/schema';
import { postDocument, StockError, type Tx } from '$lib/server/stock/post';
import { parseSerials, round4 } from '$lib/server/stock/math';
import { m } from '$lib/paraglide/messages.js';

type Reader = Pick<typeof db, 'select'>;

export const IMPORT_KINDS = ['items', 'suppliers', 'customers', 'opening'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const MAX_ROWS = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** A refusal of the whole import, said to the person importing. */
export class ImportError extends Error {}

type Column = { key: string; label: string; aliases?: string[]; sample: string; note?: string };

/**
 * The columns each kind reads, in template order. Headers are matched ignoring case, spaces,
 * dashes and underscores, against the key, the label and the aliases.
 */
export const COLUMNS: Record<ImportKind, Column[]> = {
	items: [
		{ key: 'sku', label: 'SKU', aliases: ['code', 'item code', 'product code'], sample: 'CEM-50' },
		{
			key: 'name',
			label: 'Name',
			aliases: ['item', 'item name', 'product'],
			sample: 'Cement 50 kg'
		},
		{
			key: 'nameAm',
			label: 'Name (Amharic)',
			aliases: ['name am', 'amharic name', 'amharic'],
			sample: 'ሲሚንቶ'
		},
		{ key: 'category', label: 'Category', sample: 'Building materials' },
		{
			key: 'unit',
			label: 'Unit',
			aliases: ['base unit', 'uom', 'counted in'],
			sample: 'Piece',
			note: 'Unit name or symbol; made if new'
		},
		{ key: 'salePrice', label: 'Sale price', aliases: ['price', 'selling price'], sample: '1450' },
		{
			key: 'taxCode',
			label: 'VAT',
			aliases: ['tax code', 'tax'],
			sample: 'standard',
			note: 'standard, zero or exempt'
		},
		{ key: 'supplier', label: 'Main supplier', aliases: ['supplier'], sample: 'Mugher Cement' },
		{ key: 'reorderLevel', label: 'Reorder level', aliases: ['reorder at', 'min'], sample: '20' },
		{
			key: 'stockTracked',
			label: 'Stocked',
			aliases: ['stock tracked', 'counted in stock'],
			sample: 'yes',
			note: 'no for services'
		},
		{ key: 'trackLots', label: 'Track lots', aliases: ['lots'], sample: 'no' },
		{ key: 'trackExpiry', label: 'Track expiry', aliases: ['expiry'], sample: 'no' },
		{ key: 'trackSerials', label: 'Track serials', aliases: ['serials'], sample: 'no' },
		{ key: 'barcode', label: 'Barcode', aliases: ['ean', 'upc'], sample: '' },
		{
			key: 'packUnit',
			label: 'Pack unit',
			aliases: ['pack'],
			sample: 'Quintal',
			note: 'Optional second unit'
		},
		{
			key: 'packFactor',
			label: 'Pack factor',
			aliases: ['pack size', 'factor'],
			sample: '2',
			note: 'Base units in one pack'
		},
		{ key: 'packBarcode', label: 'Pack barcode', sample: '' }
	],
	suppliers: [
		{ key: 'name', label: 'Name', aliases: ['supplier'], sample: 'Mugher Cement' },
		{ key: 'phone', label: 'Phone', aliases: ['mobile', 'telephone'], sample: '0911 234 567' },
		{ key: 'email', label: 'Email', sample: 'sales@example.com' },
		{ key: 'address', label: 'Address', sample: 'Mugher, Oromia' },
		{ key: 'tin', label: 'TIN', sample: '0000123456' },
		{ key: 'contactPerson', label: 'Contact person', aliases: ['contact'], sample: 'Ato Kebede' },
		{ key: 'vatRegistered', label: 'VAT registered', aliases: ['vat'], sample: 'yes' },
		{ key: 'leadTimeDays', label: 'Lead time days', aliases: ['lead time'], sample: '7' }
	],
	customers: [
		{ key: 'name', label: 'Name', aliases: ['customer'], sample: 'Selam Construction' },
		{ key: 'phone', label: 'Phone', aliases: ['mobile', 'telephone'], sample: '0911 765 432' },
		{ key: 'email', label: 'Email', sample: '' },
		{ key: 'address', label: 'Address', sample: 'Bole, Addis Ababa' },
		{ key: 'tin', label: 'TIN', sample: '0000654321' },
		{ key: 'creditLimit', label: 'Credit limit', aliases: ['limit'], sample: '50000' },
		{ key: 'creditDays', label: 'Credit days', aliases: ['days to pay', 'terms'], sample: '30' }
	],
	opening: [
		{ key: 'sku', label: 'SKU', aliases: ['code', 'item code'], sample: 'CEM-50' },
		{
			key: 'location',
			label: 'Location',
			aliases: ['store', 'warehouse'],
			sample: 'Main store',
			note: 'Name, or "Branch · Location"'
		},
		{ key: 'quantity', label: 'Quantity', aliases: ['qty', 'on hand'], sample: '120' },
		{ key: 'unit', label: 'Unit', aliases: ['uom'], sample: '', note: 'Blank: the base unit' },
		{
			key: 'unitCost',
			label: 'Unit cost',
			aliases: ['cost'],
			sample: '1200',
			note: 'Per the unit above'
		},
		{ key: 'lot', label: 'Lot', aliases: ['lot number', 'batch'], sample: '' },
		{
			key: 'expiry',
			label: 'Expiry',
			aliases: ['expiry date', 'expires'],
			sample: '',
			note: 'YYYY-MM-DD'
		},
		{
			key: 'serials',
			label: 'Serials',
			aliases: ['serial numbers'],
			sample: '',
			note: 'Separated by ; or ,'
		}
	]
};

type Messages = Record<
	string,
	((inputs?: object, options?: { locale?: 'en' | 'am' }) => string) | undefined
>;

/**
 * A column's name as a person reads it, in their language (or the one given). The English
 * `label` stays the template's header, so a file works whatever language it was made in.
 */
export function columnLabel(key: string, fallback: string, locale?: 'en' | 'am'): string {
	const message = (m as unknown as Messages)[`admin_imp_col_${key}`];
	return message ? message({}, locale ? { locale } : {}) : fallback;
}

/** A column's note, in the viewer's language. */
export function columnNote(note: string): string {
	const notes: Record<string, () => string> = {
		'Unit name or symbol; made if new': m.admin_imp_note_unit_new,
		'Optional second unit': m.admin_imp_note_pack_unit,
		'Base units in one pack': m.admin_imp_note_pack_factor,
		'Name, or "Branch · Location"': m.admin_imp_note_location,
		'Blank: the base unit': m.admin_imp_note_unit_blank,
		'Per the unit above': m.admin_imp_note_unit_cost,
		'YYYY-MM-DD': m.admin_imp_note_expiry,
		'Separated by ; or ,': m.admin_imp_note_serials
	};
	return notes[note]?.() ?? note;
}

/** A column's name for a message about one of its cells. */
const L = (key: string) =>
	columnLabel(
		key,
		Object.values(COLUMNS)
			.flat()
			.find((c) => c.key === key)?.label ?? key
	);

// ── Reading the file ────────────────────────────────────────────────────────────────────────

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	// Excel writes a byte-order mark; Ethiopian files often come from Excel.
	const s = text.replace(/^\uFEFF/, '');
	// Semicolon-separated files come from Excel set to a European locale.
	const firstLine = s.slice(0, s.indexOf('\n') === -1 ? s.length : s.indexOf('\n'));
	const sep =
		(firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (quoted) {
			if (c === '"' && s[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === sep) {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && s[i + 1] === '\n') i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += c;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

const headerKey = (h: string) => h.toLowerCase().replace(/[\s_\-.()]+/g, '');

/** A cell as text: Excel dates as `YYYY-MM-DD`, numbers without float noise. */
function cellText(v: unknown): string {
	if (v === null || v === undefined) return '';
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	if (typeof v === 'number') return String(round4(v));
	if (typeof v === 'boolean') return v ? 'yes' : 'no';
	return String(v).trim();
}

export type SheetRow = { row: number; values: Record<string, string> };

/**
 * The file as rows keyed by column (`sku`, `name`...). Row numbers are the spreadsheet's, header
 * being row 1, so a message can point at the line to fix. Unknown columns are reported, not used.
 */
export async function readTable(
	kind: ImportKind,
	file: { name: string; bytes: Uint8Array }
): Promise<{ rows: SheetRow[]; ignored: string[] }> {
	if (file.bytes.byteLength > MAX_FILE_BYTES) {
		throw new ImportError(m.admin_imp_too_big());
	}
	let table: string[][];
	const name = file.name.toLowerCase();
	if (name.endsWith('.xlsx')) {
		try {
			const data = await readSheet(Buffer.from(file.bytes));
			table = data.map((r) => r.map(cellText));
		} catch {
			throw new ImportError(m.admin_imp_bad_excel());
		}
	} else if (name.endsWith('.csv') || name.endsWith('.txt')) {
		table = parseCsv(new TextDecoder('utf-8').decode(file.bytes));
	} else {
		throw new ImportError(m.admin_imp_bad_type());
	}

	const nonEmpty = (r: string[]) => r.some((c) => c.trim() !== '');
	const headerIndex = table.findIndex(nonEmpty);
	if (headerIndex === -1) throw new ImportError(m.admin_imp_empty());
	const header = table[headerIndex].map((h) => headerKey(h));

	const columns = COLUMNS[kind];
	const byHeader = new Map<string, string>();
	for (const col of columns) {
		// The Amharic name counts too: a file whose headers were typed in Amharic still reads.
		for (const alias of [
			col.key,
			col.label,
			columnLabel(col.key, col.label, 'am'),
			...(col.aliases ?? [])
		]) {
			byHeader.set(headerKey(alias), col.key);
		}
	}
	const keys = header.map((h) => byHeader.get(h) ?? null);
	if (!keys.some(Boolean)) {
		throw new ImportError(m.admin_imp_no_columns({ kind }));
	}
	const ignored = table[headerIndex].filter((h, i) => h.trim() && !keys[i]);

	const rows: SheetRow[] = [];
	for (let i = headerIndex + 1; i < table.length; i++) {
		if (!nonEmpty(table[i])) continue;
		const values: Record<string, string> = {};
		keys.forEach((k, j) => {
			if (k && values[k] === undefined) values[k] = (table[i][j] ?? '').trim();
		});
		rows.push({ row: i + 1, values });
	}
	if (!rows.length) throw new ImportError(m.admin_imp_no_data());
	if (rows.length > MAX_ROWS) {
		throw new ImportError(m.admin_imp_too_many_rows({ rows: rows.length, max: MAX_ROWS }));
	}
	return { rows, ignored };
}

/** A template: the header row and one sample row. */
export function templateCsv(kind: ImportKind): string {
	const q = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
	const cols = COLUMNS[kind];
	return (
		'\uFEFF' +
		[cols.map((c) => q(c.label)).join(','), cols.map((c) => q(c.sample)).join(',')].join('\r\n') +
		'\r\n'
	);
}

// ── Planning ────────────────────────────────────────────────────────────────────────────────

export type RowPlan = {
	row: number;
	/** What the row is about, for the preview: an SKU, a name. */
	label: string;
	action: 'create' | 'update' | 'skip';
	errors: string[];
	warnings: string[];
};

export type Plan = {
	kind: ImportKind;
	rows: RowPlan[];
	counts: { create: number; update: number; skip: number; errors: number };
};

const lower = (s: string) => s.trim().toLowerCase();
const TRUE = new Set(['yes', 'y', 'true', '1', 'x', 'ok', 'አዎ']);
const FALSE = new Set(['no', 'n', 'false', '0', '', 'የለም']);

function bool(v: string | undefined, errors: string[], label: string): boolean | undefined {
	if (v === undefined || v.trim() === '') return undefined;
	const t = lower(v);
	if (TRUE.has(t)) return true;
	if (FALSE.has(t)) return false;
	errors.push(m.admin_imp_yes_no({ label, value: v }));
	return undefined;
}

function num(
	v: string | undefined,
	errors: string[],
	label: string,
	opts: { min?: number; integer?: boolean; positive?: boolean } = {}
): number | undefined {
	if (v === undefined || v.trim() === '') return undefined;
	// Thousands separators and a currency word are common in Ethiopian spreadsheets.
	const n = Number(
		v
			.replace(/,/g, '')
			.replace(/\s*(birr|etb|br)\.?$/i, '')
			.trim()
	);
	if (!Number.isFinite(n)) {
		errors.push(m.admin_imp_not_number({ label, value: v }));
		return undefined;
	}
	if (opts.integer && !Number.isInteger(n)) errors.push(m.admin_imp_whole({ label }));
	if (opts.positive && n <= 0) errors.push(m.admin_imp_positive({ label }));
	else if (opts.min !== undefined && n < opts.min)
		errors.push(m.admin_imp_at_least({ label, min: opts.min }));
	return n;
}

/** `YYYY-MM-DD`, or `DD/MM/YYYY` as Ethiopian offices write Gregorian dates. */
function isoDate(v: string | undefined, errors: string[], label: string): string | undefined {
	if (!v?.trim()) return undefined;
	const t = v.trim();
	let d: string | null = null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(t)) d = t;
	const dmy = t.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
	if (dmy) d = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
	if (!d || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
		errors.push(m.admin_imp_date({ label, value: v }));
		return undefined;
	}
	return d;
}

const TAX_WORDS: Record<string, 'standard' | 'zero' | 'exempt'> = {
	standard: 'standard',
	'15%': 'standard',
	'15': 'standard',
	vat: 'standard',
	zero: 'zero',
	'zero-rated': 'zero',
	'zero rated': 'zero',
	'0%': 'zero',
	'0': 'zero',
	exempt: 'exempt'
};

/** Everything the business already has that rows refer to by name, loaded once. */
async function lookups(reader: Reader, orgId: number) {
	const [units, categories, suppliers, items, locations, barcodes, packs, org] = await Promise.all([
		reader
			.select({ id: uom.id, name: uom.name, symbol: uom.symbol })
			.from(uom)
			.where(and(eq(uom.orgId, orgId), isNull(uom.deletedAt))),
		reader
			.select({ id: category.id, name: category.name })
			.from(category)
			.where(and(eq(category.orgId, orgId), isNull(category.deletedAt))),
		reader
			.select({ id: supplier.id, name: supplier.name })
			.from(supplier)
			.where(and(eq(supplier.orgId, orgId), isNull(supplier.deletedAt))),
		reader
			.select()
			.from(item)
			.where(and(eq(item.orgId, orgId), isNull(item.deletedAt))),
		reader
			.select({
				id: location.id,
				name: location.name,
				kind: location.kind,
				branchId: location.branchId,
				branch: branch.name
			})
			.from(location)
			.innerJoin(branch, eq(branch.id, location.branchId))
			.where(and(eq(location.orgId, orgId), isNull(location.deletedAt))),
		reader
			.select({ code: barcode.code, itemId: barcode.itemId })
			.from(barcode)
			.where(and(eq(barcode.orgId, orgId), isNull(barcode.deletedAt))),
		reader
			.select({ itemId: itemUnit.itemId, uomId: itemUnit.uomId, factor: itemUnit.factor })
			.from(itemUnit)
			.where(and(eq(itemUnit.orgId, orgId), isNull(itemUnit.deletedAt))),
		reader
			.select({ sellsToCustomers: organization.sellsToCustomers })
			.from(organization)
			.where(eq(organization.id, orgId))
	]);
	return {
		unitByName: (name: string) =>
			units.find((u) => lower(u.name) === lower(name) || lower(u.symbol) === lower(name)),
		categoryByName: (name: string) => categories.find((c) => lower(c.name) === lower(name)),
		supplierByName: (name: string) => suppliers.find((s) => lower(s.name) === lower(name)),
		itemBySku: (sku: string) => items.find((i) => lower(i.sku) === lower(sku)),
		locations,
		barcodes,
		packs,
		sellsToCustomers: org[0]?.sellsToCustomers ?? true
	};
}
type Lookups = Awaited<ReturnType<typeof lookups>>;

/** The location a row names: "Branch · Location" (or "Branch / Location"), or a name only one branch has. */
function findLocation(l: Lookups, text: string) {
	const usable = l.locations.filter((x) => x.kind !== 'transit');
	const parts = text.split(/\s*[·/|>]\s*/);
	if (parts.length === 2) {
		return {
			found: usable.find(
				(x) => lower(x.branch) === lower(parts[0]) && lower(x.name) === lower(parts[1])
			),
			ambiguous: false
		};
	}
	const matches = usable.filter((x) => lower(x.name) === lower(text));
	return { found: matches.length === 1 ? matches[0] : undefined, ambiguous: matches.length > 1 };
}

async function hasMoved(reader: Reader, itemId: number) {
	const [row] = await reader
		.select({ n: sql<number>`COUNT(*)` })
		.from(stockMovement)
		.where(eq(stockMovement.itemId, itemId));
	return Number(row.n) > 0;
}

/** What would happen to each row, and what is wrong with it. Writes nothing. */
export async function planImport(
	reader: Reader,
	orgId: number,
	kind: ImportKind,
	rows: SheetRow[]
): Promise<Plan> {
	const l = await lookups(reader, orgId);
	const plans: RowPlan[] = [];
	if (kind === 'customers' && !l.sellsToCustomers) {
		throw new ImportError(m.admin_imp_no_customers());
	}

	const seen = new Map<string, number>();
	const seenCodes = new Map<string, number>();
	const once = (key: string, row: number, errors: string[], what: string) => {
		const first = seen.get(key);
		if (first !== undefined) errors.push(m.admin_imp_also_on_row({ what, row: first }));
		else seen.set(key, row);
	};
	const codeFree = (code: string, itemId: number | undefined, row: number, errors: string[]) => {
		const earlier = seenCodes.get(code);
		if (earlier !== undefined) errors.push(m.admin_imp_barcode_row({ code, row: earlier }));
		seenCodes.set(code, row);
		const owner = l.barcodes.find((b) => b.code === code);
		if (owner && owner.itemId !== itemId) errors.push(m.admin_imp_barcode_taken({ code }));
	};

	for (const { row, values: v } of rows) {
		const errors: string[] = [];
		const warnings: string[] = [];
		let action: RowPlan['action'] = 'create';
		let label = v.name || v.sku || '';

		if (kind === 'items') {
			label = v.sku ? `${v.sku} · ${v.name ?? ''}` : (v.name ?? '');
			if (!v.sku) errors.push(m.admin_imp_sku_empty());
			else if (v.sku.length > 40) errors.push(m.admin_imp_sku_long());
			else once(`sku:${lower(v.sku)}`, row, errors, m.admin_imp_what_sku({ sku: v.sku }));
			const existing = v.sku ? l.itemBySku(v.sku) : undefined;
			action = existing ? 'update' : 'create';
			if (!existing && !v.name) errors.push(m.admin_imp_name_empty());
			if (v.name && (v.name.length < 2 || v.name.length > 160)) {
				errors.push(m.admin_imp_name_length());
			}
			if (!existing && !v.unit) errors.push(m.admin_imp_unit_empty());
			if (v.unit && !l.unitByName(v.unit)) warnings.push(m.admin_imp_unit_new({ unit: v.unit }));
			if (v.category && !l.categoryByName(v.category)) {
				warnings.push(m.admin_imp_category_new({ category: v.category }));
			}
			num(v.salePrice, errors, L('salePrice'), { min: 0 });
			num(v.reorderLevel, errors, L('reorderLevel'), { min: 0 });
			if (v.taxCode && !TAX_WORDS[lower(v.taxCode)]) {
				errors.push(m.admin_imp_vat_word({ value: v.taxCode }));
			}
			const stocked =
				bool(v.stockTracked, errors, L('stockTracked')) ?? existing?.stockTracked ?? true;
			const lots = bool(v.trackLots, errors, L('trackLots'));
			const expiry = bool(v.trackExpiry, errors, L('trackExpiry'));
			const serials = bool(v.trackSerials, errors, L('trackSerials'));
			if (v.supplier && !l.supplierByName(v.supplier)) {
				errors.push(m.admin_imp_supplier_unknown({ name: v.supplier }));
			}
			if (stocked && !v.supplier && !existing?.supplierId) {
				errors.push(m.admin_imp_supplier_needed());
			}
			// The ledger was written in an item's terms: they stay once stock has moved.
			if (existing) {
				const newUnit = v.unit ? l.unitByName(v.unit)?.id : undefined;
				const changes =
					(v.unit && newUnit !== existing.baseUomId) ||
					(v.stockTracked && stocked !== existing.stockTracked) ||
					(lots !== undefined && lots !== existing.trackLots) ||
					(expiry !== undefined && expiry !== existing.trackExpiry) ||
					(serials !== undefined && serials !== existing.trackSerials);
				if (changes && (await hasMoved(reader, existing.id))) {
					errors.push(m.admin_imp_moved());
				}
			}
			if (v.barcode) codeFree(v.barcode, existing?.id, row, errors);
			if (v.packUnit || v.packFactor || v.packBarcode) {
				if (!v.packUnit) errors.push(m.admin_imp_pack_unit_empty());
				const factor = num(v.packFactor, errors, L('packFactor'), { positive: true });
				if (v.packUnit && factor === undefined) errors.push(m.admin_imp_pack_factor_empty());
				const packUom = v.packUnit ? l.unitByName(v.packUnit) : undefined;
				const baseUom = v.unit ? l.unitByName(v.unit) : undefined;
				const baseId = baseUom?.id ?? existing?.baseUomId;
				if (
					v.packUnit &&
					(lower(v.packUnit) === lower(v.unit ?? '') || (packUom && packUom.id === baseId))
				) {
					errors.push(m.admin_imp_pack_same());
				}
				if (v.packUnit && !packUom) warnings.push(m.admin_imp_unit_new({ unit: v.packUnit }));
				const had =
					existing &&
					packUom &&
					l.packs.find((p) => p.itemId === existing.id && p.uomId === packUom.id);
				if (had && factor !== undefined && had.factor !== factor) {
					warnings.push(m.admin_imp_pack_kept({ unit: v.packUnit, factor: had.factor }));
				}
				if (v.packBarcode) codeFree(v.packBarcode, existing?.id, row, errors);
			}
		} else if (kind === 'suppliers') {
			if (!v.name) errors.push(m.admin_imp_name_empty());
			else once(`name:${lower(v.name)}`, row, errors, m.admin_imp_what_supplier({ name: v.name }));
			const existing = v.name ? l.supplierByName(v.name) : undefined;
			action = existing ? 'update' : 'create';
			if (!existing && !v.phone) errors.push(m.admin_imp_phone_empty());
			if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
				errors.push(m.admin_imp_email_bad());
			bool(v.vatRegistered, errors, L('vatRegistered'));
			num(v.leadTimeDays, errors, L('leadTimeDays'), { min: 0, integer: true });
		} else if (kind === 'customers') {
			if (!v.name) errors.push(m.admin_imp_name_empty());
			else
				once(
					`c:${lower(v.name)}|${(v.phone ?? '').replace(/\D/g, '')}`,
					row,
					errors,
					m.admin_imp_what_customer({ name: v.name })
				);
			if (v.name) {
				const existing = await findCustomer(reader, orgId, v.name, v.phone || null);
				action = existing ? 'update' : 'create';
			}
			if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
				errors.push(m.admin_imp_email_bad());
			num(v.creditLimit, errors, L('creditLimit'), { min: 0 });
			num(v.creditDays, errors, L('creditDays'), { min: 0, integer: true });
		} else {
			label = `${v.sku ?? ''} @ ${v.location ?? ''}`;
			const it = v.sku ? l.itemBySku(v.sku) : undefined;
			if (!v.sku) errors.push(m.admin_imp_sku_empty());
			else if (!it) errors.push(m.admin_imp_no_item({ sku: v.sku }));
			else if (!it.stockTracked) errors.push(m.admin_imp_not_stocked({ item: it.name }));
			if (!v.location) errors.push(m.admin_imp_location_empty());
			else {
				const { found, ambiguous } = findLocation(l, v.location);
				if (ambiguous) errors.push(m.admin_imp_location_ambiguous({ location: v.location }));
				else if (!found) errors.push(m.admin_imp_location_unknown({ location: v.location }));
				else if (it) {
					const [bal] = await reader
						.select({ q: sql<number>`COALESCE(SUM(${stockBalance.quantity}), 0)` })
						.from(stockBalance)
						.where(and(eq(stockBalance.itemId, it.id), eq(stockBalance.locationId, found.id)));
					if (Number(bal.q) > 0) {
						warnings.push(m.admin_imp_already_there({ quantity: round4(Number(bal.q)) }));
					}
				}
			}
			const quantity = num(v.quantity, errors, L('quantity'), { positive: true });
			if (v.quantity === undefined || v.quantity === '') errors.push(m.admin_imp_quantity_empty());
			num(v.unitCost, errors, L('unitCost'), { min: 0 });
			if (it && v.unit) {
				const u = l.unitByName(v.unit);
				if (!u) errors.push(m.admin_imp_unit_unknown({ unit: v.unit }));
				else if (
					u.id !== it.baseUomId &&
					!l.packs.some((p) => p.itemId === it.id && p.uomId === u.id)
				) {
					errors.push(m.admin_imp_not_counted_in({ item: it.name, unit: v.unit }));
				}
			}
			const expiry = isoDate(v.expiry, errors, L('expiry'));
			if (it) {
				if ((it.trackLots || it.trackExpiry) && !v.lot)
					errors.push(m.admin_imp_needs_lot({ item: it.name }));
				if (it.trackExpiry && !expiry && !v.expiry)
					errors.push(m.admin_imp_needs_expiry({ item: it.name }));
				const { serials, duplicates } = parseSerials((v.serials ?? '').replace(/;/g, ','));
				if (duplicates.length)
					errors.push(m.admin_imp_serial_twice({ serials: duplicates.join(', ') }));
				if (it.trackSerials) {
					if (!v.unit || l.unitByName(v.unit)?.id === it.baseUomId) {
						if (quantity !== undefined && serials.length !== quantity) {
							errors.push(m.admin_imp_serial_count({ item: it.name, quantity }));
						}
					} else errors.push(m.admin_imp_serial_base());
				} else if (serials.length) errors.push(m.admin_imp_no_serials({ item: it.name }));
			}
		}

		plans.push({ row, label, action: errors.length ? 'skip' : action, errors, warnings });
	}

	const count = (a: RowPlan['action']) =>
		plans.filter((p) => p.action === a && !p.errors.length).length;
	return {
		kind,
		rows: plans,
		counts: {
			create: count('create'),
			update: count('update'),
			skip: 0,
			errors: plans.filter((p) => p.errors.length).length
		}
	};
}

async function findCustomer(reader: Reader, orgId: number, name: string, phone: string | null) {
	const [row] = await reader
		.select({ id: customer.id })
		.from(customer)
		.where(
			and(
				eq(customer.orgId, orgId),
				isNull(customer.deletedAt),
				sql`LOWER(${customer.name}) = LOWER(${name})`,
				phone
					? sql`REGEXP_REPLACE(${customer.phone}, '[^0-9]', '') = ${phone.replace(/[^0-9]/g, '')}`
					: isNull(customer.phone)
			)
		);
	return row?.id ?? null;
}

// ── Writing ─────────────────────────────────────────────────────────────────────────────────

export type ImportResult = {
	created: number;
	updated: number;
	/** Opening stock: the adjustments posted, one per location. */
	documents: { id: number; number: string }[];
};

/**
 * Plans the rows again and, if every one is clean, writes them all. Throws `ImportError` naming
 * the first bad row otherwise. Run it inside a transaction: all or nothing.
 */
export async function runImport(
	tx: Tx,
	input: { orgId: number; kind: ImportKind; rows: SheetRow[]; userId?: string; today: string }
): Promise<ImportResult> {
	const { orgId, kind, rows } = input;
	const plan = await planImport(tx, orgId, kind, rows);
	const bad = plan.rows.find((r) => r.errors.length);
	if (bad) {
		throw new ImportError(
			m.admin_imp_nothing_imported_rows({
				count: plan.counts.errors,
				row: bad.row,
				error: bad.errors[0]
			})
		);
	}
	const result: ImportResult = { created: 0, updated: 0, documents: [] };
	const userId = input.userId ?? null;

	if (kind === 'suppliers') {
		for (const { values: v } of rows) {
			const values = {
				...(v.phone ? { phone: v.phone } : {}),
				...(v.email ? { email: v.email } : {}),
				...(v.address ? { address: v.address } : {}),
				...(v.tin ? { tin: v.tin } : {}),
				...(v.contactPerson ? { contactPerson: v.contactPerson } : {}),
				...(v.vatRegistered ? { vatRegistered: TRUE.has(lower(v.vatRegistered)) } : {}),
				...(v.leadTimeDays ? { leadTimeDays: Number(v.leadTimeDays) } : {})
			};
			const [existing] = await tx
				.select({ id: supplier.id })
				.from(supplier)
				.where(
					and(
						eq(supplier.orgId, orgId),
						isNull(supplier.deletedAt),
						sql`LOWER(${supplier.name}) = LOWER(${v.name})`
					)
				);
			if (existing) {
				if (Object.keys(values).length) {
					await tx
						.update(supplier)
						.set({ ...values, updatedBy: userId })
						.where(eq(supplier.id, existing.id));
				}
				result.updated++;
			} else {
				await tx.insert(supplier).values({
					orgId,
					name: v.name,
					phone: v.phone,
					...values,
					createdBy: userId
				});
				result.created++;
			}
		}
		return result;
	}

	if (kind === 'customers') {
		for (const { values: v } of rows) {
			const values = {
				...(v.email ? { email: v.email } : {}),
				...(v.address ? { address: v.address } : {}),
				...(v.tin ? { tin: v.tin } : {}),
				...(v.creditLimit ? { creditLimit: Number(v.creditLimit.replace(/,/g, '')) } : {}),
				...(v.creditDays ? { creditDays: Number(v.creditDays) } : {})
			};
			const id = await findCustomer(tx, orgId, v.name, v.phone || null);
			if (id) {
				if (Object.keys(values).length) {
					await tx
						.update(customer)
						.set({ ...values, updatedBy: userId })
						.where(eq(customer.id, id));
				}
				result.updated++;
			} else {
				await tx
					.insert(customer)
					.values({ orgId, name: v.name, phone: v.phone || null, ...values, createdBy: userId });
				result.created++;
			}
		}
		return result;
	}

	if (kind === 'items') {
		const unitId = async (name: string) => {
			const [found] = await tx
				.select({ id: uom.id })
				.from(uom)
				.where(
					and(
						eq(uom.orgId, orgId),
						isNull(uom.deletedAt),
						sql`(LOWER(${uom.name}) = LOWER(${name}) OR LOWER(${uom.symbol}) = LOWER(${name}))`
					)
				);
			if (found) return found.id;
			const [created] = await tx
				.insert(uom)
				.values({ orgId, name: name.slice(0, 40), symbol: name.slice(0, 12).toLowerCase() })
				.$returningId();
			return created.id;
		};
		const categoryId = async (name: string) => {
			const [found] = await tx
				.select({ id: category.id })
				.from(category)
				.where(and(eq(category.orgId, orgId), sql`LOWER(${category.name}) = LOWER(${name})`));
			if (found) return found.id;
			const [created] = await tx
				.insert(category)
				.values({ orgId, name: name.slice(0, 100) })
				.$returningId();
			return created.id;
		};
		const supplierId = async (name: string) => {
			const [found] = await tx
				.select({ id: supplier.id })
				.from(supplier)
				.where(
					and(
						eq(supplier.orgId, orgId),
						isNull(supplier.deletedAt),
						sql`LOWER(${supplier.name}) = LOWER(${name})`
					)
				);
			return found!.id;
		};
		const addBarcode = async (itemId: number, code: string, uomId: number | null) => {
			const [has] = await tx
				.select({ id: barcode.id })
				.from(barcode)
				.where(and(eq(barcode.orgId, orgId), eq(barcode.code, code), isNull(barcode.deletedAt)));
			if (!has) await tx.insert(barcode).values({ orgId, itemId, code, uomId });
		};

		for (const { values: v } of rows) {
			const flags = {
				...(v.stockTracked ? { stockTracked: TRUE.has(lower(v.stockTracked)) } : {}),
				...(v.trackLots ? { trackLots: TRUE.has(lower(v.trackLots)) } : {}),
				...(v.trackExpiry ? { trackExpiry: TRUE.has(lower(v.trackExpiry)) } : {}),
				...(v.trackSerials ? { trackSerials: TRUE.has(lower(v.trackSerials)) } : {})
			};
			// As on the item form: expiry needs lots; a service tracks nothing.
			if (flags.trackExpiry) flags.trackLots = true;
			if (flags.stockTracked === false) {
				flags.trackLots = flags.trackExpiry = flags.trackSerials = false;
			}
			const values = {
				...(v.name ? { name: v.name } : {}),
				...(v.nameAm ? { nameAm: v.nameAm } : {}),
				...(v.category ? { categoryId: await categoryId(v.category) } : {}),
				...(v.unit ? { baseUomId: await unitId(v.unit) } : {}),
				...(v.salePrice
					? {
							salePrice: Number(v.salePrice.replace(/,/g, '').replace(/\s*(birr|etb|br)\.?$/i, ''))
						}
					: {}),
				...(v.taxCode ? { taxCode: TAX_WORDS[lower(v.taxCode)] } : {}),
				...(v.supplier ? { supplierId: await supplierId(v.supplier) } : {}),
				...(v.reorderLevel ? { reorderLevel: Number(v.reorderLevel.replace(/,/g, '')) } : {}),
				...flags
			};
			const [existing] = await tx
				.select({ id: item.id, baseUomId: item.baseUomId })
				.from(item)
				.where(
					and(
						eq(item.orgId, orgId),
						isNull(item.deletedAt),
						sql`LOWER(${item.sku}) = LOWER(${v.sku})`
					)
				);
			let itemId: number;
			let baseUomId: number;
			if (existing) {
				itemId = existing.id;
				baseUomId = values.baseUomId ?? existing.baseUomId;
				await tx
					.update(item)
					.set({ ...values, updatedBy: userId })
					.where(eq(item.id, itemId));
				result.updated++;
			} else {
				const [created] = await tx
					.insert(item)
					.values({
						orgId,
						sku: v.sku,
						name: v.name,
						baseUomId: values.baseUomId!,
						...values,
						createdBy: userId
					})
					.$returningId();
				itemId = created.id;
				baseUomId = values.baseUomId!;
				result.created++;
			}
			if (v.barcode) await addBarcode(itemId, v.barcode, null);
			if (v.packUnit) {
				const packId = await unitId(v.packUnit);
				const [had] = await tx
					.select({ id: itemUnit.id })
					.from(itemUnit)
					.where(
						and(eq(itemUnit.itemId, itemId), eq(itemUnit.uomId, packId), isNull(itemUnit.deletedAt))
					);
				if (!had && packId !== baseUomId) {
					await tx.insert(itemUnit).values({
						orgId,
						itemId,
						uomId: packId,
						factor: Number(v.packFactor.replace(/,/g, ''))
					});
				}
				if (v.packBarcode) await addBarcode(itemId, v.packBarcode, packId);
			}
		}
		return result;
	}

	// Opening stock: one adjustment per location, posted.
	const l = await lookups(tx, orgId);
	const byLocation = new Map<number, { row: number; values: Record<string, string> }[]>();
	for (const r of rows) {
		const loc = findLocation(l, r.values.location).found!;
		byLocation.set(loc.id, [...(byLocation.get(loc.id) ?? []), r]);
	}
	for (const [locationId, locRows] of byLocation) {
		const loc = l.locations.find((x) => x.id === locationId)!;
		const [doc] = await tx
			.insert(stockDocument)
			.values({
				orgId,
				type: 'adjustment',
				branchId: loc.branchId,
				docDate: input.today,
				fromLocationId: locationId,
				reason: 'opening',
				reference: 'Opening stock import',
				createdBy: userId
			})
			.$returningId();
		const rowOfLine = new Map<number, number>();
		for (const { row, values: v } of locRows) {
			const it = l.itemBySku(v.sku)!;
			const unit = v.unit ? l.unitByName(v.unit)!.id : it.baseUomId;
			const { serials } = parseSerials((v.serials ?? '').replace(/;/g, ','));
			const [line] = await tx
				.insert(stockDocumentLine)
				.values({
					orgId,
					documentId: doc.id,
					itemId: it.id,
					uomId: unit,
					quantity: Number(v.quantity.replace(/,/g, '')),
					unitCost: v.unitCost ? Number(v.unitCost.replace(/,/g, '')) : null,
					lotNumber: v.lot || null,
					expiryDate: v.expiry ? (isoDate(v.expiry, [], '') ?? null) : null,
					serials: serials.length ? serials.join('\n') : null,
					note: `Import row ${row}`
				})
				.$returningId();
			rowOfLine.set(line.id, row);
		}
		try {
			// Opening stock is the starting point, not a write-off: no second approval.
			const { number } = await postDocument(tx, {
				orgId,
				documentId: doc.id,
				userId: input.userId,
				today: input.today,
				approved: true
			});
			result.documents.push({ id: doc.id, number });
			result.created += locRows.length;
		} catch (err) {
			if (err instanceof StockError) {
				const row = err.lineId ? rowOfLine.get(err.lineId) : undefined;
				throw new ImportError(
					m.admin_imp_nothing_imported({
						detail: `${row ? m.admin_imp_row_prefix({ row }) : ''}${err.message}`
					})
				);
			}
			throw err;
		}
	}
	return result;
}

/** Items of this business by SKU, for tests and the preview's links. */
export async function itemIdsBySku(orgId: number, skus: string[], reader: Reader = db) {
	if (!skus.length) return new Map<string, number>();
	const rows = await reader
		.select({ id: item.id, sku: item.sku })
		.from(item)
		.where(and(eq(item.orgId, orgId), inArray(item.sku, skus)));
	return new Map(rows.map((r) => [r.sku, r.id]));
}
