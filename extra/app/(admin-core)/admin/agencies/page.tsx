/**
 * Page Monitoring Multi-tenant - Agencies
 *
 * Écran de surveillance et gestion des comptes partenaires B2B.
 * Permet au Super Admin de visualiser l'état de toutes les agences,
 * leurs performances, leurs soldes Wallet, et d'agir sur leurs comptes
 * (activation/désactivation, ajustement de limites de crédit).
 *
 * Fonctionnalités :
 *  - Liste des agences avec filtres (statut, région, performance)
 *  - Détails par agence (solde, CA, réservations)
 *  - Actions rapides (suspendre, réactiver, ajuster crédit)
 *  - Export des données (CSV, PDF)
 */

export default function AgenciesPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Monitoring Multi-tenant</h1>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex gap-4">
          <select className="border rounded px-3 py-2">
            <option>Tous les statuts</option>
            <option>Actif</option>
            <option>Suspendu</option>
          </select>
          <select className="border rounded px-3 py-2">
            <option>Toutes les régions</option>
            <option>Tunis</option>
            <option>Sfax</option>
            <option>Sousse</option>
          </select>
          <button className="bg-blue-600 text-white px-4 py-2 rounded">
            Filtrer
          </button>
        </div>
      </div>

      {/* Agencies Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Agence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Statut
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Solde Wallet
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                CA (Mois)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Réservations
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4">Agence Voyage Tunis</td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                  Actif
                </span>
              </td>
              <td className="px-6 py-4">15,430 TND</td>
              <td className="px-6 py-4">45,200 TND</td>
              <td className="px-6 py-4">234</td>
              <td className="px-6 py-4">
                <button className="text-blue-600 hover:underline">Gérer</button>
              </td>
            </tr>
            {/* More rows to be added */}
          </tbody>
        </table>
      </div>
    </div>
  )
}
