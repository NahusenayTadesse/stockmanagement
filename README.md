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
  fiscal year (`MAIN-GRN-2019-00001`). The movement and valuation primitives it shares with
  transfer receiving are in `stock/ledger.ts`; refusals are `StockError` (and `ApprovalRequired`)
  from `stock/errors.ts`.
- **Transfers between branches travel** (`src/lib/server/stock/transit.ts`). A transfer inside
  one branch moves at once. One to another branch, when posted, takes the stock into that
  branch's system **In transit** location (made on first use, never offered on a form) and waits
  `in_transit`; the form takes the driver and vehicle plate, and the printout is a dispatch note.
  The receiving branch opens it (Stock → Transfers in transit) and enters what arrived — serials
  ticked off for serial items; more than was sent is refused. Arrivals move onto its shelf dated
  the day they arrived; whatever did not arrive is written off from transit as `transit_loss`, so
  the ledger shows the loss. Only someone who works at the receiving branch can receive it.
- **Branch scoping** (`src/lib/server/scope.ts`). A user may be kept to some branches (Admin
  panel → Users → Works in; empty = every branch). They see documents, counts, orders, sales,
  shifts, requisitions and stock of those branches only, pick only their locations, and get a 404
  for anything else; a transfer may still be sent to any branch. `branches.all` (owners and
  managers by default) sees everything whatever is assigned.
- **Requisitions** (`/dashboard/requisitions`, `src/lib/server/requisitions.ts`). A department,
  ward or site asks the store for items (`requisitions.request`; the new **Department** role holds
  just that), submits it (numbered `REQ`), and someone else (`requisitions.approve`) approves it —
  cutting quantities if need be — or rejects it with a reason. "Issue" drafts the store issue with
  the approved quantities, to the department; posting it marks the requisition issued.
- **Approvals — maker-checker** (optional; Business profile → Approvals, `src/lib/server/approvals.ts`).
  Limits, all empty by default: adjustments worth at least X at cost, every write-off, counts
  whose differences come to at least X, purchase orders worth at least X. Past a limit, posting
  (or "Mark as ordered") does not happen: it becomes a request on **Approvals**, and someone with
  `approvals.decide` — never the person who asked — approves it, which posts it in their name,
  or rejects it with a reason shown to the requester, who can also withdraw it to change it.
- **Reservations** (optional; Business profile → Hold stock). An accepted proforma holds what it
  quotes at its location, and an approved requisition what was approved at its store
  (`stock_reservation`, `src/lib/server/reservations.ts`; kits hold their components). Issues,
  the till and transfers from that location may not dip into stock held for someone else; the
  sale or issue it was held for may, and posting it releases the hold. A proforma going back to
  draft, cancelled or past its date releases it too. On hand shows held and free quantities.
- **Costing: moving average or FIFO** (Business profile). By default stock is valued at the
  moving average. With FIFO, each receipt becomes a `cost_layer`; stock leaving the business
  (sales, write-offs, returns to supplier, losses in transit) takes the oldest layers first, and
  the item's average cost follows the layers left, so valuations still read `avg_cost`. Turning
  FIFO on opens one layer per item at its current average; moving stock between locations never
  changes what it cost.
- **Receipts in another currency, and landed costs.** A receipt may name a currency and the rate
  on the day; lines take the price as invoiced and are costed in birr at the rate (a new rate
  re-costs them). Landed costs (freight, insurance, duty, excise, surtax, clearing, transport)
  are added on the receipt while it is a draft, each shared over the lines by value, quantity or
  weight (items have an optional weight); posting adds each line's share to what the stock cost.
  They are not part of what the goods supplier is owed.
- **Kits, recipes, variants and services.** A kit or recipe is an item with components
  (`kit_component`, per one unit of the kit) and no stock of its own: selling it takes the
  components off the shelf (first expiry first out) on the kit's line; returning it brings them
  back, in proportion, into the lots they left. A variant (`parent_item_id`, `variant_label`) is
  an item of its own — SKU, barcode, stock, price — listed under its parent, made with "Add
  variant", which copies the parent's settings and packs. Services and kits sell at the till, on
  proformas and on issues; they cannot be received, transferred or adjusted.
