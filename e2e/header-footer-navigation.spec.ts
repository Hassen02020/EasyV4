import { test, expect, type Page } from "@playwright/test"

/**
 * Audit Header/Footer/Navigation — mission "AUDIT COMPLET HEADER / FOOTER /
 * NAVIGATION / LIENS MORTS". Couvre : rendu FR/EN/AR desktop+mobile, RTL,
 * persistance devise, absence de lien mort dans le Header/Footer, et le
 * statut HTTP réel de chaque route commerciale référencée.
 *
 * Le switch de langue passe par une navigation complète (`/api/set-locale`
 * pose un cookie puis redirige, voir components/language-switcher.tsx) —
 * jamais une simple injection de cookie qui laisserait le SSR initial
 * incohérent avec le client.
 */

async function setLocale(page: Page, locale: "fr" | "en" | "ar") {
  await page.goto(`/api/set-locale?locale=${locale}&redirectTo=%2F`)
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
    await page.goto("/")
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
    await page.goto("/omra")
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
    await page.goto("/")
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
    await page.goto("/")
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
    await page.goto("/")
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
