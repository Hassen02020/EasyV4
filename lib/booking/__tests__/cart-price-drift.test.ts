/**
 * CART-DRIFT-01 — panier B2C, drift de prix cart→confirmation.
 *
 * Scénario audité (Customer Experience) : `components/cart/cart-view.tsx`
 * ajoute une ligne au panier avec un `priceTnd` figé au moment de l'ajout
 * (localStorage, AUCUN TTL — voir lib/cart/cart-store.ts), puis affiche ce
 * même montant, potentiellement des heures/jours plus tard, comme le total
 * "à confirmer". Le client accepte les CGV et clique "Confirmer le panier"
 * en croyant ce montant.
 *
 * Classification (audit terminé, voir rapport) : PAS un bug financier —
 * `createGuestReservationFromDraft` (hôtel), `createGuestPackageBooking` et
 * `createGuestActivityBooking` recalculaient DÉJÀ 100% du montant chargé
 * côté serveur avant cette correction (myGo réel + marge pour l'hôtel ;
 * ligne `catalog_package_departures`/`catalog_activity_sessions` verrouillée
 * `FOR UPDATE` pour package/activité) — jamais un prix client-fourni. Le
 * ledger/wallet restait donc toujours exact. Le vrai bug est côté
 * EXPÉRIENCE CLIENT : si le tarif a réellement changé entre l'ajout au
 * panier et la confirmation (repricing fournisseur, nouveau tarif
 * départ/session), le client pouvait être facturé — wallet débité, ou
 * facture émise pour virement/espèces — d'un montant DIFFÉRENT de celui vu
 * et accepté au clic "Confirmer", SANS jamais en être informé ni avoir à
 * reconfirmer.
 *
 * Correctif : chaque moteur accepte désormais un `expectedTotalTnd` optionnel
 * (le prix affiché au panier) et compare le total fraîchement recalculé via
 * `priceDrifted()` (lib/booking/pricing.ts, testé en isolation dans
 * pricing.test.ts) — un écart matériel rejette (`code: "PRICE_CHANGED"`)
 * AVANT toute tentative de paiement ou écriture DB, plutôt que de charger
 * silencieusement un montant différent de celui affiché.
 *
 * Ces trois moteurs importent transitivement `"server-only"`
 * (withTenantContext → lib/db/tenant-context.ts) et ce dépôt n'a pas de
 * DATABASE_URL en CI (voir lib/booking/__tests__/b2b-idempotency-invariants.test.ts
 * pour le même constat) — un appel comportemental réel n'est donc pas
 * possible hors bundler Next.js. Même méthode que ce fichier voisin :
 * vérification statique du code source réel, sur les points précis qui
 * prouvent que (a) le rejet a lieu AVANT toute charge/écriture et (b) la
 * clé d'idempotence ne peut jamais mettre en cache un rejet PRICE_CHANGED
 * pour un montant devenu obsolète.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const guestActionsSrc = readFileSync(
  join(process.cwd(), "lib/booking/guest-actions.ts"),
  "utf8",
)
const packageActionsSrc = readFileSync(
  join(process.cwd(), "lib/packages/booking-actions.ts"),
  "utf8",
)
const activityActionsSrc = readFileSync(
  join(process.cwd(), "lib/activities/guest-booking-actions.ts"),
  "utf8",
)
const cartViewSrc = readFileSync(
  join(process.cwd(), "components/cart/cart-view.tsx"),
  "utf8",
)

function idx(src: string, needle: string): number {
  const i = src.indexOf(needle)
  assert.ok(i >= 0, `attendu dans le source : ${needle}`)
  return i
}

// --- Hôtel (lib/booking/guest-actions.ts) --------------------------------

test("createGuestReservationFromDraft : accepte expectedTotalTnd optionnel", () => {
  assert.match(guestActionsSrc, /expectedTotalTnd\?: number/)
})

test("createGuestReservationFromDraft : priceDrifted() vérifié AVANT toute tentative de paiement carte", () => {
  const driftIdx = idx(
    guestActionsSrc,
    "priceDrifted(expectedTotalTnd, breakdownBeforePromo.totalTnd)",
  )
  const cardPaymentIdx = idx(guestActionsSrc, "attemptCardPayment(")
  assert.ok(
    driftIdx < cardPaymentIdx,
    "la garde anti-drift doit s'exécuter avant toute tentative de paiement carte",
  )
})

test("createGuestReservationFromDraft : priceDrifted() vérifié AVANT toute écriture (INSERT reservations)", () => {
  const driftIdx = idx(
    guestActionsSrc,
    "priceDrifted(expectedTotalTnd, breakdownBeforePromo.totalTnd)",
  )
  const insertIdx = idx(guestActionsSrc, ".insert(reservations)")
  assert.ok(
    driftIdx < insertIdx,
    "la garde anti-drift doit s'exécuter avant toute écriture réservation",
  )
})

test("createGuestReservationFromDraft : un rejet PRICE_CHANGED compense le hold myGo et libère le verrou d'inventaire (comme les autres rejets)", () => {
  const driftBlock = guestActionsSrc.slice(
    guestActionsSrc.indexOf(
      "priceDrifted(expectedTotalTnd, breakdownBeforePromo.totalTnd)",
    ),
    guestActionsSrc.indexOf(
      "priceDrifted(expectedTotalTnd, breakdownBeforePromo.totalTnd)",
    ) + 900,
  )
  assert.match(
    driftBlock,
    /cancelBooking\(\{[\s\S]{0,40}?bookingId: myGoBooking\.bookingId[\s\S]{0,10}?\}\)/,
  )
  assert.match(driftBlock, /releaseInventoryLock\(\)/)
  assert.match(driftBlock, /code:\s*"PRICE_CHANGED"/)
  assert.match(driftBlock, /currentTotalTnd:\s*breakdownBeforePromo\.totalTnd/)
})

// --- Package (lib/packages/booking-actions.ts) ----------------------------

test("createGuestPackageBooking : accepte expectedTotalTnd optionnel, inclus dans la clé d'idempotence", () => {
  assert.match(packageActionsSrc, /expectedTotalTnd\?: number/)
  assert.match(
    packageActionsSrc,
    /expectedTotalTnd:\s*input\.expectedTotalTnd\s*\?\?\s*null/,
  )
})

test("createGuestPackageBooking : priceDrifted() vérifié AVANT toute tentative de paiement carte et avant l'INSERT reservations", () => {
  const driftIdx = idx(
    packageActionsSrc,
    "priceDrifted(expectedTotalTnd, breakdownBeforePromo.totalTnd)",
  )
  const paymentIdx = idx(packageActionsSrc, 'paymentMethod === "card"')
  const insertIdx = idx(packageActionsSrc, ".insert(reservations)")
  assert.ok(
    driftIdx < paymentIdx,
    "la garde anti-drift doit s'exécuter avant toute tentative de paiement carte",
  )
  assert.ok(
    driftIdx < insertIdx,
    "la garde anti-drift doit s'exécuter avant toute écriture réservation",
  )
})

test("createGuestPackageBooking : un rejet PRICE_CHANGED renvoie le code et le nouveau total, jamais une charge silencieuse", () => {
  assert.match(packageActionsSrc, /class PriceChanged extends Error/)
  assert.match(
    packageActionsSrc,
    /throw new PriceChanged\(breakdownBeforePromo\.totalTnd\)/,
  )
  assert.match(packageActionsSrc, /err instanceof PriceChanged/)
  assert.match(packageActionsSrc, /code:\s*"PRICE_CHANGED"/)
  assert.match(packageActionsSrc, /currentTotalTnd:\s*err\.currentTotalTnd/)
})

// --- Activité (lib/activities/guest-booking-actions.ts) -------------------

test("createGuestActivityBooking : accepte expectedTotalTnd optionnel, inclus dans la clé d'idempotence", () => {
  assert.match(activityActionsSrc, /expectedTotalTnd\?: number/)
  assert.match(
    activityActionsSrc,
    /expectedTotalTnd:\s*input\.expectedTotalTnd\s*\?\?\s*null/,
  )
})

test("createGuestActivityBooking : priceDrifted() vérifié AVANT toute tentative de paiement carte et avant l'INSERT reservations", () => {
  const driftIdx = idx(
    activityActionsSrc,
    "priceDrifted(expectedTotalTnd, totalTnd)",
  )
  const paymentIdx = idx(activityActionsSrc, 'paymentMethod === "card"')
  const insertIdx = idx(activityActionsSrc, ".insert(reservations)")
  assert.ok(
    driftIdx < paymentIdx,
    "la garde anti-drift doit s'exécuter avant toute tentative de paiement carte",
  )
  assert.ok(
    driftIdx < insertIdx,
    "la garde anti-drift doit s'exécuter avant toute écriture réservation",
  )
})

test("createGuestActivityBooking : un rejet PRICE_CHANGED renvoie le code et le nouveau total, jamais une charge silencieuse", () => {
  assert.match(activityActionsSrc, /class PriceChanged extends Error/)
  assert.match(activityActionsSrc, /throw new PriceChanged\(totalTnd\)/)
  assert.match(activityActionsSrc, /err instanceof PriceChanged/)
  assert.match(activityActionsSrc, /code:\s*"PRICE_CHANGED"/)
  assert.match(activityActionsSrc, /currentTotalTnd:\s*err\.currentTotalTnd/)
})

// --- Panier (components/cart/cart-view.tsx) --------------------------------
// Le panier doit ENVOYER `expectedTotalTnd` (sinon la garde ci-dessus ne
// peut jamais rien détecter — `priceDrifted` ignore un `expected` absent
// par construction, voir pricing.test.ts) et RÉAGIR à un rejet
// PRICE_CHANGED en mettant à jour le prix affiché plutôt qu'en le
// masquant.

test("cart-view : envoie expectedTotalTnd pour les 3 modules (hôtel/package/activité)", () => {
  const occurrences =
    cartViewSrc.split("expectedTotalTnd: line.priceTnd").length - 1
  assert.equal(
    occurrences,
    3,
    "les 3 branches module (hotel/package/activity) doivent envoyer expectedTotalTnd",
  )
})

test("cart-view : la clé d'idempotence hôtel inclut priceTnd (clé fraîche après mise à jour du prix affiché)", () => {
  assert.match(
    cartViewSrc,
    /JSON\.stringify\(\{[\s\S]{0,150}?draft: line\.draft,[\s\S]{0,150}?traveler: line\.traveler,[\s\S]{0,150}?method,[\s\S]{0,150}?priceTnd: line\.priceTnd,?[\s\S]{0,20}?\}\)/,
  )
})

test("cart-view : un rejet PRICE_CHANGED met à jour le prix affiché de la ligne (cart.updatePrice), jamais silencieusement ignoré", () => {
  const occurrences =
    cartViewSrc.split('result.code === "PRICE_CHANGED"').length - 1
  assert.equal(
    occurrences,
    3,
    "les 3 branches module doivent gérer PRICE_CHANGED",
  )
  assert.match(
    cartViewSrc,
    /cart\.updatePrice\(line\.id, result\.currentTotalTnd\)/,
  )
})

test("lib/cart/cart-store.ts : updateCartLinePrice ne modifie que l'affichage local, jamais utilisé comme source de charge", () => {
  const storeSrc = readFileSync(
    join(process.cwd(), "lib/cart/cart-store.ts"),
    "utf8",
  )
  assert.match(
    storeSrc,
    /export function updateCartLinePrice\(id: string, priceTnd: number\)/,
  )
})
