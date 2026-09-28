# Stock management

A multi-tenant stock system for Ethiopian businesses: pharmacies, shops, restaurants, NGO and
government stores, rental companies. SvelteKit + Drizzle (MySQL/MariaDB) + better-auth, built on
`@nahu/admin-kit`. The feature plan and the phases after this one are in the planning notes.

## Running it

```sh
# .env
DATABASE_URL="mysql://dev@localhost:3306/stock_management"
ORIGIN="http://localhost:5173"
BETTER_AUTH_SECRET="…32+ random characters…"

npm install
npm run db:migrate  # create the tables
npm run dev         # open /register to create a business and its owner
```

### Changing the schema

Edit `src/lib/server/db/schema/`, then `npm run db:generate`, **read the SQL it wrote in
`drizzle/`**, and `npm run db:migrate`. `db:push` is disabled: against MariaDB, drizzle-kit
cannot read the database's check constraints, and with `--force` it auto-approved `TRUNCATE`
statements on tables with data. JSON columns use the `jsonText` type in `schema/audit.ts`
(LONGTEXT) for the same reason.

If `db:migrate` exits with code 1 and no message, drizzle-kit swallowed a MySQL error. Replay the
migration's statements one by one with the `mariadb` client (into a scratch database with the
same collation) to see which failed. The usual culprit is an identifier over MySQL's 64-character
limit: give long foreign keys an explicit short name with `foreignKey({ name, … })`.

### Demo data

```sh
npm run db:seed -- --yes           # adds a hardware store and a tech store, if missing
npm run db:seed -- --yes --fresh   # rebuilds both
```

Two businesses with branches, staff on every role (password `Secret123!` — the script prints
the logins) and a few months of receipts, transfers, sales, write-offs and drafts, purchase
orders in every state (draft, ordered, partly and fully received), a posted stock count and one
still in progress, all posted through the real services. Dates are relative to the day you run it, so the expiring and
expired lots stay expiring and expired. Local databases only unless `ALLOW_REMOTE_SEED=yes`.

Scripts run under tsx with `scripts/tsconfig.json`, which maps `$lib` and points
`$env/dynamic/private` at `process.env` (`scripts/shims/env.ts`), so they can use the app's own
modules. Modules the seed imports must not import the kit's Vite-only helpers
(`@nahu/admin-kit/server/childCrud` and friends); form-only code lives apart, as in
`src/lib/server/orderLines.ts`.

The first request after a boot seeds the `permissions` table from the route rules
(`src/lib/access.ts`) and the code-only list in `src/lib/server/seedPermissions.ts`.

## How it fits together

- **Tenancy.** `organization` is the tenant. Every business table has `org_id`; `locals.orgId`
  comes from the signed-in user's row and every query filters by it. Simple lists use
  `orgCrud` (`src/lib/server/tenant.ts`), which is the kit's `childCrud` with the organization as
  owner.
- **People and permissions** follow dentalClinic: a user has one role; roles hold permissions;
  per-user special permissions replace the role's. Each business gets an **Owner** role holding
  every permission (a super admin). You can only grant permissions you hold, and a business can
  never lose its last active owner.
- **Accounts.** `/register` creates a business with its owner. Staff are added from
  Admin panel → Users. better-auth's public sign-up and admin endpoints are closed in
  `hooks.server.ts`; the admin plugin's HTTP API acts on every user across businesses.
- **Items** have capability flags (lots, expiry, serials, leasable, controlled…) instead of a
  table per kind of product. Quantities are stored in the item's base unit; pack units convert.
- **Stock changes only by posting a document** (receipt, issue, transfer, adjustment) —
  `src/lib/server/stock/post.ts`. Posting writes the append-only `stock_movement` ledger and the
  `stock_balance` cache in one transaction, issues first-expiry-first-out, never goes negative,
  never issues expired/quarantined/recalled lots, and numbers documents per branch and Ethiopian
  fiscal year (`MAIN-GRN-2019-00001`).

