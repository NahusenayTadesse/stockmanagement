/**
 * The building blocks of the demo seed. Everything goes through the app's own code: businesses
 * are made by `createOrganization`, stock moves only by `postDocument`, passwords are hashed by
 * better-auth's own hasher. So a seeded business is exactly what one typed in by hand would be —
 * balances, lots, serials, average costs and document numbers included.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { addLocalDays, localToday } from '@nahu/admin-kit/time';
import {
	account,
	barcode,
	branch,
	category,
	customer,
	fiscalDevice,
	item,
	itemUnit,
	location,
	lot,
	numberSequence,
	organization,
	paymentMethod,
	posCart,
	posShift,
	priceList,
	priceListItem,
	purchaseOrder,
	purchaseOrderLine,
	quote,
	quoteLine,
	rolePermissions,
	roles,
	serialUnit,
	session,
	specialPermissions,
	stockBalance,
	stockCount,
	stockCountLine,
	stockDocument,
	stockDocumentLine,
	stockMovement,
	supplier,
	transactionAttachment,
	transactions,
	uom,
	user
} from '$lib/server/db/schema';
import { createOrganization } from '$lib/server/seedPermissions';
import { postDocument, type Tx } from '$lib/server/stock/post';
import { markOrdered, receiptFromOrder } from '$lib/server/purchasing';
import { createReturn } from '$lib/server/returns';
import { submitEinvoice } from '$lib/server/einvoice';
import { checkout, closeShift, openShift, shiftSummary } from '$lib/server/pos';
import { priceTable } from '$lib/server/pricing';
import { lineAmounts, saleTotRate, saleVatRate, taxSettings } from '$lib/server/tax';
import { convertQuote, numberQuote } from '$lib/server/quotes';
import { countLines, openCount, postCount, saveCounts } from '$lib/server/counts';
import { documentTotals, suggestedWithholding } from '$lib/server/tax';
import type { DocumentType } from '$lib/constants';

/** Every seeded account signs in with this. */
export const PASSWORD = 'Secret123!';

/** A day relative to today, so expiry dates stay meaningful whenever the seed is run. */
export const day = (offset: number) => addLocalDays(localToday(), offset);

/** `count` serial numbers: `serials('5CD41', 1, 3, 5)` → 5CD4100001, 5CD4100002, 5CD4100003. */
export function serials(prefix: string, start: number, count: number, width = 5): string[] {
	return Array.from(
		{ length: count },
		(_, i) => `${prefix}${String(start + i).padStart(width, '0')}`
	);
}

export type Business = {
	orgId: number;
	name: string;
	branches: Map<string, number>;
	locations: Map<string, number>;
	units: Map<string, number>;
	categories: Map<string, number>;
	items: Map<string, number>;
	users: Map<string, string>;
	suppliers: Map<string, number>;
	customers: Map<string, number>;
};

/**
 * Removes a seeded business and everything it owns, children first. Only ever called on a name
 * this seed created, and only with `--fresh`.
 */
/**
 * The business a seeded owner belongs to. Found by the owner's email rather than the business
 * name, because an owner can rename their business from the Business profile screen.
 */
async function seededOrgs(tx: Tx, ownerEmail: string) {
	return tx.selectDistinct({ id: user.orgId }).from(user).where(eq(user.email, ownerEmail));
}

export async function removeBusiness(tx: Tx, ownerEmail: string) {
	const orgs = await seededOrgs(tx, ownerEmail);

	for (const { id: orgId } of orgs) {
		const userIds = (await tx.select({ id: user.id }).from(user).where(eq(user.orgId, orgId))).map(
			(u) => u.id
		);
		const roleIds = (
			await tx.select({ id: roles.id }).from(roles).where(eq(roles.orgId, orgId))
		).map((r) => r.id);

		// Attached files leave the disk with their rows.
		const files = await tx
			.select({ fileName: transactionAttachment.fileName })
			.from(transactionAttachment)
			.where(eq(transactionAttachment.orgId, orgId));
		const [org] = await tx
			.select({ logo: organization.logo })
			.from(organization)
			.where(eq(organization.id, orgId));
		for (const name of [...files.map((f) => f.fileName), org?.logo]) {
			if (name) fs.rmSync(path.join(FILES_DIR, name), { force: true });
		}

		// Returns point at what they return, within the same tables: unhook them before deleting.
		await tx
			.update(stockDocumentLine)
			.set({ returnOfLineId: null })
			.where(eq(stockDocumentLine.orgId, orgId));
		await tx.update(stockDocument).set({ returnOfId: null }).where(eq(stockDocument.orgId, orgId));

		for (const table of [
			stockMovement,
			stockBalance,
			numberSequence,
			stockCountLine,
			stockCount,
			stockDocumentLine,
			stockDocument,
			purchaseOrderLine,
			purchaseOrder,
			quoteLine,
			quote,
			posCart,
			priceListItem,
			serialUnit,
			lot,
			barcode,
			itemUnit,
			item,
			category,
			transactionAttachment,
			transactions,
			posShift,
			paymentMethod,
			supplier,
			customer,
			priceList
		]) {
			await tx.delete(table).where(eq(table.orgId, orgId));
		}
		if (userIds.length) {
			await tx.delete(specialPermissions).where(inArray(specialPermissions.userId, userIds));
			await tx.delete(session).where(inArray(session.userId, userIds));
			await tx.delete(account).where(inArray(account.userId, userIds));
			await tx.delete(user).where(inArray(user.id, userIds));
		}
		if (roleIds.length) {
			await tx.delete(rolePermissions).where(inArray(rolePermissions.roleId, roleIds));
		}
		await tx.delete(roles).where(eq(roles.orgId, orgId));
		await tx.delete(location).where(eq(location.orgId, orgId));
		await tx.delete(branch).where(eq(branch.orgId, orgId));
		await tx.delete(uom).where(eq(uom.orgId, orgId));
		await tx.delete(organization).where(eq(organization.id, orgId));
	}
}

