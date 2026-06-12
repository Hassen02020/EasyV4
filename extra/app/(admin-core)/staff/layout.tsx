/**
 * Layout Staff - Espace opérationnel équipe interne
 *
 * Ce layout encapsule les pages du Staff (managers, agents réservation,
 * agents comptabilité, agents terrain). Offre une sidebar adaptée aux
 * tâches quotidiennes : gestion des réservations, validation manuelle,
 * suivi des paiements, et scan QR pour activités.
 *
 * Rôles autorisés :
 *  - manager : accès complet
 *  - agent_resa : gestion réservations
 *  - agent_compta : paiements et facturation
 *  - agent_excursions : scan QR activités
 *
 * Protection par middleware (rôle staff requis, limité à leur agence).
 * Affichage dynamique du nom de l'utilisateur connecté et son rôle.
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { ReactNode } from "react"

export default async function StaffLayout({ children }: { children: ReactNode }) {
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

  const userName = session?.user?.user_metadata?.name || session?.user?.email || "Staff"
  const userRole = session?.user?.user_metadata?.role || "agent_resa"

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-800 text-white">
        <div className="p-6">
          <h1 className="text-xl font-bold">TunisiaGo Staff</h1>
          <p className="text-sm text-slate-400">Espace Opérationnel</p>
        </div>
        <nav className="mt-6">
          <ul className="space-y-2 px-4">
            <li>
              <a href="/staff" className="block px-4 py-2 rounded hover:bg-slate-700">
                Dashboard
              </a>
            </li>
            <li>
              <a href="/staff/bookings" className="block px-4 py-2 rounded hover:bg-slate-700">
                Réservations
              </a>
            </li>
            <li>
              <a href="/staff/payments" className="block px-4 py-2 rounded hover:bg-slate-700">
                Paiements
              </a>
            </li>
            <li>
              <a href="/staff/activities" className="block px-4 py-2 rounded hover:bg-slate-700">
                Activités (QR)
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Header with User Info */}
      <header className="ml-64 bg-white shadow-sm border-b">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Opérations</h2>
          </div>
          <div className="flex items-center gap-4">
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
