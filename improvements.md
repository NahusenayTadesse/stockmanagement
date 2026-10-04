# Improvement review

Reviewed: 2026-10-03

## Implementation progress

First implementation batch, 2026-10-03:

- **Finding 1 — dashboard stock fix implemented.** Stock value, expiry quantities/counts, low-stock quantities, draft counts, and recent documents now use the viewer's branch scope. Transfers remain visible through either endpoint, matching the document list. Deleted documents are excluded. The shared organization-wide catalog count is explicitly explained in English and Amharic.
- **Finding 2 — complete totals implemented.** Expired/expiring and low-stock totals are calculated independently of the 50-row previews. Preview tables show “Showing … of …”. Expired value also includes all matching lots. Filtered “View all” destinations remain follow-up work.
- **Regression coverage:** four new database tests exercise branch/tenant isolation, owner visibility, incoming transfers, deleted documents, more than 50 matching records, shared lots, expiry boundaries, zero stock, and empty scopes/businesses. All four plus the two existing branch-scope tests passed using rolled-back local database transactions.
- **Validation:** `npm run check` passed with zero errors/warnings; Prettier, ESLint, and whitespace checks passed for the changed files. Repository-wide `npm run lint` is blocked by existing diff-marked code examples in `.cursor/skills/`, `.gemini/skills/`, and `.github/skills/`, plus formatting in `project.inlang/.meta.json` and `project.inlang/README.md`. Browser validation and Svelte MCP autofixer validation remain unavailable in this session.
- **Further scope audit remains open:** the expiry page calls `expiryWatch(orgId, today)` without branch scope, including its email action; the reorder page scopes its location picker but falls back to organization-wide suggestions when no location is selected. These routes, related actions/exports, and other summaries require a separate pass before calling finding 1 complete across the product. Dashboard money/credit/approval summaries retain their existing permission policies in this batch.

The review below records the original observations and remaining backlog; the progress notes above describe what has changed since that review.

## Scope and confidence

This is a source-based review of the public site, registration, dashboard, shared navigation and table conventions, POS, stock queries, import screen, localization, and operational/test configuration. Findings below distinguish confirmed implementation behavior from design proposals and checks that need runtime validation.

The deployment URL in the README could not be opened through the web tool, and browser automation was unavailable during the original review. Consequently, that review did **not** visually test the deployed site, sign in, measure performance or contrast, or reproduce issues against a running database. Svelte MCP documentation tools were not available. The original review changed no application code or data; subsequent implementation and database validation are tracked above.

## Overall assessment

The product already covers considerably more than basic inventory: lot/expiry tracking, transfers, purchasing, stock counts, credit, POS, reporting, subscriptions, imports, English/Amharic, Ethiopian date inputs, and guided help. Preserve those capabilities and the shared component system. The strongest next step is to make existing workflows more trustworthy, easier to discover, and faster to operate before adding more modules.

Priorities: **P0** = resolve before relying on the affected control; **P1** = next improvement cycle; **P2** = subsequent refinement. Effort estimates are relative: **S** = localized change, **M** = several components/services, **L** = cross-cutting work.

## Correctness and reliability

### 1. Apply branch restrictions consistently to dashboard stock data

- **P0 · M · Confirmed source inconsistency.** `src/routes/dashboard/+page.server.ts` calls `dashboardStats(orgId)` without the viewer's branch scope. In `src/lib/server/stock/queries.ts`, that function aggregates organization-wide balances, documents, and lots. By contrast, `src/routes/dashboard/stock/+page.server.ts` passes `branchScope(locals)` into its stock query, and the dashboard itself scopes its in-transit count.
- **Impact:** a branch-restricted employee can receive stock summaries and recent document metadata for other branches. This is a within-business scope issue; this review found no evidence here of cross-tenant access.
- **Improve:** pass the authorized scope into every applicable dashboard query. Audit related summaries and exports against the same policy. Distinguish organization-wide catalog counts from branch-specific stock metrics in the labels.
- **Acceptance:** with two branches and a user assigned to one, dashboard totals, lots, and recent documents include only permitted data. Owners retain the intended organization-wide view. Verify returned page data as well as visible elements.

