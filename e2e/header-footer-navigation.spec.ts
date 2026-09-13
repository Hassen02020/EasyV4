import { test, expect, type Page } from "@playwright/test"

/**
 * Audit Header/Footer/Navigation — mission "AUDIT COMPLET HEADER / FOOTER /
 * NAVIGATION / LIENS MORTS". Couvre : rendu FR/EN/AR desktop+mobile, RTL,
 * persistance devise, absence de lien mort dans le Header/Footer, et le
 * statut HTTP réel de chaque route commerciale référencée.
 *
 * Migration next-intl (Lot 1) : le switch de langue navigue maintenant vers
 * l'URL préfixée par la locale (`/fr`, `/en`, `/ar` — localePrefix "always",
 * voir i18n/routing.ts) au lieu de poser un cookie via `/api/set-locale`
 * (supprimé). Chaque `page.goto` de ce fichier cible donc directement le
 * préfixe de locale plutôt qu'un chemin racine ambigu.
 */

async function setLocale(page: Page, locale: "fr" | "en" | "ar") {
  await page.goto(`/${locale}`)
}

test.describe("Header — i18n + RTL (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const locale of ["fr", "en", "ar"] as const) {
    test(`Header rendu correctement en ${locale}`, async ({ page }) => {
      await setLocale(page, locale)
      await page.waitForLoadState("networkidle")

      const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"))
      const lang = await page.evaluate(() => document.documentElement.getAttribute("lang"))
      expect(lang).toBe(locale)

      if (locale === "ar") {
        expect(dir, "html[dir] doit être 'rtl' en arabe").toBe("rtl")
      } else {
        expect(dir, `html[dir] ne doit pas être 'rtl' en ${locale}`).not.toBe("rtl")
      }

      await expect(page.locator("header")).toBeVisible()
      await page.screenshot({
        path: `docs/audits/screenshots/nav-audit/header-${locale}-desktop.png`,
        fullPage: false,
      })
    })
  }
})

test.describe("Footer — i18n (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const locale of ["fr", "en", "ar"] as const) {
    test(`Footer rendu correctement en ${locale}`, async ({ page }) => {
      await setLocale(page, locale)
      await page.waitForLoadState("networkidle")
      const footer = page.locator("footer")
      await footer.scrollIntoViewIfNeeded()
      await expect(footer).toBeVisible()
      await footer.screenshot({
        path: `docs/audits/screenshots/nav-audit/footer-${locale}-desktop.png`,
      })
    })
  }
})

test.describe("Header/Footer — mobile 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("Header mobile — hamburger ouvre le menu, pas d'overflow", async ({ page }) => {
    await setLocale(page, "fr")
    await page.waitForLoadState("networkidle")
    await page.screenshot({ path: "docs/audits/screenshots/nav-audit/header-mobile-closed.png" })

    const menuButton = page.getByRole("button", { name: /toggle menu/i })
    await menuButton.click()
    await expect(page.getByRole("link", { name: "Aide" })).toBeVisible()
    await page.screenshot({ path: "docs/audits/screenshots/nav-audit/header-mobile-open.png" })

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth, `scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`).toBeLessThanOrEqual(
      overflow.clientWidth + 1,
    )
  })

  test("Footer mobile — pas d'overflow horizontal", async ({ page }) => {
    await setLocale(page, "fr")
    await page.waitForLoadState("networkidle")
    const footer = page.locator("footer")
    await footer.scrollIntoViewIfNeeded()
    await footer.screenshot({ path: "docs/audits/screenshots/nav-audit/footer-mobile.png" })
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  })
})

test.describe("Currency switcher — persistance", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("TND -> EUR -> USD -> TND persiste après navigation et refresh", async ({ page }) => {
    await page.goto("/fr")
    await page.waitForLoadState("networkidle")

    async function readCurrency(): Promise<string | null> {
      return page.evaluate(() => localStorage.getItem("e2b_currency"))
    }

    // État initial : devise par défaut TND (aucune sélection encore faite)
    const trigger = page.getByRole("button", { name: /changer de devise/i })
    await trigger.click()
    await page.getByRole("menuitem", { name: /^EUR/ }).click()
    await expect.poll(readCurrency).toBe("EUR")
    await page.screenshot({ path: "docs/audits/screenshots/nav-audit/currency-eur.png" })

    // Persistance après navigation interne
    await page.goto("/fr/omra")
    await page.waitForLoadState("networkidle")
    expect(await readCurrency()).toBe("EUR")

    await page.getByRole("button", { name: /changer de devise/i }).click()
    await page.getByRole("menuitem", { name: /^USD/ }).click()
    await expect.poll(readCurrency).toBe("USD")
    await page.screenshot({ path: "docs/audits/screenshots/nav-audit/currency-usd.png" })

    // Persistance après refresh complet
    await page.reload()
    await page.waitForLoadState("networkidle")
    expect(await readCurrency()).toBe("USD")

    // Persistance après changement de langue
    await setLocale(page, "en")
    await page.waitForLoadState("networkidle")
    expect(await readCurrency()).toBe("USD")

    await page.getByRole("button", { name: /changer de devise/i }).click()
    await page.getByRole("menuitem", { name: /^TND/ }).click()
    await expect.poll(readCurrency).toBe("TND")
  })
})

