/**
 * /admin/reservations — Vue consolidée cross-agences (super_admin / manager).
 *
 * Guards :
 *   - Session Supabase requise → redirect /login
 *   - Rôle admin requis (super_admin | manager | agent_resa) → redirect /admin
 *
 * Super_admin : toutes les agences via loadAllReservations().
 * manager / agent_resa : scopé à leur propre agencyId.
 */

import { Suspense } from "react"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import {
  loadAllReservations,
  loadAdminReservationsPage,
  decodeCursor,
} from "@/lib/admin/reservations-data"
import { logger } from "@/lib/logger"
import nextDynamic from "next/dynamic"
import AdminReservationsLoading from "./loading"

const ReservationsDataTable = nextDynamic(() =>
  import("@/components/admin/reservations-data-table").then(
    (m) => m.ReservationsDataTable,
  ),
)

export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["super_admin", "manager", "agent_resa"] as const
type AllowedRole = (typeof ALLOWED_ROLES)[number]

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    cursor?: string
    agencyId?: string
    status?: string
    module?: string
  }>
}) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login?next=/admin/reservations")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile) redirect("/login")

  if (!ALLOWED_ROLES.includes(profile.role as AllowedRole)) {
    logger.warn("Unauthorized access attempt to /admin/reservations", {
      userId: user.id,
      role: profile.role,
    })
    redirect("/admin")
  }

  const params = (await searchParams) ?? {}
  const cursor = params.cursor ? decodeCursor(params.cursor) : null
  const isSuperAdmin = profile.role === "super_admin"

  let available = false
  let rows: Awaited<ReturnType<typeof loadAllReservations>>["rows"] = []
  let nextCursor: string | null = null
  let hasMore = false

  if (isSuperAdmin) {
    const result = await loadAllReservations({
      agencyId: params.agencyId ?? null,
      status: params.status ?? null,
      module: params.module ?? null,
      cursor,
      limit: 50,
    })
    available = result.available
    rows = result.rows
    nextCursor = result.nextCursor
    hasMore = result.hasMore
  } else {
    const result = await loadAdminReservationsPage(profile.agencyId, 25, cursor)
    available = result.available
    rows = result.rows
    nextCursor = result.nextCursor
    hasMore = result.hasMore
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Réservations
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isSuperAdmin
              ? "Vue consolidée de toutes les agences — tri, filtre, changement de statut."
              : "Suivi et modification des réservations en temps réel."}
          </p>
        </div>
        <div className="bg-secondary/60 text-secondary-foreground rounded-full px-3 py-1 text-xs font-medium">
          {rows.length} ligne{rows.length > 1 ? "s" : ""}
          {hasMore ? "+" : ""}
        </div>
      </div>

      {!available ? (
        <div className="border-accent/40 bg-accent/10 text-accent-foreground rounded-2xl border p-4 text-sm">
          <strong>Mode dégradé.</strong> La base de données n&apos;est pas
          accessible. Aucune mutation n&apos;est possible.
        </div>
      ) : null}

      <Suspense fallback={<AdminReservationsLoading />}>
        <ReservationsDataTable
          rows={rows}
          nextCursor={nextCursor}
          hasMore={hasMore}
          showAgencyColumn={isSuperAdmin}
        />
      </Suspense>
    </div>
  )
}
