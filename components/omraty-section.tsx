"use client"

import Image from "next/image"
import { useT } from "@/components/locale-context"

function OmratySectionContent() {
  const t = useT()
  return (
    <>
      <h2 className="mb-3 text-2xl font-bold text-[#1e3a5f] sm:text-3xl">
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

            {/* Image */}
            <div className="relative h-64 lg:h-auto">
              <Image
                src="https://images.unsplash.com/photo-1564769625905-50e93615e769?w=800&h=500&fit=crop"
                alt="Omraty - Programme de pèlerinage"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
