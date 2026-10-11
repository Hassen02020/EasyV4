"use client"

import { useTranslations } from "next-intl"

function OmratySectionContent() {
  const t = useTranslations("Common")
  return (
    <>
      <h2 className="text-sidebar mb-3 text-2xl font-bold sm:text-3xl">
        {t("omraTitle")}
      </h2>
      <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
        {t("omraSubtitle")}
      </p>
    </>
  )
}

export function OmratySection() {
  return (
    <section className="bg-muted/50 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
          <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
            <OmratySectionContent />
          </div>
        </div>
      </div>
    </section>
  )
}
