/**
 * Catalogue d'hôtels mocké pour le portail B2B `/pro/hotels`.
 *
 *  - Couverture : 25 établissements sur les principales destinations balnéaires
 *    et culturelles tunisiennes (Hammamet, Sousse, Djerba, Monastir,
 *    Gammarth, Tabarka, Tunis, Tozeur…).
 *  - Données réalistes (catégorie, zone, équipements, type de pension)
 *    pour valider visuellement la SERP.
 *  - Prix exprimés en TND TTC pour 2 adultes / 4 nuits, "net agence" hors
 *    marge — la marge sera calculée à l'affichage à partir de
 *    `pricing_margins` en phase 9.
 *  - Les données seront remplacées par un appel MyGo réel via l'API
 *    `/api/hotels/search` une fois la couche B2B branchée côté serveur.
 */

export type HotelBoarding = "LP" | "BB" | "HB" | "FB" | "AI"

export const BOARDING_LABEL: Record<HotelBoarding, string> = {
  LP: "Logement",
  BB: "Logement Petit Déjeuner",
  HB: "Demi Pension",
  FB: "Pension Complète",
  AI: "Tout Inclus",
}

export const BOARDING_SHORT: Record<HotelBoarding, string> = {
  LP: "LP",
  BB: "PD",
  HB: "DP",
  FB: "PC",
  AI: "AI",
}

export type HotelBoardingOption = {
  type: HotelBoarding
  price: number
}

export type ProHotel = {
  id: string
  name: string
  brand?: string
  stars: number | null
  category?: string
  zone: string
  cityId: number
  cityName: string
  region: string
  image: string
  rating?: { score: number; label: string; reviews: number }
  /** Pourcentage gratuit type "1er enfant -6 ans gratuit". */
  childOffer?: string
  /** Avantages distinctifs (4-6 puces dans l'onglet Détails). */
  perks: string[]
  amenities: string[]
  /** Si vrai, badge vert RECOMMENDED affiché sur la carte. */
  recommended?: boolean
  /** Type de service principal (resort / spa / urbain / désert). */
  segments: string[]
  /** Prix net agence par option de pension (TND TTC, 2 ad, 4 nuits). */
  boardings: HotelBoardingOption[]
  description: string
}

