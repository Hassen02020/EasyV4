/**
 * Page Dashboard Super Admin
 *
 * Tableau de bord des indicateurs globaux de l'agence principale TunisiaGo.
 * Affiche les métriques clés : CA total, nombre de réservations, performance
 * des modules, santé du système, et alertes opérationnelles.
 *
 * Données affichées :
 *  - Chiffre d'affaires (par module, par période)
 *  - Volume de réservations (statut, source)
 *  - Performance API (MyGo, Amadeus, etc.)
 *  - Alertes (paiements en échec, stocks critiques)
 */

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard Super Admin</h1>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Chiffre d'affaires</h3>
          <p className="text-2xl font-bold mt-2">125,430 TND</p>
          <p className="text-sm text-green-600">+12.5% vs mois dernier</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Réservations</h3>
          <p className="text-2xl font-bold mt-2">1,234</p>
          <p className="text-sm text-green-600">+8.3% vs mois dernier</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Agences actives</h3>
          <p className="text-2xl font-bold mt-2">45</p>
          <p className="text-sm text-gray-500">Sur 50 partenaires</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Alertes</h3>
          <p className="text-2xl font-bold mt-2 text-red-600">3</p>
          <p className="text-sm text-gray-500">À traiter</p>
        </div>
      </div>

      {/* Placeholder for charts and detailed metrics */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Performance par Module</h2>
        <p className="text-gray-500">Graphiques et tableaux détaillés à implémenter</p>
      </div>
    </div>
  )
}