export async function businessExists(tx: Tx, ownerEmail: string) {
	return (await seededOrgs(tx, ownerEmail)).length > 0;
}

/**
 * A new business through `createOrganization`, with its main branch and main store renamed to
 * something that reads like a real place.
 */
export async function createBusiness(
	tx: Tx,
	input: {
		name: string;
		tin: string;
		phone: string;
		address: string;
		main: { name: string; code: string; address: string; phone: string; store: string };
		/** VAT registration, withholding agency and the like. */
		settings?: Partial<typeof organization.$inferInsert>;
	}
): Promise<Business> {
	const { orgId, branchId } = await createOrganization(tx, input);
	await tx
		.update(organization)
		.set({ address: input.address, ...input.settings })
		.where(eq(organization.id, orgId));
	await tx
		.update(branch)
		.set({
			name: input.main.name,
			code: input.main.code,
			address: input.main.address,
			phone: input.main.phone
		})
		.where(eq(branch.id, branchId));
	await tx
		.update(location)
		.set({ name: input.main.store })
		.where(and(eq(location.branchId, branchId), eq(location.kind, 'storage')));

	const biz: Business = {
		orgId,
		name: input.name,
		branches: new Map([[input.main.code, branchId]]),
		locations: new Map(),
		units: new Map(),
		categories: new Map(),
		items: new Map(),
		users: new Map(),
		suppliers: new Map(),
		customers: new Map()
	};

	for (const l of await tx.select().from(location).where(eq(location.orgId, orgId))) {
		biz.locations.set(l.name, l.id);
	}
	for (const u of await tx.select().from(uom).where(eq(uom.orgId, orgId))) {
		biz.units.set(u.name, u.id);
	}
	return biz;
}

export async function addBranch(
	tx: Tx,
	biz: Business,
	b: { name: string; code: string; address: string; phone: string }
) {
	const [row] = await tx
		.insert(branch)
		.values({ orgId: biz.orgId, ...b })
		.$returningId();
	biz.branches.set(b.code, row.id);
}

export async function addLocations(
	tx: Tx,
	biz: Business,
	rows: { branch: string; name: string; kind: 'storage' | 'sales' | 'cold' | 'quarantine' }[]
) {
	for (const l of rows) {
		const [row] = await tx
			.insert(location)
			.values({
				orgId: biz.orgId,
				branchId: biz.branches.get(l.branch)!,
				name: l.name,
				kind: l.kind
			})
			.$returningId();
		biz.locations.set(l.name, row.id);
	}
}

export async function addUnits(tx: Tx, biz: Business, rows: { name: string; symbol: string }[]) {
	for (const u of rows) {
		if (biz.units.has(u.name)) continue;
		const [row] = await tx
			.insert(uom)
			.values({ orgId: biz.orgId, ...u })
			.$returningId();
		biz.units.set(u.name, row.id);
	}
}

export async function addCategories(
	tx: Tx,
	biz: Business,
	rows: { name: string; nameAm?: string; warn?: number }[]
) {
	for (const c of rows) {
		const [row] = await tx
			.insert(category)
			.values({ orgId: biz.orgId, name: c.name, nameAm: c.nameAm, expiryWarningDays: c.warn ?? 90 })
			.$returningId();
		biz.categories.set(c.name, row.id);
	}
}

/** A staff account on one of the business's roles, able to sign in with `PASSWORD`. */
export async function addUser(
	tx: Tx,
	biz: Business,
	u: { key: string; name: string; email: string; role: string; branch: string }
) {
	const [role] = await tx
		.select({ id: roles.id })
		.from(roles)
		.where(and(eq(roles.orgId, biz.orgId), eq(roles.name, u.role)));
	const id = randomUUID().replace(/-/g, '');

	await tx.insert(user).values({
		id,
		name: u.name,
		email: u.email,
		emailVerified: true,
		orgId: biz.orgId,
		roleId: role.id,
		branchId: biz.branches.get(u.branch),
		role: 'user'
	});
	await tx.insert(account).values({
		id: randomUUID().replace(/-/g, ''),
		accountId: id,
		providerId: 'credential',
		userId: id,
		password: await hashPassword(PASSWORD)
	});
	biz.users.set(u.key, id);
}

export type SupplierSpec = {
	name: string;
	phone: string;
	vatRegistered?: boolean;
	email?: string;
	address?: string;
	tin?: string;
	contactPerson?: string;
};

