/**
 * Garde-fou de réservation Hôtels Monde.
 *
 * Les offres actuellement émises par le module portent un jeton du
 * Virtual World Hotel Supplier. Ce moteur simule la recherche et
 * l'inventaire : il ne constitue pas une confirmation d'hôtel réel.
 *
 * Tant qu'un adaptateur de réservation fournisseur réel n'est pas branché,
 * le checkout doit refuser toutes les offres virtuelles côté serveur.
 * Le retour null ne pourra être activé qu'avec un vrai parcours BOOK
 * fournisseur et ses tests de certification.
 */
export type WorldHotelBookingBlock = {
  code: "DEMO_SUPPLIER_BOOKING_DISABLED"
  message: string
}

export function getWorldHotelBookingBlock(): WorldHotelBookingBlock | null {
  return {
    code: "DEMO_SUPPLIER_BOOKING_DISABLED",
    message:
      "Les offres Hôtels Monde affichées sont des offres de démonstration. La réservation en ligne est temporairement indisponible. Contactez notre agence pour obtenir une offre confirmée.",
  }
}
