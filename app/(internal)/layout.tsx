import type { Metadata } from "next"

import { RootShell } from "@/components/root-shell"

import { buildSiteMetadata } from "@/lib/seo/site-metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildSiteMetadata()
}

/**
 * Root layout du back-office (`/admin`, `/pro`, `/b2b`, `/mutuelle`, `/login`,
 * `/unauthorized`, `/error/403`) — reste en français, non préfixé, une seule
 * devise. Pas de `NextIntlClientProvider`/`CurrencyProvider` ici : ce
 * périmètre n'utilise ni next-intl ni le sélecteur de devise storefront.
 */
export default function InternalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <RootShell lang="fr" dir="ltr">
      {children}
    </RootShell>
  )
}
