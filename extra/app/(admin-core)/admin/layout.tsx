/**
 * Layout Super Admin - Espace d'administration cross-agencies
 *
 * Ce layout encapsule toutes les pages du Super Admin, offrant une navigation
 * unifiée pour le monitoring multi-tenant, la configuration globale et la gestion
 * des partenaires B2B. Accessible uniquement aux utilisateurs avec le rôle 'super_admin'.
 *
 * Fonctionnalités :
 *  - Sidebar avec navigation vers Dashboard, Agencies, Configurations
 *  - Header avec informations utilisateur et notifications
 *  - Protection par middleware (rôle super_admin requis)
 *  - Affichage dynamique du nom de l'utilisateur connecté et son rôle
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { ReactNode } from "react"

export default async function AdminLayout({ children }: { children: ReactNode }) {
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

  const userName = session?.user?.user_metadata?.name || session?.user?.email || "Admin"
  const userRole = session?.user?.user_metadata?.role || "super_admin"

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white">
        <div className="p-6">
          <h1 className="text-xl font-bold">TunisiaGo Admin</h1>
          <p className="text-sm text-slate-400">Super Admin</p>
        </div>
        <nav className="mt-6">
          <ul className="space-y-2 px-4">
            <li>
              <a href="/admin" className="block px-4 py-2 rounded hover:bg-slate-800">
                Dashboard
              </a>
            </li>
            <li>
              <a href="/admin/agencies" className="block px-4 py-2 rounded hover:bg-slate-800">
                Agencies
              </a>
            </li>
            <li>
              <a href="/admin/configurations" className="block px-4 py-2 rounded hover:bg-slate-800">
                Configurations
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      {/* Header with User Info */}
      <header className="ml-64 bg-white shadow-sm border-b">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Administration Globale</h2>
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