export async function addSuppliers(tx: Tx, biz: Business, rows: SupplierSpec[], createdBy: string) {
	for (const s of rows) {
		const [row] = await tx
			.insert(supplier)
			.values({ orgId: biz.orgId, ...s, createdBy })
			.$returningId();
		biz.suppliers.set(s.name, row.id);
	}
}

export type CustomerSpec = {
	name: string;
	withholdsTax?: boolean;
	creditLimit?: number | null;
	creditDays?: number;
	phone?: string;
	email?: string;
	address?: string;
	tin?: string;
	note?: string;
};

/** The regular buyers worth naming. Walk-in sales in the seed name nobody, as in real life. */
export async function addCustomers(tx: Tx, biz: Business, rows: CustomerSpec[], createdBy: string) {
	for (const c of rows) {
		const [row] = await tx
			.insert(customer)
			.values({ orgId: biz.orgId, ...c, createdBy })
			.$returningId();
		biz.customers.set(c.name, row.id);
	}
}

function customerId(biz: Business, name: string) {
	const id = biz.customers.get(name);
	if (!id) throw new Error(`${biz.name}: no customer called ${name}`);
	return id;
}

function supplierId(biz: Business, name: string) {
	const id = biz.suppliers.get(name);
	if (!id) throw new Error(`${biz.name}: no supplier called ${name}`);
	return id;
}

export type ItemSpec = {
	sku: string;
	name: string;
	nameAm?: string;
	category: string;
	unit: string;
	/** Pack units: `[['Box', 10]]` — a box is 10 base units. */
	packs?: [string, number][];
	barcodes?: string[];
	/** The main supplier, by name. Required for anything counted in stock. */
	supplier?: string;
	price?: number;
	reorder?: number;
	description?: string;
	flags?: Partial<
		Pick<
			typeof item.$inferInsert,
			| 'stockTracked'
			| 'trackLots'
			| 'trackExpiry'
			| 'trackSerials'
			| 'sellable'
			| 'purchasable'
			| 'leasable'
			| 'consumable'
			| 'perishable'
			| 'prescriptionOnly'
			| 'controlledSubstance'
			| 'storageCondition'
		>
	>;
};

export async function addItems(tx: Tx, biz: Business, specs: ItemSpec[], createdBy: string) {
	for (const s of specs) {
		const flags = { ...s.flags };
		if (flags.trackExpiry) flags.trackLots = true;
		if (!s.supplier && flags.stockTracked !== false) {
			throw new Error(`${biz.name}: ${s.sku} is stock-tracked and needs a main supplier`);
		}

		const [row] = await tx
			.insert(item)
			.values({
				orgId: biz.orgId,
				sku: s.sku,
				name: s.name,
				nameAm: s.nameAm,
				categoryId: biz.categories.get(s.category),
				baseUomId: unitId(biz, s.unit),
				salePrice: s.price ?? null,
				reorderLevel: s.reorder ?? null,
				description: s.description,
				supplierId: s.supplier ? supplierId(biz, s.supplier) : null,
				createdBy,
				...flags
			})
			.$returningId();
		biz.items.set(s.sku, row.id);

		for (const [unit, factor] of s.packs ?? []) {
			await tx
				.insert(itemUnit)
				.values({ orgId: biz.orgId, itemId: row.id, uomId: unitId(biz, unit), factor });
		}
		for (const code of s.barcodes ?? []) {
			await tx.insert(barcode).values({ orgId: biz.orgId, itemId: row.id, code });
		}
	}
}

function unitId(biz: Business, name: string) {
	const id = biz.units.get(name);
	if (!id) throw new Error(`${biz.name}: no unit called ${name}`);
	return id;
}

export type LineSpec = {
	sku: string;
	qty: number;
	/** Defaults to the item's base unit. */
	unit?: string;
	/** Per `unit`. */
	cost?: number;
	/** Issues: the sale price per `unit`. Defaults to the item's list price. */
	price?: number;
	/** Receipts: the lot arriving. */
	lot?: string;
	expiry?: string;
	/** Issues, transfers, write-offs: take from this lot rather than first-expiry-first-out. */
	fromLot?: string;
	serials?: string[];
};

/**
 * A stock document with its lines, posted as of its own date (so expiry is judged the way it was
 * on that day) unless `draft` is set.
 */
