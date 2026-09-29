/**
 * An electronics shop in Piassa with a second showroom at Bole (Edna Mall). Shows: phones and
 * laptops tracked by IMEI / serial number from receipt to sale, an air-freight import, a
 * proforma-style institutional sale, pack units (cartons of batteries, boxes of flash drives),
 * ink that is about to expire, batteries that did expire and were quarantined, a lot put on hold,
 * a phone written off as damaged, projectors kept for rental, and service items.
 */
import {
	addBranch,
	addCategories,
	addCustomers,
	returnGoods,
	tillShift,
	addItems,
	addLocations,
	addSuppliers,
	addUnits,
	addUser,
	createBusiness,
	day,
	document,
	money,
	serials,
	setLotStatus,
	purchaseOrderSeed,
	receiveOrder,
	stockTake,
	type Business,
	type ItemSpec
} from './helpers';
import type { Tx } from '$lib/server/stock/post';

export const TECH = 'Arada Tech Center';

const serial = { trackSerials: true } as const;

const ITEMS: ItemSpec[] = [
	{
		sku: 'LAP-HP450',
		name: 'HP ProBook 450 G10 — i5, 16 GB, 512 GB SSD',
		category: 'Laptops',
		unit: 'Piece',
		price: 98000,
		reorder: 3,
		flags: serial
	},
	{
		sku: 'LAP-TPE14',
		name: 'Lenovo ThinkPad E14 Gen 5 — i7, 16 GB, 1 TB SSD',
		category: 'Laptops',
		unit: 'Piece',
		price: 132000,
		reorder: 2,
		flags: serial
	},
	{
		sku: 'LAP-ACA315',
		name: 'Acer Aspire 3 — i3, 8 GB, 256 GB SSD',
		category: 'Laptops',
		unit: 'Piece',
		price: 52000,
		reorder: 4,
		flags: serial
	},
	{
		sku: 'PH-SGA15',
		name: 'Samsung Galaxy A15, 128 GB',
		category: 'Phones',
		unit: 'Piece',
		price: 21500,
		reorder: 5,
		description: 'Serial number = IMEI 1.',
		flags: serial
	},
	{
		sku: 'PH-TSP20',
		name: 'Tecno Spark 20, 128 GB',
		category: 'Phones',
		unit: 'Piece',
		price: 12800,
		reorder: 8,
		description: 'Serial number = IMEI 1.',
		flags: serial
	},
	{
		sku: 'PH-IP13',
		name: 'iPhone 13, 128 GB',
		category: 'Phones',
		unit: 'Piece',
		price: 86000,
		reorder: 2,
		description: 'Serial number = IMEI 1.',
		flags: serial
	},
	{
		sku: 'ACC-CHG65',
		name: 'USB-C charger 65 W',
		category: 'Accessories',
		unit: 'Piece',
		packs: [['Box', 10]],
		price: 1800,
		reorder: 20,
		barcodes: ['6297100100017']
	},
	{
		sku: 'ACC-HDMI15',
		name: 'HDMI cable 1.5 m',
		category: 'Accessories',
		unit: 'Piece',
		packs: [['Box', 20]],
		price: 450,
		barcodes: ['6297100100024']
	},
	{
		sku: 'ACC-SP-A15',
		name: 'Screen protector, Galaxy A15',
		category: 'Accessories',
		unit: 'Piece',
		packs: [['Pack', 50]],
		price: 250
	},
	{
		sku: 'ACC-MOUSE',
		name: 'Wireless mouse',
		category: 'Accessories',
		unit: 'Piece',
		price: 750,
		reorder: 10,
		barcodes: ['6297100100031']
	},
	{
		sku: 'NET-C6',
		name: 'TP-Link Archer C6 router',
		category: 'Networking',
		unit: 'Piece',
		price: 4800,
		reorder: 5
	},
	{
		sku: 'NET-CAT6',
		name: 'Cat6 network cable',
		category: 'Networking',
		unit: 'Metre',
		packs: [['Roll', 305]],
		price: 45
	},
	{
		sku: 'STO-USB32',
		name: 'Kingston 32 GB USB flash drive',
		category: 'Storage',
		unit: 'Piece',
		packs: [['Box', 50]],
		price: 550,
		reorder: 20,
		barcodes: ['6297100100048']
	},
	{
		sku: 'STO-SSD1T',
		name: 'Samsung 870 EVO SSD 1 TB',
		category: 'Storage',
		unit: 'Piece',
		price: 9800,
		reorder: 3
	},
	// Ink and batteries carry expiry dates.
	{
		sku: 'INK-HP305B',
		name: 'HP 305 ink cartridge, black',
		category: 'Printers & ink',
		unit: 'Piece',
		price: 1900,
		reorder: 10,
		flags: { trackExpiry: true }
	},
	{
		sku: 'INK-HP305C',
		name: 'HP 305 ink cartridge, colour',
		category: 'Printers & ink',
		unit: 'Piece',
		price: 2300,
		reorder: 10,
		flags: { trackExpiry: true }
	},
	{
		sku: 'BAT-AA',
		name: 'Duracell AA battery',
		category: 'Batteries',
		unit: 'Piece',
		packs: [
			['Pack', 4],
			['Carton', 96]
		],
		price: 70,
		flags: { trackExpiry: true }
	},
	// Power cuts: UPS units are serial-tracked for warranty claims.
	{
		sku: 'UPS-APC650',
		name: 'APC Back-UPS 650 VA',
		category: 'Power backup',
		unit: 'Piece',
		price: 7800,
		reorder: 4,
		flags: serial
	},
	{
		sku: 'STAB-1K',
		name: 'Voltage stabilizer 1000 VA',
		category: 'Power backup',
		unit: 'Piece',
		price: 3500,
		reorder: 5
	},
	{
		sku: 'PRJ-EBX51',
		name: 'Epson EB-X51 projector',
		category: 'Rental equipment',
		unit: 'Piece',
		description: 'Rented for events and training by the day.',
		flags: { trackSerials: true, leasable: true, sellable: false }
	},
	{
		sku: 'SRV-OS',
		name: 'Operating system installation and setup',
		category: 'Services',
		unit: 'Piece',
		price: 1500,
		flags: { stockTracked: false, purchasable: false }
	},
	{
		sku: 'SRV-REPAIR',
		name: 'Repair labour, per hour',
		category: 'Services',
		unit: 'Piece',
		price: 800,
		flags: { stockTracked: false, purchasable: false }
	}
];

