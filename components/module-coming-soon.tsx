import type { LucideIcon } from "lucide-react"
import { Mail, Phone } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { ModuleHero } from "@/components/module-hero"
import { ModuleBackHomeLink } from "@/components/module-back-home-link"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/navigation"
import { PUBLIC_MODULES } from "@/lib/public/module-nav"
import { getRequestTenantInfo } from "@/lib/tenant/current-tenant"
import { getSiteContactInfo } from "@/lib/tenant/site-config"
import { getPublicSiteConfig } from "@/lib/public/site-content"

/**
 * Gabarit commun des modules publics PAS ENCORE DISPONIBLES EN LIGNE
 * (Visa, Bateaux & Croisières). Aucune date de lancement, aucune
 * fonctionnalité fictive : hero de marque (tokens --module-hero-*), badge de
 * statut, contacts réels de l'agence courante (même source que le footer),
 * liens vers les services disponibles.
 *
 * Sans aucun contact configuré, le bloc de contact disparaît entièrement
 * (jamais de « contactez-nous » sans moyen de contact).
 */

/** Classes littérales (détectées par Tailwind) — tokens de marque, pas de couleur par page. */
const BRAND_HERO_GRADIENT = "from-module-hero-from to-module-hero-to"

interface ModuleComingSoonProps {
  Icon: LucideIcon
  title: string
  description: string
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export async function ModuleComingSoon({
  Icon,
  title,
  description,
}: ModuleComingSoonProps) {
  const [t, tCommon, tenant, site] = await Promise.all([
    getTranslations("ModulePlaceholder"),
    getTranslations("Common"),
    getRequestTenantInfo(),
    getPublicSiteConfig(),
  ])
  const contact = await getSiteContactInfo(tenant?.agencyId ?? null)

  const rawPhone = contact?.contactPhone ?? site?.contactPhone ?? null
  const phone = rawPhone
    ? rawPhone.startsWith("+")
      ? rawPhone
      : `+${rawPhone}`
    : null
  const whatsapp = contact?.whatsappNumber?.replace(/^\+/, "") || null
  const email = site?.contactEmail ?? null
  const hasContact = Boolean(phone || whatsapp || email)

  const liveModules = PUBLIC_MODULES.filter((m) => m.searchable)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1">
        <ModuleHero
          Icon={Icon}
          gradient={BRAND_HERO_GRADIENT}
          kicker={t("statusBadge")}
          title={title}
          subtitle={description}
        />

        <div className="mx-auto max-w-xl space-y-8 px-4 py-10">
          {hasContact ? (
            <section
              aria-labelledby="coming-soon-contact"
              className="bg-card rounded-xl border p-6 text-center shadow-xs"
            >
              <h2
                id="coming-soon-contact"
                className="text-brand-ink text-lg font-semibold"
              >
                {t("contactTitle")}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {t("contactDescription")}
              </p>
              <div className="mt-5 flex flex-col gap-3">
                {phone ? (
                  <Button asChild size="lg" className="h-11 w-full">
                    <a href={`tel:${phone}`}>
                      <Phone aria-hidden="true" />
                      {t("callCta")}
                      <span dir="ltr">{phone}</span>
                    </a>
                  </Button>
                ) : null}
                {whatsapp ? (
                  <Button
                    asChild
                    size="lg"
                    variant={phone ? "outline" : "default"}
                    className="h-11 w-full"
                  >
                    <a
                      href={`https://wa.me/${whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <WhatsAppIcon className="size-4" />
                      {t("whatsappCta")}
                    </a>
                  </Button>
                ) : null}
                {email ? (
                  <Button
                    asChild
                    size="lg"
                    variant={phone || whatsapp ? "outline" : "default"}
                    className="h-11 w-full"
                  >
                    <a href={`mailto:${email}`}>
                      <Mail aria-hidden="true" />
                      {t("emailCta")}
                    </a>
                  </Button>
                ) : null}
              </div>
            </section>
          ) : null}

          <nav aria-labelledby="coming-soon-live" className="text-center">
            <h2
              id="coming-soon-live"
              className="text-muted-foreground text-sm font-medium"
            >
              {t("otherServicesTitle")}
            </h2>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {liveModules.map(({ id, labelKey, icon: ModIcon, href }) => (
                <li key={id}>
                  <Link
                    href={href}
                    className="bg-card hover:bg-primary-soft focus-visible:ring-ring/50 inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium outline-none focus-visible:ring-[3px]"
                  >
                    <ModIcon className="size-4" aria-hidden="true" />
                    {tCommon(labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <ModuleBackHomeLink label={t("backToHome")} />
      </main>
      <Footer />
    </div>
  )
}
