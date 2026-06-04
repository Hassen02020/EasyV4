/**
 * Catalogue mocké de hôtels B2B pour la section Pro
 * Prix nets agence (avant marge)
 */

export type HotelBoarding = "bb" | "hb" | "fb" | "ai"

export interface ProHotelRating {
  score: number
  label: string
  reviews: number
}

export interface ProHotel {
  id: string
  name: string
  city: string
  /** Zone géographique (ex: "Bord de mer", "Centre-ville") */
  zone?: string
  stars: number
  /** Catégorie textuelle si pas d'étoiles */
  category?: string
  /** Chaîne hôtelière */
  brand?: string
  images: string[]
  /** Image principale (alias vers images[0]) */
  image?: string
  amenities: string[]
  /** Segments clients (ex: "Famille", "Affaires") */
  segments?: string[]
  /** Points forts (perks) pour l'onglet détails */
  perks?: string[]
  /** Offre enfant gratuit ou réduit */
  childOffer?: string
  /** Mise en avant sur la SERP */
  recommended?: boolean
  /** Note et avis clients */
  rating?: ProHotelRating
  boardings: HotelBoarding[]
  rooms: ProRoom[]
  description?: string
  address?: string
}

export interface ProRoom {
  id: string
  name: string
  capacity: number
  prices: Record<HotelBoarding, number>
}

export const BOARDING_LABEL: Record<HotelBoarding, string> = {
  bb: "Petit-déjeuner",
  hb: "Demi-pension",
  fb: "Pension complète",
  ai: "All Inclusive",
}

export const BOARDING_SHORT: Record<HotelBoarding, string> = {
  bb: "BB",
  hb: "HB",
  fb: "FB",
  ai: "AI",
}

// Catalogue de 10 hôtels mockés
const HOTELS: ProHotel[] = [
  {
    id: "carthage-thalasso",
    name: "Carthage Thalasso Resort",
    city: "Gammarth",
    stars: 5,
    images: ["/hotels/carthage-1.jpg"],
    amenities: ["wifi", "spa", "pool", "gym"],
    boardings: ["bb", "hb", "fb", "ai"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 841.253, hb: 1050.5, fb: 1250, ai: 1450 } },
      { id: "suite", name: "Suite", capacity: 3, prices: { bb: 1200, hb: 1450, fb: 1700, ai: 1950 } },
    ],
  },
  {
    id: "hotel-concorde",
    name: "Concorde Hotel",
    city: "Tunis",
    stars: 4,
    images: ["/hotels/concorde-1.jpg"],
    amenities: ["wifi", "pool", "gym"],
    boardings: ["bb", "hb", "fb"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 450, hb: 650, fb: 850, ai: 0 } },
    ],
  },
  {
    id: "royal-garden",
    name: "Royal Garden Palace",
    city: "Hammamet",
    stars: 5,
    images: ["/hotels/royal-garden-1.jpg"],
    amenities: ["wifi", "spa", "pool", "beach", "gym"],
    boardings: ["bb", "hb", "fb", "ai"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 750, hb: 950, fb: 1150, ai: 1350 } },
      { id: "suite", name: "Suite Vue Mer", capacity: 3, prices: { bb: 1100, hb: 1350, fb: 1600, ai: 1850 } },
    ],
  },
  {
    id: "hasdrubal",
    name: "Hasdrubal Thalassa & Spa",
    city: "Hammamet",
    stars: 5,
    images: ["/hotels/hasdrubal-1.jpg"],
    amenities: ["wifi", "spa", "pool", "beach", "gym"],
    boardings: ["bb", "hb", "fb", "ai"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 900, hb: 1150, fb: 1400, ai: 1650 } },
    ],
  },
  {
    id: "iberostar",
    name: "Iberostar Selection Kantaoui Bay",
    city: "Sousse",
    stars: 5,
    images: ["/hotels/iberostar-1.jpg"],
    amenities: ["wifi", "pool", "beach", "gym", "kids"],
    boardings: ["bb", "hb", "fb", "ai"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 650, hb: 850, fb: 1050, ai: 1250 } },
      { id: "family", name: "Chambre Familiale", capacity: 4, prices: { bb: 950, hb: 1250, fb: 1550, ai: 1850 } },
    ],
  },
  {
    id: "movenpick",
    name: "Movenpick Resort & Marine Spa",
    city: "Sousse",
    stars: 5,
    images: ["/hotels/movenpick-1.jpg"],
    amenities: ["wifi", "spa", "pool", "beach", "gym"],
    boardings: ["bb", "hb", "fb", "ai"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 720, hb: 920, fb: 1120, ai: 1320 } },
    ],
  },
  {
    id: "sidi-mansour",
    name: "Sidi Mansour Resort",
    city: "Djerba",
    stars: 4,
    images: ["/hotels/sidi-mansour-1.jpg"],
    amenities: ["wifi", "pool", "beach", "gym"],
    boardings: ["bb", "hb", "fb", "ai"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 380, hb: 550, fb: 720, ai: 890 } },
    ],
  },
  {
    id: "djerba-plaza",
    name: "Djerba Plaza Thalasso & Spa",
    city: "Djerba",
    stars: 5,
    images: ["/hotels/djerba-plaza-1.jpg"],
    amenities: ["wifi", "spa", "pool", "beach", "gym"],
    boardings: ["bb", "hb", "fb", "ai"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 520, hb: 720, fb: 920, ai: 1120 } },
    ],
  },
  {
    id: "seabel-alhambra",
    name: "Seabel Alhambra Beach Golf & Spa",
    city: "Sfax",
    stars: 4,
    images: ["/hotels/seabel-1.jpg"],
    amenities: ["wifi", "golf", "pool", "beach", "gym"],
    boardings: ["bb", "hb", "fb", "ai"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 420, hb: 600, fb: 780, ai: 960 } },
    ],
  },
  {
    id: "gold-yasmine",
    name: "Golden Yasmine Mehari Tabarka",
    city: "Tabarka",
    stars: 4,
    images: ["/hotels/gold-yasmine-1.jpg"],
    amenities: ["wifi", "pool", "beach", "gym"],
    boardings: ["bb", "hb", "fb"],
    rooms: [
      { id: "standard", name: "Chambre Standard", capacity: 2, prices: { bb: 350, hb: 500, fb: 650, ai: 0 } },
    ],
  },
]

export interface ListProHotelsOptions {
  cityId?: number
  brand?: string
  searchAll?: boolean
}

export function listProHotels(options?: ListProHotelsOptions): ProHotel[] {
  if (!options || options.searchAll) return HOTELS
  return HOTELS.filter((h) => {
    if (options.brand && !h.name.toLowerCase().includes(options.brand.toLowerCase())) return false
    return true
  })
}

export function getProHotelById(id: string): ProHotel | undefined {
  return HOTELS.find((h) => h.id === id)
}

export function minBoardingPrice(hotel: ProHotel, boarding?: HotelBoarding): number | null {
  if (!boarding) {
    const allPrices = hotel.rooms.flatMap((r) =>
      hotel.boardings.map((b) => r.prices[b]).filter((p) => p > 0)
    )
    return allPrices.length > 0 ? Math.min(...allPrices) : null
  }
  const roomsWithBoarding = hotel.rooms.filter((r) => boarding in r.prices)
  if (roomsWithBoarding.length === 0) return null
  return Math.min(...roomsWithBoarding.map((r) => r.prices[boarding!]))
}