export async function document(
	tx: Tx,
	biz: Business,
	head: {
		type: DocumentType;
		date: string;
		from?: string;
		to?: string;
		/** Receipts: the supplier, by name. */
		supplier?: string;
		/** Issues: who it went to, as written — a department, or nobody for a walk-in sale. */
		party?: string;
		/** Issues: a listed customer, by name. */
		customer?: string;
		reference?: string;
		reason?: 'count' | 'damage' | 'expiry' | 'found' | 'other';
		note?: string;
		by: string;
		draft?: boolean;
	},
	lines: LineSpec[]
) {
	const fromId = head.from ? biz.locations.get(head.from) : null;
	const toId = head.to ? biz.locations.get(head.to) : null;
	if ((head.from && !fromId) || (head.to && !toId)) {
		throw new Error(`${biz.name}: unknown location ${head.from ?? head.to}`);
	}
	const [loc] = await tx
		.select({ branchId: location.branchId })
		.from(location)
		.where(eq(location.id, (fromId ?? toId)!));
	const userId = biz.users.get(head.by)!;

	const [doc] = await tx
		.insert(stockDocument)
		.values({
			orgId: biz.orgId,
			type: head.type,
			branchId: loc.branchId,
			docDate: head.date,
			fromLocationId: fromId,
			toLocationId: toId,
			supplierId: head.type === 'receipt' ? supplierId(biz, head.supplier!) : null,
			party: head.type === 'receipt' ? null : head.party,
			customerId: head.customer ? customerId(biz, head.customer) : null,
			reference: head.reference,
			reason: head.reason,
			note: head.note,
			createdBy: userId
		})
		.$returningId();

	for (const l of lines) {
		const itemId = biz.items.get(l.sku);
		if (!itemId) throw new Error(`${biz.name}: no item ${l.sku}`);
		const [it] = await tx
			.select({ baseUomId: item.baseUomId, salePrice: item.salePrice })
			.from(item)
			.where(eq(item.id, itemId));
		const uomId = l.unit ? unitId(biz, l.unit) : it.baseUomId;

		// A sale is priced as the issue form prices it: the list price, times the pack size.
		let unitPrice: number | null = null;
		if (head.type === 'issue') {
			let factor = 1;
			if (uomId !== it.baseUomId) {
				const [conv] = await tx
					.select({ factor: itemUnit.factor })
					.from(itemUnit)
					.where(and(eq(itemUnit.itemId, itemId), eq(itemUnit.uomId, uomId)));
				factor = conv?.factor ?? 1;
			}
			unitPrice =
				l.price ?? (it.salePrice != null ? Math.round(it.salePrice * factor * 100) / 100 : null);
		}

		let lotId: number | null = null;
		if (l.fromLot) {
			const [found] = await tx
				.select({ id: lot.id })
				.from(lot)
				.where(and(eq(lot.itemId, itemId), eq(lot.lotNumber, l.fromLot)));
			if (!found) throw new Error(`${biz.name}: no lot ${l.fromLot} of ${l.sku}`);
			lotId = found.id;
		}

		await tx.insert(stockDocumentLine).values({
			orgId: biz.orgId,
			documentId: doc.id,
			itemId,
			uomId,
			quantity: l.qty,
			unitCost: l.cost ?? null,
			unitPrice,
			lotId,
			lotNumber: l.lot ?? null,
			expiryDate: l.expiry ?? null,
			serials: l.serials?.join('\n') ?? null
		});
	}

	if (!head.draft) {
		// The seed stands in for a manager, who may take a customer over their limit.
		await postDocument(tx, {
			orgId: biz.orgId,
			documentId: doc.id,
			userId,
			today: head.date,
			allowOverLimit: true
		});
	}
	return doc.id;
}

/** Quarantine or recall a lot, as the Lots screen does. */
export async function setLotStatus(
	tx: Tx,
	biz: Business,
	sku: string,
	lotNumber: string,
	status: 'quarantine' | 'recalled',
	note: string
) {
	await tx
		.update(lot)
		.set({ status, note })
		.where(and(eq(lot.itemId, biz.items.get(sku)!), eq(lot.lotNumber, lotNumber)));
}

// ── Money ────────────────────────────────────────────────────────────────────────────────────

/** Where the kit stores uploads; the seed writes its sample files there directly. */
const FILES_DIR = process.env.FILES_DIR ?? '.tempFiles';

/**
 * A one-page PDF with a few lines of text, standing in for a transfer confirmation or receipt.
 * Marked as a sample on its face, so it can never pass for a real bank document.
 */
