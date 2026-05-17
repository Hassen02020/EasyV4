/**
 * Sources statiques pour le moteur de recherche du portail B2B :
 *  - destinations (villes / régions tunisiennes)
 *  - chaînes hôtelières disponibles dans le catalogue
 *
 * Données extraites des fixtures MyGo (`lib/mygo/__fixtures__/listcity.json`)
 * + saisie manuelle pour chaînes courantes (Mouradi, Iberostar, Magic, …).
 *
 * Le compteur `hotelsCount` est une estimation indicative reproduisant
 * l'autocomplete affiché par le portail myGO référent dans les captures de
 * cahier des charges (Tunis 55, Gammarth 12, Hammamet 86, Sousse 48…).
 * Ces valeurs ne servent qu'à l'UI ; les vrais comptes seront fournis par
 * la couche backend SERP en Phase 4.
 */

export type DestinationKind = "all" | "region" | "city" | "chain"

export type Destination = {
  id: string
  kind: DestinationKind
  label: string
  region?: string
  country?: string
  hotelsCount?: number
  /** ID MyGo de la ville (pour passer dans l'URL SERP). */
  cityId?: number
}

const CITIES: Destination[] = [
  {
    id: "all-tunisia",
    kind: "all",
    label: "Toute la Tunisie",
    country: "Tunisie",
    hotelsCount: 412,
  },
  { id: "city-32", kind: "city", label: "Tunis", region: "Tunis & Côtes de Carthage", country: "Tunisie", cityId: 32, hotelsCount: 55 },
  { id: "city-6485", kind: "city", label: "Gammarth", region: "Tunis & Côtes de Carthage", country: "Tunisie", cityId: 6485, hotelsCount: 12 },
  { id: "city-10", kind: "city", label: "Hammamet", region: "Cap Bon", country: "Tunisie", cityId: 10, hotelsCount: 86 },
  { id: "city-11", kind: "city", label: "Nabeul", region: "Cap Bon", country: "Tunisie", cityId: 11, hotelsCount: 14 },
  { id: "city-12", kind: "city", label: "Kelibia", region: "Cap Bon", country: "Tunisie", cityId: 12, hotelsCount: 5 },
  { id: "city-13", kind: "city", label: "Korba", region: "Cap Bon", country: "Tunisie", cityId: 13, hotelsCount: 4 },
  { id: "city-14", kind: "city", label: "Korbous", region: "Cap Bon", country: "Tunisie", cityId: 14, hotelsCount: 3 },
  { id: "city-59", kind: "city", label: "Zaghouan", region: "Cap Bon", country: "Tunisie", cityId: 59, hotelsCount: 2 },
  { id: "city-34", kind: "city", label: "Sousse", region: "Sahel", country: "Tunisie", cityId: 34, hotelsCount: 48 },
  { id: "city-37", kind: "city", label: "Monastir", region: "Sahel", country: "Tunisie", cityId: 37, hotelsCount: 22 },
  { id: "city-35", kind: "city", label: "Mahdia", region: "Sahel", country: "Tunisie", cityId: 35, hotelsCount: 12 },
  { id: "city-6482", kind: "city", label: "El Jem", region: "Sahel", country: "Tunisie", cityId: 6482, hotelsCount: 3 },
  { id: "city-18", kind: "city", label: "Djerba", region: "Djerba & Zarzis", country: "Tunisie", cityId: 18, hotelsCount: 60 },
  { id: "city-19", kind: "city", label: "Zarzis", region: "Djerba & Zarzis", country: "Tunisie", cityId: 19, hotelsCount: 8 },
  { id: "city-76", kind: "city", label: "Medenine", region: "Djerba & Zarzis", country: "Tunisie", cityId: 76, hotelsCount: 4 },
  { id: "city-39", kind: "city", label: "Sfax", region: "Sfax", country: "Tunisie", cityId: 39, hotelsCount: 10 },
  { id: "city-6483", kind: "city", label: "Kerkennah", region: "Sfax", country: "Tunisie", cityId: 6483, hotelsCount: 5 },
  { id: "city-55", kind: "city", label: "Gabes", region: "Sud", country: "Tunisie", cityId: 55, hotelsCount: 6 },
  { id: "city-70", kind: "city", label: "Tataouine", region: "Sud", country: "Tunisie", cityId: 70, hotelsCount: 4 },
  { id: "city-73", kind: "city", label: "Matmata", region: "Sud", country: "Tunisie", cityId: 73, hotelsCount: 3 },
  { id: "city-54", kind: "city", label: "Gafsa", region: "Sud", country: "Tunisie", cityId: 54, hotelsCount: 4 },
  { id: "city-47", kind: "city", label: "Tozeur", region: "Djerid", country: "Tunisie", cityId: 47, hotelsCount: 9 },
  { id: "city-75", kind: "city", label: "Nefta", region: "Djerid", country: "Tunisie", cityId: 75, hotelsCount: 4 },
  { id: "city-20", kind: "city", label: "Douz", region: "Djerid", country: "Tunisie", cityId: 20, hotelsCount: 5 },
  { id: "city-22", kind: "city", label: "Kebili", region: "Djerid", country: "Tunisie", cityId: 22, hotelsCount: 2 },
  { id: "city-23", kind: "city", label: "Ksar Ghilane", region: "Djerid", country: "Tunisie", cityId: 23, hotelsCount: 4 },
  { id: "city-17", kind: "city", label: "Kairouan", region: "Centre", country: "Tunisie", cityId: 17, hotelsCount: 7 },
  { id: "city-72", kind: "city", label: "Sbeitla", region: "Centre", country: "Tunisie", cityId: 72, hotelsCount: 2 },
  { id: "city-74", kind: "city", label: "Sidi Bouzid", region: "Centre", country: "Tunisie", cityId: 74, hotelsCount: 2 },
  { id: "city-48", kind: "city", label: "Bizerte", region: "Nord", country: "Tunisie", cityId: 48, hotelsCount: 9 },
  { id: "city-31", kind: "city", label: "Ain Drahem", region: "Nord", country: "Tunisie", cityId: 31, hotelsCount: 6 },
  { id: "city-33", kind: "city", label: "Tabarka", region: "Tabarka", country: "Tunisie", cityId: 33, hotelsCount: 7 },
  { id: "city-49", kind: "city", label: "Le Kef", region: "Nord-ouest", country: "Tunisie", cityId: 49, hotelsCount: 3 },
  { id: "city-71", kind: "city", label: "Téboursouk", region: "Nord-ouest", country: "Tunisie", cityId: 71, hotelsCount: 2 },
  { id: "city-6484", kind: "city", label: "Nefza", region: "Nord-ouest", country: "Tunisie", cityId: 6484, hotelsCount: 1 },
  { id: "city-6487", kind: "city", label: "Béja", region: "Béja", country: "Tunisie", cityId: 6487, hotelsCount: 2 },
]

