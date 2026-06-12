"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

// Types
export type Language = "fr" | "en" | "ar"
export type Currency = "TND" | "EUR" | "USD"

interface Translation {
  [key: string]: string | Translation
}

interface LanguageCurrencyContextType {
  language: Language
  currency: Currency
  setLanguage: (lang: Language) => void
  setCurrency: (curr: Currency) => void
  t: (key: string) => string
  formatPrice: (amount: number, targetCurrency?: Currency) => string
}

// Traductions par défaut (chargées de manière statique)
const defaultTranslations: Record<Language, Translation> = {
  fr: {
    nav: { home: "Accueil", hotels_tunisia: "Hôtels Tunisie", hotels_world: "Hôtels Monde", flights: "Vols", omra: "Omra", packages: "Voyages Organisés", transfers: "Transferts", car_rental: "Location de voiture", help: "Aide", my_bookings: "Mes Réservations", login: "Connexion", logout: "Déconnexion" },
    footer: {
      services: "Nos Services",
      contact: "Contact",
      legal: "Mentions légales",
      cgv: "CGV",
      privacy: "Politique de confidentialité",
      copyright: "© 2026 Easy2Book. Tous droits réservés. Agence de voyage agréée en Tunisie.",
      trust_badges: {
        payment_secure: "Paiement 100% Sécurisé",
        payment_secure_desc: "SPS / Monétique Tunisie",
        support_local: "Support Local 7j/7",
        support_local_desc: "+216 98 140 514",
        availability: "Disponibilité Réelle",
        availability_desc: "MyGo/APIGDS",
        physical_agency: "Agence Physique",
        physical_agency_desc: "À Tunis"
      }
    },
    filter_sidebar: {
      title: "Affinez vos résultats",
      reset: "Réinitialiser les filtres",
      pricing: "Tarifs et disponibilités",
      recommended: "Hôtel recommandé",
      available_only: "Disponible seulement",
      free_cancellation: "Annulation gratuite",
      category: "Catégorie",
      price_per_night: "Prix ({currency})",
      meal_plan: "Type de pension",
      facilities: "Équipements"
    },
    hotel_card: {
      from: "À partir de",
      view_details: "Voir détails",
      rates_rooms: "Tarifs & chambres",
      room_header: "Chambre 1 : 2 adultes",
      free_cancellation_before: "Annulation gratuite avant le {date}",
      available: "Disponible",
      on_request: "Sur demande",
      book: "Réserver",
      exclusive: "Exclusive",
      add_wishlist: "Ajouter aux favoris",
      remove_wishlist: "Retirer des favoris",
      view_image: "Voir l'image {number}"
    },
    flash_offers: { title: "Nos meilleures offres au départ de Tunis", badge: "Offre Flash", book: "Réserver" },
    currency: { TND: "Dinar tunisien", EUR: "Euro", USD: "Dollar US" },
    language: { fr: "Français", en: "English", ar: "العربية" },
    common: {
      search: "Rechercher",
      book: "Réserver",
      cancel: "Annuler",
      confirm: "Confirmer",
      loading: "Chargement...",
      error: "Erreur",
      success: "Succès",
      required: "*",
      optional: "(optionnel)"
    },
    booking_engine: {
      tabs: { vols: "Vols", hotels_tunisia: "Hôtels Tunisie", hotels_monde: "Hôtels Monde", omraty: "Omraty", voyages_organises: "Voyages Organisés", transfers: "Transferts", car: "Car" },
      coming_soon: "{module} - Bientôt disponible",
      coming_soon_desc: "Ce module sera bientôt disponible sur Easy2Book.",
      search: "RECHERCHER",
      vols: {
        departure: "Départ de",
        destination: "Destination",
        dates: "Dates",
        choose_dates: "Choisir les dates",
        class: "Classe",
        flexible: "Comparer avec les prix flexibles",
        economique: "Économique",
        premium: "Premium",
        business: "Business"
      },
      hotels_monde: {
        destination: "Destination mondiale",
        placeholder: "Ville, hôtel ou aéroport",
        checkin: "Check-in",
        arrival_date: "Date d'arrivée",
        checkout: "Check-out",
        departure_date: "Date de départ"
      },
      omraty: {
        program: "Programme",
        select: "Sélectionner",
        economique: "Économique",
        confort: "Confort",
        prestige: "Prestige",
        departure_month: "Mois de départ",
        choose_month: "Choisir le mois",
        distance_haram: "Distance Haram",
        distance: "Distance",
        flight_type: "Type de vol",
        direct: "Vol direct",
        with_stopover: "Avec escale"
      },
      voyages_organises: {
        destination: "Destination",
        choose_destination: "Choisir une destination",
        turquie: "Turquie",
        egypte: "Égypte",
        dubai: "Dubaï",
        malaisie: "Malaisie",
        thailande: "Thaïlande",
        period: "Période",
        choose_period: "Choisir la période",
        duration: "Durée",
        travelers: "Voyageurs",
        "1_traveler": "1 Voyageur",
        "2_travelers": "2 Voyageurs",
        "3_travelers": "3 Voyageurs",
        "4_travelers": "4 Voyageurs",
        "5_plus_travelers": "5+ Voyageurs"
      },
      transfers: {
        pickup_location: "Lieu de prise en charge",
        airport_port: "Aéroport / Port",
        tunis_airport: "Aéroport Tunis-Carthage",
        enfidha_airport: "Aéroport Enfidha",
        djerba_airport: "Aéroport Djerba",
        monastir_airport: "Aéroport Monastir",
        dropoff_location: "Lieu de dépôt",
        hotel_address: "Hôtel ou adresse",
        date_time: "Date et heure",
        arrival_date: "Date d'arrivée",
        passengers: "Passagers",
        "1_passenger": "1 Passager",
        "2_passengers": "2 Passagers",
        "3_passengers": "3 Passagers",
        "4_passengers": "4 Passagers",
        "5_plus_passengers": "5+ Passagers"
      },
      car: {
        pickup_location: "Lieu de prise en charge",
        airport_city: "Aéroport ou ville",
        hammamet_center: "Hammamet centre",
        sousse_center: "Sousse centre",
        pickup_date: "Date de prise",
        choose_date: "Choisir la date",
        return_date: "Date de retour",
        category: "Catégorie",
        economique: "Économique",
        compact: "Compacte",
        sedan: "Berline",
        suv: "SUV",
        luxury: "Luxe",
        with_driver: "Avec chauffeur"
      }
    },
    booking_form: {
      header: { home: "Accueil", hotels: "Hôtels", apartments: "Appartements", ticket_management: "Gestion des billets", contact: "Contact", info_reservations: "Info Réservations" },
      breadcrumb: { hotel_list: "Liste des hôtels", rates: "Tarifs" },
      warning: { insufficient_balance: "Solde insuffisant", please_fund: "Veuillez recharger votre compte" },
      room_occupancy: "Occupation de la chambre",
      on_request: "Sur demande",
      guest: { adult: "Adulte", primary: "Principal", mr: "M.", last_name: "Nom", first_name: "Prénom" },
      contact_info: "Informations de contact",
      email_placeholder: "email@exemple.com",
      phone_placeholder: "+216 XX XXX XXX",
      cancellation_policy: "Politique d'annulation",
      free_cancellation: "Annulation gratuite",
      until_48h: "jusqu'à 48h avant",
      within_48h: "Dans les 48h",
      no_show: "No-show",
      special_requests: "Demandes spéciales",
      back_to_search: "Retour à la recherche",
      book: "Réserver",
      from: "Du",
      to: "au",
      so: "soit",
      nights: "nuits",
      modify_search: "Modifier la recherche",
      subtotal: "Sous-total"
    },
    adults: "Adultes",
    children: "Enfants"
  },
  en: {
    nav: { home: "Home", hotels_tunisia: "Tunisia Hotels", hotels_world: "World Hotels", flights: "Flights", omra: "Umrah", packages: "Package Tours", transfers: "Transfers", car_rental: "Car Rental", help: "Help", my_bookings: "My Bookings", login: "Login", logout: "Logout" },
    footer: {
      services: "Our Services",
      contact: "Contact",
      legal: "Legal Notice",
      cgv: "Terms of Service",
      privacy: "Privacy Policy",
      copyright: "© 2026 Easy2Book. All rights reserved. Licensed travel agency in Tunisia.",
      trust_badges: {
        payment_secure: "100% Secure Payment",
        payment_secure_desc: "SPS / Monétique Tunisie",
        support_local: "Local Support 7/7",
        support_local_desc: "+216 98 140 514",
        availability: "Real Availability",
        availability_desc: "MyGo/APIGDS",
        physical_agency: "Physical Agency",
        physical_agency_desc: "In Tunis"
      }
    },
    filter_sidebar: {
      title: "Refine your results",
      reset: "Reset filters",
      pricing: "Pricing & availability",
      recommended: "Recommended hotel",
      available_only: "Available only",
      free_cancellation: "Free cancellation",
      category: "Category",
      price_per_night: "Price ({currency})",
      meal_plan: "Meal plan",
      facilities: "Facilities"
    },
    hotel_card: {
      from: "From",
      view_details: "View details",
      rates_rooms: "Rates & rooms",
      room_header: "Room 1 : 2 adults",
      free_cancellation_before: "Free cancellation before {date}",
      available: "Available",
      on_request: "On request",
      book: "Book",
      exclusive: "Exclusive",
      add_wishlist: "Add to wishlist",
      remove_wishlist: "Remove from wishlist",
      view_image: "View image {number}"
    },
    flash_offers: { title: "Our best offers departing from Tunis", badge: "Flash Offer", book: "Book" },
    currency: { TND: "Tunisian Dinar", EUR: "Euro", USD: "US Dollar" },
    language: { fr: "Français", en: "English", ar: "العربية" },
    common: {
      search: "Search",
      book: "Book",
      cancel: "Cancel",
      confirm: "Confirm",
      loading: "Loading...",
      error: "Error",
      success: "Success",
      required: "*",
      optional: "(optional)"
    },
    booking_engine: {
      tabs: { vols: "Flights", hotels_tunisia: "Tunisia Hotels", hotels_monde: "World Hotels", omraty: "Umrah", voyages_organises: "Package Tours", transfers: "Transfers", car: "Car" },
      coming_soon: "{module} - Coming Soon",
      coming_soon_desc: "This module will be available soon on Easy2Book.",
      search: "SEARCH",
      vols: {
        departure: "Departure from",
        destination: "Destination",
        dates: "Dates",
        choose_dates: "Choose dates",
        class: "Class",
        flexible: "Compare with flexible prices",
        economique: "Economy",
        premium: "Premium",
        business: "Business"
      },
      hotels_monde: {
        destination: "Worldwide destination",
        placeholder: "City, hotel or airport",
        checkin: "Check-in",
        arrival_date: "Arrival date",
        checkout: "Check-out",
        departure_date: "Departure date"
      },
      omraty: {
        program: "Program",
        select: "Select",
        economique: "Economy",
        confort: "Comfort",
        prestige: "Prestige",
        departure_month: "Departure month",
        choose_month: "Choose month",
        distance_haram: "Haram Distance",
        distance: "Distance",
        flight_type: "Flight type",
        direct: "Direct flight",
        with_stopover: "With stopover"
      },
      voyages_organises: {
        destination: "Destination",
        choose_destination: "Choose a destination",
        turquie: "Turkey",
        egypte: "Egypt",
        dubai: "Dubai",
        malaisie: "Malaysia",
        thailande: "Thailand",
        period: "Period",
        choose_period: "Choose period",
        duration: "Duration",
        travelers: "Travelers",
        "1_traveler": "1 Traveler",
        "2_travelers": "2 Travelers",
        "3_travelers": "3 Travelers",
        "4_travelers": "4 Travelers",
        "5_plus_travelers": "5+ Travelers"
      },
      transfers: {
        pickup_location: "Pickup location",
        airport_port: "Airport / Port",
        tunis_airport: "Tunis-Carthage Airport",
        enfidha_airport: "Enfidha Airport",
        djerba_airport: "Djerba Airport",
        monastir_airport: "Monastir Airport",
        dropoff_location: "Dropoff location",
        hotel_address: "Hotel or address",
        date_time: "Date and time",
        arrival_date: "Arrival date",
        passengers: "Passengers",
        "1_passenger": "1 Passenger",
        "2_passengers": "2 Passengers",
        "3_passengers": "3 Passengers",
        "4_passengers": "4 Passengers",
        "5_plus_passengers": "5+ Passengers"
      },
      car: {
        pickup_location: "Pickup location",
        airport_city: "Airport or city",
        hammamet_center: "Hammamet center",
        sousse_center: "Sousse center",
        pickup_date: "Pickup date",
        choose_date: "Choose date",
        return_date: "Return date",
        category: "Category",
        economique: "Economy",
        compact: "Compact",
        sedan: "Sedan",
        suv: "SUV",
        luxury: "Luxury",
        with_driver: "With driver"
      }
    },
    booking_form: {
      header: { home: "Home", hotels: "Hotels", apartments: "Apartments", ticket_management: "Ticket Management", contact: "Contact", info_reservations: "Booking Info" },
      breadcrumb: { hotel_list: "Hotel List", rates: "Rates" },
      warning: { insufficient_balance: "Insufficient balance", please_fund: "Please fund your account" },
      room_occupancy: "Room Occupancy",
      on_request: "On Request",
      guest: { adult: "Adult", primary: "Primary", mr: "Mr.", last_name: "Last Name", first_name: "First Name" },
      contact_info: "Contact Information",
      email_placeholder: "email@example.com",
      phone_placeholder: "+216 XX XXX XXX",
      cancellation_policy: "Cancellation Policy",
      free_cancellation: "Free Cancellation",
      until_48h: "until 48h before",
      within_48h: "Within 48h",
      no_show: "No-show",
      special_requests: "Special Requests",
      back_to_search: "Back to Search",
      book: "Book",
      from: "From",
      to: "to",
      so: "so",
      nights: "nights",
      modify_search: "Modify Search",
      subtotal: "Subtotal"
    },
    adults: "Adults",
    children: "Children"
  },
  ar: {
    nav: { home: "الرئيسية", hotels_tunisia: "فنادق تونس", hotels_world: "فنادق العالم", flights: "رحلات", omra: "عمرة", packages: "الرحلات المنظمة", transfers: "نقل", car_rental: "تأجير سيارات", help: "مساعدة", my_bookings: "حجوزاتي", login: "تسجيل الدخول", logout: "تسجيل الخروج" },
    footer: {
      services: "خدماتنا",
      contact: "اتصال",
      legal: "إشعار قانوني",
      cgv: "شروط الخدمة",
      privacy: "سياسة الخصوصية",
      copyright: "© 2026 Easy2Book. جميع الحقوق محفوظة. وكالة سفر مرخصة في تونس.",
      trust_badges: {
        payment_secure: "دفع آمن 100%",
        payment_secure_desc: "SPS / Monétique Tunisie",
        support_local: "دعم محلي 7/7",
        support_local_desc: "+216 98 140 514",
        availability: "توفر حقيقي",
        availability_desc: "MyGo/APIGDS",
        physical_agency: "وكالة مادية",
        physical_agency_desc: "في تونس"
      }
    },
    filter_sidebar: {
      title: "ضيق نتائجك",
      reset: "إعادة تعيين الفلاتر",
      pricing: "الأسعار والتوفر",
      recommended: "فندق موصى به",
      available_only: "متوفر فقط",
      free_cancellation: "إلغاء مجاني",
      category: "الفئة",
      price_per_night: "السعر ({currency})",
      meal_plan: "خطة الوجبات",
      facilities: "المرافق"
    },
    hotel_card: {
      from: "من",
      view_details: "عرض التفاصيل",
      rates_rooms: "الأسعار والغرف",
      room_header: "غرفة 1 : 2 بالغين",
      free_cancellation_before: "إلغاء مجاني قبل {date}",
      available: "متوفر",
      on_request: "عند الطلب",
      book: "احجز",
      exclusive: "حصري",
      add_wishlist: "إضافة إلى المفضلة",
      remove_wishlist: "إزالة من المفضلة",
      view_image: "عرض الصورة {number}"
    },
    flash_offers: { title: "أفضل عروضنا المغادرة من تونس", badge: "عرض فلاش", book: "احجز" },
    currency: { TND: "دينار تونسي", EUR: "يورو", USD: "دولار أمريكي" },
    language: { fr: "Français", en: "English", ar: "العربية" },
    common: {
      search: "بحث",
      book: "حجز",
      cancel: "إلغاء",
      confirm: "تأكيد",
      loading: "جاري التحميل...",
      error: "خطأ",
      success: "نجاح",
      required: "*",
      optional: "(اختياري)"
    },
    booking_engine: {
      tabs: { vols: "رحلات", hotels_tunisia: "فنادق تونس", hotels_monde: "فنادق العالم", omraty: "عمرة", voyages_organises: "الرحلات المنظمة", transfers: "نقل", car: "سيارة" },
      coming_soon: "{module} - قريباً",
      coming_soon_desc: "سيكون هذا الوحدة متاحاً قريباً على Easy2Book.",
      search: "بحث",
      vols: {
        departure: "المغادرة من",
        destination: "الوجهة",
        dates: "التواريخ",
        choose_dates: "اختر التواريخ",
        class: "الدرجة",
        flexible: "مقارنة مع الأسعار المرنة",
        economique: "اقتصادي",
        premium: "مميز",
        business: "رجال الأعمال"
      },
      hotels_monde: {
        destination: "وجهة عالمية",
        placeholder: "مدينة، فندق أو مطار",
        checkin: "تسجيل الوصول",
        arrival_date: "تاريخ الوصول",
        checkout: "تسجيل المغادرة",
        departure_date: "تاريخ المغادرة"
      },
      omraty: {
        program: "البرنامج",
        select: "اختر",
        economique: "اقتصادي",
        confort: "مريح",
        prestige: "فاخر",
        departure_month: "شهر المغادرة",
        choose_month: "اختر الشهر",
        distance_haram: "مسافة الحرم",
        distance: "المسافة",
        flight_type: "نوع الرحلة",
        direct: "رحلة مباشرة",
        with_stopover: "مع توقف"
      },
      voyages_organises: {
        destination: "الوجهة",
        choose_destination: "اختر وجهة",
        turquie: "تركيا",
        egypte: "مصر",
        dubai: "دبي",
        malaisie: "ماليزيا",
        thailande: "تايلاند",
        period: "الفترة",
        choose_period: "اختر الفترة",
        duration: "المدة",
        travelers: "المسافرون",
        "1_traveler": "1 مسافر",
        "2_travelers": "2 مسافرين",
        "3_travelers": "3 مسافرين",
        "4_travelers": "4 مسافرين",
        "5_plus_travelers": "5+ مسافرين"
      },
      transfers: {
        pickup_location: "موقع الاستلام",
        airport_port: "مطار / ميناء",
        tunis_airport: "مطار تونس قرطاج",
        enfidha_airport: "مطار النفيضة",
        djerba_airport: "مطار جربة",
        monastir_airport: "مطار المنستير",
        dropoff_location: "موقع التسليم",
        hotel_address: "فندق أو عنوان",
        date_time: "التاريخ والوقت",
        arrival_date: "تاريخ الوصول",
        passengers: "الركاب",
        "1_passenger": "1 راكب",
        "2_passengers": "2 راكب",
        "3_passengers": "3 ركاب",
        "4_passengers": "4 ركاب",
        "5_plus_passengers": "5+ ركاب"
      },
      car: {
        pickup_location: "موقع الاستلام",
        airport_city: "مطار أو مدينة",
        hammamet_center: "مركز حمامات",
        sousse_center: "مركز سوسة",
        pickup_date: "تاريخ الاستلام",
        choose_date: "اختر التاريخ",
        return_date: "تاريخ الإرجاع",
        category: "الفئة",
        economique: "اقتصادي",
        compact: "مدمج",
        sedan: "سيدان",
        suv: "دفع رباعي",
        luxury: "فاخر",
        with_driver: "مع سائق"
      }
    },
    booking_form: {
      header: { home: "الرئيسية", hotels: "فنادق", apartments: "شقق", ticket_management: "إدارة التذاكر", contact: "اتصال", info_reservations: "معلومات الحجز" },
      breadcrumb: { hotel_list: "قائمة الفنادق", rates: "الأسعار" },
      warning: { insufficient_balance: "رصيد غير كافٍ", please_fund: "يرجى شحن حسابك" },
      room_occupancy: "شغل الغرفة",
      on_request: "عند الطلب",
      guest: { adult: "بالغ", primary: "الرئيسي", mr: "السيد", last_name: "اسم العائلة", first_name: "الاسم الأول" },
      contact_info: "معلومات الاتصال",
      email_placeholder: "بريد@مثال.com",
      phone_placeholder: "+216 XX XXX XXX",
      cancellation_policy: "سياسة الإلغاء",
      free_cancellation: "إلغاء مجاني",
      until_48h: "حتى 48 ساعة قبل",
      within_48h: "خلال 48 ساعة",
      no_show: "عدم الحضور",
      special_requests: "طلبات خاصة",
      back_to_search: "العودة للبحث",
      book: "احجز",
      from: "من",
      to: "إلى",
      so: "أي",
      nights: "ليالي",
      modify_search: "تعديل البحث",
      subtotal: "المجموع الفرعي"
    },
    adults: "بالغين",
    children: "أطفال"
  }
}

