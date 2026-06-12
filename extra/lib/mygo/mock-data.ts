/**
 * Données fictives pour le mode Mock du client MyGo.
 *
 * Activé automatiquement quand MYGO_LOGIN ou MYGO_PASSWORD sont absents.
 * Les données respectent scrupuleusement les schemas Zod pour validation.
 */

import type {
  ListCityItemT,
  ListHotelItemT,
  HotelDetailItemT,
  HotelSearchResultItemT,
} from "./schemas"

// ---------------------------------------------------------------------------
// Villes tunisiennes
// ---------------------------------------------------------------------------

export const MOCK_CITIES: ListCityItemT[] = [
  {
    Id: 1,
    Name: "Djerba",
    Region: "Médenine",
    Country: { Id: 227, Name: "Tunisie" },
  },
  {
    Id: 2,
    Name: "Hammamet",
    Region: "Nabeul",
    Country: { Id: 227, Name: "Tunisie" },
  },
  {
    Id: 3,
    Name: "Sousse",
    Region: "Sousse",
    Country: { Id: 227, Name: "Tunisie" },
  },
  {
    Id: 4,
    Name: "Mahdia",
    Region: "Mahdia",
    Country: { Id: 227, Name: "Tunisie" },
  },
  {
    Id: 5,
    Name: "Monastir",
    Region: "Monastir",
    Country: { Id: 227, Name: "Tunisie" },
  },
  {
    Id: 6,
    Name: "Nabeul",
    Region: "Nabeul",
    Country: { Id: 227, Name: "Tunisie" },
  },
  {
    Id: 7,
    Name: "Tunis",
    Region: "Tunis",
    Country: { Id: 227, Name: "Tunisie" },
  },
  {
    Id: 8,
    Name: "Bizerte",
    Region: "Bizerte",
    Country: { Id: 227, Name: "Tunisie" },
  },
]

// ---------------------------------------------------------------------------
// Hôtels fictifs (par ville)
// ---------------------------------------------------------------------------

const createHotel = (
  id: number,
  name: string,
  cityId: number,
  cityName: string,
  stars: number,
  image: string,
): ListHotelItemT => ({
  Id: id,
  Name: name,
  Category: { Id: stars, Title: `${stars} étoiles`, Star: stars },
  City: {
    Id: cityId,
    Name: cityName,
    Country: { Id: 227, Name: "Tunisie" },
  },
  Adress: `${name}, ${cityName}, Tunisie`,
  Image: image,
  Localization: { Longitude: "10.0000", Latitude: "35.0000" },
  Facilities: [
    { Title: "Piscine", Category: "Sport" },
    { Title: "WiFi", Category: "Service" },
    { Title: "Restaurant", Category: "Restauration" },
    { Title: "Parking", Category: "Service" },
  ],
  Theme: ["Famille", "Plage"],
  Note: "Hôtel recommandé",
})

export const MOCK_HOTELS: ListHotelItemT[] = [
  // Djerba
  createHotel(
    101,
    "Hôtel Yadis Djerba Golf",
    1,
    "Djerba",
    4,
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
  ),
  createHotel(
    102,
    "Iberostar Mehari Djerba",
    1,
    "Djerba",
    4,
    "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80",
  ),
  createHotel(
    103,
    "Vincci Marillia Djerba",
    1,
    "Djerba",
    5,
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
  ),
  // Hammamet
  createHotel(
    201,
    "Hasdrubal Thalassa & Spa",
    3,
    "Hammamet",
    4,
    "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80",
  ),
  createHotel(
    202,
    "Royal Azur Thalassa",
    3,
    "Hammamet",
    4,
    "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800&q=80",
  ),
  createHotel(
    203,
    "Concorde Marco Polo",
    3,
    "Hammamet",
    4,
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80",
  ),
  createHotel(
    204,
    "Vincci Lella Baya",
    3,
    "Hammamet",
    5,
    "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80",
  ),
  // Sousse
  createHotel(
    301,
    "Iberostar Selection Diar El Andalous",
    2,
    "Sousse",
    5,
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&q=80",
  ),
  createHotel(
    302,
    "El Mouradi Palm Marina",
    2,
    "Sousse",
    4,
    "https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=800&q=80",
  ),
  // Mahdia
  createHotel(
    401,
    "El Mouradi Mahdia",
    4,
    "Mahdia",
    4,
    "https://images.unsplash.com/photo-1584132967474-5c38948af9f8?w=800&q=80",
  ),
  createHotel(
    402,
    "Thalassa Mahdia",
    4,
    "Mahdia",
    4,
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
  ),
  // Monastir
  createHotel(
    501,
    "El Mouradi Skanes",
    5,
    "Monastir",
    4,
    "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80",
  ),
  // Nabeul
  createHotel(
    601,
    "Sentido Djerba Beach",
    6,
    "Nabeul",
    4,
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
  ),
  // Tunis
  createHotel(
    701,
    "Sheraton Tunis Hotel",
    7,
    "Tunis",
    5,
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
  ),
  createHotel(
    702,
    "Le Corail Suites Hotel",
    7,
    "Tunis",
    4,
    "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80",
  ),
]

