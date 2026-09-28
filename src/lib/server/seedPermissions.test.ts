import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLES, permissionNames, permissionsMissingDescriptions } from './seedPermissions';

describe('permissions', () => {
	it('words every permission, so the role screens never show a bare code', () => {
		expect(permissionsMissingDescriptions()).toEqual([]);
	});

	it('gives default roles only permissions that exist', () => {
		const known = new Set(permissionNames());
		for (const role of DEFAULT_ROLES) {
			if (role.permissions === 'all') continue;
			expect(
				role.permissions.filter((p) => !known.has(p)),
				role.name
			).toEqual([]);
		}
	});
});
