/**
 * Désinscription des emails de campagne — /desabonnement/[id]
 * (CRM-CAMPAIGN-SAFETY-01). Lien présent dans chaque email de campagne ;
 * `id` = identifiant de la cible de campagne. La page n'affiche aucune
 * donnée personnelle et n'agit qu'après un clic de confirmation.
 */

import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { UnsubscribeConfirm } from "@/components/crm/unsubscribe-confirm"

interface PageProps {
  params: Promise<{ locale: string; id: string }>
}

export async function generateMetadata() {
  const t = await getTranslations("Unsubscribe")
  return {
    title: `${t("title")} | Easy2Book`,
    robots: { index: false, follow: false },
  }
}

export default async function UnsubscribePage({ params }: PageProps) {
  const { id } = await params
  const t = await getTranslations("Unsubscribe")
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <div className="mx-auto max-w-xl space-y-4 px-4 py-16">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
          <UnsubscribeConfirm targetId={id} />
        </div>
      </main>
      <Footer />
    </div>
  )
}
