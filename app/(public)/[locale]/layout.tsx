import type { Metadata, Viewport } from "next"

import { notFound } from "next/navigation"

import { hasLocale, NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"

import { RootShell } from "@/components/root-shell"

import { CurrencyProvider } from "@/components/currency-context"

import { routing } from "@/i18n/routing"

import { LOCALE_META, type Locale } from "@/lib/locale"

import { buildSiteMetadata } from "@/lib/seo/site-metadata"

export async function generateMetadata(): Promise<Metadata> {
  return buildSiteMetadata()
}

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  // Rend `useTranslations()`/`useLocale()` etc. disponibles côté Server
  // Components de cette arborescence sans avoir à repasser `locale` partout.
  setRequestLocale(locale)

  return (
    <NextIntlClientProvider locale={locale}>
      <CurrencyProvider>
        <RootShell lang={locale} dir={LOCALE_META[locale as Locale].dir}>
          {children}
        </RootShell>
      </CurrencyProvider>
    </NextIntlClientProvider>
  )
}