export const PRO_HOTELS: ProHotel[] = [
  {
    id: "carthage-thalasso",
    name: "Carthage Thalasso Resort",
    stars: 5,
    category: "Thalasso & Spa",
    zone: "Gammarth, Zone touristique",
    cityId: 6485,
    cityName: "Gammarth",
    region: "Tunis & Côtes de Carthage",
    image:
      "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.5, label: "Bien", reviews: 2 },
    childOffer: "1er enfant -6 ans gratuit",
    perks: [
      "Centre de thalassothérapie",
      "Plage privée",
      "3 piscines (1 chauffée)",
      "Service navette aéroport",
    ],
    amenities: ["wifi", "parking", "pool", "spa", "beach", "restaurant"],
    recommended: true,
    segments: ["Affaires", "Famille", "Week-end"],
    boardings: [
      { type: "BB", price: 841.253 },
      { type: "HB", price: 1024.5 },
      { type: "FB", price: 1192.0 },
    ],
    description:
      "Resort 5★ au bord de la Méditerranée, à 20 min de l'aéroport Tunis-Carthage. Centre de thalasso de 4000 m² et 3 restaurants à la carte.",
  },
  {
    id: "mouradi-palace",
    name: "Mouradi Palace Hammamet",
    brand: "Mouradi Hotels",
    stars: 5,
    category: "Hôtel club",
    zone: "Hammamet Yasmine, Zone touristique",
    cityId: 10,
    cityName: "Hammamet",
    region: "Cap Bon",
    image:
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.2, label: "Très bien", reviews: 412 },
    childOffer: "1er enfant -7 ans gratuit",
    perks: [
      "All Inclusive premium",
      "5 piscines extérieures",
      "Aquaparc privé",
      "Club enfants 4-12 ans",
    ],
    amenities: ["wifi", "pool", "kids-club", "gym", "beach", "all-inclusive"],
    recommended: true,
    segments: ["Famille", "All Inclusive", "Estival"],
    boardings: [
      { type: "BB", price: 624.0 },
      { type: "HB", price: 778.5 },
      { type: "AI", price: 1086.75 },
    ],
    description:
      "Le fleuron de la chaîne Mouradi à Hammamet Yasmine. 7 ha de jardins, accès direct à la plage, animation continue.",
  },
  {
    id: "iberostar-mehari",
    name: "Iberostar Selection Mehari Djerba",
    brand: "Iberostar",
    stars: 5,
    category: "Resort balnéaire",
    zone: "Djerba Aghir, Zone touristique",
    cityId: 18,
    cityName: "Djerba",
    region: "Djerba & Zarzis",
    image:
      "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.7, label: "Excellent", reviews: 1284 },
    childOffer: "2 enfants -12 ans gratuits",
    perks: [
      "All Inclusive Premium",
      "Plage privée 400 m",
      "Spa 1500 m²",
      "6 restaurants thématiques",
    ],
    amenities: ["wifi", "pool", "spa", "beach", "gym", "all-inclusive"],
    recommended: true,
    segments: ["Famille", "All Inclusive", "Premium"],
    boardings: [
      { type: "BB", price: 712.0 },
      { type: "HB", price: 925.5 },
      { type: "AI", price: 1305.25 },
    ],
    description:
      "Resort haut de gamme sur la plage d'Aghir. Architecture berbère, gastronomie de chef, programmes wellness.",
  },
  {
    id: "tui-blue-palm",
    name: "TUI BLUE Palm Beach Palace",
    brand: "TUI Blue",
    stars: 5,
    category: "Adults-only",
    zone: "Djerba, Plage de Sidi Mahres",
    cityId: 18,
    cityName: "Djerba",
    region: "Djerba & Zarzis",
    image:
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.4, label: "Très bien", reviews: 564 },
    perks: [
      "Réservé aux adultes (+16 ans)",
      "Plage privée",
      "Spa haut de gamme",
      "Cuisine méditerranéenne premium",
    ],
    amenities: ["wifi", "pool", "spa", "beach", "adults-only"],
    recommended: false,
    segments: ["Adultes", "Romantique", "Premium"],
    boardings: [
      { type: "BB", price: 825.0 },
      { type: "HB", price: 1014.0 },
      { type: "AI", price: 1342.5 },
    ],
    description:
      "Adresse adults-only de TUI Blue sur la plage de Sidi Mahres. Cadre raffiné, gastronomie premium.",
  },
  {
    id: "movenpick-sousse",
    name: "Mövenpick Resort & Marine Spa Sousse",
    brand: "Mövenpick",
    stars: 5,
    category: "Spa & Marina",
    zone: "Sousse, Boulevard 14 Janvier",
    cityId: 34,
    cityName: "Sousse",
    region: "Sahel",
    image:
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.6, label: "Excellent", reviews: 932 },
    childOffer: "Enfant -12 ans -50%",
    perks: [
      "Marine spa 2500 m²",
      "Plage face médina",
      "Restaurants gastronomiques",
      "Salles séminaires modulables",
    ],
    amenities: ["wifi", "spa", "pool", "beach", "business-center", "gym"],
    recommended: true,
    segments: ["Affaires", "Spa", "Premium"],
    boardings: [
      { type: "BB", price: 905.0 },
      { type: "HB", price: 1148.75 },
      { type: "FB", price: 1392.0 },
    ],
    description:
      "Hôtel 5★ urbain-balnéaire face à la médina classée UNESCO. Idéal MICE.",
  },
  {
    id: "magic-life-skanes",
    name: "Magic Life Skanes Monastir",
    brand: "Magic Life",
    stars: 4,
    category: "All Inclusive Family",
    zone: "Monastir, Skanes",
    cityId: 37,
    cityName: "Monastir",
    region: "Sahel",
    image:
      "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.9, label: "Très bien", reviews: 1842 },
    childOffer: "1er enfant -14 ans gratuit",
    perks: [
      "All Inclusive Plus",
      "Aquaparc inclus",
      "Mini-Magix Kids Club",
      "Sport & animation continue",
    ],
    amenities: ["wifi", "pool", "kids-club", "all-inclusive", "beach", "sport"],
    recommended: false,
    segments: ["Famille", "All Inclusive", "Estival"],
    boardings: [
      { type: "AI", price: 698.0 },
    ],
    description:
      "Club family-friendly à Skanes, à 5 min de l'aéroport Monastir. Animation TUI Magic Life.",
  },
  {
    id: "radisson-djerba",
    name: "Radisson Blu Palace Resort & Thalasso Djerba",
    brand: "Radisson Blu",
    stars: 5,
    category: "Thalasso",
    zone: "Djerba, Plage de Sidi Mahres",
    cityId: 18,
    cityName: "Djerba",
    region: "Djerba & Zarzis",
    image:
      "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.5, label: "Excellent", reviews: 712 },
    perks: [
      "Thalasso 3000 m²",
      "Plage privée 800 m",
      "6 restaurants",
      "Académie de golf",
    ],
    amenities: ["wifi", "spa", "pool", "beach", "golf", "restaurant"],
    recommended: true,
    segments: ["Premium", "Spa", "Golf"],
    boardings: [
      { type: "BB", price: 980.0 },
      { type: "HB", price: 1248.5 },
      { type: "AI", price: 1592.0 },
    ],
    description:
      "Resort 5★ avec centre thalasso de renommée internationale. Direct accès à la plage de Sidi Mahres.",
  },
  {
    id: "laico-tunis",
    name: "Laico Tunis",
    brand: "Laico",
    stars: 5,
    category: "Affaires",
    zone: "Les Berges du Lac, Tunis",
    cityId: 32,
    cityName: "Tunis",
    region: "Tunis & Côtes de Carthage",
    image:
      "https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.0, label: "Très bien", reviews: 487 },
    perks: [
      "Centre de congrès",
      "Vue sur le lac de Tunis",
      "Spa & fitness",
      "Restaurants gastronomiques",
    ],
    amenities: ["wifi", "pool", "spa", "business-center", "gym", "restaurant"],
    recommended: false,
    segments: ["Affaires", "Séminaires"],
    boardings: [
      { type: "BB", price: 615.0 },
      { type: "HB", price: 818.5 },
    ],
    description:
      "Hôtel d'affaires premium au cœur du quartier diplomatique des Berges du Lac.",
  },
  {
    id: "vincci-helya-beach",
    name: "Vincci Helya Beach Resort",
    brand: "Vincci Hotels",
    stars: 4,
    category: "Resort",
    zone: "Skanes, Monastir",
    cityId: 37,
    cityName: "Monastir",
    region: "Sahel",
    image:
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.1, label: "Très bien", reviews: 921 },
    childOffer: "Enfant -12 ans -75%",
    perks: [
      "All Inclusive Soft",
      "2 piscines (1 chauffée)",
      "Plage privée",
      "Spa Vincci",
    ],
    amenities: ["wifi", "pool", "beach", "spa", "all-inclusive"],
    recommended: false,
    segments: ["Famille", "All Inclusive"],
    boardings: [
      { type: "HB", price: 712.5 },
      { type: "AI", price: 928.75 },
    ],
    description:
      "Resort 4★ Vincci sur la plage de Skanes. Architecture lumineuse et excellent rapport qualité-prix.",
  },
  {
    id: "seabel-aladin",
    name: "Seabel Aladin Djerba",
    brand: "Seabel Hotels",
    stars: 3,
    category: "Hôtel club",
    zone: "Djerba, Aghir",
    cityId: 18,
    cityName: "Djerba",
    region: "Djerba & Zarzis",
    image:
      "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.6, label: "Bien", reviews: 658 },
    perks: [
      "All Inclusive standard",
      "Architecture berbère",
      "Plage privée",
      "Animation francophone",
    ],
    amenities: ["wifi", "pool", "beach", "all-inclusive"],
    recommended: false,
    segments: ["Famille", "All Inclusive", "Budget"],
    boardings: [
      { type: "AI", price: 528.0 },
    ],
    description:
      "Club 3★ familial à Djerba Aghir. Bon rapport qualité-prix et animation francophone.",
  },
  {
    id: "el-mouradi-port",
    name: "El Mouradi Port El Kantaoui",
    brand: "Mouradi Hotels",
    stars: 4,
    category: "Resort",
    zone: "Port El Kantaoui, Sousse",
    cityId: 34,
    cityName: "Sousse",
    region: "Sahel",
    image:
      "https://images.unsplash.com/photo-1551918120-9739cb430c6d?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.8, label: "Très bien", reviews: 1102 },
    childOffer: "1er enfant -6 ans gratuit",
    perks: [
      "Tout Inclus Mouradi",
      "Plage privée 200 m",
      "3 piscines",
      "Sport, gym, sauna",
    ],
    amenities: ["wifi", "pool", "beach", "all-inclusive", "gym"],
    recommended: true,
    segments: ["Famille", "All Inclusive"],
    boardings: [
      { type: "HB", price: 568.0 },
      { type: "AI", price: 798.25 },
    ],
    description:
      "Resort Mouradi face au port de plaisance d'El Kantaoui. Idéal séjours actifs et familles.",
  },
  {
    id: "ras-rmel-tabarka",
    name: "Royal Tabarka Resort",
    stars: 4,
    category: "Resort nature",
    zone: "Tabarka, Plage de Montazah",
    cityId: 33,
    cityName: "Tabarka",
    region: "Tabarka",
    image:
      "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.4, label: "Bien", reviews: 287 },
    perks: [
      "Vue mer & forêt de chêne-liège",
      "Plongée sous-marine",
      "Golf 18 trous à 2 km",
      "Restaurants poissons",
    ],
    amenities: ["wifi", "pool", "beach", "diving", "golf"],
    recommended: false,
    segments: ["Nature", "Sportif"],
    boardings: [
      { type: "BB", price: 478.0 },
      { type: "HB", price: 624.5 },
    ],
    description:
      "Resort au cœur de Tabarka, idéal pour découvrir le Nord-Ouest tunisien (Bulla Regia, Chemtou).",
  },
  {
    id: "anantara-tozeur",
    name: "Anantara Sahara Tozeur Resort & Villas",
    stars: 5,
    category: "Luxe désert",
    zone: "Tozeur, Bord d'oasis",
    cityId: 47,
    cityName: "Tozeur",
    region: "Djerid",
    image:
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=900&q=70",
    rating: { score: 9.1, label: "Exceptionnel", reviews: 412 },
    perks: [
      "Villas avec piscine privée",
      "Spa Anantara",
      "Observatoire astronomique",
      "Expériences désertiques sur-mesure",
    ],
    amenities: ["wifi", "spa", "pool", "private-villa", "restaurant"],
    recommended: true,
    segments: ["Luxe", "Désert", "Romantique"],
    boardings: [
      { type: "BB", price: 1480.0 },
      { type: "HB", price: 1885.5 },
    ],
    description:
      "Resort iconique signé Anantara à Tozeur. Villas avec piscine privée, expériences désert, gastronomie de chef.",
  },
  {
    id: "el-mouradi-gammarth",
    name: "El Mouradi Gammarth",
    brand: "Mouradi Hotels",
    stars: 5,
    category: "Resort balnéaire",
    zone: "Gammarth, La Marsa",
    cityId: 6485,
    cityName: "Gammarth",
    region: "Tunis & Côtes de Carthage",
    image:
      "https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.0, label: "Très bien", reviews: 624 },
    perks: [
      "Plage privée Gammarth",
      "3 piscines",
      "Spa & balnéo",
      "Centre de congrès",
    ],
    amenities: ["wifi", "pool", "beach", "spa", "business-center"],
    recommended: false,
    segments: ["Affaires", "Famille", "Week-end"],
    boardings: [
      { type: "BB", price: 692.0 },
      { type: "HB", price: 882.5 },
      { type: "AI", price: 1124.0 },
    ],
    description:
      "Resort Mouradi 5★ face à la côte de Gammarth. Forte présence MICE.",
  },
  {
    id: "diar-lemdina",
    name: "Diar Lemdina Hammamet",
    stars: 4,
    category: "Médina",
    zone: "Hammamet Yasmine, Médina Méditerranéa",
    cityId: 10,
    cityName: "Hammamet",
    region: "Cap Bon",
    image:
      "https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.7, label: "Très bien", reviews: 1248 },
    childOffer: "Enfant -10 ans gratuit",
    perks: [
      "Architecture médina",
      "All Inclusive premium",
      "Aquaparc à 5 min",
      "Animation francophone",
    ],
    amenities: ["wifi", "pool", "beach", "all-inclusive"],
    recommended: false,
    segments: ["Famille", "Culturel"],
    boardings: [
      { type: "AI", price: 642.0 },
    ],
    description:
      "Hôtel inspiré de la médina tunisienne, à Hammamet Yasmine. Animation famille très appréciée.",
  },
  {
    id: "africa-jade-thalasso",
    name: "Africa Jade Thalasso Korbous",
    stars: 4,
    category: "Thalasso",
    zone: "Korbous, Cap Bon",
    cityId: 14,
    cityName: "Korbous",
    region: "Cap Bon",
    image:
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.1, label: "Très bien", reviews: 318 },
    perks: [
      "Sources thermales naturelles",
      "Centre thalasso labellisé",
      "Vue golfe de Tunis",
      "Cures détox",
    ],
    amenities: ["wifi", "spa", "pool", "thalasso"],
    recommended: true,
    segments: ["Wellness", "Cure"],
    boardings: [
      { type: "BB", price: 612.0 },
      { type: "HB", price: 758.5 },
    ],
    description:
      "Établissement spécialisé thalasso & thermalisme, posé sur les falaises de Korbous.",
  },
  {
    id: "ksar-djerba",
    name: "Royal Karthago Djerba",
    stars: 4,
    category: "Resort",
    zone: "Djerba, Aghir",
    cityId: 18,
    cityName: "Djerba",
    region: "Djerba & Zarzis",
    image:
      "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.5, label: "Bien", reviews: 562 },
    perks: [
      "All Inclusive",
      "Plage privée",
      "2 piscines",
      "Excursions désert organisées",
    ],
    amenities: ["wifi", "pool", "beach", "all-inclusive"],
    recommended: false,
    segments: ["Famille", "Aventure"],
    boardings: [
      { type: "AI", price: 612.5 },
    ],
    description:
      "Hôtel 4★ All Inclusive à Aghir, idéal pour combiner balnéaire et excursions désertiques.",
  },
  {
    id: "sahara-douz",
    name: "Sahara Douz Lodge",
    stars: 3,
    category: "Désert",
    zone: "Douz, Porte du Sahara",
    cityId: 20,
    cityName: "Douz",
    region: "Djerid",
    image:
      "https://images.unsplash.com/photo-1542640244-7e672d6cef4e?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.2, label: "Bien", reviews: 184 },
    perks: [
      "Tentes berbères",
      "Méharées organisées",
      "Soirées sous les étoiles",
      "Restaurant cuisine sud-tunisienne",
    ],
    amenities: ["wifi", "pool", "restaurant"],
    recommended: true,
    segments: ["Désert", "Aventure", "Romantique"],
    boardings: [
      { type: "BB", price: 312.0 },
      { type: "HB", price: 408.5 },
    ],
    description:
      "Lodge au charme typique du Sud tunisien, à la porte du Sahara. Excellent rapport qualité/prix pour explorer le grand désert.",
  },
  {
    id: "hasdrubal-prestige",
    name: "Hasdrubal Prestige Thalassa & Spa",
    stars: 5,
    category: "Thalasso & Spa",
    zone: "Djerba, Sidi Mahres",
    cityId: 18,
    cityName: "Djerba",
    region: "Djerba & Zarzis",
    image:
      "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.6, label: "Excellent", reviews: 1284 },
    perks: [
      "Suites avec piscine privée",
      "Thalasso 5000 m²",
      "Tout Inclus de prestige",
      "Plage privée 600 m",
    ],
    amenities: ["wifi", "spa", "pool", "private-villa", "all-inclusive"],
    recommended: true,
    segments: ["Luxe", "Spa", "Adultes"],
    boardings: [
      { type: "BB", price: 1224.0 },
      { type: "HB", price: 1485.5 },
      { type: "AI", price: 1888.0 },
    ],
    description:
      "Adresse phare du groupe Hasdrubal. 220 suites prestigieuses avec piscines privatives.",
  },
  {
    id: "fourat-mahdia",
    name: "El Fourati Mahdia",
    stars: 4,
    category: "Resort",
    zone: "Mahdia, Hiboun",
    cityId: 35,
    cityName: "Mahdia",
    region: "Sahel",
    image:
      "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.6, label: "Bien", reviews: 462 },
    perks: [
      "Plage privée",
      "Spa & hammam",
      "All Inclusive",
      "Excursions médina inclues",
    ],
    amenities: ["wifi", "pool", "beach", "spa", "all-inclusive"],
    recommended: false,
    segments: ["Famille", "All Inclusive"],
    boardings: [
      { type: "AI", price: 588.0 },
    ],
    description:
      "Hôtel familial avec direct accès à la plage de Mahdia. Bon rapport qualité-prix.",
  },
  {
    id: "marhaba-club",
    name: "Marhaba Club Sousse",
    stars: 4,
    category: "Hôtel club",
    zone: "Sousse, Boujaafar",
    cityId: 34,
    cityName: "Sousse",
    region: "Sahel",
    image:
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.4, label: "Bien", reviews: 1102 },
    perks: [
      "All Inclusive Soft",
      "Mini-club enfants",
      "Plage à 100 m",
      "Animation jour & soir",
    ],
    amenities: ["wifi", "pool", "beach", "kids-club", "all-inclusive"],
    recommended: false,
    segments: ["Famille", "All Inclusive"],
    boardings: [
      { type: "AI", price: 524.0 },
    ],
    description:
      "Club familial à Sousse Boujaafar, animation continue, idéal pour familles avec enfants.",
  },
  {
    id: "kheops-tabarka",
    name: "Hôtel Iberostar Mehari Tabarka",
    brand: "Iberostar",
    stars: 4,
    category: "Resort nature",
    zone: "Tabarka, Plage Sidi Maouia",
    cityId: 33,
    cityName: "Tabarka",
    region: "Tabarka",
    image:
      "https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.7, label: "Très bien", reviews: 412 },
    perks: [
      "Centre de plongée",
      "Forêt de chêne-liège",
      "Vue baie de Tabarka",
      "Excursions Bulla Regia",
    ],
    amenities: ["wifi", "pool", "beach", "diving"],
    recommended: false,
    segments: ["Nature", "Plongée"],
    boardings: [
      { type: "BB", price: 524.0 },
      { type: "HB", price: 678.5 },
    ],
    description:
      "Iberostar 4★ niché dans la forêt de chênes-lièges de Tabarka. Plage et plongée.",
  },
  {
    id: "regency-monastir",
    name: "Regency Hotel & Spa Monastir",
    stars: 4,
    category: "Spa & Resort",
    zone: "Monastir, Plage Skanes",
    cityId: 37,
    cityName: "Monastir",
    region: "Sahel",
    image:
      "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.6, label: "Bien", reviews: 384 },
    perks: [
      "Spa marin labellisé",
      "Architecture lumineuse",
      "Plage privée",
      "Salles séminaire",
    ],
    amenities: ["wifi", "pool", "spa", "beach", "business-center"],
    recommended: false,
    segments: ["Spa", "Affaires"],
    boardings: [
      { type: "BB", price: 482.0 },
      { type: "HB", price: 612.5 },
    ],
    description:
      "Hôtel 4★ familial avec spa marin à Skanes Monastir.",
  },
  {
    id: "concorde-marco-polo",
    name: "Concorde Hôtel Marco Polo",
    stars: 4,
    category: "Resort",
    zone: "Hammamet, Centre",
    cityId: 10,
    cityName: "Hammamet",
    region: "Cap Bon",
    image:
      "https://images.unsplash.com/photo-1551918120-9739cb430c6d?auto=format&fit=crop&w=900&q=70",
    rating: { score: 7.3, label: "Bien", reviews: 762 },
    perks: [
      "Bord de mer Hammamet",
      "3 piscines",
      "Cuisine internationale",
      "Animation francophone",
    ],
    amenities: ["wifi", "pool", "beach", "all-inclusive"],
    recommended: false,
    segments: ["Famille", "All Inclusive"],
    boardings: [
      { type: "AI", price: 562.0 },
    ],
    description:
      "Resort populaire au cœur d'Hammamet, accès direct à la plage.",
  },
  {
    id: "dar-said-sidi-bou",
    name: "Dar Saïd Sidi Bou Saïd",
    stars: 4,
    category: "Boutique",
    zone: "Sidi Bou Saïd, Centre historique",
    cityId: 32,
    cityName: "Tunis",
    region: "Tunis & Côtes de Carthage",
    image:
      "https://images.unsplash.com/photo-1542640244-7e672d6cef4e?auto=format&fit=crop&w=900&q=70",
    rating: { score: 8.9, label: "Excellent", reviews: 248 },
    perks: [
      "Boutique-hôtel typique",
      "Patio andalou",
      "Vue sur le golfe",
      "Cuisine méditerranéenne raffinée",
    ],
    amenities: ["wifi", "pool", "spa", "restaurant"],
    recommended: true,
    segments: ["Charme", "Romantique", "Culturel"],
    boardings: [
      { type: "BB", price: 768.0 },
      { type: "HB", price: 925.5 },
    ],
    description:
      "Boutique-hôtel iconique au cœur du village bleu et blanc de Sidi Bou Saïd.",
  },
]

export function getProHotelById(id: string): ProHotel | undefined {
  return PRO_HOTELS.find((h) => h.id === id)
}

export function listProHotels(filter?: {
  cityId?: number
  brand?: string
  searchAll?: boolean
}): ProHotel[] {
  if (!filter || filter.searchAll) return PRO_HOTELS
  return PRO_HOTELS.filter((h) => {
    if (filter.cityId !== undefined && h.cityId !== filter.cityId) return false
    if (filter.brand && h.brand !== filter.brand) return false
    return true
  })
}

export function minBoardingPrice(hotel: ProHotel): number {
  if (hotel.boardings.length === 0) return 0
  return Math.min(...hotel.boardings.map((b) => b.price))
}