// Configuration des devises par langue
const defaultCurrencyByLanguage: Record<Language, Currency> = {
  fr: "EUR",
  en: "USD",
  ar: "TND",
}

// Configuration des symboles et formats
const currencyConfig: Record<Currency, { symbol: string; locale: string }> = {
  TND: { symbol: "د.ت", locale: "ar-TN" },
  EUR: { symbol: "€", locale: "fr-FR" },
  USD: { symbol: "$", locale: "en-US" },
}

// Context
const LanguageCurrencyContext = createContext<LanguageCurrencyContextType | undefined>(
  undefined,
)

// Provider
export function LanguageCurrencyProvider({ children }: { children: ReactNode }) {
  // Initialisation avec valeurs par défaut (cohérentes serveur/client)
  // NE PAS accéder à localStorage dans useState pour éviter les problèmes SSR
  const [language, setLanguageState] = useState<Language>("fr")
  const [currency, setCurrencyState] = useState<Currency>("EUR")
  const [isMounted, setIsMounted] = useState(false)

  // Initialisation côté client après le premier rendu
  useEffect(() => {
    setIsMounted(true)
    const savedLang = localStorage.getItem("easy2book_language") as Language
    const savedCurrency = localStorage.getItem("easy2book_currency") as Currency
    
    if (savedLang && ["fr", "en", "ar"].includes(savedLang)) {
      setLanguageState(savedLang)
    }
    if (savedCurrency && ["TND", "EUR", "USD"].includes(savedCurrency)) {
      setCurrencyState(savedCurrency)
    }
  }, [])

  // Gestion du RTL sur l'élément html
  useEffect(() => {
    if (!isMounted) return // Ne pas exécuter côté serveur
    const html = document.documentElement
    if (language === "ar") {
      html.setAttribute("dir", "rtl")
      html.setAttribute("lang", "ar")
    } else {
      html.setAttribute("dir", "ltr")
      html.setAttribute("lang", language)
    }
  }, [language, isMounted])

  // Sauvegarde dans localStorage
  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    if (typeof window !== "undefined") {
      localStorage.setItem("easy2book_language", lang)
      // Changer la devise par défaut quand on change de langue
      const newCurrency = defaultCurrencyByLanguage[lang]
      setCurrencyState(newCurrency)
      localStorage.setItem("easy2book_currency", newCurrency)
    }
  }

  const setCurrency = (curr: Currency) => {
    setCurrencyState(curr)
    if (typeof window !== "undefined") {
      localStorage.setItem("easy2book_currency", curr)
    }
  }

  // Fonction de traduction
  const t = (key: string): string => {
    const keys = key.split(".")
    let value: Translation | string = defaultTranslations[language]

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k]
      } else {
        return key // Retourne la clé si non trouvée
      }
    }

    return typeof value === "string" ? value : key
  }

  // Formatage des prix
  const formatPrice = (amount: number, targetCurrency?: Currency): string => {
    const curr = targetCurrency || currency
    const config = currencyConfig[curr]
    
    // Utiliser la locale de la langue actuelle pour le formatage
    const locale = language === "ar" ? "ar-TN" : language === "fr" ? "fr-FR" : "en-US"
    
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: curr,
        minimumFractionDigits: curr === "TND" ? 3 : 2,
        maximumFractionDigits: curr === "TND" ? 3 : 2,
      }).format(amount)
    } catch {
      // Fallback en cas d'erreur
      return `${config.symbol} ${amount.toFixed(curr === "TND" ? 3 : 2)}`
    }
  }

  const value: LanguageCurrencyContextType = {
    language,
    currency,
    setLanguage,
    setCurrency,
    t,
    formatPrice,
  }

  return (
    <LanguageCurrencyContext.Provider value={value}>
      {children}
    </LanguageCurrencyContext.Provider>
  )
}

// Hook personnalisé
export function useLanguageCurrency() {
  const context = useContext(LanguageCurrencyContext)
  if (context === undefined) {
    throw new Error("useLanguageCurrency must be used within a LanguageCurrencyProvider")
  }
  return context
}
