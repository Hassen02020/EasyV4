import { test, expect } from "@playwright/test"
import fr from "../messages/fr.json"
import {
  newTravelerRef,
  sealTraveler,
  travelerCookieName,
} from "../lib/booking/traveler-cookie"
import {
  waitForRoute,
  type Fetcher,
  type RouteProbe,
} from "./support/wait-for-route"
import {
  EXPIRED_AGE_MS,
  TEST_TRAVELER,
  addTravelerCookie,
  draftToken,
  legacyTokenWithTraveler,
} from "./support/checkout-draft"

/**
 * DRAFT-PII-URL-01/02 — le voyageur n'est JAMAIS lu ni écrit dans l'URL ; il
 * vit dans un cookie chiffré par brouillon. Données de test, aucun appel
 * fournisseur. Brouillon signé (priceToken valide) : la vraie page de
 * paiement s'affiche, pas le bloc « prix non vérifié ».
 */

// Serveur de dev froid (CI) : attente BORNÉE d'une vraie condition de
// disponibilité (HTTP 200 + contenu propre à chaque route), jamais un GET dont
// le statut serait ignoré. Un 404/500 persistant, une autre page ou une panne
// réseau font ÉCHOUER la suite avec le dernier statut / la dernière erreur.
test.beforeAll(async ({ request }) => {
  const fetcher: Fetcher = async (path) => {
    // failOnStatusCode:false sert uniquement à LIRE le statut : tout statut
    // différent de 200 est traité comme « non disponible » par waitForRoute.
    const res = await request.get(path, {
      maxRedirects: 0,
      timeout: 30_000,
      failOnStatusCode: false,
      headers: path.includes("&t=" + WARMUP_REF)
        ? { cookie: WARMUP_COOKIE }
        : {},
    })
    return { status: res.status(), body: await res.text() }
  }
  const draft = draftToken(true)
  const probes: RouteProbe[] = [
    {
      label: "saisie voyageur",
      path: `/fr/booking/travelers?d=${draft}`,
      check: ({ body }) =>
        body.includes('<html lang="fr"') &&
        body.includes(fr.Booking.travelerDetailsTitle)
          ? null
          : "route inattendue (page ou titre voyageur absent)",
    },
    {
      label:
        "paiement sans cookie (redirection attendue vers la saisie voyageur)",
      path: `/fr/booking/checkout?d=${draft}&t=AAAAAAAAAAAAAAAAAAAAAA`,
      check: ({ body }) =>
        body.includes("NEXT_REDIRECT;replace;/fr/booking/travelers")
          ? null
          : "route inattendue (redirection vers /booking/travelers absente)",
    },
    {
      label: "paiement avec cookie valide (récapitulatif voyageur attendu)",
      path: `/fr/booking/checkout?d=${draft}&t=${WARMUP_REF}`,
      check: ({ body }) =>
        body.includes(TEST_TRAVELER.email)
          ? null
          : "route inattendue (récapitulatif voyageur absent : cookie refusé ou page différente)",
    },
  ]
  for (const probe of probes) await waitForRoute(fetcher, probe)
})

// Cookie de l'échauffement (référence propre, jamais réutilisée par les tests).
const WARMUP_REF = newTravelerRef()
const WARMUP_COOKIE = `${travelerCookieName(WARMUP_REF)}=${sealTraveler(WARMUP_REF, TEST_TRAVELER)}`

const PII = [
  TEST_TRAVELER.email,
  TEST_TRAVELER.civicId,
  TEST_TRAVELER.firstName,
]

function expectNoTravelerInUrl(url: string) {
  const decoded = decodeURIComponent(url)
  for (const clear of PII) expect(decoded).not.toContain(clear)
  const d = /[?&]d=([^&]+)/.exec(url)?.[1]
  if (d) {
    const json = Buffer.from(decodeURIComponent(d), "base64url").toString(
      "utf8",
    )
    for (const clear of [...PII, "civicId", '"traveler"']) {
      expect(json).not.toContain(clear)
    }
  }
}

test("cookie valide + priceToken valide → vraie page de paiement, récapitulatif voyageur, URL sans voyageur", async ({
  page,
  context,
}) => {
  const ref = await addTravelerCookie(context)
  await page.goto(`/fr/booking/checkout?d=${draftToken(true)}&t=${ref}`, {
    waitUntil: "networkidle",
  })
  expect(page.url()).toContain("/booking/checkout")
  await expect(page.getByText(TEST_TRAVELER.email).first()).toBeVisible()
  // Vraie page de paiement : pas le bloc « prix non vérifié » (texte visible).
  expect(await page.locator("body").innerText()).not.toContain(
    fr.Booking.priceNotVerifiedTitle,
  )
  expect(page.url()).toContain(`t=${ref}`)
  expectNoTravelerInUrl(page.url())
  // Le cookie est HttpOnly : illisible côté page.
  expect(await page.evaluate(() => document.cookie)).not.toContain("e2b_trv_")
})