// ---------------------------------------------------------------------------
// Détails hôtel (avec album)
// ---------------------------------------------------------------------------

export const MOCK_HOTEL_DETAILS: Record<number, HotelDetailItemT> = {
  101: {
    Id: 101,
    Name: "Hôtel Yadis Djerba Golf",
    Category: { Id: 4, Title: "4 étoiles", Star: 4 },
    City: {
      Id: 1,
      Name: "Djerba",
      Region: "Médenine",
      Country: { Id: 227, Name: "Tunisie" },
    },
    Email: "info@yadisdjerba.com",
    Phone: "+216 75 650 000",
    ShortDescription: "Hôtel 4 étoiles avec parcours de golf, situé à proximité de la plage de Djerba.",
    LongDescription:
      "L'Hôtel Yadis Djerba Golf est un établissement 4 étoiles situé sur l'île de Djerba. Il dispose d'un parcours de golf 18 trous, de plusieurs piscines, d'un spa et de restaurants variés. Les chambres sont spacieuses et modernes, offrant une vue sur le jardin ou la mer. L'hôtel est idéal pour les familles et les golfeurs.",
    Adress: "Zone Touristique, Midoun, Djerba, Tunisie",
    Localization: { Longitude: "10.8553", Latitude: "33.8075" },
    CheckIn: "14:00",
    CheckOut: "12:00",
    Type: "Résidence",
    Image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
    Album: [
      {
        Url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
        Description: "Vue de l'hôtel",
        Alt: "Hôtel Yadis Djerba Golf",
      },
      {
        Url: "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80",
        Description: "Piscine",
        Alt: "Piscine de l'hôtel",
      },
      {
        Url: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
        Description: "Chambre",
        Alt: "Chambre confort",
      },
      {
        Url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80",
        Description: "Restaurant",
        Alt: "Restaurant principal",
      },
    ],
    Facilities: [
      { Title: "Piscine extérieure", Category: "Sport" },
      { Title: "Piscine intérieure", Category: "Sport" },
      { Title: "Golf 18 trous", Category: "Sport" },
      { Title: "Spa", Category: "Bien-être" },
      { Title: "Salle de sport", Category: "Sport" },
      { Title: "WiFi gratuit", Category: "Service" },
      { Title: "Restaurant", Category: "Restauration" },
      { Title: "Bar", Category: "Restauration" },
      { Title: "Parking gratuit", Category: "Service" },
      { Title: "Réception 24h/24", Category: "Service" },
    ],
    Option: [
      { Id: 1, Title: "Petit-déjeuner inclus" },
      { Id: 2, Title: "Demi-pension" },
      { Id: 3, Title: "Pension complète" },
      { Id: 4, Title: "All Inclusive" },
    ],
    Theme: ["Famille", "Golf", "Plage", "Bien-être"],
    Note: "Hôtel très bien noté par nos clients",
  },
  201: {
    Id: 201,
    Name: "Hasdrubal Thalassa & Spa",
    Category: { Id: 4, Title: "4 étoiles", Star: 4 },
    City: {
      Id: 3,
      Name: "Hammamet",
      Region: "Nabeul",
      Country: { Id: 227, Name: "Tunisie" },
    },
    Email: "info@hasdrubal.com",
    Phone: "+216 72 280 000",
    ShortDescription: "Hôtel thalasso avec vue sur la mer à Hammamet.",
    LongDescription:
      "Le Hasdrubal Thalassa & Spa est un hôtel 4 étoiles situé face à la mer à Hammamet. Il dispose d'un centre thalasso réputé, de piscines intérieure et extérieure, et de chambres confortables avec balcon. L'hôtel propose une cuisine tunisienne et internationale.",
    Adress: "Boulevard 14 Janvier, Hammamet, Tunisie",
    Localization: { Longitude: "10.6035", Latitude: "36.3985" },
    CheckIn: "14:00",
    CheckOut: "12:00",
    Type: "Hôtel",
    Image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80",
    Album: [
      {
        Url: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80",
        Description: "Vue de l'hôtel",
        Alt: "Hasdrubal Thalassa",
      },
      {
        Url: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800&q=80",
        Description: "Spa",
        Alt: "Centre thalasso",
      },
    ],
    Facilities: [
      { Title: "Centre thalasso", Category: "Bien-être" },
      { Title: "Piscine", Category: "Sport" },
      { Title: "Spa", Category: "Bien-être" },
      { Title: "WiFi", Category: "Service" },
      { Title: "Restaurant", Category: "Restauration" },
    ],
    Option: [
      { Id: 1, Title: "Petit-déjeuner inclus" },
      { Id: 2, Title: "Demi-pension" },
    ],
    Theme: ["Bien-être", "Plage", "Couple"],
    Note: "Excellent centre thalasso",
  },
}

// ---------------------------------------------------------------------------
// Résultats de recherche (avec prix)
// ---------------------------------------------------------------------------

