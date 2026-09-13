import type { ReactNode } from "react"

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
  children,
}: {
  lang: string
  dir: "ltr" | "rtl"
  children: ReactNode
}) {
  return (
    <html
      lang={lang}
      dir={dir}
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
