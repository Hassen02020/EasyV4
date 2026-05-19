import { test, expect } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

/**
 * Tests d'accessibilité — axe-core sur les pages critiques.
 *
 * Seuil : 0 violation "serious" ou "critical".
 */

const CRITICAL_PAGES = [
  { name: "Home", url: "/" },
  { name: "Login", url: "/login" },
  { name: "Admin Dashboard", url: "/admin" },
  { name: "Admin Reservations", url: "/admin/reservations" },
  { name: "Booking", url: "/booking" },
]

test.describe("Accessibility (axe-core)", () => {
  for (const page of CRITICAL_PAGES) {
    test(`no critical/serious violations on ${page.name}`, async ({
      page: pwPage,
    }) => {
      await pwPage.goto(page.url)
      await pwPage.waitForLoadState("networkidle")

      const accessibilityScanResults = await new AxeBuilder({ page: pwPage })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()

      const serious = accessibilityScanResults.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      )

      expect(
        serious,
        `${serious.length} serious/critical a11y violations on ${page.url}`,
      ).toHaveLength(0)
    })
  }
})
