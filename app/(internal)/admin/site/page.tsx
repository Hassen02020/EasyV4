import { getPublicModuleVisuals, getPublicPromotions, getPublicSiteConfig } from "@/lib/public/site-content"
import { savePublicModuleVisual, savePublicPromotion, savePublicSiteSettings } from "@/lib/admin/public-site-actions"

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
    getPublicPromotions(),
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
        <h2 className="mb-4 text-lg font-semibold">Identité, Hero principal & contact</h2>
        <form action={savePublicSiteSettings} className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Logo public — URL image</span>
            <input
              name="logoUrl"
              defaultValue={site?.logoUrl ?? ""}
              placeholder="https://..."
              className="border-border bg-background w-full rounded-md border px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>Hero principal — URL image</span>
            <input
              name="heroImageUrl"
              defaultValue={site?.heroImageUrl ?? ""}
              placeholder="https://..."
              className="border-border bg-background w-full rounded-md border px-3 py-2"
            />
          </label>
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
            <input name="facebookUrl" defaultValue={site?.facebookUrl ?? ""} className="border-border bg-background w-full rounded-md border px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span>Instagram</span>
            <input name="instagramUrl" defaultValue={site?.instagramUrl ?? ""} className="border-border bg-background w-full rounded-md border px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span>TikTok</span>
            <input name="tiktokUrl" defaultValue={site?.tiktokUrl ?? ""} className="border-border bg-background w-full rounded-md border px-3 py-2" />
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
              <form key={slug} action={savePublicModuleVisual} className="border-border grid gap-3 rounded-lg border p-4 md:grid-cols-[180px_1fr_100px_auto] md:items-end">
                <input type="hidden" name="moduleSlug" value={slug} />
                <input type="hidden" name="sortOrder" value={visual?.sortOrder ?? 0} />
                <label className="space-y-1 text-sm">
                  <span>Module</span>
                  <input readOnly value={label} className="bg-muted w-full rounded-md px-3 py-2" />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Image Hero</span>
                  <input name="heroImageUrl" defaultValue={visual?.heroImageUrl ?? ""} placeholder="https://..." className="border-border bg-background w-full rounded-md border px-3 py-2" />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="enabled" defaultChecked={visual?.enabled ?? true} />
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
        <h2 className="mb-4 text-lg font-semibold">Promotions publiques</h2>
        <div className="space-y-4">
          {promotions.map((promotion) => (
            <form key={promotion.id} action={savePublicPromotion} className="border-border grid gap-3 rounded-lg border p-4 md:grid-cols-2">
              <input type="hidden" name="id" value={promotion.id} />
              <input type="hidden" name="sortOrder" value={String(promotions.indexOf(promotion) * 10 + 10)} />
              <label className="space-y-1 text-sm">
                <span>Titre</span>
                <input name="title" defaultValue={promotion.title} className="border-border bg-background w-full rounded-md border px-3 py-2" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Sous-titre</span>
                <input name="subtitle" defaultValue={promotion.subtitle ?? ""} className="border-border bg-background w-full rounded-md border px-3 py-2" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Destination</span>
                <input name="destination" defaultValue={promotion.destination} className="border-border bg-background w-full rounded-md border px-3 py-2" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Module</span>
                <input name="moduleSlug" defaultValue={promotion.moduleSlug} className="border-border bg-background w-full rounded-md border px-3 py-2" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Lien public</span>
                <input name="href" defaultValue={promotion.href} className="border-border bg-background w-full rounded-md border px-3 py-2" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Image</span>
                <input name="imageUrl" defaultValue={promotion.image} className="border-border bg-background w-full rounded-md border px-3 py-2" />
              </label>
              <label className="space-y-1 text-sm">
                <span>Drapeau</span>
                <input name="flag" defaultValue={promotion.flag ?? ""} className="border-border bg-background w-full rounded-md border px-3 py-2" />
              </label>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked />
                Actif
              </label>
              <div className="flex items-end">
                <button className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-semibold">Enregistrer</button>
              </div>
            </form>
          ))}
        </div>
      </section>
    </div>
  )
}
