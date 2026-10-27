import {
  Briefcase,
  Building2,
  Car,
  Compass,
  Globe,
  Moon,
  Navigation,
  Plane,
  Ship,
  Stamp,
} from "lucide-react"

/**
 * Modules commerciaux publics — source unique partagée par le moteur de
 * recherche de l'accueil et la navigation du header. `id` = `moduleSlug` de
 * `public_module_visuals`.
 *
 * `searchable: false` : module affiché dans la navigation du header
 * uniquement — pas d'onglet dans le moteur de recherche de l'accueil (pas
 * de formulaire de réservation pour ce module).
 */
export const PUBLIC_MODULES = [
  {
    id: "hotels-tunisie",
    labelKey: "tabHotelsTunisie",
    icon: Building2,
    href: "/hotels",
    searchable: true,
  },
  {
    id: "hotels-monde",
    labelKey: "tabHotelsMonde",
    icon: Globe,
    href: "/hotels-monde",
    searchable: true,
  },
  {
    id: "omraty",
    labelKey: "tabOmraty",
    icon: Moon,
    href: "/omra",
    searchable: true,
  },
  {
    id: "voyages-organises",
    labelKey: "tabVoyages",
    icon: Briefcase,
    href: "/packages",
    searchable: true,
  },
  {
    id: "bateaux-croisieres",
    labelKey: "tabCroisieres",
    icon: Ship,
    href: "/croisieres",
    searchable: false,
  },
  {
    id: "attractions",
    labelKey: "tabAttractions",
    icon: Compass,
    href: "/attractions",
    searchable: true,
  },
  {
    id: "vols",
    labelKey: "tabVols",
    icon: Plane,
    href: "/vols",
    searchable: true,
  },
  {
    id: "transferts",
    labelKey: "tabTransferts",
    icon: Navigation,
    href: "/transferts",
    searchable: true,
  },
  {
    id: "car",
    labelKey: "tabCar",
    icon: Car,
    href: "/car",
    searchable: true,
  },
  {
    id: "visa",
    labelKey: "tabVisa",
    icon: Stamp,
    href: "/visa",
    searchable: false,
  },
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
