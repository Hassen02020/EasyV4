/**
 * Voucher i18n — traductions pour les PDFs de voucher (FR / EN / AR).
 * Les PDFs sont rendus côté serveur (pas de hooks) : les labels sont
 * passés en paramètre lors de l'appel à renderXxxVoucherPdf(data, locale).
 */

export interface VoucherLabels {
  /* Header */
  bookingRef: string
  /* Voucher titles */
  hotelTitle: string
  flightTitle: string
  omraTitle: string
  packageTitle: string
  activityTitle: string
  /* Sections */
  clientSection: string
  accommodationSection: string
  flightSection: string
  omraProgramSection: string
  groupContactSection: string
  tripSection: string
  activitySection: string
  agencyContactTitle: string
  /* Client fields */
  fullName: string
  status: string
  /* Status values */
  statusConfirmed: string
  statusPending: string
  statusCancelled: string
  /* Accommodation fields */
  hotel: string
  room: string
  board: string
  checkIn: string
  checkOut: string
  adults: string
  children: string
  nightsLabel: string
  nightsText: (n: number) => string
  /* Flight fields */
  route: string
  pnr: string
  flightNumber: string
  departure: string
  arrival: string
  cabin: string
  /* Omra / Package fields */
  packageLabel: string
  departureDate: string
  returnDate: string
  pilgrimsText: (n: number) => string
  /* Activity fields */
  activityLabel: string
  sessionDate: string
  schedule: string
  /* Total */
  totalAmount: string
  /* Stamp */
  confirmedStamp: string
  /* Footer */
  generatedOn: string
  /* Agency contact */
  emailLabel: string
  whatsappLabel: string
  websiteLabel: string
}

const FR: VoucherLabels = {
  bookingRef: "N° Réservation",
  hotelTitle: "Voucher de Confirmation Hôtel",
  flightTitle: "Voucher de Confirmation Vol",
  omraTitle: "Voucher de Confirmation Omra",
  packageTitle: "Voucher de Confirmation Voyage Organisé",
  activityTitle: "Voucher de Confirmation Attraction",
  clientSection: "Client",
  accommodationSection: "Hébergement",
  flightSection: "Vol",
  omraProgramSection: "Programme Omra",
  groupContactSection: "Contact du groupe",
  tripSection: "Voyage",
  activitySection: "Attraction",
  agencyContactTitle: "Contact Agence",
  fullName: "Nom complet",
  status: "Statut",
  statusConfirmed: "CONFIRMÉ",
  statusPending: "EN ATTENTE",
  statusCancelled: "ANNULÉ",
  hotel: "Hôtel",
  room: "Chambre",
  board: "Pension",
  checkIn: "Check-in",
  checkOut: "Check-out",
  adults: "Adultes",
  children: "Enfants",
  nightsLabel: "Nuitées",
  nightsText: (n) => `${n} nuit${n > 1 ? "s" : ""}`,
  route: "Trajet",
  pnr: "PNR",
  flightNumber: "Vol",
  departure: "Départ",
  arrival: "Arrivée",
  cabin: "Cabine",
  packageLabel: "Package",
  departureDate: "Date de départ",
  returnDate: "Date de retour",
  pilgrimsText: (n) => `${n} pèlerin${n > 1 ? "s" : ""}`,
  activityLabel: "Attraction",
  sessionDate: "Date de la session",
  schedule: "Horaires",
  totalAmount: "Montant Total TTC",
  confirmedStamp: "✓ Réservation Confirmée",
  generatedOn: "Généré le",
  emailLabel: "Email",
  whatsappLabel: "WhatsApp",
  websiteLabel: "Web",
}

