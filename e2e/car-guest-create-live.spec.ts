import { test, expect } from "@playwright/test"

/**
 * CAR-GUEST-CREATE-LIVE-01 — première preuve d'exécution RÉELLE de
 * `createGuestCarBooking` (lib/cars/guest-booking-actions.ts) — zéro
 * référence dans aucun fichier de test de ce dépôt avant ce fichier (audit
 * OBSERVE du 2026-10-21), même gap que celui déjà fermé pour l'hôtel
 * Tunisie, l'hôtel Monde, le transfert et le vol (demande).
 *
 * Gap de données découvert ET fermé avant de pouvoir écrire ce test (pas
 * un blocage d'infra) : `car_locations`/`car_categories`/
 * `car_fleet_vehicles`/`car_pricing_rates` étaient COMPLÈTEMENT vides dans
 * ce labo pour l'agence OTA directe — ce module dépend d'un vrai
 * catalogue/flotte saisi par une agence, comme le transfert. 2 lieux +
 * 1 catégorie + 3 véhicules de flotte + 1 tarif insérés directement en
 * base (préfixés "TEST FIXTURE —", jamais présentés comme un vrai
 * catalogue commercial).
 *
 * Disponibilité RÉELLE, différente des hôtels (Virtual Supplier
 * algorithmique) et du transfert (catalogue de prix pur, pas de stock) :
 * `checkCarAvailability()` (guest-booking-actions.ts) cherche d'abord une
 * ligne `car_availability` par date exacte — absente ici, AUCUNE n'a été
 * seedée volontairement — puis retombe sur un véhicule de flotte
 * `status='available'` au lieu/catégorie demandés, qu'elle verrouille et
 * passe à `status='rented'` après la réservation (vrai décrément, jamais
 * un stock illimité).
 *
 * CAR-TEST-REPRO-01 (2026-10-21) — les 3 véhicules de fixture partagés
 * (`E2E-TEST-001/002/003`, insérés une fois manuellement, voir ci-dessus)
 * s'épuisaient après 3 exécutions réelles, rendant ce test non
 * reproductible. Corrigé en rendant le test propriétaire de SON PROPRE
 * véhicule, jamais des 3 lignes partagées : `test.beforeAll` insère une
 * ligne `car_fleet_vehicles` dédiée (plaque unique horodatée,
 * `status='available'`, même agence/catégorie/lieu que les fixtures
 * partagées) via `DATABASE_DIRECT_URL` (superuser — mêmes raisons et même
 * patron que `deleteCanonicalHotelFixtureAsSuperuser` dans
 * `lib/db/__tests__/rls-gap-public-tables-01-live.test.ts` : contourne
 * uniquement la préparation du fixture, jamais le test lui-même, qui
 * passe toujours par `app_runtime`/RLS via le parcours applicatif réel).
 * `test.afterAll` supprime cette ligne précise par son propre id — jamais
 * les 3 lignes partagées préexistantes. Suppression sûre après résa :
 * `reservation_car.vehicle_id` a `onDelete: "set null"` (vérifié dans
 * lib/db/schema/cars.ts), donc la réservation déjà créée n'est jamais
 * affectée. Résultat : reproductible indéfiniment, sans toucher aux
 * données préexistantes.
 *
 * Parcours RÉEL : la page `/car/search` (Server Component) résout les
 * VRAIS `pickup`/`dropoff`/`category` (UUIDs de lieux/catégorie — pas de
 * recherche par texte libre ici, contrairement aux autres modules) et
 * préremplit `CarBookingForm`, qui recalcule son propre devis au montage
 * (`updatePricing()`, même pattern que le transfert) — bouton de
 * soumission `disabled` tant qu'aucun devis n'est obtenu. Aucune case CGV
 * ni choix de mode de paiement (confirmé par lecture du composant) :
 * `createGuestCarBooking` ne prend pas de `paymentMethod`, règlement
 * toujours différé ("aucune voie CB disponible actuellement", voir
 * l'en-tête du formulaire).
 *
 * Champs conducteur SANS `htmlFor`/`id` (`<Label>` sans `htmlFor`,
 * `<Input>` sans `id` — confirmé par lecture du composant, même défaut que
 * le formulaire transfert) : `getByPlaceholder`, pas `getByLabel`.
 *
 * Doit tourner contre `pnpm dev` — aucun moteur fournisseur virtuel ici
 * (catalogue + flotte réels, comme le transfert), donc pas de
 * `MYGO_MODE=virtual` nécessaire.
 */

