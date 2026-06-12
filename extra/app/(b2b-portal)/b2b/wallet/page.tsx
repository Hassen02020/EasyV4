/**
 * Page Wallet - Ledger immuable
 *
 * Affiche les mouvements de crédit/débit du Ledger immuable pour l'agence.
 * Chaque mouvement est tracé avec les comptes de débit/crédit (comptabilité
 * double-entrée), le montant, la devise, la description, et la référence
 * (réservation, paiement, remboursement).
 *
 * Données affichées :
 *  - Solde actuel du Wallet
 *  - Historique des mouvements (ledger_entries)
 *  - Détails de chaque mouvement (comptes, montant, description, référence)
 *  - Filtres par période et type de mouvement
 *
 * Le Ledger est immuable : aucun mouvement ne peut être modifié ou supprimé.
 * Les corrections se font par des mouvements inverses.
 */

export default function WalletPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Wallet - Ledger</h1>
      
      {/* Wallet Balance Card */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-6 rounded-lg shadow mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-100 text-sm">Solde disponible</p>
            <p className="text-4xl font-bold mt-1">15,430 TND</p>
          </div>
          <div className="text-right">
            <p className="text-green-100 text-sm">Limite de crédit</p>
            <p className="text-2xl font-semibold mt-1">50,000 TND</p>
          </div>
        </div>
        <div className="mt-4">
          <div className="bg-green-400 rounded-full h-2">
            <div className="bg-white rounded-full h-2" style={{ width: '30%' }}></div>
          </div>
          <p className="text-green-100 text-xs mt-1">30% utilisé</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex gap-4 flex-wrap">
          <input type="date" className="border rounded px-3 py-2" />
          <input type="date" className="border rounded px-3 py-2" />
          <select className="border rounded px-3 py-2">
            <option>Tous les types</option>
            <option>Crédit</option>
            <option>Débit</option>
          </select>
          <button className="bg-blue-600 text-white px-4 py-2 rounded">
            Filtrer
          </button>
        </div>
      </div>

      {/* Ledger Entries Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Référence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Compte Débit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Compte Crédit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Montant
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4">23 mai 2026</td>
              <td className="px-6 py-4">Réservation TG-2026-000123</td>
              <td className="px-6 py-4">TG-2026-000123</td>
              <td className="px-6 py-4">Wallet Agence</td>
              <td className="px-6 py-4">Revenus Hôtels</td>
              <td className="px-6 py-4 text-red-600">-450 TND</td>
            </tr>
            <tr>
              <td className="px-6 py-4">22 mai 2026</td>
              <td className="px-6 py-4">Recharge Wallet</td>
              <td className="px-6 py-4">DEP-2026-000045</td>
              <td className="px-6 py-4">Banque</td>
              <td className="px-6 py-4">Wallet Agence</td>
              <td className="px-6 py-4 text-green-600">+5,000 TND</td>
            </tr>
            <tr>
              <td className="px-6 py-4">21 mai 2026</td>
              <td className="px-6 py-4">Réservation TG-2026-000122</td>
              <td className="px-6 py-4">TG-2026-000122</td>
              <td className="px-6 py-4">Wallet Agence</td>
              <td className="px-6 py-4">Revenus Vols</td>
              <td className="px-6 py-4 text-red-600">-890 TND</td>
            </tr>
            {/* More entries to be added */}
          </tbody>
        </table>
      </div>
    </div>
  )
}
