/**
 * /admin/reservations — Data Table back-office connectée à Supabase.
 *
 * Server Component : on récupère l'agence courante via le profil utilisateur
 * connecté, on charge toutes les réservations via Drizzle, puis on délègue
 * l'affichage à `ReservationsDataTable` (client) qui prend en charge le
 * filtrage, le tri, la pagination et la mutation de statut.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { loadAdminReservations } from "@/lib/admin/reservations-data"
import { ReservationsDataTable } from "@/components/admin/reservations-data-table"

export const dynamic = "force-dynamic"

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string }>
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const profile = user ? await getCurrentAdminProfile(user.id) : null
  const agencyId = profile?.agencyId ?? "00000000-0000-0000-0000-000000000001"

  const params = (await searchParams) ?? {}
  const initialType = params.type

  const { available, rows } = await loadAdminReservations(agencyId)

  const filteredRows = initialType
    ? rows.filter((r) => r.module === initialType)
    : rows

  return (
    <div className="space-y-6 p-6">
      <div className="e2b-fade-in-up flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Réservations
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Suivi et modification du statut des réservations clients en temps
            réel.
          </p>
        </div>
        <div className="bg-secondary/60 text-secondary-foreground rounded-full px-3 py-1 text-xs font-medium">
          {rows.length} ligne{rows.length > 1 ? "s" : ""} chargée
          {rows.length > 1 ? "s" : ""}
        </div>
      </div>

      {!available ? (
        <div className="border-accent/40 bg-accent/10 text-accent-foreground rounded-2xl border p-4 text-sm">
          <strong>Mode dégradé.</strong> La base de données n&apos;est pas
          accessible. Aucune mutation n&apos;est possible tant que la connexion
          n&apos;est pas restaurée.
        </div>
      ) : null}

      <div
        className="e2b-fade-in-up"
        style={{ animationDelay: "120ms" }}
      >
        <ReservationsDataTable rows={filteredRows} />
      </div>
    </div>
  )
}