/** Where each item normally comes from. Services have none. */
const MAIN_SUPPLIER: Record<string, string | undefined> = {
	'LAP-HP450': 'Horizon Tech Distribution PLC',
	'LAP-TPE14': 'Horizon Tech Distribution PLC',
	'LAP-ACA315': 'Horizon Tech Distribution PLC',
	'PH-SGA15': 'Al Noor Electronics LLC, Dubai',
	'PH-TSP20': 'Al Noor Electronics LLC, Dubai',
	'PH-IP13': 'Al Noor Electronics LLC, Dubai',
	'ACC-CHG65': 'Merkato Accessories Wholesale',
	'ACC-HDMI15': 'Merkato Accessories Wholesale',
	'ACC-SP-A15': 'Al Noor Electronics LLC, Dubai',
	'ACC-MOUSE': 'Merkato Accessories Wholesale',
	'NET-C6': 'Merkato Accessories Wholesale',
	'NET-CAT6': 'Merkato Accessories Wholesale',
	'STO-USB32': 'Merkato Accessories Wholesale',
	'STO-SSD1T': 'Merkato Accessories Wholesale',
	'INK-HP305B': 'Horizon Tech Distribution PLC',
	'INK-HP305C': 'Horizon Tech Distribution PLC',
	'BAT-AA': 'Horizon Tech Distribution PLC',
	'UPS-APC650': 'Horizon Tech Distribution PLC',
	'STAB-1K': 'Horizon Tech Distribution PLC',
	'PRJ-EBX51': 'Horizon Tech Distribution PLC'
};

