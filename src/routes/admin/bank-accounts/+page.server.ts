import { contentCrud } from '@nahu/admin-kit/server/crud';
import { platformBankAccount } from '$lib/server/db/schema';
import { bankAccountAdd, bankAccountEdit } from '$lib/schemas/billing';
import { m } from '$lib/paraglide/messages.js';

/** The accounts businesses transfer their subscription into, shown on their Subscription page. */
const crud = contentCrud({
	table: platformBankAccount,
	label: () => m.platform_bank_account(),
	addSchema: bankAccountAdd,
	editSchema: bankAccountEdit,
	uniqueField: 'accountNumber'
});

export const load = crud.load;
export const actions = crud.actions;
