import { describe, expect, it } from 'vitest';
import {
	allocate,
	documentNumber,
	ethiopianFiscalYear,
	isExpired,
	movingAverage,
	parseSerials,
	toBase,
	type Candidate
} from './math';

const today = '2026-09-28';

const lot = (
	lotId: number | null,
	quantity: number,
	expiryDate: string | null,
	status: Candidate['status'] = 'available'
): Candidate => ({ lotId, quantity, expiryDate, status });

describe('allocate', () => {
	it('takes from the lot that expires first', () => {
		const result = allocate(
			[lot(1, 10, '2027-06-01'), lot(2, 10, '2026-12-01'), lot(3, 10, null)],
			15,
			{ today }
		);
		expect(result).toEqual({
			takes: [
				{ lotId: 2, quantity: 10 },
				{ lotId: 1, quantity: 5 }
			],
			short: 0
		});
	});

	it('leaves undated lots until last', () => {
		const result = allocate([lot(1, 5, null), lot(2, 5, '2030-01-01')], 6, { today });
		expect(result.takes.map((t) => t.lotId)).toEqual([2, 1]);
	});

	it('never issues expired, quarantined or recalled stock', () => {
		const result = allocate(
			[
				lot(1, 10, '2026-09-27'),
				lot(2, 10, '2027-01-01', 'quarantine'),
				lot(3, 10, '2027-01-01', 'recalled'),
				lot(4, 3, '2027-01-01')
			],
			5,
			{ today }
		);
		expect(result).toEqual({ takes: [{ lotId: 4, quantity: 3 }], short: 2 });
	});

	it('treats a lot expiring today as still in date', () => {
		expect(allocate([lot(1, 1, today)], 1, { today }).short).toBe(0);
	});

	it('writes off unusable stock when asked to, expired first', () => {
		const result = allocate([lot(1, 10, '2027-01-01'), lot(2, 4, '2026-01-01')], 5, {
			today,
			allowUnusable: true
		});
		expect(result.takes).toEqual([
			{ lotId: 2, quantity: 4 },
			{ lotId: 1, quantity: 1 }
		]);
	});

	it('takes only from the named lot', () => {
		const result = allocate([lot(1, 10, '2026-12-01'), lot(2, 10, '2027-01-01')], 4, {
			today,
			lotId: 2
		});
		expect(result.takes).toEqual([{ lotId: 2, quantity: 4 }]);
	});

	it('handles items without lots', () => {
		expect(allocate([lot(null, 2.5, null, null)], 1.25, { today })).toEqual({
			takes: [{ lotId: null, quantity: 1.25 }],
			short: 0
		});
	});

	it('does not drift on decimal quantities', () => {
		const result = allocate([lot(1, 0.1, null), lot(2, 0.2, null)], 0.3, { today });
		expect(result.short).toBe(0);
	});
});

describe('units and cost', () => {
	it('converts packs to base units', () => {
		expect(toBase(3, 100)).toBe(300); // 3 boxes of 100 tablets
		expect(toBase(2.5, 100)).toBe(250); // 2.5 quintals in kg
		expect(toBase(0.1, 3)).toBe(0.3);
	});

	it('averages cost over what is on hand', () => {
		expect(movingAverage(100, 10, 100, 20)).toBe(15);
		expect(movingAverage(0, 10, 50, 12)).toBe(12);
		expect(movingAverage(30, 7.5, 10, 8.5)).toBe(7.75);
	});

	it('knows when something has expired', () => {
		expect(isExpired('2026-09-27', today)).toBe(true);
		expect(isExpired(today, today)).toBe(false);
		expect(isExpired(null, today)).toBe(false);
	});
});

describe('serials', () => {
	it('reads one per line or comma separated, and reports repeats', () => {
		expect(parseSerials('A1\nA2, A3\n\nA2')).toEqual({
			serials: ['A1', 'A2', 'A3'],
			duplicates: ['A2']
		});
		expect(parseSerials(null)).toEqual({ serials: [], duplicates: [] });
	});
});

describe('document numbers', () => {
	it('uses the Ethiopian fiscal year, which starts on Hamle 1', () => {
		// 8 July 2025 is Hamle 1, 2017: the first day of FY 2018.
		expect(ethiopianFiscalYear('2025-07-07')).toBe(2017);
		expect(ethiopianFiscalYear('2025-07-08')).toBe(2018);
		// Meskerem 2019 (September 2026) is still FY 2019.
		expect(ethiopianFiscalYear('2026-09-28')).toBe(2019);
	});

	it('formats branch, kind, year and number', () => {
		expect(documentNumber('ADD', 'receipt', 2019, 42)).toBe('ADD-GRN-2019-00042');
	});
});
