/**
 * Page Recharge Wallet - Initiation demande
 *
 * Formulaire d'initiation des demandes de recharge de compte pour les
 * agences partenaires. L'agence spécifie le montant souhaité, la méthode
 * de paiement (virement, espèces), et ajoute une note justificative.
 *
 * Processus :
 *  1. L'agence soumet une demande de recharge
 *  2. La demande est créée en statut "pending"
 *  3. Le Super Admin reçoit une notification
 *  4. Le Super Admin valide la demande après vérification du paiement
 *  5. Le Ledger est mis à jour (crédit du Wallet)
 *  6. L'agence reçoit une notification de confirmation
 *
 * Les demandes sont tracées dans audit_events pour traçabilité.
 */

export default function WalletDepositPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Recharger le Wallet</h1>
      
      <div className="max-w-2xl">
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">Informations actuelles</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Solde actuel</p>
              <p className="text-2xl font-bold text-green-600">15,430 TND</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Limite de crédit</p>
              <p className="text-2xl font-bold">50,000 TND</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Nouvelle demande de recharge</h2>
          
          <form className="space-y-6">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Montant de la recharge (TND)
              </label>
              <input
                type="number"
                min="100"
                max="50000"
                step="10"
                placeholder="Ex: 5000"
                className="w-full border rounded-lg px-4 py-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum: 100 TND | Maximum: 50,000 TND
              </p>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Méthode de paiement
              </label>
              <select className="w-full border rounded-lg px-4 py-2">
                <option value="transfer">Virement bancaire</option>
                <option value="cash">Espèces (agence)</option>
                <option value="check">Chèque</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Note justificative
              </label>
              <textarea
                rows={3}
                placeholder="Ex: Recharge pour saison estivale..."
                className="w-full border rounded-lg px-4 py-2"
              />
            </div>

            {/* Bank Details (for transfer) */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium mb-2">Coordonnées bancaires TunisiaGo</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong>Banque:</strong> BIAT</p>
                <p><strong>RIB:</strong> 12345678901234567890</p>
                <p><strong>IBAN:</strong> TN99 1234 5678 9012 3456 7890</p>
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-4">
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
              >
                Soumettre la demande
              </button>
              <button
                type="button"
                className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>

        {/* Pending Requests */}
        <div className="bg-white p-6 rounded-lg shadow mt-6">
          <h2 className="text-xl font-semibold mb-4">Demandes en cours</h2>
          <p className="text-gray-500">Aucune demande en attente de traitement</p>
        </div>
      </div>
    </div>
  )
}
