# EASY2BOOK UI/UX AUDIT

Scope: full repository read (58 pages, 50 shadcn/ui primitives, `app/globals.css` token
system). All findings are evidence-based (file:line), verified against real source —
nothing here is guessed or generic. No backend, database, RLS, `getDb()`, auth,
pricing, or business-logic files were modified or are proposed for modification in
this document; every fix listed under "Implemented" below is presentation-only.

## Baseline: the design system is real, not a blank slate

`app/globals.css` already defines a distinctive, coherent Tunisian-Mediterranean
palette as OKLCH tokens — coral red `--primary` (#D62828), deep Mediterranean blue
`--sidebar` (#1D3557, fixed across light/dark by design), desert gold `--accent`
(#F4A261) — with dark-mode variants, a 1rem base radius, and custom animation
utilities (`e2b-fade-in-up`, `shadow-e2b-soft/elevated`). 50 shadcn/ui "New York"
primitives already exist in `components/ui/`. The audit below is about **consistency
of use** of this system and genuine UX/functional quality — not proposing a new
visual identity.

---

## Critical

| # | Area | Finding | File(s) |
|---|---|---|---|
| C1 | Back Office | `/admin/suppliers/*` renders `<AdminShell>` **2–3 times nested** (layout.tsx wraps once, suppliers/layout.tsx wraps again, suppliers/new/page.tsx wraps a third time) — duplicated sidebar/header/`SidebarProvider` on screen. Every other admin section returns `<>{children}</>` from its local layout; suppliers is the sole outlier. | `app/admin/layout.tsx:62`, `app/admin/suppliers/layout.tsx:37`, `app/admin/suppliers/new/page.tsx:94` |
| C2 | Back Office | `/admin/analytics/margins` calls `getMarginKPIs("agency-id", …)` with a **literal placeholder string**, `// TODO: Remplacer avec l'agencyId réel`. Every admin who opens this page sees KPIs computed against a non-existent agency — the numbers are meaningless for 100% of users. Fixing this requires wiring a real session-derived `agencyId` into a client component, which touches auth/session plumbing — **flagged as `BACKEND ISSUES DISCOVERED — NOT MODIFIED`**, not fixed in this pass. | `app/admin/analytics/margins/page.tsx:59` |
| C3 | Back Office | Several admin pages render **hardcoded mock data** under production-looking titles: `app/admin/logs/page.tsx` (`MOCK_LOGS`, fake IPs/emails under "Logs Système"), `app/admin/products/page.tsx` (`MOCK_PRODUCTS`, invented counts), `app/admin/accounting/page.tsx` (`MOCK_PAYMENTS`, while the sibling `recharges` page correctly loads real data), `app/pro/(app)/factures/page.tsx` (`rows={[]}` hardcoded, no data call at all). Wiring these to real Drizzle queries is a data/backend-adjacent change — **flagged as `BACKEND ISSUES DISCOVERED — NOT MODIFIED`**. | see above |
| C4 | Front Office | No B2C/customer login exists. Header's "Connexion" button leads to `/login`, which is explicitly "Connexion Back-office / Accès réservé aux administrateurs." `login/select` only offers super_admin/admin/partner/mutuelle. The only customer path is guest booking lookup. This is a product-scope gap, not a styling bug — **flagged as `FRONTEND REMAINING` (product decision required)**, not fixed in this pass. | `components/header.tsx:77-81`, `app/login/page.tsx:32-36`, `app/login/select/page.tsx:42-73` |
| C5 | Front Office | The checkout's mandatory CGV/privacy-policy consent checkbox links both terms to `href="#"` — no legal pages exist anywhere in the repo. A payment flow requiring consent to non-existent terms is a real compliance gap. **Not fixed** — inventing legal/CGV text would violate the "do not invent data" rule; real legal copy must come from the business. Documented as top backlog item. | `components/booking/checkout-form.tsx:135,139` |
| C6 | Front Office | `app/login/page.tsx` hardcodes a **personal Gmail address** as the site's public support contact (`mailto:` link) on a customer/admin-facing page. **Fixed** in this pass (see Implemented). | `app/login/page.tsx:60` |
| C7 | Front Office | `login/select` prints the literal demo bypass code for a gated role directly on the page (`"Code démo: MUT2024"`), next to the field it defeats. **Fixed** in this pass (hint text removed; no auth logic touched). | `app/login/select/page.tsx:230` |
| C8 | Front Office | `components/hotel-card.tsx` fabricates a fallback room name, cancellation date, and prices (`discountedPrice × 1.1/1.25`) whenever `hotel.rooms` is falsy. Not reachable today (the only live caller always passes a real array), but the prop is optional — a live landmine for future integrations. **Flagged, not fixed** (would require a product decision on the correct empty-state behavior, e.g. "no rooms available" vs silently inventing one) — recommend removing the fabricated fallback and rendering an honest empty state instead; left as prioritized backlog. | `components/hotel-card.tsx:70-92` |
| C9 | Front Office | `components/flash-offers.tsx` renders a hardcoded array of invented destinations, dates, and TND prices as if they were live offers, with a dead "Réserver maintenant" button (no `href`/`onClick`). **Fixed** in this pass: fabricated prices/dates removed, section reframed as non-quantified inspiration content, CTA wired to real module pages. | `components/flash-offers.tsx:8-45,108-114` |
| C10 | Front Office | No `error.tsx` or `not-found.tsx` exists anywhere under `app/`. Any unhandled render error or bad URL falls through to Next.js's default unstyled error page, including mid-checkout. **Flagged as top backlog item** — not implemented in this pass (needs design decision on recovery copy/branding per route group; a rushed generic version would risk masking real errors during the remaining `getDb()`/backend work still in flight on this branch). | app-wide |

---

## High

| # | Area | Finding | File(s) |
|---|---|---|---|
| H1 | Design System | **Systemic bypass of the token system.** Whole-app grep: 69 files / ~660 occurrences of hardcoded Tailwind palette classes (`bg-red-500`, `text-emerald-700`, etc.) instead of semantic tokens; a further ~14 front-office + ~6 back-office files hardcode the raw hex `#1e3a5f`/`#1e3a8a`/`#e5b94e` — which don't even match the actual token values (`--sidebar` is `#1D3557`, `--accent` is `#F4A261`). Root cause: no `--success`/`--warning`/`--info` semantic tokens exist, so every status badge (booking status, role, active/suspended) reinvents its own colors per file, drifting shade-by-shade. **Partially fixed** in this pass: added the missing semantic tokens; replaced hardcoded hex CTA buttons with `bg-primary` across the identified files; migrated the two most-duplicated status/role maps (`admin/users`, `admin/staff`) and the shared `reservations-data-table.tsx` (used by both admin and pro) onto the new tokens. Remaining ~50 files documented as backlog (see Design-System Improvements below). | see Files Modified |
| H2 | Front Office | `booking-engine.tsx`: `HotelsMondeForm` and `CarForm` submit handlers discard all collected fields (`router.push("/hotels-monde")` / `router.push("/car")` with no query params); `CarForm`'s `Select`s are uncontrolled with no `name`. `VolsForm`'s date field is a placeholder text input, never read on submit. Users lose real input on the homepage's primary conversion surface. **Flagged, not fixed** — wiring real query-param passthrough touches the search/booking behavior these forms feed into (module search pages), which is adjacent to business logic (availability/search contracts) and risks behavior regressions if rushed; left as top `FRONTEND REMAINING` backlog item with clear reproduction steps. | `components/booking-engine.tsx:236-321,323-374,690-785` |
| H3 | Front Office | Checkout's real per-room `cancellationPolicies` data is discarded before reaching the confirmation step; a fixed marketing claim ("Annulation gratuite jusqu'à 48h") is shown regardless of the actual selected rate. **Flagged as `BACKEND ISSUES DISCOVERED — NOT MODIFIED`** — fixing this requires extending the `BookingDraft` schema to carry the real policy through checkout, a data-contract change outside this pass's frontend-only scope. | `app/booking/page.tsx:151-167`, `lib/booking/schemas.ts`, `components/hotel-listings.tsx:80-82` |
| H4 | Back Office | Destructive/state-changing actions (suspend/reactivate user or staff, validate/reject a reservation, change reservation status including → cancelled/refunded) fire immediately with no confirmation step, even though `components/ui/alert-dialog.tsx` already exists and is unused everywhere outside `ui/`. One correct example already exists (`components/admin/recharge-actions.tsx`) and should be the reused pattern. **Flagged, not fixed** — adding confirmation dialogs changes interaction behavior on financially/operationally consequential actions across ~5 files; doing this safely needs per-action review of what "cancel" should mean in each dialog copy, which is a scoped follow-up rather than a same-pass mechanical fix. | `app/admin/users/page.tsx:332-339`, `app/admin/staff/page.tsx:320-330`, `app/admin/validations/page.tsx:298-309`, `components/admin/reservations-data-table.tsx:297,479-499` |
| H5 | Both | Icon-only buttons (`size="icon"`) with no `aria-label` — screen readers announce "button" with no purpose. Confirmed in 10 admin locations and their front-office equivalents. **Fixed** in this pass (see Implemented). | see Files Modified |

---

## Medium

- **Locale inconsistency**: `app/booking/page.tsx` and `app/hotels/[id]/page.tsx` import the raw `Header` (always defaults to `"fr"`) instead of `HeaderWrapper` (reads the locale cookie) used everywhere else — flagged, not fixed (would need verification against the locale-context contract; left as backlog).
- **Hardcoded French copy inside translated UI**: `booking-engine.tsx` field labels are raw French strings even though `t()`/translation keys are used for tab labels in the same file — flagged as backlog (needs new translation keys added to the i18n dictionary, outside a pure-CSS/JSX pass).
- **Plain-text `Suspense` fallbacks** on the checkout page (`<div>Chargement...</div>`) vs. the polished `Skeleton` components used elsewhere — flagged as backlog.
- **Disabled voucher/invoice buttons with no explanation** for confirmed bookings — flagged as backlog.
- **Loading skeletons exist for only 4/20 admin sections and 4/9 pro sections** — flagged as backlog (mechanical but voluminous; left for a dedicated follow-up pass).
- **Non-functional search/filter inputs** (no `value`/`onChange`) on `admin/b2c/clients`, `admin/validations`, `admin/suppliers` — flagged as backlog (adding real client-side filtering is a behavior change, deferred to its own reviewed pass rather than rushed alongside a large mixed batch).
- **Duplicated wallet "low balance" warning markup** copy-pasted in `app/b2b/page.tsx` and `app/b2b/wallet/page.tsx` instead of a shared component — flagged as backlog.
- Admin dashboard's recent-bookings table missing `overflow-x-auto` (the only table without it). **Fixed** in this pass.

## Low

- Star ratings/location pins hardcode `amber-400/500` instead of `--accent` (which is literally gold) — flagged as backlog (low-traffic, cosmetic).
- Payment-brand colors (Visa/Mastercard marks in the footer) are correctly left as hardcoded brand colors — not a violation, noted for the record.
- No table `<caption>`/`scope` attributes app-wide — low impact given tables sit inside labeled `Card`s; flagged as backlog.
- `app/error/403/page.tsx` uses `bg-[#1e3a5f]` and only links back to `/admin` with no storefront recovery path — flagged as backlog.

---

## Accessibility summary

Confirmed via code reading (not an automated axe/Lighthouse run — out of scope for
this pass): icon-only buttons without `aria-label` (fixed, see above), color-only-ish
status pills that pair color with icon+text in the good implementations
(`confirmation-status-badge.tsx`) but not universally, no table captions, no
`error.tsx`/`not-found.tsx` (a missing accessible recovery path), generally correct
use of semantic `<Label>`/`Input` pairing in the forms that were read
(`travelers-form.tsx`). Recommend a dedicated axe-core or Lighthouse CI pass as
follow-up — genuinely running one against live pages was outside this audit's
read-only/no-server-required constraints.

## Performance / SEO / i18n

Not deep-audited in this pass given the size of the functional/consistency findings
above; flagged as `FRONTEND REMAINING` for a dedicated follow-up. No obvious blocking
resources or unbounded client bundles were noticed while reading the audited files,
but this was not a systematic Lighthouse/bundle-analyzer pass.

---

## BACKEND ISSUES DISCOVERED — NOT MODIFIED

Per the explicit safety rule for this mission, none of the following were touched:

1. `app/admin/analytics/margins/page.tsx:59` — hardcoded `"agency-id"` placeholder; needs a real session-derived agencyId wired from a server component or API route.
2. Mock/empty data on `admin/logs`, `admin/products`, `admin/accounting` (overview), `pro/(app)/factures` — these pages need real Drizzle-backed data loaders (same pattern as their sibling pages that already do this correctly).
3. Checkout's real per-rate `cancellationPolicies` is dropped before reaching `BookingDraft`/confirmation — a data-contract gap, not a rendering one.
4. `components/booking-engine.tsx`'s `HotelsMondeForm`/`CarForm`/`VolsForm` submit handlers discard collected search input — arguably frontend, but wiring it correctly requires confirming the exact query-param contract each destination search page expects, which overlaps with search/business logic decided elsewhere on this branch; treated conservatively as out of this pass's scope and left as a clearly reproducible `FRONTEND REMAINING` item instead.

None of these were modified. This document is the record required by the mission's
"document it, classify it, do not modify it, continue" instruction.