### 2. Separate dashboard totals from preview limits

- **P1 · S/M · Confirmed.** `dashboardStats()` limits both expiry and low-stock lists to 50 rows. Expired/expiring counts are derived from that limited expiry array; the UI uses `stats.lowStock.length` for the low-stock count.
- **Impact:** figures that look like totals stop at 50. Because expiry is sorted oldest first, 50 expired lots can hide all upcoming expiries from the reported count.
- **Improve:** calculate full aggregate counts separately; retain small preview lists with “Showing 10 of 126” and a filtered “View all” link. Compute any displayed expiry value independently of the preview too.
- **Acceptance:** fixtures with more than 50 expired lots, additional soon-expiring lots, and more than 50 low-stock items produce correct totals and bounded previews.

### 3. Make POS checkout retries idempotent

- **P1 · M · Confirmed missing request identity in the reviewed checkout path; duplicate-sale scenario needs runtime reproduction.** `src/lib/schemas/pos.ts`, `src/routes/dashboard/pos/+page.server.ts`, and `src/lib/server/pos.ts` have no checkout request key. A transaction protects one execution, and the UI disables the submit button while paying, but neither identifies a retried request as the same sale. Payment-reference checks do not cover ordinary cash retries.
- **Impact:** a lost response after a successful commit can leave a cashier unsure whether to retry and potentially create a second sale.
- **Improve:** issue a stable checkout key, enforce uniqueness within the organization, and return the original receipt for repeated submissions. Reject reuse with a different payload. Give an uncertain checkout a “Check sale status” recovery path.
- **Acceptance:** repeated and concurrent submissions of the same checkout produce one document, one stock deduction, and one set of payments. A retry after a lost response retrieves that receipt.

### 4. Preserve an unfinished POS cart

- **P1 · M · Confirmed.** The active cart in `src/routes/dashboard/pos/+page.svelte` lives in component state. Explicit held carts exist, but automatic recovery and navigation protection are absent from this page. The clear-cart button directly calls `newSale()`.
- **Impact:** refresh, navigation, language-switch reload, or an accidental clear can discard work unless the cashier remembered to hold the cart.
- **Improve:** autosave a recoverable draft scoped to business, user, and shift; offer restoration after reload. Revalidate prices, stock, and item availability when restoring. Confirm clearing a nonempty cart or provide undo. Make draft persistence and expiry clear, especially on shared devices.
- **Acceptance:** recover a cart after reload; never restore another user's/business's cart; clear the saved draft only after a confirmed sale or intentional discard.

### 5. Show sellable stock in POS, not just physical on-hand stock

- **P1 · M · Confirmed difference in data sources.** POS `catalogue()` sums `stockBalance.quantity` by location. It does not filter those balances by lot expiry/status or subtract reservations. The stock page separately computes held/free quantities, while posting enforces further stock rules.
- **Impact:** a product can appear available and then fail at payment because some physical stock cannot be sold.
- **Improve:** share an availability calculation with the issuing rules. Distinguish on-hand, reserved, and sellable quantities; account for unit conversion and quantities already in the cart. Keep final server validation because another till can sell the stock meanwhile.
- **Acceptance:** expired, quarantined, recalled, and reserved stock is represented consistently with posting rules. A checkout conflict identifies the affected line and preserves the rest of the cart.

### 6. Verify schema readiness during deployment

- **P1 · M · Confirmed.** `src/routes/health/+server.ts` checks `SELECT 1`. The README explicitly notes that pending migrations can break pages while health still returns success, and deployment requires a separate migration procedure.
- **Improve:** retain the lightweight connectivity check, add a schema compatibility/readiness check, and make deployment fail clearly when required migrations are missing. Exercise a representative authenticated read after deployment with a dedicated test account.
- **Acceptance:** deploying against an incompatible schema cannot be reported as successful merely because the database answers a ping. Recovery and rollback steps are documented and rehearsed.

