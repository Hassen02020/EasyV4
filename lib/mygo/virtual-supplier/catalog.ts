/**
 * Catalogue du Virtual MyGo Supplier — généré de façon déterministe (seed
 * fixe) plutôt qu'à la main : reproductible d'un run de test à l'autre,
 * sans jamais rejouer de vraies données commerciales.
 *
 * Villes/régions : réutilise les IDs/noms RÉELS capturés dans
 * lib/mygo/__fixtures__/listcity.json (données géographiques publiques —
 * pas des données commerciales). Boardings : réutilise les 5 codes
 * confirmés dans lib/mygo/__fixtures__/listboarding.json (une vraie
 * capture myGo — Timing/Ip présents dans le fichier). Hôtels : entièrement
 * synthétiques, nommés "Virtual Hotel NNN" pour ne jamais être confondus
 * avec un établissement réel.
 */

import { mulberry32Like } from "./rng"

// ---------------------------------------------------------------------------
// Villes — données réelles (géographie publique, pas commerciale)
// ---------------------------------------------------------------------------

export interface VirtualCity {
  id: number
  name: string
  region: string
  /** Coordonnées approximatives — assez réalistes pour l'affichage carte, pas topographiquement exactes. */
  lat: number
  lng: number
}

export const VIRTUAL_CITIES: VirtualCity[] = [
  { id: 10, name: "Hammamet", region: "Cap Bon", lat: 36.4, lng: 10.61 },
  { id: 11, name: "Nabeul", region: "Cap Bon", lat: 36.45, lng: 10.73 },
  { id: 12, name: "Kelibia", region: "Cap Bon", lat: 36.85, lng: 11.09 },
  { id: 13, name: "Korba", region: "Cap Bon", lat: 36.57, lng: 10.86 },
  { id: 14, name: "Korbous", region: "Cap Bon", lat: 36.81, lng: 10.58 },
  { id: 17, name: "Kairouan", region: "Centre", lat: 35.68, lng: 10.1 },
  { id: 18, name: "Djerba", region: "Djerba & Zarzis", lat: 33.81, lng: 10.85 },
  { id: 19, name: "Zarzis", region: "Djerba & Zarzis", lat: 33.5, lng: 11.11 },
  { id: 20, name: "Douz", region: "Djerid", lat: 33.46, lng: 9.02 },
  { id: 22, name: "Kebili", region: "Djerid", lat: 33.7, lng: 8.97 },
  { id: 23, name: "Ksar Ghilane", region: "Djerid", lat: 32.99, lng: 9.63 },
  { id: 31, name: "Ain Drahem", region: "Nord", lat: 36.78, lng: 8.68 },
  { id: 32, name: "Tunis", region: "Tunis et Côtes de Carthage", lat: 36.81, lng: 10.18 },
  { id: 33, name: "Tabarka", region: "Tabarka", lat: 36.95, lng: 8.76 },
  { id: 34, name: "Sousse", region: "Sahel", lat: 35.83, lng: 10.64 },
  { id: 35, name: "Mahdia", region: "Sahel", lat: 35.5, lng: 11.06 },
  { id: 37, name: "Monastir", region: "Sahel", lat: 35.78, lng: 10.83 },
  { id: 39, name: "Sfax", region: "Sfax", lat: 34.74, lng: 10.76 },
  { id: 47, name: "Tozeur", region: "Djerid", lat: 33.92, lng: 8.13 },
  { id: 48, name: "Bizerte", region: "Nord", lat: 37.27, lng: 9.87 },
  { id: 49, name: "Le Kef", region: "Nord-ouest", lat: 36.17, lng: 8.71 },
  { id: 54, name: "Gafsa", region: "Sud", lat: 34.43, lng: 8.78 },
  { id: 55, name: "Gabes", region: "Sud", lat: 33.88, lng: 10.1 },
  { id: 59, name: "Zaghouan", region: "Cap Bon", lat: 36.4, lng: 10.14 },
  { id: 70, name: "Tataouine", region: "Sud", lat: 32.93, lng: 10.45 },
  { id: 71, name: "Téboursouk", region: "Nord-ouest", lat: 36.46, lng: 9.24 },
  { id: 72, name: "Sbeitla", region: "Centre", lat: 35.23, lng: 9.12 },
  { id: 73, name: "Matmata", region: "Sud", lat: 33.54, lng: 9.97 },
  { id: 74, name: "Sidi Bouzid", region: "Centre", lat: 35.04, lng: 9.48 },
  { id: 75, name: "Nefta", region: "Djerid", lat: 33.87, lng: 7.88 },
  { id: 76, name: "Mednenine", region: "Djerba & Zarzis", lat: 33.35, lng: 10.5 },
  { id: 6482, name: "El Jem", region: "Sahel", lat: 35.3, lng: 10.71 },
  { id: 6483, name: "Kerkennah", region: "Sfax", lat: 34.7, lng: 11.2 },
  { id: 6484, name: "Nefza", region: "Nord-ouest", lat: 37.08, lng: 9.13 },
  { id: 6485, name: "Gammarth", region: "Gammarth", lat: 36.93, lng: 10.29 },
  { id: 6487, name: "Béja", region: "Béja", lat: 36.73, lng: 9.18 },
]

