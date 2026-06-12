/**
 * Layout Partenaire B2B - Espace agences partenaires
 *
 * Ce layout encapsule les pages du portail B2B pour les agences partenaires.
 * Offre une sidebar adaptée aux besoins des agences (réservations, wallet,
 * rapports) et affiche dynamiquement le solde du Wallet de l'agence en cours.
 *
 * Rôle autorisé :
 *  - manager (owner agence) : accès complet
 *  - agent_resa (agence) : gestion réservations
 *
 * Protection par middleware (rôle B2B requis, limité à l'agence de l'utilisateur).
 * Le solde du Wallet est récupéré depuis la table agency_wallets et affiché
 * en temps réel dans le header.
 *
 * NOTE: La table agency_wallets sera ajoutée au schéma Drizzle dans l'Étape 3
 * de la feuille de route. Pour l'instant, le solde est simulé.
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { ReactNode } from "react"
import { getDb } from "@/lib/db/client"
import { agencyWallets } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export default async function B2BLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const userName = session?.user?.user_metadata?.name || session?.user?.email || "Partenaire"
  const userRole = session?.user?.user_metadata?.role || "manager"
  const agencyId = session?.user?.user_metadata?.agency_id

  // Récupération du solde réel du Wallet via Drizzle ORM
  let walletBalance = 0
  let frozenBalance = 0
  let agencyName = "Agence Partenaire"

  if (agencyId) {
    try {
      const db = getDb()
      const [wallet] = await db
        .select({
          balance: agencyWallets.balance,
          frozenBalance: agencyWallets.frozenBalance,
        })
        .from(agencyWallets)
        .where(eq(agencyWallets.agencyId, agencyId))
        .limit(1)

      if (wallet) {
        walletBalance = parseFloat(wallet.balance)
        frozenBalance = parseFloat(wallet.frozenBalance)
      }
    } catch (error) {
      console.error("Erreur lors de la récupération du wallet:", error)
      // En cas d'erreur (ex: DB non configurée), on garde les valeurs par défaut à 0
    }
  }

  const availableBalance = walletBalance - frozenBalance

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-blue-900 text-white">
        <div className="p-6">
          <h1 className="text-xl font-bold">TunisiaGo B2B</h1>
          <p className="text-sm text-blue-300">Espace Partenaire</p>
        </div>
        <nav className="mt-6">
          <ul className="space-y-2 px-4">
            <li>
              <a href="/b2b" className="block px-4 py-2 rounded hover:bg-blue-800">
                Dashboard
              </a>
            </li>
            <li>
              <a href="/b2b/bookings" className="block px-4 py-2 rounded hover:bg-blue-800">
                Mes Réservations
              </a>
            </li>
            <li>
              <a href="/b2b/wallet" className="block px-4 py-2 rounded hover:bg-blue-800">
                Wallet
              </a>
            </li>
            <li>
              <a href="/b2b/reports" className="block px-4 py-2 rounded hover:bg-blue-800">
                Rapports
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Header with Wallet Balance */}
      <header className="ml-64 bg-white shadow-sm border-b">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{agencyName}</h2>
            <p className="text-sm text-gray-500">ID: {agencyId || "N/A"}</p>
          </div>
          <div className="flex items-center gap-6">
            {/* Wallet Balance Display - Professionnel et scannable */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-6 py-3 min-w-[200px]">
              <div className="flex items-baseline justify-between mb-1">
                <p className="text-xs text-green-600 font-medium uppercase tracking-wide">
                  Solde disponible
                </p>
                {frozenBalance > 0 && (
                  <span className="text-xs text-orange-500" title={`${frozenBalance.toFixed(3)} TND bloqués`}>
                    🔒
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-green-700">
                {availableBalance.toLocaleString("fr-FR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-sm font-normal text-green-600">TND</span>
              </p>
              {frozenBalance > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Bloqué: {frozenBalance.toFixed(2)} TND
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-gray-500 capitalize">{userRole}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="ml-64 p-8">
        {children}
      </main>
    </div>
  )
}