- **Shelf life on receiving** (Admin panel → Categories). A category may ask for a least
  remaining shelf life on deliveries; a lot below it is flagged when the receipt is posted, or
  refused outright if the category says so.

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
- **Selling.** A sale is an ordinary posted issue with priced lines, however it is made — so
  credit, VAT/TOT, returns, fiscal receipts and e-invoices apply to all of them.
  - **Till** (`/dashboard/pos`, `src/lib/server/pos.ts`): open a shift with a float, scan a
    barcode or type a name/code (Enter adds an exact barcode or SKU match; F2 search, F9 pay),
    change units, quantities and prices, name a customer (their price list reprices the cart), hold
    and recall carts. Payment can be split across methods; only cash gives change, taken off the
    cash payment; anything unpaid needs a named customer and goes on their account (their credit
    limit applies). Checkout prices, pays and posts in one transaction, then prints the fiscal
    receipt / sends the e-invoice if set up, and offers the 80 mm receipt. Closing a shift counts
    the drawer against float + cash in − cash out, and records the difference.
  - **Price lists** (Admin panel → Price lists, `src/lib/server/pricing.ts`): a customer's list
    price for the unit, else its base-unit price scaled to the pack, else the item's list price.
    **Discount limit** (Business profile): a larger discount needs `sales.discount`.
  - **Proformas** (`/dashboard/sales/quotes`, `src/lib/server/quotes.ts`): for a listed customer
    or a one-off buyer (name, TIN); priced like the till; numbered (`PRF`) when sent; printable
    and emailable; "Make it a sale" drafts the sale at the quoted prices, to check and post.
  - **Sales & invoices** (`/dashboard/sales`): every priced sale and customer return with total,
    paid, on account, FS No. and e-invoice status; each posted one prints an A4 tax invoice (or
    sales invoice / credit note) with TINs, VAT or TOT, amount in words, payments, FS No., IRN
    and QR code.
- **Customers** (`/dashboard/customers`, `src/lib/server/customers.ts`) are optional everywhere.
  Only the name is required; names repeat, so the same name is refused only with the same phone
  (or both without one). An issue may name a customer, write who it went to in "Issued to", or
  leave both empty for a walk-in sale; a payment may name a customer the same way, and a sale's
  payment defaults to the sale's customer. A business that never sells (a hospital, NGO or school
  store) sets **Business profile → Customers → Internal store only**, which hides the customer list,
  every picker and the report section; nothing recorded is lost.
- **Credit (ዱቤ)** (`src/lib/server/credit.ts`). Issue lines carry a sale price, defaulting to the
  item's list price for the unit. What a customer owes is computed, never stored: posted sales to
  them at those prices, minus money in from them, plus refunds — a cash sale is one whose payment
  is recorded with it. Each customer has a credit limit (empty: none; 0: cash only) and days to
  pay. Posting a sale to a named customer is refused if a line has no price, or if it would take
  them over their limit — counting payments already recorded on the sale — unless the poster holds
  `customers.credit`. Payments are applied to the oldest sales first; what is left is aged
  (not due, 1–30, 31–60, 61–90, over 90 days late) on **Customers → Credit & ageing** and on the
  customer's page, which also has "Receive payment", a printable statement with running balance
  (`?from=` brings a balance forward) and "Email statement". The dashboard shows what is owed and
  overdue. Customer returns and tax the customer withheld settle the account like payments.
- **Returns** (`src/lib/server/returns.ts`): a posted sale has "Customer return", a posted receipt
  "Return to supplier". Either drafts a return of everything still returnable — per original line
  and lot, in base units, serials listed — at the original price (or cost) and VAT rate; the
  storekeeper lowers it to what actually comes back and posts it. Customer returns go back into
  the lot they left from, even an expired one; returns to supplier may take expired, quarantined
  and recalled stock (that is what they are for). Posting refuses more than is left to return,
  and serials that were not on the original. A customer return credits their account; a return to
  supplier comes off what they are owed.
- **VAT** (`src/lib/server/tax.ts`): prices and costs on lines are before VAT. Items carry a tax
  code (standard, zero-rated, exempt); the business (Business profile) and each supplier say
  whether they are VAT-registered. Posting a sale or receipt fixes each line's rate — the
  business's rate on standard items if it is registered (sales), or if the supplier is
  (deliveries) — so later changes never rewrite a posted invoice; returns copy the rate they
  return. Customer and supplier balances, payment suggestions and printed vouchers use totals
  with VAT. **Reports → VAT & withholding** has output VAT, input VAT, VAT payable, and the sales
  and purchase registers (with TINs) for filing.