export async function seedTech(tx: Tx): Promise<Business> {
	const biz = await createBusiness(tx, {
		name: TECH,
		tin: '0045678923',
		phone: '+251 11 111 4567',
		address: 'Piassa, Arada, Addis Ababa',
		main: {
			name: 'Piassa',
			code: 'PSA',
			address: 'Churchill Avenue, Piassa',
			phone: '+251 11 111 4567',
			store: 'Piassa Back Store'
		},
		// Not VAT-registered: pays 2% turnover tax on what it sells instead. No fiscal device and
		// no e-invoicing set up — all of that is optional.
		settings: { totRate: 2 }
	});

	await addBranch(tx, biz, {
		name: 'Bole Edna Mall',
		code: 'EDN',
		address: 'Edna Mall, 2nd floor, Bole',
		phone: '+251 11 662 7788'
	});
	await addLocations(tx, biz, [
		{ branch: 'PSA', name: 'Piassa Showroom', kind: 'sales' },
		{ branch: 'EDN', name: 'Edna Store', kind: 'storage' },
		{ branch: 'EDN', name: 'Edna Showroom', kind: 'sales' }
	]);
	await addUnits(tx, biz, [{ name: 'Roll', symbol: 'roll' }]);
	await addCategories(tx, biz, [
		{ name: 'Laptops', nameAm: 'ላፕቶፕ' },
		{ name: 'Phones', nameAm: 'ስልክ' },
		{ name: 'Accessories', nameAm: 'መለዋወጫ' },
		{ name: 'Networking', nameAm: 'ኔትወርክ' },
		{ name: 'Storage', nameAm: 'ማከማቻ' },
		{ name: 'Printers & ink', nameAm: 'ቀለም', warn: 60 },
		{ name: 'Batteries', nameAm: 'ባትሪ', warn: 120 },
		{ name: 'Power backup', nameAm: 'ዩፒኤስ' },
		{ name: 'Rental equipment', nameAm: 'የሚከራዩ ዕቃዎች' },
		{ name: 'Services', nameAm: 'አገልግሎት' }
	]);

	await addUser(tx, biz, {
		key: 'owner',
		name: 'Samuel Tesfaye',
		email: 'samuel@tech.example.com',
		role: 'Owner',
		branch: 'PSA'
	});
	await addUser(tx, biz, {
		key: 'manager',
		name: 'Liya Haile',
		email: 'liya@tech.example.com',
		role: 'Manager',
		branch: 'PSA'
	});
	await addUser(tx, biz, {
		key: 'edna',
		name: 'Kidus Worku',
		email: 'kidus@tech.example.com',
		role: 'Storekeeper',
		branch: 'EDN'
	});
	await addUser(tx, biz, {
		key: 'clerk',
		name: 'Bethlehem Assefa',
		email: 'betty@tech.example.com',
		role: 'Clerk',
		branch: 'PSA'
	});

	await addSuppliers(
		tx,
		biz,
		[
			{
				name: 'Horizon Tech Distribution PLC',
				phone: '+251 11 557 8800',
				email: 'sales@horizontech.example.com',
				address: 'Bole, Addis Ababa',
				tin: '0023004567',
				contactPerson: 'Ato Yared',
				vatRegistered: true
			},
			{
				name: 'Al Noor Electronics LLC, Dubai',
				phone: '+971 4 222 7788',
				email: 'orders@alnoor.example.com',
				address: 'Deira, Dubai, UAE'
			},
			{
				name: 'Merkato Accessories Wholesale',
				phone: '+251 911 334 556',
				address: 'Merkato, Addis Ababa'
			}
		],
		biz.users.get('owner')!
	);

	// Institutional buyers who come back. Most walk-in buyers leave no name, and their sales name
	// no customer.
	await addCustomers(
		tx,
		biz,
		[
			{
				name: 'Addis Ababa University',
				phone: '+251 11 123 9800',
				email: 'ict.procurement@aau.example.com',
				tin: '0000012345',
				address: 'Sidist Kilo, Addis Ababa',
				note: 'Buys on purchase orders; pays by cheque',
				creditLimit: 1_500_000,
				creditDays: 45,
				withholdsTax: true
			},
			{
				name: 'Sheger Insurance',
				phone: '+251 11 155 7070',
				tin: '0011223344',
				address: 'Piassa, Addis Ababa',
				creditLimit: 200_000,
				creditDays: 30,
				withholdsTax: true
			},
			{
				name: 'Abay Microfinance',
				phone: '+251 11 470 2211',
				address: 'Bole, Addis Ababa',
				creditLimit: 100_000,
				creditDays: 30
			},
			// On the list but has not bought yet: someone who asked for a quote.
			{ name: 'Hanna Tesfaye', note: 'Asked for a quote on 3 laptops' }
		],
		biz.users.get('owner')!
	);

	await addItems(
		tx,
		biz,
		ITEMS.map((i) => ({ ...i, supplier: MAIN_SUPPLIER[i.sku] })),
		biz.users.get('owner')!
	);

	const hp = serials('5CD4101', 1, 14, 3); // 01–08 now, 09–14 on the draft delivery
	const thinkpad = serials('PF4A', 1, 4, 4);
	const acer = serials('NXKDE', 1, 10, 5);
	const ups = serials('3B2410', 1, 10, 3);
	const a15 = serials('3569870412', 1, 30, 5); // IMEIs: 15 digits
	const spark = serials('3548310223', 1, 50, 5);
	const iphone = serials('3527140918', 1, 5, 5);
	const projectors = serials('X5QJ', 1, 3, 5);

	// ── Opening deliveries ──────────────────────────────────────────────────────────────────
	const grnLaptops = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-60),
			to: 'Piassa Back Store',
			supplier: 'Horizon Tech Distribution PLC',
			reference: 'HTD-5521',
			by: 'manager'
		},
		[
			{ sku: 'LAP-HP450', qty: 8, cost: 84000, serials: hp.slice(0, 8) },
			{ sku: 'LAP-TPE14', qty: 4, cost: 113000, serials: thinkpad },
			{ sku: 'LAP-ACA315', qty: 10, cost: 43500, serials: acer },
			{ sku: 'UPS-APC650', qty: 10, cost: 6100, serials: ups },
			{ sku: 'STAB-1K', qty: 15, cost: 2600 }
		]
	);
	const grnImport = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-58),
			to: 'Piassa Back Store',
			supplier: 'Al Noor Electronics LLC, Dubai',
			reference: 'AWB 071-5566 2210',
			note: 'Landed cost includes duty, excise and clearing.',
			by: 'owner'
		},
		[
			{ sku: 'PH-SGA15', qty: 20, cost: 17200, serials: a15.slice(0, 20) },
			{ sku: 'PH-TSP20', qty: 30, cost: 10100, serials: spark.slice(0, 30) },
			{ sku: 'PH-IP13', qty: 5, cost: 74000, serials: iphone },
			{ sku: 'ACC-SP-A15', qty: 2, unit: 'Pack', cost: 5000 }
		]
	);
	const grnAccessories = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-55),
			to: 'Piassa Back Store',
			supplier: 'Merkato Accessories Wholesale',
			reference: 'MAW-0981',
			by: 'manager'
		},
		[
			{ sku: 'ACC-CHG65', qty: 5, unit: 'Box', cost: 11500 },
			{ sku: 'ACC-HDMI15', qty: 3, unit: 'Box', cost: 5400 },
			{ sku: 'ACC-MOUSE', qty: 40, cost: 480 },
			{ sku: 'NET-C6', qty: 12, cost: 3900 },
			{ sku: 'NET-CAT6', qty: 3, unit: 'Roll', cost: 9800 },
			{ sku: 'STO-USB32', qty: 2, unit: 'Box', cost: 19000 },
			{ sku: 'STO-SSD1T', qty: 8, cost: 8200 }
		]
	);
	const grnInk = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-54),
			to: 'Piassa Back Store',
			supplier: 'Horizon Tech Distribution PLC',
			reference: 'HTD-5540',
			by: 'manager'
		},
		[
			{ sku: 'INK-HP305B', qty: 40, cost: 1450, lot: 'HP305B-2411', expiry: day(200) },
			{ sku: 'INK-HP305C', qty: 30, cost: 1700, lot: 'HP305C-2402', expiry: day(25) },
			{ sku: 'BAT-AA', qty: 3, unit: 'Pack', cost: 240, lot: 'DUR-2309', expiry: day(-10) },
			{ sku: 'BAT-AA', qty: 4, unit: 'Carton', cost: 5200, lot: 'DUR-2903', expiry: day(900) }
		]
	);
	const grnProjectors = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-50),
			to: 'Piassa Back Store',
			supplier: 'Horizon Tech Distribution PLC',
			reference: 'HTD-5552',
			by: 'owner'
		},
		[{ sku: 'PRJ-EBX51', qty: 3, cost: 38000, serials: projectors }]
	);

	// ── Stocking the showrooms ──────────────────────────────────────────────────────────────
	await document(
		tx,
		biz,
		{
			type: 'transfer',
			date: day(-48),
			from: 'Piassa Back Store',
			to: 'Edna Store',
			party: 'Ride delivery',
			by: 'manager'
		},
		[
			{ sku: 'LAP-HP450', qty: 3, serials: hp.slice(0, 3) },
			{ sku: 'PH-SGA15', qty: 8, serials: a15.slice(0, 8) },
			{ sku: 'PH-TSP20', qty: 10, serials: spark.slice(0, 10) },
			{ sku: 'ACC-CHG65', qty: 2, unit: 'Box' },
			{ sku: 'STO-USB32', qty: 1, unit: 'Box' },
			{ sku: 'UPS-APC650', qty: 3, serials: ups.slice(0, 3) }
		]
	);
	await document(
		tx,
		biz,
		{
			type: 'transfer',
			date: day(-47),
			from: 'Piassa Back Store',
			to: 'Piassa Showroom',
			by: 'manager'
		},
		[
			{ sku: 'PH-SGA15', qty: 6, serials: a15.slice(8, 14) },
			{ sku: 'PH-TSP20', qty: 12, serials: spark.slice(10, 22) },
			{ sku: 'PH-IP13', qty: 3, serials: iphone.slice(0, 3) },
			{ sku: 'ACC-MOUSE', qty: 15 },
			{ sku: 'ACC-SP-A15', qty: 1, unit: 'Pack' },
			// First expiry first out: the 12 batteries of the older lot go to the shelf first.
			{ sku: 'BAT-AA', qty: 1, unit: 'Carton' }
		]
	);

	// ── Trading ─────────────────────────────────────────────────────────────────────────────
	const salePiassa1 = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-40),
			from: 'Piassa Showroom',
			reference: 'Receipts 00412–00447',
			by: 'manager'
		},
		[
			{ sku: 'PH-SGA15', qty: 3, serials: a15.slice(8, 11) },
			{ sku: 'PH-TSP20', qty: 5, serials: spark.slice(10, 15) },
			{ sku: 'PH-IP13', qty: 1, serials: iphone.slice(0, 1) },
			{ sku: 'ACC-MOUSE', qty: 6 },
			{ sku: 'ACC-SP-A15', qty: 12 },
			{ sku: 'BAT-AA', qty: 8 }
		]
	);
	const saleAau = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-35),
			from: 'Piassa Back Store',
			customer: 'Addis Ababa University',
			party: 'ICT Office',
			reference: 'PO AAU/ICT/2019/044',
			note: 'Against proforma PF-0219; paid by CPO.',
			by: 'owner'
		},
		[
			{ sku: 'LAP-HP450', qty: 3, serials: hp.slice(3, 6) },
			{ sku: 'LAP-ACA315', qty: 6, serials: acer.slice(0, 6) },
			{ sku: 'UPS-APC650', qty: 4, serials: ups.slice(3, 7) },
			{ sku: 'NET-C6', qty: 4 },
			{ sku: 'NET-CAT6', qty: 1, unit: 'Roll' }
		]
	);
	const saleEdna = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-30),
			from: 'Edna Store',
			reference: 'Receipts E-0101–E-0133',
			by: 'edna'
		},
		[
			{ sku: 'PH-SGA15', qty: 4, serials: a15.slice(0, 4) },
			{ sku: 'PH-TSP20', qty: 6, serials: spark.slice(0, 6) },
			{ sku: 'LAP-HP450', qty: 1, serials: hp.slice(0, 1) },
			{ sku: 'ACC-CHG65', qty: 7 },
			{ sku: 'STO-USB32', qty: 12 }
		]
	);
	await document(
		tx,
		biz,
		{
			type: 'adjustment',
			date: day(-25),
			from: 'Piassa Showroom',
			reason: 'damage',
			note: 'Dropped during demo, screen cracked. Not covered by supplier.',
			by: 'manager'
		},
		[{ sku: 'PH-TSP20', qty: -1, serials: [spark[15]] }]
	);
	const saleSheger = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-20),
			from: 'Piassa Back Store',
			customer: 'Sheger Insurance',
			party: 'Piassa branch',
			reference: 'PO SI/0772',
			by: 'manager'
		},
		[
			{ sku: 'INK-HP305C', qty: 6 },
			{ sku: 'INK-HP305B', qty: 10 },
			{ sku: 'STAB-1K', qty: 5 },
			{ sku: 'ACC-HDMI15', qty: 10 }
		]
	);
	const grnImport2 = await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-15),
			to: 'Piassa Back Store',
			supplier: 'Al Noor Electronics LLC, Dubai',
			reference: 'AWB 071-5566 2388',
			by: 'owner'
		},
		[
			{ sku: 'PH-TSP20', qty: 20, cost: 9800, serials: spark.slice(30, 50) },
			{ sku: 'PH-SGA15', qty: 10, cost: 17600, serials: a15.slice(20, 30) }
		]
	);
	await document(
		tx,
		biz,
		{
			type: 'adjustment',
			date: day(-12),
			from: 'Piassa Back Store',
			reason: 'count',
			note: 'Quarterly stock count',
			by: 'manager'
		},
		[
			{ sku: 'STO-USB32', qty: -2 },
			{ sku: 'ACC-MOUSE', qty: 1 }
		]
	);
	// The older batteries have expired by now, so this sale comes from the newer lot.
	const salePiassa2 = await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-8),
			from: 'Piassa Showroom',
			reference: 'Receipts 00519–00540',
			by: 'manager'
		},
		[
			{ sku: 'BAT-AA', qty: 4 },
			{ sku: 'PH-TSP20', qty: 4, serials: spark.slice(16, 20) },
			{ sku: 'ACC-SP-A15', qty: 10 }
		]
	);
	await document(
		tx,
		biz,
		{
			type: 'transfer',
			date: day(-6),
			from: 'Piassa Showroom',
			to: 'Quarantine',
			note: 'Expired batteries taken off the shelf',
			by: 'manager'
		},
		[{ sku: 'BAT-AA', qty: 4, fromLot: 'DUR-2309' }]
	);
	await setLotStatus(
		tx,
		biz,
		'INK-HP305B',
		'HP305B-2411',
		'quarantine',
		'On hold: supplier notice about counterfeit cartridges in circulation; checking hologram labels.'
	);

	// ── Waiting to be posted ────────────────────────────────────────────────────────────────
	await document(
		tx,
		biz,
		{
			type: 'receipt',
			date: day(-1),
			to: 'Piassa Back Store',
			supplier: 'Horizon Tech Distribution PLC',
			reference: 'HTD-5610',
			by: 'clerk',
			draft: true
		},
		[{ sku: 'LAP-HP450', qty: 6, cost: 86000, serials: hp.slice(8, 14) }]
	);
	await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(0),
			from: 'Piassa Back Store',
			customer: 'Abay Microfinance',
			party: 'Head office',
			reference: 'Proforma PF-0231',
			by: 'clerk',
			draft: true
		},
		[
			{ sku: 'LAP-TPE14', qty: 2, serials: thinkpad.slice(0, 2) },
			{ sku: 'UPS-APC650', qty: 2, serials: ups.slice(7, 9) }
		]
	);

	// ── Money ───────────────────────────────────────────────────────────────────────────────
	// Liya records, Samuel verifies. The AAU payment is still waiting for the CPO to clear.
	await money(tx, biz, {
		direction: 'out',
		amount: 65_000,
		date: day(-60),
		method: 'Bank transfer — CBE',
		purpose: 'expense',
		party: 'Arada sub-city shop owner',
		reference: 'FT25201PSA060',
		description: 'Piassa shop rent, Meskerem',
		branch: 'PSA',
		by: 'owner',
		verifiedBy: 'manager'
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-60),
		method: 'Bank transfer — CBE',
		purpose: 'purchase',
		party: 'Horizon Tech Distribution PLC',
		reference: 'FT25201HTD5521',
		receipt: 'HTD-5521',
		branch: 'PSA',
		by: 'manager',
		verifiedBy: 'owner',
		attach: 'CBE transfer confirmation',
		documents: [grnLaptops]
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-58),
		method: 'Bank transfer — other bank',
		purpose: 'purchase',
		party: 'Al Noor Electronics LLC, Dubai',
		reference: 'TT/AWB/2210',
		description: 'Telegraphic transfer in USD at the NBE rate; duty and clearing included',
		branch: 'PSA',
		by: 'owner',
		verifiedBy: 'manager',
		attach: 'Telegraphic transfer advice',
		documents: [grnImport]
	});
	await money(tx, biz, {
		direction: 'out',
		amount: 80_000,
		date: day(-58),
		method: 'Bank transfer — CBE',
		purpose: 'expense',
		party: 'Edna Mall management',
		reference: 'FT25203EDN058',
		description: 'Edna Mall shop rent, Meskerem',
		branch: 'EDN',
		by: 'owner',
		verifiedBy: 'manager'
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-55),
		method: 'Cash',
		purpose: 'purchase',
		party: 'Merkato Accessories Wholesale',
		receipt: 'MAW-0981',
		branch: 'PSA',
		by: 'manager',
		verifiedBy: 'owner',
		attach: 'Supplier cash receipt',
		documents: [grnAccessories]
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-54),
		method: 'Bank transfer — CBE',
		purpose: 'purchase',
		party: 'Horizon Tech Distribution PLC',
		reference: 'FT25206HTD5540',
		receipt: 'HTD-5540',
		branch: 'PSA',
		by: 'manager',
		verifiedBy: 'owner',
		documents: [grnInk]
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-50),
		method: 'Bank transfer — CBE',
		purpose: 'purchase',
		party: 'Horizon Tech Distribution PLC',
		reference: 'FT25210HTD5552',
		receipt: 'HTD-5552',
		branch: 'PSA',
		by: 'owner',
		verifiedBy: 'manager',
		documents: [grnProjectors]
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-40),
		method: 'Cash',
		purpose: 'sale',
		party: 'Walk-in customers',
		receipt: 'Receipts 00412–00447',
		branch: 'PSA',
		by: 'manager',
		verifiedBy: 'owner',
		documents: [salePiassa1]
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-35),
		method: 'Bank transfer — CBE',
		purpose: 'sale',
		party: 'Addis Ababa University — ICT Office',
		customer: 'Addis Ababa University',
		reference: 'CPO 7731902',
		receipt: 'FS-00231',
		description: 'CPO deposited; waiting for it to clear',
		branch: 'PSA',
		by: 'manager',
		attach: 'CPO deposit slip',
		documents: [saleAau]
	});
	await money(tx, biz, {
		direction: 'out',
		amount: 5_200,
		date: day(-35),
		method: 'Telebirr',
		purpose: 'expense',
		party: 'Ethiopian Electric Utility',
		reference: 'CI3EEU8812',
		branch: 'PSA',
		by: 'manager',
		verifiedBy: 'owner'
	});
	await money(tx, biz, {
		direction: 'out',
		amount: 3_500,
		date: day(-30),
		method: 'Telebirr',
		purpose: 'expense',
		party: 'Ethio telecom — fibre internet',
		reference: 'CI5ETF2231',
		branch: 'PSA',
		by: 'manager',
		verifiedBy: 'owner'
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-30),
		method: 'Telebirr',
		purpose: 'sale',
		party: 'Walk-in customers (Edna)',
		reference: 'CI4Q7T2ZRE',
		receipt: 'Receipts E-0101–E-0133',
		branch: 'EDN',
		by: 'edna',
		verifiedBy: 'manager',
		documents: [saleEdna]
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-20),
		method: 'Cheque',
		purpose: 'sale',
		party: 'Sheger Insurance — Piassa branch',
		customer: 'Sheger Insurance',
		reference: 'CHQ 1180347',
		receipt: 'FS-00248',
		branch: 'PSA',
		by: 'manager',
		verifiedBy: 'owner',
		documents: [saleSheger]
	});
	await money(tx, biz, {
		direction: 'out',
		settle: true,
		date: day(-15),
		method: 'Bank transfer — other bank',
		purpose: 'purchase',
		party: 'Al Noor Electronics LLC, Dubai',
		reference: 'TT/AWB/2388',
		branch: 'PSA',
		by: 'owner',
		verifiedBy: 'manager',
		documents: [grnImport2]
	});
	await money(tx, biz, {
		direction: 'in',
		amount: 4_500,
		date: day(-12),
		method: 'Cash',
		purpose: 'sale',
		party: 'Walk-in (3 laptops)',
		description: 'Windows installation and setup',
		branch: 'PSA',
		by: 'manager',
		verifiedBy: 'owner'
	});
	await money(tx, biz, {
		direction: 'in',
		amount: 2_400,
		date: day(-9),
		method: 'Telebirr',
		purpose: 'sale',
		party: 'Walk-in',
		reference: 'CI6RPR0092',
		description: 'Laptop hinge repair, 3 hours',
		branch: 'PSA',
		by: 'manager'
	});
	await money(tx, biz, {
		direction: 'in',
		settle: true,
		date: day(-8),
		method: 'Telebirr',
		purpose: 'sale',
		party: 'Walk-in customers',
		reference: 'CI8M2B6WQA',
		receipt: 'Receipts 00519–00540',
		branch: 'PSA',
		by: 'manager',
		attach: 'Telebirr screenshots',
		documents: [salePiassa2]
	});
	await money(tx, biz, {
		direction: 'in',
		amount: 53_980,
		date: day(-8),
		method: 'Telebirr',
		purpose: 'sale',
		party: 'Walk-in customers',
		receipt: 'Receipts 00519–00540',
		branch: 'PSA',
		by: 'clerk',
		void: 'Same sales entered twice (no reference on this one)'
	});

	// ── Purchase orders ───────────────────────────────────────────────────────────────────────
	// The mice came, the chargers did not.
	const poAccessories = await purchaseOrderSeed(
		tx,
		biz,
		{
			supplier: 'Merkato Accessories Wholesale',
			deliverTo: 'Piassa Back Store',
			date: day(-8),
			expected: day(-5),
			by: 'manager'
		},
		[
			{ sku: 'ACC-MOUSE', qty: 30, price: 480 },
			{ sku: 'ACC-CHG65', qty: 2, unit: 'Box', price: 11500 }
		]
	);
	await receiveOrder(
		tx,
		biz,
		poAccessories,
		{ date: day(-5), by: 'manager', reference: 'MAW-5521' },
		{ 'ACC-CHG65': { qty: 0 } }
	);

	// Ink, ordered and on its way.
	await purchaseOrderSeed(
		tx,
		biz,
		{
			supplier: 'Horizon Tech Distribution PLC',
			deliverTo: 'Piassa Back Store',
			date: day(-2),
			expected: day(5),
			reference: 'HTD quotation Q-7781',
			by: 'owner'
		},
		[
			{ sku: 'INK-HP305B', qty: 30, price: 1450 },
			{ sku: 'INK-HP305C', qty: 20, price: 1700 }
		]
	);

	// Phones from Dubai, still being priced.
	await purchaseOrderSeed(
		tx,
		biz,
		{
			supplier: 'Al Noor Electronics LLC, Dubai',
			deliverTo: 'Piassa Back Store',
			date: day(0),
			by: 'owner',
			draft: true
		},
		[{ sku: 'PH-TSP20', qty: 20, price: 9800 }]
	);

	// ── Stock count ───────────────────────────────────────────────────────────────────────────
	// Edna's count is under way: about half the shelf done.
	await stockTake(
		tx,
		biz,
		{
			location: 'Edna Store',
			date: day(0),
			by: 'edna',
			note: 'Quarter-end count',
			open: true,
			countedShare: 0.5
		},
		[]
	);

	// ── Credit (ዱቤ) ──────────────────────────────────────────────────────────────────────────
	// AAU's ICT office took flash drives, mice and routers against a purchase order, on 45 days'
	// credit: owed, not yet due.
	await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-20),
			from: 'Piassa Back Store',
			customer: 'Addis Ababa University',
			party: 'ICT Office',
			reference: 'AAU PO 2019/ICT/117',
			by: 'manager'
		},
		[
			{ sku: 'STO-USB32', qty: 20 },
			{ sku: 'ACC-MOUSE', qty: 10 },
			{ sku: 'NET-C6', qty: 2 }
		]
	);

	// Abay paid part of an old account and nothing since: more than 90 days late.
	await document(
		tx,
		biz,
		{
			type: 'issue',
			date: day(-125),
			from: 'Piassa Back Store',
			customer: 'Abay Microfinance',
			party: 'Head office',
			by: 'manager'
		},
		[
			{ sku: 'STO-USB32', qty: 6 },
			{ sku: 'ACC-HDMI15', qty: 5 }
		]
	);
	await money(tx, biz, {
		direction: 'in',
		amount: 4_000,
		date: day(-60),
		method: 'Cash',
		purpose: 'sale',
		party: 'Abay Microfinance',
		customer: 'Abay Microfinance',
		receipt: 'FS-00391',
		branch: 'PSA',
		by: 'manager'
	});

	// ── The till ─────────────────────────────────────────────────────────────────────────────
	await tillShift(
		tx,
		biz,
		{ by: 'manager', location: 'Piassa Back Store', float: 1000, date: day(-1) },
		[
			{ lines: [{ sku: 'STO-USB32', qty: 2 }], pay: [{ method: 'Cash', rest: true }] },
			{
				lines: [
					{ sku: 'ACC-MOUSE', qty: 1 },
					{ sku: 'ACC-HDMI15', qty: 2 }
				],
				pay: [{ method: 'Telebirr', rest: true, reference: 'CI0PSATILL01' }]
			}
		]
	);

	// ── Returns ──────────────────────────────────────────────────────────────────────────────
	// The quarantined black ink goes back to Horizon: the counterfeit notice was confirmed.
	await returnGoods(
		tx,
		biz,
		{
			of: grnInk,
			date: day(-3),
			by: 'manager',
			note: 'Counterfeit notice confirmed; lot HP305B-2411 returned for credit'
		},
		{ 'INK-HP305B': 30 }
	);

	return biz;
}
