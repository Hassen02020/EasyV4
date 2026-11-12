"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"

/**
 * Bloc Omra de la page d'accueil.
 *
 * OMRA-HOME-VISUAL-01 : `imageUrl` = visuel du module Omra choisi dans
 * l'administration (voir pickOmraHomeImage). Absent → texte seul, jamais une
 * image inventée. Le bouton mène à la page Omra.
 */
export function OmratySection({ imageUrl }: { imageUrl?: string | null }) {
  const t = useTranslations("Common")
  return (
    <section className="bg-muted/50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
          <div
            className={imageUrl ? "grid grid-cols-1 lg:grid-cols-2" : undefined}
          >
            <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
              <h2 className="text-sidebar mb-3 text-2xl font-bold sm:text-3xl">
                {t("omraTitle")}
              </h2>
              <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
                {t("omraSubtitle")}
              </p>
              <div className="mt-6">
                <Button asChild>
                  <Link href="/omra">{t("decouvrir")}</Link>
                </Button>
              </div>
            </div>
            {imageUrl ? (
              <div
                data-testid="omra-home-image"
                role="img"
                aria-label={t("omraTitle")}
                className="h-56 bg-cover bg-center lg:h-auto lg:min-h-64"
                style={{ backgroundImage: `url("${imageUrl}")` }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
