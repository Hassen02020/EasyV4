/**
 * Catalogue de destinations « Hôtels Monde » pour l'autocomplétion du hero de
 * recherche. Liste statique et déterministe (aucun appel réseau) : suffisante
 * pour le typeahead tant que le GDS mondial n'est pas branché.
 */

export interface WorldDestination {
  /** Slug stable utilisé en query param (`?destination=`). */
  value: string
  /** Ville. */
  city: string
  /** Pays. */
  country: string
  /** Région/continent — sert au regroupement de l'autocomplétion. */
  region:
    | "Maghreb & Moyen-Orient"
    | "Europe"
    | "Afrique"
    | "Amériques"
    | "Asie & Océanie"
}

export const WORLD_DESTINATIONS: WorldDestination[] = [
  // Maghreb & Moyen-Orient
  { value: "istanbul", city: "Istanbul", country: "Turquie", region: "Maghreb & Moyen-Orient" },
  { value: "dubai", city: "Dubaï", country: "Émirats arabes unis", region: "Maghreb & Moyen-Orient" },
  { value: "abu-dhabi", city: "Abu Dhabi", country: "Émirats arabes unis", region: "Maghreb & Moyen-Orient" },
  { value: "doha", city: "Doha", country: "Qatar", region: "Maghreb & Moyen-Orient" },
  { value: "beirut", city: "Beyrouth", country: "Liban", region: "Maghreb & Moyen-Orient" },
  { value: "amman", city: "Amman", country: "Jordanie", region: "Maghreb & Moyen-Orient" },
  { value: "antalya", city: "Antalya", country: "Turquie", region: "Maghreb & Moyen-Orient" },
  { value: "casablanca", city: "Casablanca", country: "Maroc", region: "Maghreb & Moyen-Orient" },
  { value: "marrakech", city: "Marrakech", country: "Maroc", region: "Maghreb & Moyen-Orient" },
  { value: "algiers", city: "Alger", country: "Algérie", region: "Maghreb & Moyen-Orient" },

  // Europe
  { value: "paris", city: "Paris", country: "France", region: "Europe" },
  { value: "nice", city: "Nice", country: "France", region: "Europe" },
  { value: "lyon", city: "Lyon", country: "France", region: "Europe" },
  { value: "marseille", city: "Marseille", country: "France", region: "Europe" },
  { value: "rome", city: "Rome", country: "Italie", region: "Europe" },
  { value: "milan", city: "Milan", country: "Italie", region: "Europe" },
  { value: "venice", city: "Venise", country: "Italie", region: "Europe" },
  { value: "barcelona", city: "Barcelone", country: "Espagne", region: "Europe" },
  { value: "madrid", city: "Madrid", country: "Espagne", region: "Europe" },
  { value: "london", city: "Londres", country: "Royaume-Uni", region: "Europe" },
  { value: "amsterdam", city: "Amsterdam", country: "Pays-Bas", region: "Europe" },
  { value: "brussels", city: "Bruxelles", country: "Belgique", region: "Europe" },
  { value: "geneva", city: "Genève", country: "Suisse", region: "Europe" },
  { value: "zurich", city: "Zurich", country: "Suisse", region: "Europe" },
  { value: "berlin", city: "Berlin", country: "Allemagne", region: "Europe" },
  { value: "munich", city: "Munich", country: "Allemagne", region: "Europe" },
  { value: "frankfurt", city: "Francfort", country: "Allemagne", region: "Europe" },
  { value: "vienna", city: "Vienne", country: "Autriche", region: "Europe" },
  { value: "lisbon", city: "Lisbonne", country: "Portugal", region: "Europe" },
  { value: "athens", city: "Athènes", country: "Grèce", region: "Europe" },

  // Afrique
  { value: "cairo", city: "Le Caire", country: "Égypte", region: "Afrique" },
  { value: "sharm-el-sheikh", city: "Charm el-Cheikh", country: "Égypte", region: "Afrique" },
  { value: "hurghada", city: "Hurghada", country: "Égypte", region: "Afrique" },
  { value: "dakar", city: "Dakar", country: "Sénégal", region: "Afrique" },
  { value: "nairobi", city: "Nairobi", country: "Kenya", region: "Afrique" },
  { value: "cape-town", city: "Le Cap", country: "Afrique du Sud", region: "Afrique" },
  { value: "zanzibar", city: "Zanzibar", country: "Tanzanie", region: "Afrique" },
  { value: "mauritius", city: "Île Maurice", country: "Maurice", region: "Afrique" },

  // Amériques
  { value: "new-york", city: "New York", country: "États-Unis", region: "Amériques" },
  { value: "miami", city: "Miami", country: "États-Unis", region: "Amériques" },
  { value: "los-angeles", city: "Los Angeles", country: "États-Unis", region: "Amériques" },
  { value: "montreal", city: "Montréal", country: "Canada", region: "Amériques" },
  { value: "toronto", city: "Toronto", country: "Canada", region: "Amériques" },
  { value: "cancun", city: "Cancún", country: "Mexique", region: "Amériques" },
  { value: "rio-de-janeiro", city: "Rio de Janeiro", country: "Brésil", region: "Amériques" },

  // Asie & Océanie
  { value: "bangkok", city: "Bangkok", country: "Thaïlande", region: "Asie & Océanie" },
  { value: "phuket", city: "Phuket", country: "Thaïlande", region: "Asie & Océanie" },
  { value: "bali", city: "Bali", country: "Indonésie", region: "Asie & Océanie" },
  { value: "singapore", city: "Singapour", country: "Singapour", region: "Asie & Océanie" },
  { value: "kuala-lumpur", city: "Kuala Lumpur", country: "Malaisie", region: "Asie & Océanie" },
  { value: "tokyo", city: "Tokyo", country: "Japon", region: "Asie & Océanie" },
  { value: "maldives", city: "Maldives", country: "Maldives", region: "Asie & Océanie" },
  { value: "sydney", city: "Sydney", country: "Australie", region: "Asie & Océanie" },
]

/** Libellé d'affichage : « Ville, Pays ». */
export function formatWorldDestination(d: WorldDestination): string {
  return `${d.city}, ${d.country}`
}

/** Recherche une destination par slug. */
export function findWorldDestination(
  value: string | null | undefined,
): WorldDestination | undefined {
  if (!value) return undefined
  return WORLD_DESTINATIONS.find((d) => d.value === value)
}