## Dashboard, navigation, and daily work

### 7. Turn the dashboard into a prioritized work queue

- **P1 · M · Design proposal grounded in the current layout.** `src/routes/dashboard/+page.svelte` can show separate money, attention, credit, and six stock tiles, followed by tables and onboarding. The stock tiles have no links, and all four money tiles link to the same date-filtered transaction list.
- **Improve:** lead with “Needs attention”: expired stock, approvals, low stock, overdue credit, and incoming transfers. Show a few headline metrics beneath it, with explicit period and branch scope. Make each actionable number open the matching filtered list; for example, unverified payments should open unverified payments. Add permission-aware shortcuts for sale, receipt, transfer, and count.
- **Acceptance:** a user can move from an alert to the relevant records in one click; labels explain the metric's scope and period; the page remains useful for cashier, storekeeper, and owner roles.

### 8. Make working context visible

- **P1 · M · Design proposal.** `TopBar.svelte` provides navigation search, language, theme, and account controls; the sidebar displays the business name. The dashboard lacks an explicit branch/period control in its page header.
- **Improve:** show the current business and selected branch or “All permitted branches” near page titles. Add consistent breadcrumbs to deep document/detail pages. Persist intentional filters in URLs so back navigation and shared links preserve context.
- **Acceptance:** switching branches updates totals, lists, and creation defaults consistently without widening permissions. Every deep page has a clear route back to its parent list.

### 9. Reduce table-reading friction

- **P2 · M · Confirmed convention; visual validation needed.** `src/lib/table.ts` uses `BigText` for shortened free text, with a default name length of 24 characters. Many operational decisions depend on distinguishing similar names.
- **Improve:** give item/customer names more room, retain SKU or another identifier, and prefer two-line wrapping for important identities. Reserve click-to-expand truncation for notes and secondary text. Validate shared table support before adding duplicate features for sticky headers, column visibility, density, and saved views.
- **Acceptance:** users can distinguish long, similar English and Amharic names without opening every cell. Numeric columns remain aligned and compact views still work at narrow widths.

### 10. Connect existing workflows instead of adding parallel screens

- **P2 · M · Product proposal.** Purchasing, reorder suggestions, counts, approvals, credit, and reports already exist.
- **Improve:** make the next step explicit at workflow boundaries: low stock → reorder; approved request → issue; stock discrepancy → reviewed adjustment; overdue balance → statement/reminder; received purchase → supplier/payment follow-up. Reuse existing routes and services, preserving context and permissions.
- **Acceptance:** each handoff carries the relevant record and filters, explains what remains to be done, and does not require re-entering existing information.

## POS usability and performance

### 11. Keep mobile checkout within reach

- **P1 · M · Layout risk, not a verified screenshot defect.** The POS uses `lg:grid-cols-[1fr_440px]`; below that breakpoint, the item catalog precedes the cart in a single column. The catalog can show 60 products.
- **Improve:** use a compact sticky cart summary with item count, total, and a cart/payment action. Consider separate Catalog/Cart views on small screens. Avoid letting category chips consume most of the initial viewport.
- **Acceptance:** at 360px and 390px widths, adding an item and opening payment does not require scrolling past the product catalog. Check the on-screen keyboard, dialog scrolling, and the floating help control together.

### 12. Scale catalog and customer search deliberately

- **P1 · M/L · Confirmed loading strategy; performance impact unmeasured.** The POS loader fetches the whole sellable catalog, associated units/codes, active customers, and every active price list. Price lists are loaded sequentially. The client filters the catalog and slices matches to 60.
- **Improve:** benchmark realistic catalog sizes first. Introduce indexed server search/pagination where needed, exact barcode lookup, and on-demand customer price-list loading. Show when results are truncated and how to refine or load more. Keep scanner interactions fast and deterministic.
- **Acceptance:** a user can find a product beyond the initial 60 results. Define and measure a search latency and page-payload budget with representative data and a slow connection.

