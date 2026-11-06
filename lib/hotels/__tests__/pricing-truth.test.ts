/**
 * PRICING-HOTEL-TRUTH-01 — hôtels Tunisie : le prix AFFICHÉ (recherche
 * publique, espace Pro) est calculé par exactement le même tarificateur que
 * le prix FACTURÉ (réservation B2C, débit B2B).
 *
 * Constat d'origine (production, 2026-11-06) : règle commerciale hôtel
 * globale +25 TND fixes, `pricing_margins` vide (marge par défaut +10 %) ;
 * l'affichage appliquait +10 % et la réservation +25 TND → rejet
 * « le prix a changé » en B2C, débit différent de l'affichage en B2B.
 */
import { cleanupAsSuperuserWithDrizzle } from "@/lib/db/test-helpers/superuser-cleanup"
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { hotelCommercialRules } from "@/lib/db/schema/hotel-suppliers"
import {
  makeHotelAgencyPricer,
  resolveHotelAgencyPricer,
  type HotelCommercialRules,
} from "../commercial-engine"
import {
  applyMargin,
  applyPriceToHotelOffer,
  applyMarginToHotelOffer,
  DEFAULT_MARGINS,
  type MarginRule,
} from "@/lib/pro/pricing"

const src = (rel: string) => readFileSync(rel, "utf8")

const PROD_RULE: HotelCommercialRules = {
  fixedFee: 25,
  markupRate: 0,
  currency: "TND",
}
const PROD_MARGIN: MarginRule = DEFAULT_MARGINS.hotel // +10 %

function offer(nets: number[]) {
  return {
    fromPrice: Math.min(...nets),
    boardings: [{ pax: [{ rooms: nets.map((price) => ({ price })) }] }],
  }
}

test("scénario de production : règle +25 TND, marge par défaut +10 % → prix = net + 25 (plus jamais net × 1,10)", () => {
  const pricer = makeHotelAgencyPricer(PROD_RULE, PROD_MARGIN)
  assert.equal(pricer.source, "commercial_rule")
  assert.equal(pricer.price(300), 325)
  assert.equal(pricer.price(100), 125)
  // L'ancien affichage aurait montré 330 / 110 : c'est l'écart corrigé.
  assert.equal(applyMargin(300, PROD_MARGIN), 330)
})

test("sans règle commerciale → marge pricing_margins (comportement antérieur inchangé)", () => {
  const pricer = makeHotelAgencyPricer(null, PROD_MARGIN)
  assert.equal(pricer.source, "margin")
  for (const net of [80, 250, 300, 1234.567]) {
    assert.equal(pricer.price(net), applyMargin(net, PROD_MARGIN))
  }
  // applyMarginToHotelOffer reste strictement équivalent (aucune régression).
  const o = offer([120, 180])
  assert.deepEqual(
    applyPriceToHotelOffer(o, pricer.price),
    applyMarginToHotelOffer(o, { ...DEFAULT_MARGINS }),
  )
})

test("affiché = facturé : chaque chambre affichée vaut exactement le prix que la réservation calculera pour ce net", () => {
  for (const rules of [
    PROD_RULE,
    { fixedFee: 0, markupRate: 0.08, currency: "TND" },
    {
      fixedFee: 5,
      markupRate: 0.05,
      minMarkup: 10,
      maxMarkup: 40,
      currency: "TND",
    },
    null,
  ] as (HotelCommercialRules | null)[]) {
    const pricer = makeHotelAgencyPricer(rules, PROD_MARGIN)
    const nets = [80, 250, 300, 1234.567]
    const shown = applyPriceToHotelOffer(offer(nets), pricer.price)
    const shownRooms = shown.boardings[0]!.pax[0]!.rooms.map((r) => r.price)
    // Côté réservation : hotelPricerB2C/B2B.price(myGoBooking.totalPrice).
    assert.deepEqual(
      shownRooms,
      nets.map((n) => pricer.price(n)),
    )
    // fromPrice reste le minimum (tarificateur croissant).
    assert.equal(shown.fromPrice, Math.min(...shownRooms))
  }
})

test("règle dans une autre devise → refus explicite, jamais de conversion (CURRENCY-DIM-01)", () => {
  const pricer = makeHotelAgencyPricer(
    { fixedFee: 10, markupRate: 0, currency: "EUR" },
    PROD_MARGIN,
  )
  assert.throws(() => pricer.price(300), /CURRENCY-DIM-01/)
})

