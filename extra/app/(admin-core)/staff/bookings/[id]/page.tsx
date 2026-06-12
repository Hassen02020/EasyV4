/**
 * Page Détail Réservation - Staff
 *
 * Affiche le détail complet d'une réservation spécifique. Permet au staff
 * de visualiser toutes les informations, de modifier certaines données,
 * et de valider manuellement la réservation si nécessaire.
 *
 * Fonctionnalités :
 *  - Affichage complet de la réservation (données client, détails module, paiement)
 *  - Historique des modifications (audit log)
 *  - Actions : valider, annuler, modifier, générer voucher
 *  - Notes internes pour l'équipe
 *
 * Rôles :
 *  - manager : toutes les actions
 *  - agent_resa : visualisation et modification limitée
 *  - agent_compta : visualisation et validation paiements
 */

export default function StaffBookingDetailPage({ params }: { params: { id: string } }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Réservation {params.id}</h1>
        <div className="flex gap-2">
          <button className="bg-gray-200 text-gray-800 px-4 py-2 rounded">
            Annuler
          </button>
          <button className="bg-green-600 text-white px-4 py-2 rounded">
            Valider
          </button>
        </div>
      </div>

      {/* Booking Summary */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Résumé</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Référence</p>
            <p className="font-medium">TG-2026-000123</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Statut</p>
            <p className="font-medium">En attente</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Module</p>
            <p className="font-medium">Hôtels Tunisie</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Montant total</p>
            <p className="font-medium">450 TND</p>
          </div>
        </div>
      </div>

      {/* Customer Details */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Client</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Nom</p>
            <p className="font-medium">Jean Dupont</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="font-medium">jean.dupont@email.com</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Téléphone</p>
            <p className="font-medium">+216 12 345 678</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">CIN/Passeport</p>
            <p className="font-medium">12345678</p>
          </div>
        </div>
      </div>

      {/* Module Details */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Détails Hôtel</h2>
        <p className="text-gray-500">Détails spécifiques au module (à implémenter)</p>
      </div>

      {/* Payment Details */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Paiement</h2>
        <p className="text-gray-500">Historique des paiements (à implémenter)</p>
      </div>

      {/* Audit Log */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Historique des modifications</h2>
        <p className="text-gray-500">Audit log des actions sur cette réservation (à implémenter)</p>
      </div>
    </div>
  )
}
