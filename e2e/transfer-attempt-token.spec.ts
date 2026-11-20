import { test, expect, type Page } from "@playwright/test"
import postgres from "postgres"
import { randomUUID } from "node:crypto"

/**
 * GUEST-IDEMPOTENCY-01 — formulaire de transfert B2C, parcours réel dans le
 * navigateur (jeton de tentative émis par le serveur, mode « double »).
 *
 * Prérequis (sinon skip) : serveur lancé avec GUEST_ATTEMPT_TOKEN_MODE=dual
 * et E2E_SEED_DATABASE_URL = URL PostgreSQL (propriétaire) de la MÊME base
 * que l'application. Le test crée sa propre agence OTA, la plus ancienne de
 * la base (created_at reculé à chaque exécution, donc antérieur aux agences des
 * exécutions précédentes) pour être l'agence « par défaut ».
 * Aucun appel fournisseur, aucune Production.
 */

const SEED_URL = process.env.E2E_SEED_DATABASE_URL
const MODE = process.env.GUEST_ATTEMPT_TOKEN_MODE

test.describe("Transfert B2C — jeton de tentative", () => {
  test.skip(
    !SEED_URL || MODE !== "dual",
    "E2E_SEED_DATABASE_URL et GUEST_ATTEMPT_TOKEN_MODE=dual requis",
  )
  test.setTimeout(180_000)

  let sql: ReturnType<typeof postgres>
  let fromId = ""
  let toId = ""
  let phone = ""

  test.beforeAll(async () => {
    sql = postgres(SEED_URL!, { max: 2 })
    const agencyId = randomUUID()
    fromId = randomUUID()
    toId = randomUUID()
    phone = `29${String(Date.now()).slice(-6)}`
    await sql`insert into agencies (id, slug, name, agency_type, created_at)
      values (${agencyId}, ${"e2e-" + agencyId.slice(0, 8)}, 'E2E attempt token', 'ota',
        timestamptz '2000-01-01' - (now() - timestamptz '2026-01-01'))`
    await sql`insert into catalog_transfer_zones (id, agency_id, name, zone_type)
      values (${fromId}, ${agencyId}, 'E2E Aéroport', 'airport'),
             (${toId}, ${agencyId}, 'E2E Hôtel', 'hotel')`
    await sql`insert into catalog_transfer_pricing
      (agency_id, from_zone_id, to_zone_id, vehicle_type, base_price_tnd)
      values (${agencyId}, ${fromId}, ${toId}, 'sedan', 50)`
  })
  test.afterAll(async () => {
    await sql?.end()
  })

  const count = async () =>
    Number(
      (
        await sql`select count(*)::int as n from reservations r
          join customers c on c.id = r.customer_id where c.phone = ${phone}`
      )[0].n,
    )

  async function openForm(page: Page) {
    // La résolution de l'agence par défaut est mise en cache 60 s côté
    // serveur (unstable_cache) : une requête antérieure à notre seed peut
    // avoir figé une autre agence. On recharge jusqu'à voir le formulaire.
    const url = `/fr/transferts/resultats?from=${fromId}&to=${toId}&vehicle=sedan&date=2031-03-03&time=10:00&pax=2`
    await expect(async () => {
      await page.goto(url)
      await expect(page.getByPlaceholder("Ahmed")).toBeVisible({
        timeout: 5_000,
      })
    }).toPass({ timeout: 100_000, intervals: [3_000] })
    await page.getByPlaceholder("Ahmed").fill("Eve")
    await page.getByPlaceholder("Ben Ali").fill("Onglet")
    await page.getByPlaceholder("+216 98 123 456").fill(phone)
    await page
      .getByPlaceholder("email@example.com")
      .fill("e2e-token@example.test")
  }
  const submit = (page: Page) =>
    page.getByRole("button", { name: /Confirmer/ }).first()

  test("deux onglets, même contenu : 1 réservation, avertissement, puis création confirmée", async ({
    browser,
  }) => {
    const ctx = await browser.newContext()
    const a = await ctx.newPage()
    const b = await ctx.newPage()
    await openForm(a)
    await openForm(b)
    await expect(submit(a)).toBeEnabled({ timeout: 60_000 })
    await expect(submit(b)).toBeEnabled({ timeout: 60_000 })

    await submit(a).click()
    await expect(a).toHaveURL(/\/booking\/confirmation\/TR-/, {
      timeout: 60_000,
    })
    expect(await count()).toBe(1)

    // Le second onglet (autre jeton, même contenu) est averti, rien n'est créé.
    await submit(b).click()
    await expect(b.getByText(/réservation identique existe déjà/i)).toBeVisible(
      { timeout: 60_000 },
    )
    expect(await count()).toBe(1)

    // Confirmation explicite : la seconde réservation est créée.
    await b.getByRole("button", { name: /Créer quand même/ }).click()
    await expect(b).toHaveURL(/\/booking\/confirmation\/TR-/, {
      timeout: 60_000,
    })
    expect(await count()).toBe(2)
    await ctx.close()
  })
})
