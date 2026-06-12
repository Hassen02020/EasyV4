/**
 * Page Dashboard Staff
 *
 * Tableau de bord opérationnel pour l'équipe staff. Affiche les tâches
 * du jour, les réservations en attente de validation, les paiements
 * à traiter, et les alertes opérationnelles spécifiques à l'agence.
 *
 * Données affichées :
 *  - Réservations en attente (on_request, pending)
 *  - Paiements à valider (authorized)
 *  - Activités du jour (pour scan QR)
 *  - Alertes (stocks critiques, annulations)
 */

export default function StaffDashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard Staff</h1>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">À valider</h3>
          <p className="text-2xl font-bold mt-2">12</p>
          <p className="text-sm text-orange-600">Réservations en attente</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Paiements</h3>
          <p className="text-2xl font-bold mt-2">8</p>
          <p className="text-sm text-blue-600">À traiter</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Activités</h3>
          <p className="text-2xl font-bold mt-2">45</p>
          <p className="text-sm text-gray-500">Aujourd'hui</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Alertes</h3>
          <p className="text-2xl font-bold mt-2 text-red-600">2</p>
          <p className="text-sm text-gray-500">Stocks critiques</p>
        </div>
      </div>

      {/* Pending Bookings */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-semibold mb-4">Réservations en attente de validation</h2>
        <p className="text-gray-500">Liste des réservations on_request à traiter manuellement</p>
      </div>

      {/* Today's Activities */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Activités du jour</h2>
        <p className="text-gray-500">Sessions à scanner avec QR code</p>
      </div>
    </div>
  )
}