const CHAINS: Destination[] = [
  { id: "chain-mouradi", kind: "chain", label: "Mouradi Hotels", country: "Tunisie", hotelsCount: 15 },
  { id: "chain-iberostar", kind: "chain", label: "Iberostar", country: "Tunisie", hotelsCount: 4 },
  { id: "chain-magic-life", kind: "chain", label: "Magic Life", country: "Tunisie", hotelsCount: 5 },
  { id: "chain-vincci", kind: "chain", label: "Vincci Hotels", country: "Tunisie", hotelsCount: 6 },
  { id: "chain-tui-blue", kind: "chain", label: "TUI Blue", country: "Tunisie", hotelsCount: 5 },
  { id: "chain-laico", kind: "chain", label: "Laico", country: "Tunisie", hotelsCount: 2 },
  { id: "chain-movenpick", kind: "chain", label: "Mövenpick", country: "Tunisie", hotelsCount: 2 },
  { id: "chain-radisson", kind: "chain", label: "Radisson Blu", country: "Tunisie", hotelsCount: 2 },
  { id: "chain-medina", kind: "chain", label: "Medina Hotels & Resorts", country: "Tunisie", hotelsCount: 6 },
  { id: "chain-seabel", kind: "chain", label: "Seabel Hotels", country: "Tunisie", hotelsCount: 3 },
]

export const ALL_DESTINATIONS: Destination[] = [...CITIES, ...CHAINS]

export function searchDestinations(query: string, limit = 12): Destination[] {
  const q = query.trim().toLocaleLowerCase()
  if (!q) {
    return [
      ALL_DESTINATIONS[0]!,
      ...CHAINS.slice(0, 4),
      ...CITIES.filter((c) => c.kind === "city")
        .sort((a, b) => (b.hotelsCount ?? 0) - (a.hotelsCount ?? 0))
        .slice(0, limit - 5),
    ]
  }
  return ALL_DESTINATIONS.filter(
    (d) =>
      d.label.toLocaleLowerCase().includes(q) ||
      d.region?.toLocaleLowerCase().includes(q),
  ).slice(0, limit)
}

export function findDestinationById(id: string): Destination | undefined {
  return ALL_DESTINATIONS.find((d) => d.id === id)
}