test("câblage : affichage et facturation passent par le même tarificateur, avec le bon canal", () => {
  const searchPublic = src("app/api/hotels/search-public/route.ts")
  assert.match(
    searchPublic,
    /resolveHotelAgencyPricer\(\s*tenantContext\?\.agencyId \?\? null,\s*"B2C",\s*margins\.hotel,?\s*\)/,
  )
  assert.match(
    searchPublic,
    /applyPriceToHotelOffer\(offer, hotelPricer\.price\)/,
  )
  assert.doesNotMatch(searchPublic, /applyMarginToHotelOffer/)

  const guest = src("lib/booking/guest-actions.ts")
  assert.match(
    guest,
    /resolveHotelAgencyPricer\(\s*agencyId,\s*"B2C",\s*hotelMarginRule,?\s*\)/,
  )
  assert.match(guest, /hotelPricerB2C\.price\(myGoBooking\.totalPrice\)/)

  const b2b = src("lib/booking/actions.ts")
  assert.match(
    b2b,
    /resolveHotelAgencyPricer\(\s*agencyId,\s*"B2B",\s*hotelMarginRule,?\s*\)/,
  )
  assert.match(b2b, /hotelPricerB2B\.price\(myGoBooking\.totalPrice\)/)

  assert.match(
    src("lib/pro/server-context.ts"),
    /resolveHotelAgencyPricer\(\s*profile\.agency\.id,\s*"B2B",\s*margins\.hotel,?\s*\)/,
  )
  for (const page of [
    "app/(internal)/pro/(app)/hotels/page.tsx",
    "app/(internal)/pro/(app)/hotels/[id]/page.tsx",
    "app/(internal)/pro/(app)/booking/travelers/page.tsx",
  ]) {
    const s = src(page)
    assert.match(s, /getActivePartnerHotelPricer\(\)/, page)
    assert.match(s, /applyPriceToHotelOffer\([^)]*hotelPricer\.price\)/, page)
    assert.doesNotMatch(s, /applyMarginToHotelOffer/, page)
  }
  // Plus aucune seconde formule : l'ancien appel direct au moteur a disparu.
  for (const f of ["lib/booking/actions.ts", "lib/booking/guest-actions.ts"]) {
    assert.doesNotMatch(src(f), /applyHotelCommercialEngine\(/, f)
  }
})

test("garde anti-dérive B2B : refus sans débit si le total débité ≠ total affiché ; le formulaire Pro transmet le total affiché", () => {
  const b2b = src("lib/booking/actions.ts")
  const guard = b2b.indexOf(
    "if (priceDrifted(input.expectedTotalTnd, breakdown.totalTnd)) {",
  )
  const firstWrite = b2b.indexOf("const result = await withTenantContext(")
  assert.ok(guard > 0, "garde présente")
  assert.ok(guard < firstWrite, "garde AVANT toute écriture / tout débit")
  assert.match(b2b.slice(guard, guard + 900), /code: "PRICE_CHANGED"/)
  assert.match(
    b2b.slice(guard, guard + 900),
    /cancelBooking\(\{\s*bookingId: myGoBooking\.bookingId,?\s*\}\)/,
  )
  assert.match(
    src("components/pro/pro-booking-travelers-form.tsx"),
    /expectedTotalTnd: totalTnd,/,
  )
})

// ─── Résolution réelle des règles (Postgres) ────────────────────────────

let dbAvailable = false
let agencyId = ""
const skip = () => "Postgres local indisponible (DATABASE_URL)."

before(async () => {
  try {
    await withSystemContext((tx) => tx.execute(sql`select 1`))
    dbAvailable = true
  } catch {
    dbAvailable = false
  }
  if (!dbAvailable) return
  agencyId = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `pricing-truth-${agencyId.slice(0, 8)}`,
      name: "PRICING-HOTEL-TRUTH-01 fixture",
      agencyType: "ota",
    })
    // Règles propres à l'agence fixture (jamais globales : n'interfère avec
    // aucun autre test). Priorité très haute pour primer sur toute règle
    // globale éventuellement présente dans la base de test.
    await tx.insert(hotelCommercialRules).values([
      {
        agencyId,
        channel: "B2C",
        priority: 10_000,
        fixedFee: "25.000",
        markupRate: "0",
        currency: "TND",
        isActive: true,
      },
      {
        agencyId,
        channel: "B2B",
        priority: 10_000,
        fixedFee: "0",
        markupRate: "0.05000",
        currency: "TND",
        isActive: true,
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await cleanupAsSuperuserWithDrizzle(async (tx) => {
    await tx
      .delete(hotelCommercialRules)
      .where(eq(hotelCommercialRules.agencyId, agencyId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
})

test("live : B2C et B2B résolvent chacun leur règle ; affichage et réservation obtiennent le même prix", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const b2c = await resolveHotelAgencyPricer(agencyId, "B2C", PROD_MARGIN)
  const b2b = await resolveHotelAgencyPricer(agencyId, "B2B", PROD_MARGIN)
  assert.equal(b2c.source, "commercial_rule")
  assert.equal(b2c.price(300), 325)
  assert.equal(b2b.price(300), 315)
  // Deux résolutions successives (affichage puis réservation) : identiques.
  const again = await resolveHotelAgencyPricer(agencyId, "B2C", PROD_MARGIN)
  assert.equal(again.price(1234.567), b2c.price(1234.567))
})

test("live : agence inconnue / absente → marge seule", async (t) => {
  if (!dbAvailable) return void t.skip(skip())
  const none = await resolveHotelAgencyPricer(null, "B2C", PROD_MARGIN)
  assert.equal(none.source, "margin")
  assert.equal(none.price(300), 330)
})
