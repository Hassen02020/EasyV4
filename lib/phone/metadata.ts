/**
 * PHONE-INTL-VOLS-HOTELS-MONDE-01 — point d'import unique pour les
 * métadonnées libphonenumber-js, réutilisé par les schémas de validation
 * (lib/hotels-monde/schemas.ts, lib/vols/booking-request-action.ts) et par
 * le composant de saisie (components/ui/phone-input.tsx).
 *
 * `libphonenumber-js/core` (pas la racine du package) + métadonnées
 * explicites plutôt que l'auto-chargement par défaut du package racine :
 * l'auto-chargement casse sous le harnais de test de ce dépôt
 * (`node --import tsx --test`, interop CJS/ESM — erreur "metadata argument
 * was passed but it's not a valid metadata" reproduite et confirmée
 * indépendante de nos fichiers).
 *
 * Import SANS attribut `with { type: "json" }` — testé et confirmé
 * nécessaire dans les deux sens : avec l'attribut, Turbopack (`pnpm build`)
 * casse (il résout l'export "import" du package vers le wrapper
 * `metadata.min.json.js`, qui n'est plus un JSON valide une fois
 * l'assertion de type forcée) ; sans l'attribut, les deux environnements
 * (build Next/Turbopack ET `node --import tsx --test`) résolvent
 * correctement.
 */
import metadata from "libphonenumber-js/metadata.min.json"
import type { CountryCode } from "libphonenumber-js"

export { metadata }
export type { CountryCode }