- **Withholding**: every transaction can record tax withheld on top of the cash, with its receipt
  number; it settles the account as the cash does. A business that is a withholding agent is
  offered its withholding on payments for deliveries at or above the threshold (default 3% from
  ETB 10,000, before VAT; 30% for a supplier with no TIN); a customer marked as a withholding
  agent is expected to withhold from our sales the same way. The report lists what we withheld
  (to pay to the tax office), what was withheld from us (a credit), and receipts still missing.
  Rates and threshold are settings — check them against current rules.
- **TOT** (turnover tax, optional): a business that is not VAT-registered may set a TOT rate
  (Business profile; empty = not a TOT payer); items may override it (services are often
  higher). It is added to sale lines like VAT, fixed at posting (`stock_document_line.tot_rate`),
  counted in what customers owe, printed on vouchers and totalled on the tax report.
- **Fiscal devices** (optional; Admin panel → Fiscal devices, `src/lib/server/fiscal/`). Each
  device is `manual` (ring the sale up on the device, type its FS No. back in), `datecs_tcp` (the
  Datecs fiscal-printer protocol over the network — FP-/DP- series, common as MoR-registered
  sales registers) or `http_bridge` (a vendor bridge service for USB/serial devices; the JSON
  contract is in `fiscal/bridge.ts`). Every column is optional. A posted, priced sale or customer
  return gets its receipt printed — automatically when the device prints on posting — and keeps
  its FS No. and MRC; printing runs after the commit, so a device that is off records a failure
  to retry and never loses the sale. "Check" asks the device for its diagnostics (prints nothing);
  "Z report" closes the fiscal day. Tax groups map rates to the device's groups
  (`15=A,0=B,exempt=C,tot=D`), and Datecs payment types are in `DATECS_PAYMENT`: both vary by
  firmware, so confirm them on the real device (an X report is harmless) before relying on them.
  `fiscal.test.ts` exercises the protocol against a fake device over TCP.
- **E-invoicing** (optional; Business profile, `src/lib/server/einvoice.ts`): `sandbox` issues
  a local IRN and QR data without calling anyone; `live` posts each posted sale (and each customer
  return, as a credit note naming the original IRN) to the configured endpoint, with an OAuth2
  client-credentials token when a token URL is set. The IRN and QR code show on the document and
  the voucher. **`toProviderPayload` holds the tax office's field names and is provisional —
  align it with the Ministry of Revenues' published specification before going live.** Stored
  credentials (e-invoice secret, bridge token, operator password) are encrypted with a key
  derived from `SECRETS_KEY` (or `BETTER_AUTH_SECRET`), and never sent to the browser.
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
- **Reorder and planning** (`/dashboard/purchasing/reorder`, `reorderSuggestions` in
  `src/lib/server/purchasing.ts`). "Plan for" a location to use its own min/max levels (set per
  location on the item's page, `reorder_rule`); otherwise items plan on their reorder level
  across all stock. Each row shows on hand, held, on order (to that location), usage per day
  over the last 90 days, days of stock left and the supplier's lead time (Suppliers → lead time;
  7 days when unknown). The suggestion refills to max (or twice the level), and never below
  what the lead time plus 30 days of usage needs; items with no level at all are still listed
  when they will run out before a delivery could arrive. Ticked items become one draft order per
  main supplier.
- **Expiry follow-up** (`/dashboard/stock/expiry`, `src/lib/server/expiry.ts`): expired and
  expiring lots by location, with drafts to move them into quarantine or write them off. "Email me
  this list" sends the digest now. For a daily digest, set `CRON_SECRET` and have a scheduler
  `POST /api/cron/expiry-digest` with `Authorization: Bearer $CRON_SECRET`; it mails everyone who
  can post stock, in each business with something expired or expiring within 30 days.
- **Import from a spreadsheet** (Admin panel → Import, `data.import`, `src/lib/server/importer.ts`):
  items (with a pack unit and barcodes), suppliers, customers and opening stock (per location,
  lot, expiry and serials), from CSV or Excel, with a template for each. Every file is previewed
  row by row first; one bad row and nothing is imported, and the server plans the import again
  rather than trusting the preview. Items are matched by SKU, suppliers by name, customers by
  name and phone; missing units and categories are created. Opening stock posts one adjustment per
  location (reason "opening"). Up to 5 MB and 5,000 rows a file.