export const MOCK_SEARCH_RESULTS: HotelSearchResultItemT[] = MOCK_HOTELS.map(
  (hotel, hotelIndex) => ({
    Hotel: hotel,
    Token: `token-${hotel.Id}-${Date.now()}`,
    Price: {
      Boarding: [
        {
          Id: 1,
          Code: "RO",
          Name: "Logement seul",
          Description: "Sans pension",
          Pax: [
            {
              Adult: 2,
              Child: [],
              Rooms: [
                {
                  Id: hotelIndex * 100 + 1,
                  Name: "Chambre Standard",
                  Photo: hotel.Image,
                  Description: "Chambre confortable avec vue jardin",
                  Icones: [],
                  Quantity: 1,
                  Price: hotel.Id * 100 + 50,
                  BasePrice: hotel.Id * 100,
                  PriceWithAffiliateMarkup: hotel.Id * 100 + 50,
                  StopReservation: false,
                  OnRequest: false,
                  NotRefundable: false,
                  CancellationPolicy: [
                    {
                      Fees: hotel.Id * 20,
                      Type: "PRICE",
                      Nature: "BEFORE_ARRIVAL",
                      FromDate: "2026-06-01",
                      MinStay: 2,
                      MaxStay: 14,
                    },
                  ],
                  CancellationDeadline: "48h avant arrivée",
                },
              ],
            },
          ],
        },
        {
          Id: 2,
          Code: "BB",
          Name: "Petit-déjeuner",
          Description: "Petit-déjeuner buffet inclus",
          Pax: [
            {
              Adult: 2,
              Child: [],
              Rooms: [
                {
                  Id: hotelIndex * 100 + 2,
                  Name: "Chambre Standard",
                  Photo: hotel.Image,
                  Description: "Chambre confortable avec vue jardin",
                  Icones: [],
                  Quantity: 1,
                  Price: hotel.Id * 100 + 80,
                  BasePrice: hotel.Id * 100 + 30,
                  PriceWithAffiliateMarkup: hotel.Id * 100 + 80,
                  StopReservation: false,
                  OnRequest: false,
                  NotRefundable: false,
                  CancellationPolicy: [
                    {
                      Fees: hotel.Id * 25,
                      Type: "PRICE",
                      Nature: "BEFORE_ARRIVAL",
                      FromDate: "2026-06-01",
                      MinStay: 2,
                      MaxStay: 14,
                    },
                  ],
                  CancellationDeadline: "48h avant arrivée",
                },
              ],
            },
          ],
        },
        {
          Id: 3,
          Code: "HB",
          Name: "Demi-pension",
          Description: "Petit-déjeuner + dîner inclus",
          Pax: [
            {
              Adult: 2,
              Child: [],
              Rooms: [
                {
                  Id: hotelIndex * 100 + 3,
                  Name: "Chambre Standard",
                  Photo: hotel.Image,
                  Description: "Chambre confortable avec vue jardin",
                  Icones: [],
                  Quantity: 1,
                  Price: hotel.Id * 100 + 120,
                  BasePrice: hotel.Id * 100 + 70,
                  PriceWithAffiliateMarkup: hotel.Id * 100 + 120,
                  StopReservation: false,
                  OnRequest: false,
                  NotRefundable: false,
                  CancellationPolicy: [
                    {
                      Fees: hotel.Id * 30,
                      Type: "PRICE",
                      Nature: "BEFORE_ARRIVAL",
                      FromDate: "2026-06-01",
                      MinStay: 2,
                      MaxStay: 14,
                    },
                  ],
                  CancellationDeadline: "72h avant arrivée",
                },
              ],
            },
          ],
        },
        {
          Id: 4,
          Code: "AI",
          Name: "All Inclusive",
          Description: "Pension complète illimitée",
          Pax: [
            {
              Adult: 2,
              Child: [],
              Rooms: [
                {
                  Id: hotelIndex * 100 + 4,
                  Name: "Chambre Standard",
                  Photo: hotel.Image,
                  Description: "Chambre confortable avec vue jardin",
                  Icones: [],
                  Quantity: 1,
                  Price: hotel.Id * 100 + 180,
                  BasePrice: hotel.Id * 100 + 130,
                  PriceWithAffiliateMarkup: hotel.Id * 100 + 180,
                  StopReservation: false,
                  OnRequest: false,
                  NotRefundable: true,
                  CancellationPolicy: [
                    {
                      Fees: hotel.Id * 50,
                      Type: "PERCENT",
                      Nature: "BEFORE_ARRIVAL",
                      FromDate: "2026-06-01",
                      MinStay: 3,
                      MaxStay: 14,
                    },
                  ],
                  CancellationDeadline: "Non remboursable",
                },
              ],
            },
          ],
        },
      ],
      BasePrice: hotel.Id * 100,
      Currency: "TND",
    },
    Source: "mygo",
    Currency: "TND",
    Recommended: hotel.Id % 3 === 0,
  }),
)
