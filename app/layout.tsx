import type { Metadata, Viewport } from "next"

import { Geist, Geist_Mono } from "next/font/google"

import { cookies } from "next/headers"

import { Analytics } from "@vercel/analytics/next"

import { SpeedInsights } from "@vercel/speed-insights/next"

import { ThemeProvider } from "@/components/theme-provider"

import { Toaster } from "@/components/ui/sonner"

import { QueryProvider } from "@/components/query-provider"

import { CurrencyProvider } from "@/components/currency-context"

import { LocaleProvider } from "@/components/locale-context"

import { getLocaleFromCookie, LOCALE_COOKIE, LOCALE_META } from "@/lib/locale"

import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"

import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })

const geistMono = Geist_Mono({
  subsets: ["latin"],

  variable: "--font-geist-mono",
})

const DEFAULT_TITLE = "Easy2Book — Centrale de Réservation : Vols, Hôtels, Omra & Voyages"
const DEFAULT_DESCRIPTION =
  "Easy2Book — Centrale de réservation : vols, hôtels en Tunisie et dans le monde, voyages organisés, Omra, transferts et location de voiture. Support local 7j/7 — +216 98 140 514."

// Favicon/icônes : `agencies` n'a aucune colonne favicon (schema vérifié) —
// toujours le fallback Easy2Book, tenant ou non (pas de fonctionnalité à
// inventer ici).
const ICONS: Metadata["icons"] = {
  icon: [
    { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
    { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
    { url: "/icon.svg", type: "image/svg+xml" },
  ],
  apple: "/apple-icon.png",
}

/** Métadonnées dynamiques par tenant White Label (brandName → title/description/OG) — voir proxy.ts + lib/tenant/current-tenant.ts. Fallback Easy2Book si aucun tenant résolu. */
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenantInfo()
  const brandName = tenant?.brandName ?? null
  const title = brandName ? `${brandName} — Centrale de Réservation en ligne` : DEFAULT_TITLE
  const description = brandName
    ? `${brandName} — Réservez vols, hôtels, Omra, voyages organisés et transferts en ligne.`
    : DEFAULT_DESCRIPTION

  return {
    title,
    description,
    manifest: "/manifest.json",
    icons: ICONS,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: brandName ?? "Easy2Book",
    },
    openGraph: {
      title,
      description,
      siteName: brandName ?? "Easy2Book",
      images: tenant?.logoUrl ? [{ url: tenant.logoUrl }] : undefined,
    },
  }
}

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const locale = getLocaleFromCookie(cookieStore.get(LOCALE_COOKIE)?.value)

  return (
    <html
      lang={locale}
      dir={LOCALE_META[locale].dir}
      className={`${geistSans.variable} ${geistMono.variable} bg-background`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <LocaleProvider initialLocale={locale}>
            <CurrencyProvider>
              <QueryProvider>
                {children}

                <Toaster richColors position="top-center" />
              </QueryProvider>
            </CurrencyProvider>
          </LocaleProvider>
        </ThemeProvider>

        {process.env.NODE_ENV === "production" && (
          <>
            <Analytics />

            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  )
}