function samplePdf(title: string, lines: string[]): Buffer {
	const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '-');
	const text = [
		'BT /F1 18 Tf 50 780 Td (' + esc(title) + ') Tj ET',
		'BT /F1 10 Tf 50 760 Td (SAMPLE - generated by the demo seed, not a real payment record) Tj ET',
		...lines.map((l, i) => `BT /F1 12 Tf 50 ${725 - i * 20} Td (${esc(l)}) Tj ET`)
	].join('\n');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
		`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
	];
	let pdf = '%PDF-1.4\n';
	const offsets: number[] = [];
	objects.forEach((body, i) => {
		offsets.push(Buffer.byteLength(pdf));
		pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
	});
	const xref = Buffer.byteLength(pdf);
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(pdf);
}

export type MoneySpec = {
	direction: 'in' | 'out';
	/** Or `settle`: pay the linked documents in full, as the payment form suggests. */
	amount?: number;
	/**
	 * Pays the linked documents' total, VAT included, keeping back the withholding the rules call
	 * for (ours from a supplier, or a withholding customer's from us).
	 */
	settle?: boolean;
	withholdingReceipt?: string;
	date: string;
	method: string;
	purpose: 'purchase' | 'sale' | 'expense' | 'other_income' | 'other';
	party?: string;
	reference?: string;
	receipt?: string;
	description?: string;
	branch?: string;
	/** Who typed it in. */
	by: string;
	/** Who checked it against the statement — must be someone else. */
	verifiedBy?: string;
	void?: string;
	/** Attach a sample PDF with this title. */
	attach?: string;
	/** Stock documents this money was for. */
	documents?: number[];
	/** The supplier paid, by name. Defaults to the supplier of a linked receipt. */
	supplier?: string;
	/** The customer who paid, by name. Defaults to the customer of a linked sale. */
	customer?: string;
};

/** A transaction, optionally with a sample PDF attached and linked to stock documents. */
export async function money(tx: Tx, biz: Business, m: MoneySpec) {
	const [method] = await tx
		.select({ id: paymentMethod.id })
		.from(paymentMethod)
		.where(and(eq(paymentMethod.orgId, biz.orgId), eq(paymentMethod.name, m.method)));
	if (!method) throw new Error(`${biz.name}: no payment method ${m.method}`);

	const createdBy = biz.users.get(m.by)!;

	let amount = m.amount ?? 0;
	let withheld = 0;
	if (m.settle) {
		if (!m.documents?.length) throw new Error(`${biz.name}: settle needs documents`);
		let gross = 0;
		let net = 0;
		for (const id of m.documents) {
			const t = await documentTotals(biz.orgId, id, tx);
			gross += t?.gross ?? 0;
			net += t?.net ?? 0;
		}
		const [doc] = await tx
			.select({
				type: stockDocument.type,
				supplierId: stockDocument.supplierId,
				customerId: stockDocument.customerId
			})
			.from(stockDocument)
			.where(eq(stockDocument.id, m.documents[0]));
		withheld = (await suggestedWithholding(biz.orgId, doc, net, tx)).amount;
		amount = Math.round((gross - withheld) * 100) / 100;
	}

	let paidSupplier = m.supplier ? supplierId(biz, m.supplier) : null;
	// A sale's payment belongs to the sale's customer, if it had one.
	let payingCustomer = m.customer ? customerId(biz, m.customer) : null;
	if (m.documents?.length) {
		const [doc] = await tx
			.select({ supplierId: stockDocument.supplierId, customerId: stockDocument.customerId })
			.from(stockDocument)
			.where(eq(stockDocument.id, m.documents[0]));
		paidSupplier ??= doc?.supplierId ?? null;
		payingCustomer ??= doc?.customerId ?? null;
	}

	const [row] = await tx
		.insert(transactions)
		.values({
			orgId: biz.orgId,
			branchId: m.branch ? biz.branches.get(m.branch) : null,
			direction: m.direction,
			amount,
			withheld,
			withholdingReceipt: withheld
				? (m.withholdingReceipt ?? `WH-${m.date.replaceAll('-', '')}`)
				: null,
			occurredOn: m.date,
			paymentMethodId: method.id,
			purpose: m.purpose,
			party: m.party,
			reference: m.reference,
			receiptNumber: m.receipt,
			description: m.description,
			supplierId: paidSupplier,
			customerId: payingCustomer,
			createdBy,
			...(m.verifiedBy && {
				status: 'verified' as const,
				verifiedBy: biz.users.get(m.verifiedBy),
				verifiedAt: new Date(`${m.date}T17:00:00+03:00`)
			}),
			...(m.void && { status: 'void' as const, voidReason: m.void })
		})
		.$returningId();

	if (m.attach) {
		fs.mkdirSync(FILES_DIR, { recursive: true });
		const pdf = samplePdf(m.attach, [
			`Date: ${m.date}`,
			`Amount: ETB ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
			`Method: ${m.method}`,
			`${m.direction === 'in' ? 'From' : 'To'}: ${m.party ?? '-'}`,
			`Reference: ${m.reference ?? '-'}`,
			`Receipt no.: ${m.receipt ?? '-'}`,
			`Business: ${biz.name}`
		]);
		const fileName = `${randomUUID()}.pdf`;
		fs.writeFileSync(path.join(FILES_DIR, fileName), pdf);
		await tx.insert(transactionAttachment).values({
			orgId: biz.orgId,
			transactionId: row.id,
			fileName,
			originalName: `${m.attach}.pdf`,
			mimeType: 'application/pdf',
			sizeBytes: pdf.length,
			uploadedBy: createdBy
		});
	}

	for (const documentId of m.documents ?? []) {
		await tx
			.update(stockDocument)
			.set({ transactionId: row.id })
			.where(eq(stockDocument.id, documentId));
	}
	return row.id;
}

// ── Purchasing and counts ─────────────────────────────────────────────────────────────────────

/** A purchase order with its lines; placed (numbered) unless `draft` is set. */
export async function purchaseOrderSeed(
	tx: Tx,
	biz: Business,
	head: {
		supplier: string;
		deliverTo: string;
		date: string;
		expected?: string;
		reference?: string;
		note?: string;
		by: string;
		draft?: boolean;
	},
	lines: { sku: string; qty: number; unit?: string; price: number }[]
) {
	const locationId = biz.locations.get(head.deliverTo);
	if (!locationId) throw new Error(`${biz.name}: unknown location ${head.deliverTo}`);
	const [loc] = await tx
		.select({ branchId: location.branchId })
		.from(location)
		.where(eq(location.id, locationId));
	const userId = biz.users.get(head.by)!;

	const [order] = await tx
		.insert(purchaseOrder)
		.values({
			orgId: biz.orgId,
			branchId: loc.branchId,
			supplierId: supplierId(biz, head.supplier),
			locationId,
			orderDate: head.date,
			expectedDate: head.expected ?? null,
			reference: head.reference ?? null,
			note: head.note ?? null,
			createdBy: userId
		})
		.$returningId();

	for (const l of lines) {
		const itemId = biz.items.get(l.sku);
		if (!itemId) throw new Error(`${biz.name}: no item ${l.sku}`);
		const [it] = await tx
			.select({ baseUomId: item.baseUomId })
			.from(item)
			.where(eq(item.id, itemId));
		await tx.insert(purchaseOrderLine).values({
			orgId: biz.orgId,
			purchaseOrderId: order.id,
			itemId,
			uomId: l.unit ? unitId(biz, l.unit) : it.baseUomId,
			quantity: l.qty,
			unitPrice: l.price
		});
	}

	if (!head.draft) await markOrdered(tx, { orgId: biz.orgId, orderId: order.id, userId });
	return order.id;
}