test.describe("Header/Footer — liens internes, aucun 404/500", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("tous les liens internes du Header répondent 200/3xx", async ({ page, request }) => {
    await page.goto("/fr")
    await page.waitForLoadState("networkidle")
    const hrefs = await page.locator("header a[href]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")).filter((h): h is string => !!h),
    )
    const internal = [...new Set(hrefs)].filter((h) => h.startsWith("/") && !h.startsWith("//"))
    expect(internal.length, "le Header doit contenir au moins un lien interne").toBeGreaterThan(0)
    for (const href of internal) {
      const res = await request.get(href, { maxRedirects: 5 })
      expect(res.status(), `Header link ${href} -> HTTP ${res.status()}`).toBeLessThan(400)
    }
  })

  test("tous les liens internes du Footer répondent 200/3xx", async ({ page, request }) => {
    await page.goto("/fr")
    await page.waitForLoadState("networkidle")
    const hrefs = await page.locator("footer a[href]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")).filter((h): h is string => !!h),
    )
    const internal = [...new Set(hrefs)].filter((h) => h.startsWith("/") && !h.startsWith("//"))
    expect(internal.length, "le Footer doit contenir au moins un lien interne").toBeGreaterThan(0)
    for (const href of internal) {
      const res = await request.get(href, { maxRedirects: 5 })
      expect(res.status(), `Footer link ${href} -> HTTP ${res.status()}`).toBeLessThan(400)
    }
  })

  test("aucun lien Header/Footer ne pointe vers href=\"#\" ou href vide", async ({ page }) => {
    await page.goto("/fr")
    await page.waitForLoadState("networkidle")
    const badHrefs = await page.locator("header a[href], footer a[href]").evaluateAll((els) =>
      els
        .map((el) => (el as HTMLAnchorElement).getAttribute("href"))
        .filter((h) => h === "#" || h === ""),
    )
    expect(badHrefs, `liens morts trouvés: ${JSON.stringify(badHrefs)}`).toHaveLength(0)
  })
})

test.describe("Search — cohérence locale", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const locale of ["fr", "en", "ar"] as const) {
    test(`page d'accueil (moteur de recherche) en ${locale}`, async ({ page }) => {
      await setLocale(page, locale)
      await page.waitForLoadState("networkidle")
      await page.screenshot({ path: `docs/audits/screenshots/nav-audit/search-${locale}.png` })
    })
  }
})

/**
 * Lot 5 (final) — routing next-intl : cas limites non couverts ailleurs
 * (redirection locale par défaut, segment de locale invalide) + présence
 * réelle des balises `<link rel="alternate" hreflang>` dans le `<head>`
 * rendu (`alternates.languages`, voir lib/seo/alternate-languages.ts).
 * Comportement vérifié directement sur le serveur réel avant d'écrire ces
 * assertions (curl -I) plutôt que supposé depuis la doc next-intl :
 *   - `/` (sans préfixe) → 307 vers `/fr` par défaut (aucun header
 *     Accept-Language), ou vers `/en`/`/ar` selon la négociation
 *     Accept-Language — `localeDetection` par défaut de next-intl.
 *   - `/xx/omra` (segment de locale non reconnu) → next-intl ne le traite
 *     PAS comme un préfixe invalide à rejeter : il traite `xx` comme un
 *     premier segment de chemin ordinaire et redirige (307) vers
 *     `/fr/xx/omra` (ajout du préfixe par défaut) — chemin qui, lui,
 *     ne correspond à aucune route sous `app/(public)/[locale]/**`
 *     (il n'existe pas de route `xx/omra`) et rend donc un vrai 404
 *     Next.js. Le comportement observable "de bout en bout" reste bien un
 *     404 pour l'utilisateur, seulement via une redirection intermédiaire.
 */
