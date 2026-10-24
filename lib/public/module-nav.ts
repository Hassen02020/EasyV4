import {
  Briefcase,
  Building2,
  Car,
  Compass,
  Globe,
  Moon,
  Navigation,
  Plane,
} from "lucide-react"

/**
 * Modules commerciaux publics — source unique partagée par le moteur de
 * recherche de l'accueil et la navigation du header. `id` = `moduleSlug` de
 * `public_module_visuals`.
 */
export const PUBLIC_MODULES = [
  {
    id: "hotels-tunisie",
    labelKey: "tabHotelsTunisie",
    icon: Building2,
    href: "/hotels",
  },
  {
    id: "hotels-monde",
    labelKey: "tabHotelsMonde",
    icon: Globe,
    href: "/hotels-monde",
  },
  { id: "omraty", labelKey: "tabOmraty", icon: Moon, href: "/omra" },
  {
    id: "voyages-organises",
    labelKey: "tabVoyages",
    icon: Briefcase,
    href: "/packages",
  },
  {
    id: "attractions",
    labelKey: "tabAttractions",
    icon: Compass,
    href: "/attractions",
  },
  { id: "vols", labelKey: "tabVols", icon: Plane, href: "/vols" },
  {
    id: "transferts",
    labelKey: "tabTransferts",
    icon: Navigation,
    href: "/transferts",
  },
  { id: "car", labelKey: "tabCar", icon: Car, href: "/car" },
] as const

export type PublicModule = (typeof PUBLIC_MODULES)[number]
export type PublicModuleId = PublicModule["id"]

export type PublicModuleVisual = {
  moduleSlug: string
  enabled: boolean
  sortOrder: number
  heroImageUrl: string | null
}

/**
 * Modules à afficher, dans l'ordre de PUBLIC_MODULES. Liste vide (DB
 * indisponible) → tous les modules, pour que la navigation reste utilisable.
 */
export function getVisiblePublicModules(
  modules: readonly Pick<PublicModuleVisual, "moduleSlug" | "enabled">[],
): PublicModule[] {
  const enabled = modules.filter((module) => module.enabled)
  if (enabled.length === 0) return [...PUBLIC_MODULES]
  return PUBLIC_MODULES.filter((tab) =>
    enabled.some((module) => module.moduleSlug === tab.id),
  )
}
