import { Suspense } from "react"
import { Link } from "@/i18n/navigation"
import { getTranslations } from "next-intl/server"
import { CompteLoginForm } from "@/components/compte/compte-login-form"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const metadata = {
  title: "Mon compte — Connexion | Easy2Book",
  description: "Connectez-vous pour retrouver l'historique de toutes vos réservations Easy2Book.",
  alternates: { languages: buildLanguageAlternates("/compte/connexion") },
}

export default async function CompteConnexionPage() {
  const t = await getTranslations("Compte")
  return (
    <main className="from-background via-background to-accent/10 relative flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-12">
      <div
        aria-hidden
        className="bg-primary/15 absolute -top-20 -left-20 h-72 w-72 rounded-full blur-3xl"
      />
      <div
        aria-hidden
        className="bg-secondary/20 absolute -right-20 -bottom-20 h-72 w-72 rounded-full blur-3xl"
      />
      <div className="e2b-fade-in-up relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Link href="/" aria-label={t("backHomeAria")} className="group">
            <Easy2BookLogo className="e2b-logo-pulse h-20 w-20" priority />
          </Link>
          <h1 className="text-foreground mt-6 text-2xl font-semibold tracking-tight">
            {t("connexionPageTitle")}
          </h1>
          <p className="text-muted-foreground mt-1 text-center text-sm">
            {t("connexionPageSubtitle")}
          </p>
        </div>

        <Suspense
          fallback={
            <div className="bg-card shadow-e2b-soft h-56 animate-pulse rounded-2xl border" />
          }
        >
          <CompteLoginForm />
        </Suspense>

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs">
          <p className="text-muted-foreground">
            {t("noAccountPrefix")}{" "}
            <Link href="/bookings" className="text-primary font-medium hover:underline">
              {t("lookupWithCodeLink")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
