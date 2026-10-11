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
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Content */}
            <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
              <OmratySectionContent />
            </div>

            {/* Local SVG illustration — no external network dependency */}
            <div className="relative h-64 overflow-hidden lg:h-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/omra-banner.svg"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
