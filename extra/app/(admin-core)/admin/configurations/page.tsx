/**
 * Page Configurations - Feature Flags
 *
 * Interface de gestion des Feature Flags pour activer/désactiver
 * les flux XML des 7 modules de réservation. Permet au Super Admin
 * de contrôler la disponibilité de chaque module sans déploiement.
 *
 * Modules contrôlables :
 *  - Hôtels Tunisie (MyGo)
 *  - Hôtels Monde (Expedia/Booking.com)
 *  - Vols (Amadeus/Sabre)
 *  - Omraty (API Omra)
 *  - Voyages Organisés (Catalog interne)
 *  - Transferts (Catalog interne)
 *  - Car (API Location)
 *
 * Les flags sont stockés dans la table module_configs (PostgreSQL).
 */

import { getModuleConfigs } from "./actions"
import { ConfigurationsClient } from "./configurations-client"

export default async function ConfigurationsPage() {
  const result = await getModuleConfigs()
  const configs = result.success ? result.data ?? [] : []
  return <ConfigurationsClient initialConfigs={configs} />
}