test("cookie absent → retour à la saisie voyageur, URL sans voyageur", async ({
  page,
}) => {
  await page.goto(
    `/fr/booking/checkout?d=${draftToken(true)}&t=AAAAAAAAAAAAAAAAAAAAAA`,
    {
      waitUntil: "networkidle",
    },
  )
  expect(page.url()).toContain("/booking/travelers")
  expectNoTravelerInUrl(page.url())
})

test("cookie falsifié → refusé, retour à la saisie voyageur", async ({
  page,
  context,
}) => {
  const ref = await addTravelerCookie(context, { tamper: true })
  await page.goto(`/fr/booking/checkout?d=${draftToken(true)}&t=${ref}`, {
    waitUntil: "networkidle",
  })
  expect(page.url()).toContain("/booking/travelers")
  expect(await page.content()).not.toContain(TEST_TRAVELER.email)
})

test("cookie expiré → refusé, retour à la saisie voyageur", async ({
  page,
  context,
}) => {
  const ref = await addTravelerCookie(context, { ageMs: EXPIRED_AGE_MS })
  await page.goto(`/fr/booking/checkout?d=${draftToken(true)}&t=${ref}`, {
    waitUntil: "networkidle",
  })
  expect(page.url()).toContain("/booking/travelers")
})

test("cookie d'un autre brouillon (autre référence) → refusé", async ({
  page,
  context,
}) => {
  await addTravelerCookie(context)
  await page.goto(
    `/fr/booking/checkout?d=${draftToken(true)}&t=BBBBBBBBBBBBBBBBBBBBBB`,
    {
      waitUntil: "networkidle",
    },
  )
  expect(page.url()).toContain("/booking/travelers")
})

test("ancien ?d= avec voyageur (sans t) → voyageur ignoré, jamais réécrit dans l'URL", async ({
  page,
}) => {
  const legacy = legacyTokenWithTraveler()
  await page.goto(`/fr/booking/checkout?d=${legacy}`, {
    waitUntil: "networkidle",
  })
  expect(page.url()).toContain("/booking/travelers")
  expect(page.url()).not.toContain(legacy)
  expectNoTravelerInUrl(page.url())
  expect(await page.content()).not.toContain(TEST_TRAVELER.email)
})

test("ancien ?d= avec voyageur ET cookie valide → le cookie fait foi, l'URL reste sans voyageur", async ({
  page,
  context,
}) => {
  const ref = await addTravelerCookie(context)
  await page.goto(
    `/fr/booking/checkout?d=${legacyTokenWithTraveler()}&t=${ref}`,
    {
      waitUntil: "networkidle",
    },
  )
  expect(page.url()).toContain("/booking/checkout")
  await expect(page.getByText(TEST_TRAVELER.email).first()).toBeVisible()
  // Les liens générés par la page repartent d'un token sans voyageur.
  const hrefs = await page
    .locator('a[href*="/booking/travelers"]')
    .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href))
  expect(hrefs.length).toBeGreaterThan(0)
  for (const h of hrefs) expectNoTravelerInUrl(h)
})

test("formulaire voyageur : après saisie, l'URL du paiement ne contient aucune donnée personnelle", async ({
  page,
}) => {
  await page.goto(`/fr/booking/travelers?d=${draftToken(true)}`, {
    waitUntil: "networkidle",
  })
  await page.fill("#firstName", TEST_TRAVELER.firstName)
  await page.fill("#lastName", TEST_TRAVELER.lastName)
  await page.fill("#email", TEST_TRAVELER.email)
  await page.fill("#phone", TEST_TRAVELER.phone)
  await page.fill("#civicId", TEST_TRAVELER.civicId)
  await page.locator('form button[type="submit"]').first().click()
  await page.waitForURL(/\/booking\/checkout\?d=.*&t=/, { timeout: 15_000 })
  expectNoTravelerInUrl(page.url())
  await expect(page.getByText(TEST_TRAVELER.email).first()).toBeVisible()
  // Cookie posé par l'action serveur : HttpOnly (illisible côté page).
  expect(await page.evaluate(() => document.cookie)).not.toContain("e2b_trv_")
})