### 13. Label POS inputs and explain payment failures in context

- **P1 · S/M · Confirmed markup gaps.** Several POS inputs rely on placeholders: catalog search, note, payment reference, SMS phone, and held-cart label. Other controls already have explicit accessible labels, which is worth extending consistently.
- **Improve:** add persistent labels or explicit accessible names; connect help/error text to fields. Explain cash-only change constraints before submit, preserve split payments on error, and put focus on the relevant error or field. Announce scan success/failure and payment progress without stealing scanner focus unnecessarily.
- **Acceptance:** a keyboard/screen-reader user can identify every field after entering a value and recover from a declined checkout. Incorrect barcode entry produces an understandable result.

## Public site and onboarding

### 14. Show the product earlier and shorten the feature catalog

- **P2 · M · Confirmed page structure; design proposal.** `src/routes/(site)/+page.svelte` uses a stylized `BinCard` in the hero, followed by six detailed feature groups containing 38 bullet points, local benefits, a day-in-the-life section, pricing, and a closing CTA.
- **Improve:** keep the distinctive navy/green identity, but show an actual dashboard/POS preview using clearly marked sample data. Lead with three concrete outcomes, then let visitors explore deeper features. Bring English/Amharic and Ethiopian-calendar support close to the main value proposition. Offer a read-only demo or short walkthrough alongside trial registration.
- **Acceptance:** an unfamiliar visitor can explain who the product is for, what using it looks like, and the next step after a brief scan. Preview images remain legible on mobile and have useful alternatives.

### 15. Make signup and subscription expectations explicit

- **P2 · S/M · Design proposal.** Registration already groups package, business, and owner information, explains trial length, and provides a next-steps list. Build on that foundation.
- **Improve:** keep the selected package and renewal amount visible near submission; explain trial expiry, manual receipt review timing, and what happens if payment is delayed. Carry the package choice from pricing into registration. Publish product-specific privacy, terms, support, and data-export/closure information with visible footer links; the reviewed public layout has no such links. Obtain appropriate review of policy wording.
- **Acceptance:** customers can understand the selected cost/period and post-trial behavior without navigating away from signup. Any promises about support or data handling match actual operations.

### 16. Tailor the existing getting-started guide

- **P2 · M · Enhancement to an existing feature.** The project already has a persisted getting-started guide, searchable help, and tours; do not rebuild them.
- **Improve:** prioritize guide steps by business type and role. For a shop, lead toward a first successful sale; for an internal store, toward receiving and issuing stock. Link to the existing import preview workflow when a business has a spreadsheet. Show prerequisites before launching a tour and let experienced users resume help when needed.
- **Acceptance:** a new user reaches one meaningful completed transaction with only the necessary setup, and can recover or reopen guidance later.

## Accessibility, localization, and presentation

### 17. Run a focused accessibility and responsive pass

- **P1 · M · Some source evidence; browser validation required.** The public layout has a skip link, but the reviewed dashboard layout has no equivalent. Existing accessible labels and shared primitives are useful foundations, not proof that complete flows work with assistive technology.
- **Improve:** add a dashboard skip link and verify focus order, dialog focus return, tour dismissal, error announcements, visible focus, and reduced-motion behavior. Measure light/dark contrast rather than assuming brand colors pass. Check sticky navigation, payment dialogs, and help overlays for overlap.
- **Acceptance matrix:** keyboard-only; screen reader; 200% zoom; 360/390/768/1280px widths; both languages; both themes. Cover login, item lookup, sale, stock receipt, and subscription payment.

### 18. Make calendar choice consistent with displayed dates

