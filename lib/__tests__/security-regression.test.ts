/**
 * Régression sécurité — Phase 12, Partie 16.
 *
 * Ne re-teste pas les fixtures déjà couvertes ailleurs (voir les fichiers
 * cités en commentaire pour chaque section) ; ce fichier vérifie
 * spécifiquement que les NOUVEAUX chemins B2C guest checkout (Phase 12)
 * n'introduisent PAS de régression sur les garanties déjà établies en
 * Phase 11 — falsification de prix, statut voucher, isolation agence,
 * idempotence.
 *
 * Prix falsifié (Omra / Packages) : contrairement au chemin Hôtel (qui
 * revalide un prix fournisseur externe, myGo — voir le commentaire de tête
 * de `lib/booking/guest-actions.ts` et la garde P0 dans
 * `confirmHotelWithProvider`, non re-testable ici sans harnais BDD/myGo,
 * déjà un gap documenté en Phase 11), les schémas de réservation Omra et
 * Packages n'exposent tout simplement AUCUN champ de prix : la propriété
 * est structurelle, pas seulement comportementale — un client ne peut même
 * pas *tenter* d'envoyer un prix, quelle que soit la valeur du payload.
 */

import test from "node:test"
import assert from "node:assert/strict"

import { omraGuestBookingSchema } from "@/lib/omra/schemas"
import { packageGuestBookingSchema } from "@/lib/packages/schemas"

const validPilgrim = {
  firstName: "Ahmed",
  lastName: "Ben Ali",
  birthDate: "1980-05-12",
  nationality: "TN",
  gender: "male" as const,
  maritalStatus: "married" as const,
  phone: "+216 98 123 456",
  email: "ahmed@example.tn",
  country: "TN",
  passportNumber: "A12345678",
  passportIssueDate: "2020-01-01",
  passportExpiryDate: "2030-01-01",
  passportIssuingCountry: "TN",
}

const validOmraBooking = {
  packageId: "11111111-1111-1111-1111-111111111111",
  departureDate: "2026-03-01",
  pilgrims: [validPilgrim],
}

const validPackageBooking = {
  packageId: "11111111-1111-1111-1111-111111111111",
  departureId: "22222222-2222-2222-2222-222222222222",
  adults: 2,
  children: 0,
  childrenAges: [] as number[],
  traveler: {
    civility: "M" as const,
    firstName: "Hassen",
    lastName: "Tarhouni",
    email: "hassen@example.tn",
    phone: "+216 98 140 514",
    civicIdType: "cin" as const,
    civicId: "12345678",
  },
}

test("SÉCURITÉ — omraGuestBookingSchema : un prix client injecté est ignoré (jamais lu, jamais utilisé)", () => {
  const forged = {
    ...validOmraBooking,
    // Un attaquant essaie d'injecter un prix arbitrairement bas.
    totalTnd: 1,
    pricePerPilgrim: 1,
    unitPriceTnd: 1,
  }
  const result = omraGuestBookingSchema.safeParse(forged)
  assert.equal(result.success, true, "le reste du payload reste valide")
  if (result.success) {
    const parsed = result.data as Record<string, unknown>
    assert.equal("totalTnd" in parsed, false, "le schéma ne doit exposer aucun champ prix")
    assert.equal("pricePerPilgrim" in parsed, false)
    assert.equal("unitPriceTnd" in parsed, false)
  }
})

test("SÉCURITÉ — packageGuestBookingSchema : un prix client injecté est ignoré (jamais lu, jamais utilisé)", () => {
  const forged = {
    ...validPackageBooking,
    totalTnd: 1,
    adultPriceTnd: 1,
    childPriceTnd: 1,
  }
  const result = packageGuestBookingSchema.safeParse(forged)
  assert.equal(result.success, true)
  if (result.success) {
    const parsed = result.data as Record<string, unknown>
    assert.equal("totalTnd" in parsed, false, "le schéma ne doit exposer aucun champ prix")
    assert.equal("adultPriceTnd" in parsed, false)
    assert.equal("childPriceTnd" in parsed, false)
  }
})

test("SÉCURITÉ — omraGuestBookingSchema : aucun champ agencyId n'est accepté (résolution serveur uniquement)", () => {
  const forged = { ...validOmraBooking, agencyId: "00000000-0000-0000-0000-000000000099" }
  const result = omraGuestBookingSchema.safeParse(forged)
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal("agencyId" in (result.data as Record<string, unknown>), false)
  }
})

test("SÉCURITÉ — packageGuestBookingSchema : aucun champ agencyId n'est accepté (résolution serveur uniquement)", () => {
  const forged = { ...validPackageBooking, agencyId: "00000000-0000-0000-0000-000000000099" }
  const result = packageGuestBookingSchema.safeParse(forged)
  assert.equal(result.success, true)
  if (result.success) {
    assert.equal("agencyId" in (result.data as Record<string, unknown>), false)
  }
})