const PICKUP_LOCATION_ID = "bbbbbbbb-0001-0001-0001-000000000001"
const DROPOFF_LOCATION_ID = "bbbbbbbb-0001-0001-0001-000000000001"
const CATEGORY_ID = "bbbbbbbb-0002-0002-0002-000000000001"
const AGENCY_ID = "00000000-0000-0000-0000-000000000001"

function futureDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

let ownVehicleId: string | null = null

test.beforeAll(async () => {
  const directUrl = process.env.DATABASE_DIRECT_URL
  if (!directUrl) return
  const postgres = (await import("postgres")).default
  const sql = postgres(directUrl, { max: 1 })
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into car_fleet_vehicles
        (agency_id, category_id, current_location_id, plate, brand, model, status)
      values
        (${AGENCY_ID}, ${CATEGORY_ID}, ${PICKUP_LOCATION_ID},
         ${"E2E-TEST-RUN-" + Date.now()}, 'Renault', 'Clio 5', 'available')
      returning id
    `
    ownVehicleId = row?.id ?? null
  } finally {
    await sql.end()
  }
})

test.afterAll(async () => {
  if (!ownVehicleId) return
  const directUrl = process.env.DATABASE_DIRECT_URL
  if (!directUrl) return
  const postgres = (await import("postgres")).default
  const sql = postgres(directUrl, { max: 1 })
  try {
    await sql`delete from car_fleet_vehicles where id = ${ownVehicleId}`
  } finally {
    await sql.end()
  }
})

test.describe("CAR-GUEST-CREATE-LIVE-01 — réservation voiture guest réelle", () => {
  test("devis pré-rempli par URL → conducteur → confirmation avec référence réelle", async ({
    page,
  }) => {
    test.setTimeout(60_000)

    const pickupDate = futureDate(10 + (Date.now() % 20))
    const returnDate = futureDate(13 + (Date.now() % 20))
    await page.goto(
      `/car/search?pickup=${PICKUP_LOCATION_ID}&dropoff=${DROPOFF_LOCATION_ID}&pickupDate=${pickupDate}&pickupTime=10:00&returnDate=${returnDate}&returnTime=10:00&category=${CATEGORY_ID}`,
    )

    // Preuve que le devis serveur (CarBookingForm::updatePricing, au montage)
    // a bien trouvé le tarif de fixture (90,000 DT/jour × 3 jours) — pas un
    // prix par défaut/inventé. Assurance "basic" = +0, donc la ligne
    // location et le total affichent tous les deux "270.000 DT" — `.first()`
    // nécessaire (1er échec empirique : strict mode violation, 2 matches).
    await expect(page.getByText(/270,000 DT|270.000 DT/).first()).toBeVisible({
      timeout: 15_000,
    })

    const submitButton = page.getByRole("button", {
      name: /Confirmer la Réservation/i,
    })
    await expect(submitButton).toBeEnabled({ timeout: 15_000 })

    const suffix = Date.now().toString().slice(-6)
    await page.getByPlaceholder("Ahmed").fill("CertifCar")
    await page.getByPlaceholder("Ben Ali").fill(`E2E-${suffix}`)
    await page.getByPlaceholder("+216 98 123 456").fill("+21698140514")
    await page
      .getByPlaceholder("email@example.com")
      .fill(`certif-car-e2e-${suffix}@example.com`)
    await page.getByPlaceholder("123456789").fill(`PERMIS-${suffix}`)

    await submitButton.click()

    await page.waitForURL(/\/booking\/confirmation\/[A-Za-z0-9-]+\?token=/, {
      timeout: 20_000,
    })
    const url = new URL(page.url())
    const publicRef = url.pathname.split("/").pop()
    expect(publicRef).toBeTruthy()

    await expect(page.getByText(/Référence/i).first()).toBeVisible()
    await expect(page.getByText(publicRef!)).toBeVisible()
    await expect(page.getByText(/CertifCar|E2E-\d+/i).first()).toBeVisible()
  })
})