- **Barcodes and labels** (`src/lib/server/barcodes.ts`, Items → Labels & barcodes). "Give
  barcodes to items without one" makes in-store EAN-13 codes (`20` + the item id + check digit),
  never one another item already uses. Labels print on A4 sheets — shelf labels (name, Amharic
  name, price with VAT for a VAT-registered business, barcode) or small item labels — for chosen
  items, or for everything on a posted receipt (`?document=`). Barcodes are SVG from bwip-js
  (EAN-13 when valid, else Code 128; items without a barcode print their SKU).
- **Stock analysis** (Reports menu, `src/lib/server/analysis.ts`): slow-moving and dead stock (on
  hand, last issued, days idle, value); ABC analysis by cost used or by sales revenue; stock-out
  history (when each item ran out, and for how long, from the ledger); an item's stock level over
  time with its reorder lines (`/dashboard/reports/trend?item=`); and serial lookup — where a
  unit came from, every movement, who bought it, and whether it is still under warranty (items
  carry optional warranty months, counted from the sale).
- **Reports** (`/dashboard/reports`, `src/lib/server/reports.ts`): stock value by category,
  location and item; movements over time; most issued items; purchases and fill rate by
  supplier; write-offs by reason; money in and out by purpose and method (only for roles that
  see transactions). Periods chart by day up to two months, by Ethiopian month beyond. Every
  table exports to CSV/PDF and every chart toggles to its numbers.
- **SMS** (optional; Admin panel → SMS, `src/lib/server/sms.ts`). Texts go through GeezSMS
  with the platform's token (`SMS_KEY`, the same account as dana). Each business turns SMS on
  and chooses what goes out automatically: a receipt to a named customer after a sale (and, at
  the till, to any number a walk-in gives), a payment confirmation with what is still owed, and
  staff alerts to its alert numbers — approvals waiting, transfers on the way (the receiving
  branch's own mobile too), requisitions submitted, and a morning digest sent by the same cron
  call as the expiry email. With `sms.send`, people can also text a credit reminder to one
  customer or to everyone overdue (Customers → Credit & ageing), a proforma, a purchase order to
  its supplier, or a note. Numbers are normalised to `2519…`/`2517…` (landlines are refused and
  logged as not sent), messages are signed with the business's name and cut to 335 characters on
  a word. Nothing throws: every attempt, with the provider's answer and message units, is in the
  SMS log (and the last 20 on each customer's page). `SMS_DRY_RUN=true` logs without sending —
  the local `.env` has it on, because the demo customers' numbers look real; remove it to send.
- **Languages: English and Amharic** (paraglide). The switch in the header (and on the sign-in
  pages) sets a cookie and reloads; with no cookie, the browser's preferred language decides,
  else English. URLs are the same in both languages. Messages live in
  `messages/{en,am}/<area>.json` (common, kit, stock, sales, purchasing, admin, reports), keys
  prefixed by area; `messages/GLOSSARY.md` fixes the Amharic for each term so the same thing is
  called the same everywhere. `npm run i18n` compiles them into `src/lib/paraglide` (Vite does it
  on its own in dev and build; `npm run check` runs it first). Rules:
  - Never call a message at module top level (a `.ts` module, `columns.ts`, a zod schema,
    `<script module>`): the server shares modules between requests, so the first viewer's
    language would stick for everyone. Use getters (`get header() { return m.x(); }`), functions,
    or zod's `{ error: () => m.x() }`. `labels()`/`choices()` in `$lib/format.ts` build label
    lists that way, and `$lib/navigation.ts` titles are getters.
  - Server messages (refusals, flash messages) are read in the request's language; tests and the
    seed run outside a request and get English, which is why tests match English text.
  - The admin-kit's own words (tables, dialogs, pickers) come from `messages/*/kit.json`, passed
    to the kit from the root layout.
  - Data is never translated. Items and categories show their Amharic name in the Amharic
    interface when they have one. SMS bodies stay English: Ge'ez text costs about twice the
    message units.
  - Amharic needs an Ethiopic font: `layout.css` names Noto Sans Ethiopic, Nyala, Kefa and
    Abyssinica SIL, which cover Android, Windows, macOS and most Linux.
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