/** Villes touristiques où l'on concentre le catalogue hôtelier (le reste de VIRTUAL_CITIES reste "vide" — réaliste, comme un vrai fournisseur). */
const TOURISTIC_CITY_IDS = [10, 18, 32, 33, 34, 35, 37, 47, 6485, 11]

// ---------------------------------------------------------------------------
// Boardings — codes RÉELLEMENT confirmés (fixtures/listboarding.json)
// ---------------------------------------------------------------------------

export interface VirtualBoarding {
  id: number
  code: string
  name: string
  description: string | null
}

export const VIRTUAL_BOARDINGS: VirtualBoarding[] = [
  { id: 3, code: "LS", name: "Logement Simple", description: null },
  { id: 4, code: "LPD", name: "Logement Petit Déjeuner", description: "Logement + Petit déjeuner" },
  { id: 5, code: "DP", name: "Demi Pension", description: null },
  { id: 6, code: "PC", name: "Pension Complète", description: "Petit déjeuner + Dîner (1er service) + Déjeuner (dernier service)" },
  { id: 7, code: "ALL", name: "All Inclusive", description: null },
]

// ---------------------------------------------------------------------------
// Devises / Tags — minimal mais conforme au contrat
// ---------------------------------------------------------------------------

export const VIRTUAL_CURRENCIES = [
  { code: "TND", symbol: "DT" },
  { code: "EUR", symbol: "€" },
  { code: "USD", symbol: "$" },
]

export const VIRTUAL_TAGS = [
  { id: 1, title: "Recommandé" },
  { id: 2, title: "Plage privée" },
  { id: 3, title: "Nouveauté" },
  { id: 4, title: "Meilleur prix" },
]

// ---------------------------------------------------------------------------
// Chambres / Hôtels
// ---------------------------------------------------------------------------

export interface VirtualRoomType {
  id: number
  name: string
  maxAdults: number
  maxChildren: number
  maxOccupancy: number
  /** Prix de base par nuit, avant multiplicateur étoiles/boarding (TND). */
  basePrice: number
}

const ROOM_TEMPLATES: Omit<VirtualRoomType, "id">[] = [
  { name: "Chambre Single", maxAdults: 1, maxChildren: 0, maxOccupancy: 1, basePrice: 80 },
  { name: "Chambre Double", maxAdults: 2, maxChildren: 1, maxOccupancy: 3, basePrice: 120 },
  { name: "Chambre Twin", maxAdults: 2, maxChildren: 1, maxOccupancy: 3, basePrice: 125 },
  { name: "Chambre Triple", maxAdults: 3, maxChildren: 1, maxOccupancy: 4, basePrice: 165 },
  { name: "Chambre Familiale", maxAdults: 2, maxChildren: 3, maxOccupancy: 5, basePrice: 210 },
  { name: "Suite", maxAdults: 2, maxChildren: 2, maxOccupancy: 4, basePrice: 320 },
]

