/**
 * EASY2BOOK — SUPPLIER CONNECTIVITY LADDER
 *
 * Modélise la question centrale du réseau :
 * «Comment pouvons-nous vous connecter au réseau Easy2Book ?»
 *
 * Deux dimensions DISTINCTES (voir vision produit §5) :
 *
 * 1. ConnectivityLevel (L0→L5) : dimension TECHNIQUE
 *    Comment le fournisseur échange des données. Ne jamais l'utiliser
 *    comme score de qualité commerciale.
 *
 * 2. CertificationStatus : dimension QUALITÉ/COMMERCIALE
 *    Valeur commerciale du fournisseur dans le réseau. Un artisan L0
 *    peut être premium_partner. Un GDS L5 peut être simplement registered.
 *
 * Usage : les types ici sont les contrats de domaine ; les enums DB
 * correspondants vivent dans lib/db/schema/suppliers.ts.
 */

// ---------------------------------------------------------------------------
// Connectivity Level — dimension technique
// ---------------------------------------------------------------------------

export type ConnectivityLevel =
  | "l0_manual"
  | "l1_portal"
  | "l2_file"
  | "l3_api"
  | "l4_xml_gds"
  | "l5_native"

export const CONNECTIVITY_LEVELS: ConnectivityLevel[] = [
  "l0_manual",
  "l1_portal",
  "l2_file",
  "l3_api",
  "l4_xml_gds",
  "l5_native",
]

export const CONNECTIVITY_LEVEL_LABELS: Record<ConnectivityLevel, string> = {
  l0_manual:   "L0 · Manuel",
  l1_portal:   "L1 · Portail",
  l2_file:     "L2 · Fichier / CSV",
  l3_api:      "L3 · API",
  l4_xml_gds:  "L4 · XML / GDS / NDC",
  l5_native:   "L5 · Natif temps réel",
}

export const CONNECTIVITY_LEVEL_DESCRIPTIONS: Record<ConnectivityLevel, string> = {
  l0_manual:
    "Aucun logiciel — le fournisseur gère ses produits, disponibilités et prix directement dans le portail Easy2Book.",
  l1_portal:
    "Le fournisseur opère son propre Supplier Node dans la plateforme Easy2Book (produits, inventaire, tarifs, bookings, documents).",
  l2_file:
    "Le fournisseur synchronise via des fichiers structurés (CSV, Excel). Import/export planifié, normalisation vers le modèle Canonical.",
  l3_api:
    "Le fournisseur expose une API REST/JSON (search, availability, pricing, booking, cancellation, webhooks).",
  l4_xml_gds:
    "Intégration XML/SOAP ou accès GDS/NDC/standards B2B (OTA, Travelgate, Hotelbeds, Amadeus, Sabre…).",
  l5_native:
    "Intégration native temps réel : inventory live, pricing dynamique, webhooks, reconciliation, SLA monitoring.",
}

/** Capabilities qu'on peut attendre à chaque niveau de connectivité. */
export const CONNECTIVITY_LEVEL_CAPABILITIES: Record<ConnectivityLevel, string[]> = {
  l0_manual:  ["product_catalog", "availability_manual", "booking_manual"],
  l1_portal:  ["product_catalog", "availability_managed", "booking_managed", "cancellation_managed"],
  l2_file:    ["product_catalog", "availability_import", "pricing_import"],
  l3_api:     ["search", "availability", "pricing", "booking", "cancellation", "retrieve"],
  l4_xml_gds: ["search", "availability", "pricing", "booking", "cancellation", "retrieve", "modify"],
  l5_native:  ["search", "availability", "pricing", "booking", "cancellation", "retrieve", "modify", "webhook", "reconciliation", "health_monitoring"],
}

// ---------------------------------------------------------------------------
// Certification Status — dimension qualité/commerciale
// ---------------------------------------------------------------------------

export type CertificationStatus =
  | "registered"
  | "verified"
  | "connected"
  | "certified"
  | "premium_partner"

export const CERTIFICATION_STATUSES: CertificationStatus[] = [
  "registered",
  "verified",
  "connected",
  "certified",
  "premium_partner",
]

export const CERTIFICATION_STATUS_LABELS: Record<CertificationStatus, string> = {
  registered:      "Enregistré",
  verified:        "Vérifié",
  connected:       "Connecté",
  certified:       "Certifié",
  premium_partner: "Partenaire Premium",
}

// ---------------------------------------------------------------------------
// Connection Profile — décrit comment se connecter à un fournisseur donné
// ---------------------------------------------------------------------------

/**
 * ConnectionProfile : snapshot de la configuration de connexion d'un fournisseur.
 * Stocké en JSONB sur la colonne `config` de la table `suppliers`.
 * Ne contient JAMAIS de secrets (credentials → lib/security/secret-crypto.ts).
 */
export interface ConnectionProfile {
  /** Niveau de connectivité réel actuellement actif. */
  activeLevel: ConnectivityLevel

  /** Niveaux supportés par ce fournisseur (peut évoluer dans le temps). */
  supportedLevels: ConnectivityLevel[]

  /** Méthode de connexion primaire (free-form pour les L3–L5). */
  primaryMethod?: string

  /** Modules couverts par cette connexion. */
  modules: SupplierModule[]

  /** Documentation de l'API du fournisseur (URL ou description). */
  apiDocUrl?: string

  /** Environnements disponibles. */
  environments?: Array<"production" | "sandbox" | "virtual">

  /** Notes opérationnelles (pas affichées publiquement). */
  notes?: string
}

export type SupplierModule =
  | "hotel"
  | "flight"
  | "package"
  | "transfer"
  | "car"
  | "activity"
  | "omra"
  | "restaurant"
  | "guide"
  | "cruise"
  | "other"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Retourne true si le niveau `a` est supérieur ou égal à `b`. */
export function connectivityAtLeast(a: ConnectivityLevel, b: ConnectivityLevel): boolean {
  return CONNECTIVITY_LEVELS.indexOf(a) >= CONNECTIVITY_LEVELS.indexOf(b)
}

/** Retourne le niveau numérique (0–5) d'un ConnectivityLevel. */
export function connectivityLevelIndex(level: ConnectivityLevel): number {
  return CONNECTIVITY_LEVELS.indexOf(level)
}

/**
 * Vérifie si un fournisseur au niveau `level` supporte les capacités listées.
 * Utilisé pour filtrer les fournisseurs par capacité dans l'orchestration.
 */
export function supportsCapability(level: ConnectivityLevel, capability: string): boolean {
  return CONNECTIVITY_LEVEL_CAPABILITIES[level].includes(capability)
}
