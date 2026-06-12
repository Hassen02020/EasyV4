/**
 * Page Gestion des Réservations - Staff
 *
 * Liste de toutes les réservations de l'agence avec filtres avancés.
 * Permet au staff de suivre, modifier et valider manuellement les dossiers
 * de réservation. Les actions disponibles dépendent du rôle de l'utilisateur.
 *
 * Fonctionnalités :
 *  - Liste des réservations avec filtres (statut, module, période, client)
 *  - Actions rapides (valider, annuler, modifier)
 *  - Export des données
 *  - Accès au détail de chaque réservation
 *
 * Rôles :
 *  - manager : toutes les actions
 *  - agent_resa : visualisation et modification limitée
 *  - agent_compta : visualisation et validation paiements
 */

export default function StaffBookingsPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Gestion des Réservations</h1>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex gap-4 flex-wrap">
          <select className="border rounded px-3 py-2">
            <option>Tous les statuts</option>
            <option>En attente</option>
            <option>Confirmé</option>
            <option>Annulé</option>
          </select>
          <select className="border rounded px-3 py-2">
            <option>Tous les modules</option>
            <option>Hôtels Tunisie</option>
            <option>Vols</option>
            <option>Omraty</option>
          </select>
          <input type="text" placeholder="Rechercher client..." className="border rounded px-3 py-2" />
          <button className="bg-blue-600 text-white px-4 py-2 rounded">
            Rechercher
          </button>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Référence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Client
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Module
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Statut
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Montant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 font-medium">TG-2026-000123</td>
              <td className="px-6 py-4">Jean Dupont</td>
              <td className="px-6 py-4">Hôtels Tunisie</td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                  En attente
                </span>
              </td>
              <td className="px-6 py-4">450 TND</td>
              <td className="px-6 py-4">23 mai 2026</td>
              <td className="px-6 py-4">
                <button className="text-blue-600 hover:underline mr-2">Voir</button>
                <button className="text-green-600 hover:underline">Valider</button>
              </td>
            </tr>
            {/* More rows to be added */}
          </tbody>
        </table>
      </div>
    </div>
  )
}