- **Money** is one `transactions` table: direction (in/out), amount, the day it moved, payment
  method (Cash, Telebirr, CBE Birr, M-Pesa, bank transfer, cheque — each business edits its own
  list), purpose, receipt number, transaction reference, and any number of screenshots/PDFs.
  Anything that involves money links to it with a nullable `transaction_id` (stock documents now;
  invoices, expenses and leases later). A reference already used on another transaction is
  refused; a transaction is verified by someone other than whoever recorded it; mistakes are
  voided, never deleted. Uploaded files are served only to the business that owns them
  (`routes/dashboard/files/[name]`).

- **Business profile** (Admin panel → Business profile, `business.manage`, owners by default):
  name, TIN, phone, address and logo. The logo shows in the sidebar and on printed vouchers, is
  served only to its own business, and a replaced logo's file is deleted. The sidebar's
  "Prepared by Digital Construct" credit (`src/lib/components/AppSidebar.svelte`, linking to
  digitalconstruct.io) is fixed in code on purpose.

- **Suppliers** (`/dashboard/suppliers`): name and phone required, email/address/TIN optional.
  A receipt cannot be saved or posted without one; the receipt form has "+ New supplier", which
  saves it and selects it. Every stock-tracked item has a main supplier. Every stock movement
  has a non-null `supplier_id`: the receipt's coming in; going out, the serial unit's, else the
  lot's, else the item's main supplier. Each supplier's page shows deliveries, payments and what is
  still owed (received at cost − paid).
- **Stock counts** (`/dashboard/stock/counts`, `src/lib/server/counts.ts`): opening a count
  snapshots what the system expects at one location (optionally one category; serial-tracked
  items are left out). Counts can be blind — expected quantities are hidden from anyone who
  cannot post. Posting needs every line counted and writes all differences as one adjustment
  (reason "count"). A warning shows if stock moved at the location after the count was opened.
- **Purchase orders** (`/dashboard/purchasing`, `src/lib/server/purchasing.ts`): a draft is edited
  freely; "Mark as ordered" numbers it (`BOL-PO-2019-00001`) and fixes its lines. It can be
  printed or emailed to the supplier. "Receive delivery" drafts a goods receipt for everything
  still due at the agreed prices; the storekeeper corrects it to what arrived and posts it. The
  order's status (ordered → partly received → received) follows posted receipts, in the same
  transaction. Closing an order stops the rest counting as "on order".
- **Reorder** (`/dashboard/purchasing/reorder`): items at or below their reorder level, by main
  supplier, with on hand and on order; the suggestion refills to twice the reorder level. Ticked
  items become one draft order per supplier.
- **Expiry follow-up** (`/dashboard/stock/expiry`, `src/lib/server/expiry.ts`): expired and
  expiring lots by location, with drafts to move them into quarantine or write them off. "Email me
  this list" sends the digest now. For a daily digest, set `CRON_SECRET` and have a scheduler
  `POST /api/cron/expiry-digest` with `Authorization: Bearer $CRON_SECRET`; it mails everyone who
  can post stock, in each business with something expired or expiring within 30 days.
- **Reports** (`/dashboard/reports`, `src/lib/server/reports.ts`): stock value by category,
  location and item; movements over time; most issued items; purchases and fill rate by
  supplier; write-offs by reason; money in and out by purpose and method (only for roles that
  see transactions). Periods chart by day up to two months, by Ethiopian month beyond. Every
  table exports to CSV/PDF and every chart toggles to its numbers.
- **Mail** (`src/lib/server/mail.ts`): nodemailer over SMTP (`SMTP_*` in `.env`). It never
  throws; without SMTP settings nothing is sent and the app carries on. Password reset uses it:
  "Forgot your password?" → a one-hour, single-use link → `/reset-password`; every session of
  that user ends and they get a "your password was changed" email.
- **Correlated subqueries** in a select list must reference the outer table with `qualified()`
  (`src/lib/server/db/sql.ts`): Drizzle leaves columns unqualified there when a query has no
  joins, and the comparison silently matches the subquery's own column.

## Tests

```sh
npx vitest --run --project server   # stock rules against the real database, rolled back after
npm run check
npm run lint
```
# stockmanagement