/**
 * A delivery against an order, the way the storekeeper does it: "Receive delivery" drafts
 * everything still due, then the quantities are corrected to what arrived (0 drops the line),
 * lots are filled in, and it is posted as of its own date.
 */
export async function receiveOrder(
	tx: Tx,
	biz: Business,
	orderId: number,
	head: { date: string; by: string; reference?: string },
	arrived: Record<string, { qty?: number; lot?: string; expiry?: string }> = {}
) {
	const userId = biz.users.get(head.by)!;
	const documentId = await receiptFromOrder(tx, {
		orgId: biz.orgId,
		orderId,
		date: head.date,
		userId
	});
	if (head.reference) {
		await tx
			.update(stockDocument)
			.set({ reference: head.reference })
			.where(eq(stockDocument.id, documentId));
	}

	const skuOf = new Map([...biz.items].map(([sku, id]) => [id, sku]));
	const lines = await tx
		.select()
		.from(stockDocumentLine)
		.where(eq(stockDocumentLine.documentId, documentId));
	for (const line of lines) {
		const change = arrived[skuOf.get(line.itemId)!];
		if (!change) continue;
		if (change.qty === 0) {
			await tx.delete(stockDocumentLine).where(eq(stockDocumentLine.id, line.id));
			continue;
		}
		await tx
			.update(stockDocumentLine)
			.set({
				quantity: change.qty ?? line.quantity,
				lotNumber: change.lot ?? null,
				expiryDate: change.expiry ?? null
			})
			.where(eq(stockDocumentLine.id, line.id));
	}

	await postDocument(tx, { orgId: biz.orgId, documentId, userId, today: head.date });
	return documentId;
}

/**
 * A stock count of one location. Every line is counted as expected except the `differences`
 * (by SKU, applied to the item's first lot). Posted unless `open` is set, in which case only
 * `countedShare` of the lines are filled in — a count still in progress.
 */
export async function stockTake(
	tx: Tx,
	biz: Business,
	head: {
		location: string;
		date: string;
		by: string;
		blind?: boolean;
		note?: string;
		open?: boolean;
		countedShare?: number;
	},
	differences: { sku: string; delta: number }[] = []
) {
	const locationId = biz.locations.get(head.location);
	if (!locationId) throw new Error(`${biz.name}: unknown location ${head.location}`);
	const userId = biz.users.get(head.by)!;
	const countId = await openCount(tx, {
		orgId: biz.orgId,
		locationId,
		categoryId: null,
		blind: head.blind ?? true,
		countDate: head.date,
		note: head.note ?? null,
		userId
	});

	const lines = await countLines(biz.orgId, countId, tx);
	const deltas = new Map(
		differences.map((d) => {
			const itemId = biz.items.get(d.sku);
			const line = lines.find((l) => l.itemId === itemId);
			if (!line) throw new Error(`${biz.name}: ${d.sku} is not on the count of ${head.location}`);
			return [line.id, d.delta];
		})
	);
	const counted = head.open
		? lines.slice(0, Math.ceil(lines.length * (head.countedShare ?? 0.5)))
		: lines;
	await saveCounts(
		tx,
		biz.orgId,
		countId,
		counted.map((l) => ({ lineId: l.id, counted: l.expected + (deltas.get(l.id) ?? 0) })),
		userId
	);

	if (!head.open) await postCount(tx, { orgId: biz.orgId, countId, userId, today: head.date });
	return countId;
}

/**
 * A return, the way the document page makes one: drafted from the sale or receipt with everything
 * returnable, cut down to what actually comes back (by SKU; anything unlisted is dropped), posted.
 */
export async function returnGoods(
	tx: Tx,
	biz: Business,
	head: { of: number; date: string; by: string; note?: string },
	quantities: Record<string, number>
) {
	const userId = biz.users.get(head.by)!;
	const id = await createReturn(tx, {
		orgId: biz.orgId,
		documentId: head.of,
		date: head.date,
		userId
	});
	if (head.note) {
		await tx.update(stockDocument).set({ note: head.note }).where(eq(stockDocument.id, id));
	}
	const skuOf = new Map([...biz.items].map(([sku, itemId]) => [itemId, sku]));
	const lines = await tx
		.select()
		.from(stockDocumentLine)
		.where(eq(stockDocumentLine.documentId, id));
	for (const line of lines) {
		const qty = quantities[skuOf.get(line.itemId)!] ?? 0;
		await tx
			.update(stockDocumentLine)
			.set(qty ? { quantity: qty } : { deletedAt: new Date() })
			.where(eq(stockDocumentLine.id, line.id));
	}
	await postDocument(tx, {
		orgId: biz.orgId,
		documentId: id,
		userId,
		today: head.date,
		allowOverLimit: true
	});
	return id;
}