- **P2 · M · Confirmed convention.** Date inputs support Ethiopian/Gregorian choice, while `src/lib/table.ts` formats displayed dates through Ethiopian-calendar helpers.
- **Improve:** make displayed calendar labels explicit and consider a display preference or secondary Gregorian date where users compare external documents. Keep storage and submitted values canonical. Reuse existing date components and test calendar boundaries rather than introducing parallel conversion logic.
- **Acceptance:** a user can identify the calendar on lists, filters, and printed documents. Pagume, month boundaries, and Addis Ababa day transitions remain consistent across views.

### 19. Strengthen typography and low-bandwidth resilience

- **P2 · S/M · Confirmed external font dependency; actual impact unmeasured.** `src/routes/layout.css` imports Saira Condensed and Noto Sans Ethiopic from Google Fonts and already provides fallback fonts and Amharic-specific sizing.
- **Improve:** evaluate self-hosting the needed font assets, verify fallback rendering without network access, and use realistic long Amharic names in visual QA. Reserve condensed display typography for marketing headings; keep operational numbers and dense tables easy to scan.
- **Acceptance:** pages remain readable while fonts load or fail, without clipped Ge'ez glyphs or disruptive layout shifts. Test representative low-end mobile hardware before choosing further animation or visual effects.

### 20. Complete public sharing and discovery metadata

- **P2 · S · Source review.** Public pages include titles/descriptions, but the source search found no canonical URLs, Open Graph tags, or sitemap implementation.
- **Improve:** add public-page canonical/social metadata, a real preview image, and a sitemap for indexable public routes. Confirm private routes remain excluded from discovery. Account for the current cookie-based locale strategy rather than inventing localized URLs that do not exist.
- **Acceptance:** shared public links have the intended title, description, and image; metadata points to the deployed origin and never exposes business data.

## Quality assurance and operational visibility

### 21. Add browser coverage for complete business journeys

- **P1 · M · Confirmed test inventory gap.** There are substantial service/domain tests and example component tests. `playwright.config.ts` matches `*.e2e.ts/js`, but no matching end-to-end tests were found in the repository inventory.
- **Improve:** add a small isolated browser suite for login, first item/receipt, sale/receipt, transfer receiving, and a restricted-role flow. Add targeted regressions for branch-scoped summaries, totals over 50, cart recovery, and duplicate checkout requests. Keep billing/provider tests sandboxed.
- **Acceptance:** CI exercises actual page interactions with disposable fixtures, captures failure traces, and never sends real messages or payments. Avoid seeding or testing destructively against production.

### 22. Measure friction before expanding the feature set

- **P2 · M · Product/operations proposal.** This review did not establish an existing production analytics or monitoring setup.
- **Improve:** inventory current instrumentation, then measure time to first successful stock movement, POS completion/failure rate, search latency, import failure causes, and payment review turnaround. Correlate server failures with a request ID and give users actionable recovery information. Avoid collecting customer details or raw cart contents unnecessarily.
- **Acceptance:** the team can identify the most frequent blocked workflow and verify whether an improvement reduced failures or completion time.

## Suggested implementation sequence

1. **Trust the numbers and permissions:** branch-scoped dashboard data, complete aggregate counts, regression coverage.
2. **Protect checkout work:** idempotent sale submission, recoverable carts, consistent availability, contextual payment errors.
3. **Improve daily usability:** actionable dashboard, visible context, mobile cart access, input labels, keyboard checks.
4. **Validate scale and release safety:** realistic POS benchmarks, browser journeys, schema readiness checks.
5. **Improve acquisition and polish:** actual product previews, shorter marketing page, signup clarity, tailored guidance, metadata, and localization/typography checks.

Avoid starting with a wholesale redesign, a replacement component library, or full offline transaction posting. The existing feature set and shared UI are good foundations. First make core workflows clear and recoverable; offline posting would require its own conflict, stock, payment, and reconciliation design.
