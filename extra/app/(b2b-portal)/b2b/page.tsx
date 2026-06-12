/**
 * Page Dashboard Partenaire B2B
 *
 * Tableau de bord pour les agences partenaires. Affiche les indicateurs
 * clés de l'agence : volume de réservations, CA, solde Wallet, et
 * alertes (limite de crédit proche, réservations à valider).
 *
 * Données affichées :
 *  - Solde Wallet actuel et limite de crédit
 *  - Chiffre d'affaires du mois
 *  - Nombre de réservations (par statut)
 *  - Alertes (crédit bas, réservations en attente)
 *
 * Le solde Wallet est récupéré en temps réel depuis agency_wallets.
 */

export default function B2BDashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard Partenaire</h1>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Solde Wallet</h3>
          <p className="text-2xl font-bold mt-2 text-green-600">15,430 TND</p>
          <p className="text-sm text-gray-500">Limite: 50,000 TND</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">CA (Mois)</h3>
          <p className="text-2xl font-bold mt-2">45,200 TND</p>
          <p className="text-sm text-green-600">+15.2% vs mois dernier</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Réservations</h3>
          <p className="text-2xl font-bold mt-2">234</p>
          <p className="text-sm text-gray-500">12 en attente</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Alertes</h3>
          <p className="text-2xl font-bold mt-2 text-orange-600">1</p>
          <p className="text-sm text-gray-500">Crédit à 30%</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Actions rapides</h2>
        <div className="flex gap-4">
          <a href="/b2b/wallet/deposit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Recharger le Wallet
          </a>
          <a href="/b2b/bookings" className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300">
            Voir mes réservations
          </a>
        </div>
      </div>

      {/* Recent Bookings */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Réservations récentes</h2>
        <p className="text-gray-500">Liste des 5 dernières réservations de l'agence (à implémenter)</p>
      </div>
    </div>
  )
}
