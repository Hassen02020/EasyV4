import {
  getPublicModuleVisuals,
  getPublicSiteConfig,
} from "@/lib/public/site-content"
import {
  savePublicModuleVisual,
  savePublicPromotion,
  savePublicSiteSettings,
} from "@/lib/admin/public-site-actions"
import { SiteImageField } from "@/components/admin/site-image-field"
import { SiteVideoField } from "@/components/admin/site-video-field"
import { listAdminPromotions } from "@/lib/admin/public-site-queries"
import {
  PROMOTION_MODULES,
  promotionStatus,
  toTunisLocalInput,
  type PromotionStatus,
} from "@/lib/public/site-admin-core"

export const dynamic = "force-dynamic"

const MODULES = [
  ["hotels-tunisie", "Hôtels Tunisie"],
  ["hotels-monde", "Hôtels Monde"],
  ["omraty", "Omra"],
  ["voyages-organises", "Voyages organisés"],
  ["attractions", "Attractions"],
  ["vols", "Vols"],
  ["transferts", "Transferts"],
  ["car", "Cars"],
] as const

export default async function PublicSiteAdminPage() {
  const [site, visuals, promotions] = await Promise.all([
    getPublicSiteConfig(),
    getPublicModuleVisuals(),
    listAdminPromotions(),
  ])

  const visualByModule = new Map(visuals.map((v) => [v.moduleSlug, v]))

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Site public — visuels & contenu</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Source de vérité publique pour Hero, modules, promotions et contact.
          Les pages publiques ne choisissent plus ces images dans le code.
        </p>
      </div>

      <section className="bg-card border-border rounded-xl border p-6">
        <h2 className="mb-4 text-lg font-semibold">
          Identité, Hero principal & contact
        </h2>
        <form
          action={savePublicSiteSettings}
          className="grid gap-4 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <SiteImageField
              name="logoUrl"
              slot="logo"
              label="Logo public"
              defaultValue={site?.logoUrl}
            />
          </div>
          <div className="md:col-span-2">
            <SiteImageField
              name="heroImageUrl"
              slot="hero"
              label="Hero principal"
              defaultValue={site?.heroImageUrl}
            />
          </div>
          <div className="md:col-span-2">
            <SiteVideoField
              name="heroVideoUrl"
              label="Vidéo Hero (accueil)"
              defaultValue={site?.heroVideoUrl}
            />
          </div>
          <label className="space-y-1 text-sm">
            <span>Email public</span>
            <input
              name="contactEmail"
              type="email"
              defaultValue={site?.contactEmail ?? ""}
              className="border-border bg-background w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Téléphone public</span>
            <input
              name="contactPhone"
              defaultValue={site?.contactPhone ?? ""}
              className="border-border bg-background w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Adresse publique</span>
            <input
              name="address"
              defaultValue={site?.address ?? ""}
              className="border-border bg-background w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Facebook</span>
            <input
              name="facebookUrl"
              defaultValue={site?.facebookUrl ?? ""}
              className="border-border bg-background w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Instagram</span>
            <input
              name="instagramUrl"
              defaultValue={site?.instagramUrl ?? ""}
              className="border-border bg-background w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>TikTok</span>
            <input
              name="tiktokUrl"
              defaultValue={site?.tiktokUrl ?? ""}
              className="border-border bg-background w-full rounded-md border px-3 py-2"
            />
          </label>
          <div className="md:col-span-2">
            <button className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold">
              Enregistrer la configuration publique
            </button>
          </div>
        </form>
      </section>

      <section className="bg-card border-border rounded-xl border p-6">
        <h2 className="mb-4 text-lg font-semibold">Hero des modules</h2>
        <div className="space-y-4">
          {MODULES.map(([slug, label]) => {
            const visual = visualByModule.get(slug)
            return (
              <form
                key={slug}
                action={savePublicModuleVisual}
                className="border-border grid gap-3 rounded-lg border p-4 md:grid-cols-[180px_1fr_100px_auto] md:items-end"
              >
                <input type="hidden" name="moduleSlug" value={slug} />
                <input
                  type="hidden"
                  name="sortOrder"
                  value={visual?.sortOrder ?? 0}
                />
                <label className="space-y-1 text-sm">
                  <span>Module</span>
                  <input
                    readOnly
                    value={label}
                    className="bg-muted w-full rounded-md px-3 py-2"
                  />
                </label>
                <SiteImageField
                  name="heroImageUrl"
                  slot="module"
                  label="Image Hero"
                  defaultValue={visual?.heroImageUrl}
                />
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={visual?.enabled ?? true}
                  />
                  Actif
                </label>
                <button className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold">
                  Enregistrer
                </button>
              </form>
            )
          })}
        </div>
      </section>

      <section className="bg-card border-border rounded-xl border p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Promotions & bannières</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Une promotion n&apos;apparaît sur le site que si elle est active et
            dans ses dates (heure de Tunis). Le site en affiche 6 au maximum,
            dans l&apos;ordre croissant.
          </p>
        </div>
        <div className="space-y-4">
          <PromotionForm
            key="new"
            title="Nouvelle promotion"
            sortOrder={(promotions.length + 1) * 10}
          />
          {promotions.map((promotion) => (
            <PromotionForm
              key={promotion.id}
              promotion={promotion}
              status={promotionStatus(promotion)}
              sortOrder={promotion.sortOrder}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

const STATUS_LABEL: Record<PromotionStatus, [string, string]> = {
  active: [
    "En ligne",
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  ],
  scheduled: [
    "Programmée",
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  ],
  expired: [
    "Expirée",
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  ],
  disabled: ["Désactivée", "bg-muted text-muted-foreground"],
}

type AdminPromotion = Awaited<ReturnType<typeof listAdminPromotions>>[number]

const inputClass =
  "border-border bg-background w-full rounded-md border px-3 py-2"

function PromotionForm({
  promotion,
  status,
  title,
  sortOrder,
}: {
  promotion?: AdminPromotion
  status?: PromotionStatus
  title?: string
  sortOrder: number
}) {
  const moduleOptions = PROMOTION_MODULES.some(
    ([slug]) => slug === promotion?.moduleSlug,
  )
    ? PROMOTION_MODULES
    : promotion
      ? ([
          ...PROMOTION_MODULES,
          [promotion.moduleSlug, promotion.moduleSlug],
        ] as const)
      : PROMOTION_MODULES

  return (
    <form
      action={savePublicPromotion}
      className={`grid gap-3 rounded-lg border p-4 md:grid-cols-2 ${
        promotion ? "border-border" : "border-primary/40 border-dashed"
      }`}
    >
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <h3 className="font-semibold">{title ?? promotion?.title}</h3>
        {status ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_LABEL[status][1]}`}
          >
            {STATUS_LABEL[status][0]}
          </span>
        ) : null}
      </div>
      {promotion ? (
        <input type="hidden" name="id" value={promotion.id} />
      ) : null}
      <label className="space-y-1 text-sm">
        <span>Titre</span>
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={promotion?.title ?? ""}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>Sous-titre</span>
        <input
          name="subtitle"
          maxLength={300}
          defaultValue={promotion?.subtitle ?? ""}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>Destination</span>
        <input
          name="destination"
          required
          maxLength={120}
          defaultValue={promotion?.destination ?? ""}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>Module</span>
        <select
          name="moduleSlug"
          defaultValue={promotion?.moduleSlug ?? "hotels-tunisie"}
          className={inputClass}
        >
          {moduleOptions.map(([slug, label]) => (
            <option key={slug} value={slug}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span>Lien public (commence par /)</span>
        <input
          name="href"
          required
          pattern="/.*"
          placeholder="/omra"
          defaultValue={promotion?.href ?? ""}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>Badge (ex. -20%, Nouveau)</span>
        <input
          name="flag"
          maxLength={16}
          defaultValue={promotion?.flag ?? ""}
          className={inputClass}
        />
      </label>
      <div className="md:col-span-2">
        <SiteImageField
          name="imageUrl"
          slot="promo"
          label="Image"
          defaultValue={promotion?.imageUrl}
          required
        />
      </div>
      <label className="space-y-1 text-sm">
        <span>Début (heure de Tunis, vide = immédiat)</span>
        <input
          type="datetime-local"
          name="startsAt"
          defaultValue={toTunisLocalInput(promotion?.startsAt ?? null)}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>Fin (vide = sans fin)</span>
        <input
          type="datetime-local"
          name="endsAt"
          defaultValue={toTunisLocalInput(promotion?.endsAt ?? null)}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span>Ordre d&apos;affichage</span>
        <input
          type="number"
          name="sortOrder"
          step={1}
          defaultValue={sortOrder}
          className={inputClass}
        />
      </label>
      <div className="flex items-end justify-between gap-3">
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={promotion?.enabled ?? true}
          />
          Active
        </label>
        <button className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold">
          {promotion ? "Enregistrer" : "Créer la promotion"}
        </button>
      </div>
    </form>
  )
}