const FACILITIES_POOL = [
  { title: "Wi-Fi gratuit", category: "Connectivité" },
  { title: "Piscine extérieure", category: "Loisirs" },
  { title: "Spa & bien-être", category: "Loisirs" },
  { title: "Plage privée", category: "Extérieur" },
  { title: "Parking gratuit", category: "Services" },
  { title: "Climatisation", category: "Confort" },
  { title: "Restaurant", category: "Restauration" },
  { title: "Bar", category: "Restauration" },
  { title: "Salle de sport", category: "Loisirs" },
  { title: "Club enfants", category: "Famille" },
]

const THEME_POOL = ["Famille", "Affaires", "Romantique", "Charme", "Tourisme", "Détente"]

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&h=500&fit=crop"

export interface VirtualHotel {
  id: number
  name: string
  city: VirtualCity
  stars: number
  address: string
  image: string
  lat: number
  lng: number
  facilities: { title: string; category: string }[]
  themes: string[]
  note: string
  rooms: VirtualRoomType[]
  boardings: VirtualBoarding[]
}

const HOTEL_ID_BASE = 500000
const ROOM_ID_BASE = 900000

function pickN<T>(rng: () => number, arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => rng() - 0.5)
  return shuffled.slice(0, n)
}

/**
 * Génère le catalogue complet (déterministe — même seed => même catalogue).
 * `count` >= 50 par défaut (item 4 du cahier des charges).
 */
export function generateCatalog(count = 60, seed = 42): VirtualHotel[] {
  const rng = mulberry32Like(seed)
  const hotels: VirtualHotel[] = []

  for (let i = 0; i < count; i++) {
    const cityId = TOURISTIC_CITY_IDS[i % TOURISTIC_CITY_IDS.length]!
    const city = VIRTUAL_CITIES.find((c) => c.id === cityId)!
    const stars = 2 + Math.floor(rng() * 4) // 2..5
    const hotelId = HOTEL_ID_BASE + i + 1
    const roomCount = 2 + Math.floor(rng() * 3) // 2..4 room types
    const rooms: VirtualRoomType[] = pickN(rng, ROOM_TEMPLATES, roomCount).map(
      (tpl, idx) => ({
        ...tpl,
        id: ROOM_ID_BASE + hotelId * 10 + idx,
        basePrice: Math.round(tpl.basePrice * (0.7 + stars * 0.18)),
      }),
    )
    const boardings = pickN(
      rng,
      VIRTUAL_BOARDINGS,
      2 + Math.floor(rng() * (VIRTUAL_BOARDINGS.length - 1)),
    )

    hotels.push({
      id: hotelId,
      name: `Virtual Hotel ${String(i + 1).padStart(3, "0")}`,
      city,
      stars,
      address: `${10 + Math.floor(rng() * 90)} Avenue Habib Bourguiba, ${city.name}`,
      image: PLACEHOLDER_IMG,
      lat: city.lat + (rng() - 0.5) * 0.05,
      lng: city.lng + (rng() - 0.5) * 0.05,
      facilities: pickN(rng, FACILITIES_POOL, 3 + Math.floor(rng() * 4)),
      themes: pickN(rng, THEME_POOL, 1 + Math.floor(rng() * 3)),
      note: (3 + rng() * 2).toFixed(1),
      rooms,
      boardings,
    })
  }
  return hotels
}

let cachedCatalog: VirtualHotel[] | null = null
export function getCatalog(): VirtualHotel[] {
  if (!cachedCatalog) cachedCatalog = generateCatalog()
  return cachedCatalog
}

export function findHotel(hotelId: number): VirtualHotel | undefined {
  return getCatalog().find((h) => h.id === hotelId)
}

export function findRoom(
  hotelId: number,
  roomId: number,
): { hotel: VirtualHotel; room: VirtualRoomType } | undefined {
  const hotel = findHotel(hotelId)
  const room = hotel?.rooms.find((r) => r.id === roomId)
  return hotel && room ? { hotel, room } : undefined
}

export function findBoarding(id: number): VirtualBoarding | undefined {
  return VIRTUAL_BOARDINGS.find((b) => b.id === id)
}

/** Utile pour les tests — force la régénération. */
export function resetCatalog() {
  cachedCatalog = null
}
