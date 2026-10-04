import Image from "next/image"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { useTranslations } from "next-intl"
import { getPublicPromotions } from "@/lib/public/site-content"

/**
 * Public promotions are editorial data.
 * The component only renders the active rows selected by the server query.
 */
export async function FlashOffers() {
  const t = useTranslations("Common")
  const offers = await getPublicPromotions()

  if (offers.length === 0) return null

  return (
    <section className="bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-foreground mb-8 text-2xl font-bold sm:text-3xl">
          {t("meilleurOffres")}
        </h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="bg-card border-border overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-lg"
            >
              <div className="relative h-48 sm:h-56">
                <Image
                  src={offer.image}
                  alt={offer.destination}
                  fill
                  className="object-cover"
                />
              </div>

              <div className="p-4 sm:p-5">
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="text-foreground flex items-center gap-2 text-lg font-bold">
                      {offer.destination}
                      {offer.flag ? (
                        <span className="text-base">{offer.flag}</span>
                      ) : null}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {offer.subtitle ?? offer.title}
                    </p>
                  </div>
                </div>

                <div className="border-border flex items-center justify-end border-t pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    asChild
                  >
                    <Link href={offer.href}>{t("reserverMaintenant")}</Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