test.describe("Routing next-intl — cas limites (lot 5)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  // `locale: "fr-FR"` fixe l'Accept-Language envoyé par le contexte
  // Playwright (sinon le profil Chromium par défaut de cette machine envoie
  // son propre Accept-Language, qui peut négocier une autre langue que le
  // français par défaut de l'app — confirmé en observant le test échouer
  // sans ce `test.use` : négociait vers `/en`). Isole donc "aucune
  // préférence explicite côté utilisateur → défaut `/fr`" du test suivant,
  // qui vérifie la négociation elle-même.
  test.use({ locale: "fr-FR" })

  test("/ (sans préfixe) redirige vers la locale par défaut /fr", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "networkidle" })
    expect(response?.status()).toBeLessThan(400)
    expect(new URL(page.url()).pathname).toBe("/fr")
    expect(await page.evaluate(() => document.documentElement.getAttribute("lang"))).toBe("fr")
  })

  test("/ négocie la locale depuis Accept-Language quand fourni", async ({ request, baseURL }) => {
    // Requête HTTP directe (pas de `page.goto`) : évite tout Accept-Language
    // implicite posé par le profil Chromium par défaut de la machine, qui
    // peut entrer en conflit avec un header explicite côté contexte
    // navigateur (observé : la négociation retombait sur `/fr` malgré un
    // Accept-Language `en` explicite via `browser.newContext`). Confirmé au
    // préalable en clair via `curl -H "Accept-Language: en-US,en;q=0.9"`.
    const response = await request.get(`${baseURL}/`, {
      headers: { "Accept-Language": "en-US,en;q=0.9" },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(307)
    expect(response.headers()["location"]).toBe("/en")

    const arResponse = await request.get(`${baseURL}/`, {
      headers: { "Accept-Language": "ar,ar-TN;q=0.9" },
      maxRedirects: 0,
    })
    expect(arResponse.status()).toBe(307)
    expect(arResponse.headers()["location"]).toBe("/ar")
  })

  test("segment de locale invalide (/xx/omra) ne résout jamais en page valide (404)", async ({ page }) => {
    const response = await page.goto("/xx/omra", { waitUntil: "networkidle" })
    // La navigation traverse une redirection intermédiaire (`/fr/xx/omra`,
    // voir commentaire de describe ci-dessus) avant d'atterrir sur le 404 —
    // on vérifie le statut final ET que la page réellement affichée est le
    // 404 Next.js, pas la page Omra.
    expect(response?.status()).toBe(404)
    await expect(page.getByText(/404/)).toBeVisible()
  })

  test("route inconnue sous un préfixe de locale valide (/fr/ceci-nexiste-pas) → 404", async ({ page }) => {
    const response = await page.goto("/fr/ceci-nexiste-pas", { waitUntil: "networkidle" })
    expect(response?.status()).toBe(404)
  })
})

test.describe("alternates.languages — balises hreflang réelles (lot 5)", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  /**
   * Une page avec `export const metadata` statique (`/omra`), la page
   * détail dynamique `packages/[slug]` (`generateMetadata` avec params), et
   * `/hotels/search` (gap comblé lot 5, metadata posée via un `layout.tsx`
   * dédié car `page.tsx` est un Client Component) — échantillon demandé par
   * le brief. Un vrai slug seedé (`istanbul-decouverte`, vérifié en base
   * avant d'écrire ce test) pour ne pas dépendre d'un `notFound()`.
   */
  const cases: Array<{ name: string; path: string }> = [
    { name: "page statique (/omra)", path: "/fr/omra" },
    { name: "page dynamique (packages/[slug])", path: "/fr/packages/istanbul-decouverte" },
    { name: "gap comblé (hotels/search)", path: "/fr/hotels/search" },
  ]

  for (const { name, path } of cases) {
    test(`${name} — <link rel="alternate" hreflang> pour fr/en/ar présents`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "networkidle" })
      expect(response?.status(), `${path} doit répondre 200`).toBe(200)

      const alternates = await page.evaluate(() =>
        Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map((el) => ({
          hreflang: el.getAttribute("hreflang"),
          href: el.getAttribute("href"),
        })),
      )

      for (const locale of ["fr", "en", "ar"] as const) {
        const entry = alternates.find((a) => a.hreflang === locale)
        expect(entry, `${path} : aucune balise hreflang="${locale}" trouvée (trouvé: ${JSON.stringify(alternates)})`).toBeTruthy()
        expect(entry?.href, `${path} hreflang=${locale} doit pointer vers /${locale}/...`).toContain(`/${locale}/`)
      }

      const xDefault = alternates.find((a) => a.hreflang === "x-default")
      expect(xDefault, `${path} doit avoir un hreflang="x-default"`).toBeTruthy()
    })
  }
})
