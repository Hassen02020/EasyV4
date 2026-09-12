import { createNavigation } from "next-intl/navigation"

import { routing } from "./routing"

/**
 * Équivalents locale-aware de `next/link` / `next/navigation` pour tout le
 * périmètre storefront public (`app/(public)/[locale]/**`) — remplace les
 * imports directs de `next/link`/`next/navigation` afin que chaque
 * navigation interne reste sous le bon préfixe de locale (`/fr`, `/en`,
 * `/ar`). Ne pas utiliser dans le périmètre back-office (`app/(internal)/**`),
 * qui n'est jamais enveloppé par `NextIntlClientProvider`.
 */
export const { Link, redirect, permanentRedirect, useRouter, usePathname, getPathname } =
  createNavigation(routing)
