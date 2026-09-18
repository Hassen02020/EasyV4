import { defineRouting } from "next-intl/routing"

/**
 * Configuration next-intl unique — routes du storefront public préfixées
 * `/fr`, `/en`, `/ar` (localePrefix "always" : même le français par défaut
 * a toujours un préfixe explicite, voir plan i18n §"Décision technique").
 *
 * Le back-office (`/admin`, `/pro`, `/b2b`, `/mutuelle`, `/login`, ...) est
 * hors périmètre de ce routing — voir `lib/tenant/route-scope.ts` /
 * `proxy.ts` pour la logique qui exempte ces chemins du middleware next-intl.
 */
export const routing = defineRouting({
  locales: ["fr", "en", "ar"],
  defaultLocale: "fr",
  localePrefix: "always",
})
