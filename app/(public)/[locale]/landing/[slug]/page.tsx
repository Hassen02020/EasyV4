/**
 * Landing page de campagne — /landing/[slug] (CRM-LANDING-01).
 *
 * Page d'arrivée des campagnes (Meta, TikTok, Google, partenaires) : un
 * formulaire de demande avec consentement explicite et attribution de
 * campagne (?utm_campaign= / ?campaign=, lus sur cette page même). Contenu
 * factuel uniquement (lib/crm/landing-config.ts). Non indexée : une page de
 * campagne ne doit pas concurrencer les pages produit dans les moteurs.
 */

import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { CheckCircle2, Megaphone } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleHero } from "@/components/module-hero"
import { LeadCaptureForm } from "@/components/leads/lead-capture-form"
import { Link } from "@/i18n/navigation"
import { findLandingConfig } from "@/lib/crm/landing-config"

interface PageProps {
  params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const config = findLandingConfig(slug)
  if (!config) return {}
  const t = await getTranslations("Landing")
  const title = t(`${config.i18nKey}Title`)
  return {
    // Convention « Titre | Easy2Book », sans répéter la marque déjà présente.
    title: title.includes("Easy2Book") ? title : `${title} | Easy2Book`,
    description: t(`${config.i18nKey}Subtitle`),
    robots: { index: false, follow: true },
  }
}

export default async function LandingPage({ params }: PageProps) {
  const { slug } = await params
  const config = findLandingConfig(slug)
  if (!config) notFound()

  const t = await getTranslations("Landing")
  const benefits = [t("benefit1"), t("benefit2"), t("benefit3")]

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={Megaphone}
          gradient={config.gradient}
          kicker={t("kicker")}
          title={t(`${config.i18nKey}Title`)}
          subtitle={t(`${config.i18nKey}Subtitle`)}
        />
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2">
          <div className="space-y-5">
            <ul className="space-y-3">
              {benefits.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href={config.listingHref}
              className="text-primary text-sm font-medium underline underline-offset-4"
            >
              {t("browseOffers")}
            </Link>
          </div>
          <div className="bg-background rounded-xl">
            <LeadCaptureForm
              productType={config.productType}
              title={t("formTitle")}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
