"use client"

import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"

const OMRA_IMAGE =
  "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=1600&h=900&fit=crop"

function OmratySectionContent() {
  const t = useTranslations("Common")

  return (
    <div className="flex flex-col items-start justify-center p-6 sm:p-8 lg:p-10">
      <h2 className="text-sidebar mb-3 text-2xl font-bold sm:text-3xl">
        {t("omraTitle")}
      </h2>
      <p className="text-muted-foreground max-w-xl text-base leading-relaxed sm:text-lg">
        {t("omraSubtitle")}
      </p>
      <Button asChild className="mt-6">
        <Link href="/omra">{t("decouvrir")}</Link>
      </Button>
    </div>
  )
}

export function OmratySection() {
  const t = useTranslations("Common")

  return (
    <section className="bg-muted/50 py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="bg-card border-border grid overflow-hidden rounded-2xl border shadow-sm md:grid-cols-[0.95fr_1.05fr]">
          <div className="relative min-h-56 sm:min-h-64 md:min-h-[300px]">
            <Image
              src={OMRA_IMAGE}
              alt={t("omraImageAlt")}
              fill
              sizes="(max-width: 768px) 100vw, 45vw"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-black/10"
            />
          </div>
          <OmratySectionContent />
        </div>
      </div>
    </section>
  )
}
