import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/sonner"
import { LanguageCurrencyProvider } from "@/lib/i18n/LanguageCurrencyContext"
import { HtmlAttributes } from "@/components/html-attributes"
import "./globals.css"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: "Easy2Book — Centrale de Réservation",
  description:
    "Easy2Book — Centrale de réservation pour vos vols, hôtels en Tunisie et dans le monde, voyages organisés, Omra, transferts et location de voiture. Support local 7j/7 — +216 98 140 514.",
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
    >
      <body className="font-sans antialiased">
        <LanguageCurrencyProvider>
          <HtmlAttributes />
          {children}
          <Toaster richColors position="top-center" />
          {process.env.NODE_ENV === "production" && <Analytics />}
        </LanguageCurrencyProvider>
      </body>
    </html>
  )
}