const EN: VoucherLabels = {
  bookingRef: "Booking Ref.",
  hotelTitle: "Hotel Booking Confirmation",
  flightTitle: "Flight Booking Confirmation",
  omraTitle: "Omra Booking Confirmation",
  packageTitle: "Package Tour Booking Confirmation",
  activityTitle: "Activity Booking Confirmation",
  clientSection: "Guest",
  accommodationSection: "Accommodation",
  flightSection: "Flight",
  omraProgramSection: "Omra Program",
  groupContactSection: "Group Contact",
  tripSection: "Trip",
  activitySection: "Activity",
  agencyContactTitle: "Agency Contact",
  fullName: "Full name",
  status: "Status",
  statusConfirmed: "CONFIRMED",
  statusPending: "PENDING",
  statusCancelled: "CANCELLED",
  hotel: "Hotel",
  room: "Room",
  board: "Board",
  checkIn: "Check-in",
  checkOut: "Check-out",
  adults: "Adults",
  children: "Children",
  nightsLabel: "Nights",
  nightsText: (n) => `${n} night${n > 1 ? "s" : ""}`,
  route: "Route",
  pnr: "PNR",
  flightNumber: "Flight",
  departure: "Departure",
  arrival: "Arrival",
  cabin: "Cabin",
  packageLabel: "Package",
  departureDate: "Departure date",
  returnDate: "Return date",
  pilgrimsText: (n) => `${n} pilgrim${n > 1 ? "s" : ""}`,
  activityLabel: "Activity",
  sessionDate: "Session date",
  schedule: "Schedule",
  totalAmount: "Total Amount (incl. taxes)",
  confirmedStamp: "✓ Booking Confirmed",
  generatedOn: "Generated on",
  emailLabel: "Email",
  whatsappLabel: "WhatsApp",
  websiteLabel: "Web",
}

const AR: VoucherLabels = {
  bookingRef: "رقم الحجز",
  hotelTitle: "تأكيد حجز الفندق",
  flightTitle: "تأكيد حجز الطيران",
  omraTitle: "تأكيد حجز العمرة",
  packageTitle: "تأكيد حجز الرحلة السياحية",
  activityTitle: "تأكيد حجز النشاط",
  clientSection: "معلومات العميل",
  accommodationSection: "الإقامة",
  flightSection: "رحلة الطيران",
  omraProgramSection: "برنامج العمرة",
  groupContactSection: "جهة اتصال المجموعة",
  tripSection: "الرحلة",
  activitySection: "النشاط",
  agencyContactTitle: "معلومات الوكالة",
  fullName: "الاسم الكامل",
  status: "الحالة",
  statusConfirmed: "مؤكد",
  statusPending: "في الانتظار",
  statusCancelled: "ملغى",
  hotel: "الفندق",
  room: "نوع الغرفة",
  board: "نوع الإقامة",
  checkIn: "تاريخ الوصول",
  checkOut: "تاريخ المغادرة",
  adults: "البالغون",
  children: "الأطفال",
  nightsLabel: "الليالي",
  nightsText: (n) => `${n} ليلة`,
  route: "المسار",
  pnr: "رمز الحجز",
  flightNumber: "رقم الرحلة",
  departure: "المغادرة",
  arrival: "الوصول",
  cabin: "درجة السفر",
  packageLabel: "الباقة",
  departureDate: "تاريخ المغادرة",
  returnDate: "تاريخ العودة",
  pilgrimsText: (n) => `${n} حاج`,
  activityLabel: "النشاط",
  sessionDate: "تاريخ الجلسة",
  schedule: "مواعيد الجلسة",
  totalAmount: "المبلغ الإجمالي شامل الضريبة",
  confirmedStamp: "✓ تم تأكيد الحجز",
  generatedOn: "تاريخ الإصدار",
  emailLabel: "البريد الإلكتروني",
  whatsappLabel: "واتساب",
  websiteLabel: "الموقع",
}

export function getVoucherLabels(locale?: string): VoucherLabels {
  if (locale === "en") return EN
  if (locale === "ar") return AR
  return FR
}

export function isRTL(locale?: string): boolean {
  return locale === "ar"
}

/** Locale-aware date formatting for PDF (no React hooks) */
export function formatDateForLocale(iso: string, locale?: string): string {
  const l = locale === "en" ? "en-GB" : locale === "ar" ? "ar-TN" : "fr-FR"
  try {
    return new Date(iso).toLocaleDateString(l, {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

export function formatDateTimeForLocale(iso: string, locale?: string): string {
  const l = locale === "en" ? "en-GB" : locale === "ar" ? "ar-TN" : "fr-FR"
  try {
    return new Date(iso).toLocaleString(l, {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function formatGeneratedDate(locale?: string): string {
  const l = locale === "en" ? "en-GB" : locale === "ar" ? "ar-TN" : "fr-FR"
  return new Date().toLocaleDateString(l)
}
