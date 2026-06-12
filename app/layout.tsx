import type { Metadata, Viewport } from "next"

import { Geist, Geist_Mono } from "next/font/google"

import { Analytics } from "@vercel/analytics/next"

import { SpeedInsights } from "@vercel/speed-insights/next"

import { ThemeProvider } from "@/components/theme-provider"

import { Toaster } from "@/components/ui/sonner"

import { QueryProvider } from "@/components/query-provider"

import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })

const geistMono = Geist_Mono({
  subsets: ["latin"],

  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: "Easy2Book — Centrale de Réservation : Vols, Hôtels, Omra & Voyages",

  description:
    "Easy2Book — Centrale de réservation : vols, hôtels en Tunisie et dans le monde, voyages organisés, Omra, transferts et location de voiture. Support local 7j/7 — +216 98 140 514.",

  manifest: "/manifest.json",

  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",

        media: "(prefers-color-scheme: light)",
      },

      {
        url: "/icon-dark-32x32.png",

        media: "(prefers-color-scheme: dark)",
      },

      {
        url: "/icon.svg",

        type: "image/svg+xml",
      },
    ],

    apple: "/apple-icon.png",
  },

  appleWebApp: {
    capable: true,

    statusBarStyle: "default",

    title: "Easy2Book",
  },
}

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="fr"
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