export type DeviceSpec = Partial<typeof fiscalDevice.$inferInsert> & { branch?: string };

/**
 * Fiscal devices, and the fiscal side of every posted, priced sale and customer return so far:
 * an FS No. from the branch's device (as if the cashier typed it in from the device's receipt),
 * and — when the business has e-invoicing on — the e-invoice, sent the way the app sends it.
 */
export async function fiscalHistory(tx: Tx, biz: Business, devices: DeviceSpec[]) {
	const made: { id: number; branchId: number | null; machineCode: string | null; next: number }[] =
		[];
	for (const d of devices) {
		const { branch: code, ...values } = d;
		const branchId = code ? (biz.branches.get(code) ?? null) : null;
		const [row] = await tx
			.insert(fiscalDevice)
			.values({ ...values, orgId: biz.orgId, branchId })
			.$returningId();
		made.push({ id: row.id, branchId, machineCode: values.machineCode ?? null, next: 1 });
	}

	const sales = await tx
		.selectDistinct({ id: stockDocument.id, branchId: stockDocument.branchId })
		.from(stockDocument)
		.innerJoin(stockDocumentLine, eq(stockDocumentLine.documentId, stockDocument.id))
		.where(
			and(
				eq(stockDocument.orgId, biz.orgId),
				eq(stockDocument.status, 'posted'),
				inArray(stockDocument.type, ['issue', 'sales_return']),
				isNotNull(stockDocumentLine.unitPrice)
			)
		)
		.orderBy(stockDocument.id);

	const [org] = await tx
		.select({ mode: organization.einvoiceMode })
		.from(organization)
		.where(eq(organization.id, biz.orgId));

	for (const sale of sales) {
		const device = made.find((m) => m.branchId === sale.branchId) ?? made.find((m) => !m.branchId);
		if (device) {
			await tx
				.update(stockDocument)
				.set({
					fiscalDeviceId: device.id,
					fiscalReceiptNumber: String(device.next++).padStart(8, '0'),
					fiscalMachineCode: device.machineCode,
					fiscalStatus: 'manual',
					fiscalPrintedAt: new Date()
				})
				.where(eq(stockDocument.id, sale.id));
		}
		if (org?.mode) await submitEinvoice(biz.orgId, sale.id, tx);
	}
	return sales.length;
}

// ── Selling ───────────────────────────────────────────────────────────────────────────────────

/** A price list and its prices (by SKU, per unit; no unit means the base unit). */
export async function addPriceList(
	tx: Tx,
	biz: Business,
	name: string,
	prices: { sku: string; unit?: string; price: number }[],
	createdBy: string
) {
	const [list] = await tx
		.insert(priceList)
		.values({ orgId: biz.orgId, name, createdBy })
		.$returningId();
	for (const p of prices) {
		await tx.insert(priceListItem).values({
			orgId: biz.orgId,
			priceListId: list.id,
			itemId: itemId(biz, p.sku),
			uomId: p.unit ? unitId(biz, p.unit) : null,
			price: p.price
		});
	}
	return list.id;
}

function itemId(biz: Business, sku: string) {
	const id = biz.items.get(sku);
	if (!id) throw new Error(`${biz.name}: no item ${sku}`);
	return id;
}

type CartSpec = { sku: string; qty: number; unit?: string; price?: number };

/** Lines priced as the till would price them for this customer, and what they come to. */
async function priced(tx: Tx, biz: Business, lines: CartSpec[], customerId: number | null) {
	const [c] = customerId
		? await tx
				.select({ priceListId: customer.priceListId })
				.from(customer)
				.where(eq(customer.id, customerId))
		: [];
	const ids = lines.map((l) => itemId(biz, l.sku));
	const table = await priceTable(biz.orgId, ids, c?.priceListId ?? null, tx);
	const settings = await taxSettings(biz.orgId, tx);
	const items = await tx.select().from(item).where(inArray(item.id, ids));
	let gross = 0;
	const out = lines.map((l) => {
		const it = items.find((i) => i.id === itemId(biz, l.sku))!;
		const uomId = l.unit ? unitId(biz, l.unit) : it.baseUomId;
		const unitPrice = l.price ?? table.get(`${it.id}:${uomId}`) ?? 0;
		gross += lineAmounts(
			l.qty,
			unitPrice,
			saleVatRate(settings, it.taxCode),
			saleTotRate(settings, it.totRate)
		).gross;
		return { itemId: it.id, uomId, quantity: l.qty, unitPrice };
	});
	return { lines: out, gross: Math.round(gross * 100) / 100 };
}

async function methodId(tx: Tx, biz: Business, name: string) {
	const [m] = await tx
		.select({ id: paymentMethod.id })
		.from(paymentMethod)
		.where(and(eq(paymentMethod.orgId, biz.orgId), eq(paymentMethod.name, name)));
	if (!m) throw new Error(`${biz.name}: no payment method ${name}`);
	return m.id;
}

