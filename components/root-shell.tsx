import type { CSSProperties, ReactNode } from "react"

import { Geist, Geist_Mono } from "next/font/google"

import { Analytics } from "@vercel/analytics/next"

import { SpeedInsights } from "@vercel/speed-insights/next"

import { ThemeProvider } from "@/components/theme-provider"

import { Toaster } from "@/components/ui/sonner"

import { QueryProvider } from "@/components/query-provider"

import "@/app/globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })

const geistMono = Geist_Mono({
  subsets: ["latin"],

  variable: "--font-geist-mono",
})

import { brandColorVars } from "@/lib/theme/brand-color"

/**
 * Coquille racine partagée par les deux root layouts (`app/(public)/[locale]/layout.tsx`
 * et `app/(internal)/layout.tsx`) — polices, thème, React Query, Analytics,
 * Toaster. Pas de logique i18n ici : `lang`/`dir` sont fournis par l'appelant
 * (segment de locale pour le storefront public, valeurs figées `fr`/`ltr`
 * pour le back-office).
 */
export function RootShell({
  lang,
  dir,
  primaryColor,
  children,
}: {
  lang: string
  dir: "ltr" | "rtl"
  /** Couleur d'accent de l'agence (`#RRGGBB`) : tenant White Label, sinon agence Easy2Book (/admin/brand) ; absente = teinte par défaut. */
  primaryColor?: string | null
  children: ReactNode
}) {
  // Revalidée dans brandColorVars (valeur d'origine base de données posée
  // dans un attribut `style`) ; texte des boutons choisi pour le contraste.
  const brandVars = brandColorVars(primaryColor)

  return (
    <html
      lang={lang}
      dir={dir}
      className={`${geistSans.variable} ${geistMono.variable} bg-background`}
      style={brandVars ? (brandVars as CSSProperties) : undefined}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}

            <Toaster richColors position="top-center" />
          </QueryProvider>
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
