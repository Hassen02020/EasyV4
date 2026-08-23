/**
 * Tunisia Bed — DOCUMENTATION_REQUIRED.
 *
 * Aucune documentation API (endpoints, format XML/JSON, contrat
 * d'authentification) n'a été fournie ni trouvée dans ce dépôt/environnement.
 * Conformément à la règle de la mission ("If documentation is missing: mark
 * the driver as NOT_CONFIGURED / DOCUMENTATION_REQUIRED. Do not fabricate
 * an implementation"), aucun endpoint, tag XML, champ d'authentification ou
 * de réservation n'a été inventé ici.
 *
 * Noms de variables d'environnement définis par avance (section 6 de la
 * mission) pour que la configuration future n'exige aucun changement de
 * schéma/registre — actuellement toujours absentes, donc toujours
 * NOT_CONFIGURED.
 */
export function isTunisiaBedConfigured(): boolean {
  return Boolean(process.env.TUNISIABED_USERNAME && process.env.TUNISIABED_PASSWORD)
}
