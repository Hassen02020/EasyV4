/**
 * R7-01 (audit Phase 7) : registre technique des capacités réelles par
 * module de réservation — source de vérité unique en code, vérifiée par un
 * test statique (`__tests__/capabilities-consistency.test.ts`) qui échoue
 * si ce fichier dérive de la réalité (fichier de booking absent/renommé,
 * fournisseur démo ajouté sous un statut REAL, etc.).
 *
 * Créé après avoir constaté une dérive concrète pendant l'audit : le module
 * Car ("cars") est documenté ailleurs (`EASYV4_CAR_DECISION.md`) comme
 * "couche application : 0%", alors que `lib/cars/actions.ts::createCarBooking`
 * existe déjà et que `/car/search` fonctionne réellement (voir correction
 * apportée à ce document dans le même chantier).
 *
 * Statuts :
 *  - REAL        : recherche + réservation réelles (fournisseur réel type
 *                  myGo, ou catalogue propre à l'agence type Transferts/Car).
 *  - DEMO        : pipeline de réservation réel (paiement, écriture DB,
 *                  confirmation) mais fournisseur de recherche/inventaire
 *                  simulé (`isDemoMode()` + driver `name: "virtual"`) —
 *                  badge "démo" visible côté utilisateur.
 *  - SEARCH_ONLY : recherche fonctionnelle, aucune action de réservation
 *                  câblée derrière.
 *  - NOT_WIRED   : rien de fonctionnel derrière l'entrée du module.
 */

export type ModuleCapabilityStatus =
  | "REAL"
  | "DEMO"
  | "SEARCH_ONLY"
  | "NOT_WIRED"

export interface ModuleCapability {
  label: string
  status: ModuleCapabilityStatus
  note: string
  /** Chemin (relatif à la racine repo) du fichier portant l'action de réservation réelle, si le statut l'exige (REAL/DEMO). */
  bookingActionFile?: string
  /** Chemin du fichier de driver fournisseur, pour les modules DEMO — doit contenir le signal `isDemoMode`/`"virtual"`. */
  demoSupplierFile?: string
}

export const MODULE_CAPABILITIES: Record<string, ModuleCapability> = {
  hotels: {
    label: "Hôtels Tunisie",
    status: "REAL",
    note: "Fournisseur myGo réel. Booking via lib/booking/actions.ts (submitCheckoutAction/createReservationFromDraft).",
    bookingActionFile: "lib/booking/actions.ts",
  },
  hotelsMonde: {
    label: "Hôtels Monde",
    status: "DEMO",
    note: 'Booking réel (paiement/DB/confirmation, lib/hotels-monde/guest-booking-actions.ts), mais fournisseur de recherche/inventaire simulé (isDemoMode, driver "virtual").',
    bookingActionFile: "lib/hotels-monde/guest-booking-actions.ts",
    demoSupplierFile: "lib/hotels-monde/supplier-drivers.ts",
  },
  vols: {
    label: "Vols",
    status: "DEMO",
    note: 'Même schéma que Hôtels Monde : booking réel (lib/vols/guest-booking-actions.ts), fournisseur de recherche simulé (isDemoMode, driver "virtual").',
    bookingActionFile: "lib/vols/guest-booking-actions.ts",
    demoSupplierFile: "lib/vols/supplier-drivers.ts",
  },
  omra: {
    label: "Omra",
    status: "REAL",
    note: "Catalogue propre à l'agence. Booking via lib/omra/booking-actions.ts::createOmraBooking.",
    bookingActionFile: "lib/omra/booking-actions.ts",
  },
  packages: {
    label: "Packages",
    status: "REAL",
    note: "Catalogue propre à l'agence. Booking via lib/packages/booking-actions.ts::createPackageBooking.",
    bookingActionFile: "lib/packages/booking-actions.ts",
  },
  transferts: {
    label: "Transferts",
    status: "REAL",
    note: "Catalogue propre à l'agence. Booking via lib/transfers/actions.ts::createTransferBooking.",
    bookingActionFile: "lib/transfers/actions.ts",
  },
  activities: {
    label: "Activités",
    status: "REAL",
    note: "Catalogue propre à l'agence. Booking via lib/activities/booking-actions.ts::createActivityBooking.",
    bookingActionFile: "lib/activities/booking-actions.ts",
  },
  car: {
    label: "Location de voiture",
    status: "REAL",
    note: "Catalogue propre à l'agence (même modèle que Transferts). Booking via lib/cars/actions.ts::createCarBooking — implémenté depuis la rédaction d'EASYV4_CAR_DECISION.md (Option A), ce document contenait une affirmation obsolète corrigée dans le même chantier (R7-01).",
    bookingActionFile: "lib/cars/actions.ts",
  },
}