export type TillSale = {
	customer?: string;
	lines: CartSpec[];
	/**
	 * How it was paid. `rest` pays whatever is left (cash rounds the tender up to the next 100, as
	 * a customer hands over notes); leave the rest unpaid with a customer to put it on account.
	 */
	pay: { method: string; amount?: number; rest?: boolean; reference?: string }[];
};

/**
 * A till shift, rung up through the till's own checkout: opened with a float, its sales, and —
 * unless `open` — closed with the drawer counted `countedOff` birr from what it should hold.
 */
export async function tillShift(
	tx: Tx,
	biz: Business,
	head: {
		by: string;
		location: string;
		float: number;
		date: string;
		open?: boolean;
		countedOff?: number;
	},
	sales: TillSale[]
) {
	const userId = biz.users.get(head.by)!;
	const locationId = biz.locations.get(head.location);
	if (!locationId) throw new Error(`${biz.name}: unknown location ${head.location}`);
	const shiftId = await openShift(tx, {
		orgId: biz.orgId,
		userId,
		locationId,
		openingFloat: head.float
	});
	await tx
		.update(posShift)
		.set({ openedAt: new Date(`${head.date}T08:30:00+03:00`) })
		.where(eq(posShift.id, shiftId));

	for (const sale of sales) {
		const buyerId = sale.customer ? customerId(biz, sale.customer) : null;
		const { lines, gross } = await priced(tx, biz, sale.lines, buyerId);
		let left = gross;
		const payments = [];
		for (const p of sale.pay) {
			const id = await methodId(tx, biz, p.method);
			let amount = p.amount ?? 0;
			if (p.rest) amount = p.method === 'Cash' ? Math.ceil(left / 100) * 100 : left;
			left = Math.max(0, Math.round((left - amount) * 100) / 100);
			payments.push({ methodId: id, amount, reference: p.reference });
		}
		await checkout(tx, {
			orgId: biz.orgId,
			userId,
			shiftId,
			customerId: buyerId,
			lines,
			payments,
			today: head.date,
			// The seed stands in for a manager.
			allowOverLimit: true,
			allowDiscount: true,
			maxDiscountPercent: null
		});
	}

	if (!head.open) {
		const [row] = await tx.select().from(posShift).where(eq(posShift.id, shiftId));
		const { expectedCash } = await shiftSummary(biz.orgId, shiftId, tx);
		await closeShift(tx, {
			orgId: biz.orgId,
			shiftId,
			userId,
			countedCash: expectedCash + (head.countedOff ?? 0),
			note: head.countedOff ? 'Counted twice; the difference stands.' : undefined
		});
		await tx
			.update(posShift)
			.set({ closedAt: new Date(`${head.date}T18:30:00+03:00`) })
			.where(eq(posShift.id, row.id));
	}
	return shiftId;
}

/** A proforma, priced as the editor prices it; optionally sent, or made into a draft sale. */
export async function proforma(
	tx: Tx,
	biz: Business,
	head: {
		customer?: string;
		buyerName?: string;
		buyerTin?: string;
		date: string;
		validDays?: number;
		location: string;
		by: string;
		reference?: string;
		terms?: string;
		status?: 'draft' | 'sent' | 'accepted' | 'converted';
	},
	lines: CartSpec[]
) {
	const userId = biz.users.get(head.by)!;
	const locationId = biz.locations.get(head.location)!;
	const [loc] = await tx
		.select({ branchId: location.branchId })
		.from(location)
		.where(eq(location.id, locationId));
	const customerId_ = head.customer ? customerId(biz, head.customer) : null;
	const [q] = await tx
		.insert(quote)
		.values({
			orgId: biz.orgId,
			branchId: loc.branchId,
			customerId: customerId_,
			buyerName: head.buyerName ?? null,
			buyerTin: head.buyerTin ?? null,
			locationId,
			quoteDate: head.date,
			validUntil: addLocalDays(head.date, head.validDays ?? 30),
			reference: head.reference ?? null,
			terms: head.terms ?? null,
			createdBy: userId
		})
		.$returningId();
	const { lines: pricedLines } = await priced(tx, biz, lines, customerId_);
	for (const l of pricedLines) {
		await tx.insert(quoteLine).values({ orgId: biz.orgId, quoteId: q.id, ...l });
	}
	const status = head.status ?? 'draft';
	if (status !== 'draft') {
		await numberQuote(tx, biz.orgId, q.id);
		if (status === 'converted') {
			await convertQuote(tx, { orgId: biz.orgId, quoteId: q.id, date: head.date, userId });
		} else {
			await tx
				.update(quote)
				.set({ status, sentAt: new Date(`${head.date}T10:00:00+03:00`) })
				.where(eq(quote.id, q.id));
		}
	}
	return q.id;
}

/** Puts customers (by name) on a price list. */
export async function assignPriceList(tx: Tx, biz: Business, listId: number, names: string[]) {
	await tx
		.update(customer)
		.set({ priceListId: listId })
		.where(
			inArray(
				customer.id,
				names.map((n) => customerId(biz, n))
			)
		);
}
