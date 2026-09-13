/**
 * Logs Système — Super Admin uniquement.
 *
 * Phase 17 : remplace les logs MOCK_LOGS (tableau statique codé en dur,
 * "// Mock logs pour la démo") par une vraie requête sur `audit_events`
 * (même table déjà utilisée en Phase 16.2 pour la traçabilité paiement, et
 * par la timeline d'audit de la page détail réservation — voir
 * components/admin/audit-timeline.tsx, réutilisé ici pour ne pas dupliquer
 * le rendu). Vue cross-agence (isSuperAdmin: true, agencyId: null), cohérente
 * avec les autres vues globales du Master Admin (agences, users, finance).
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { desc, eq } from "drizzle-orm"
import { Activity, FileText } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { agencies, auditEvents, users } from "@/lib/db/schema"
import { AuditTimeline, type AuditTimelineEntry } from "@/components/admin/audit-timeline"

export const metadata: Metadata = {
  title: "Logs Système — Super Admin",
  description: "Journal d'audit plateforme (audit_events)",
}

export const dynamic = "force-dynamic"

const CATEGORY_GROUPS: Record<string, string[]> = {
  Paiements: ["payment", "reservation"],
  Catalogue: ["catalog_activity", "catalog_activity_session", "catalog_package", "catalog_package_departure", "omra_package", "omra_allotment", "product"],
  Wallet: ["wallet", "wallet_account"],
  Utilisateurs: ["user", "agency"],
}

async function loadAuditEvents() {
  return withTenantContext({ agencyId: null, userId: "", isSuperAdmin: true }, async (tx) => {
    const rows = await tx
      .select({
        id: auditEvents.id,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        action: auditEvents.action,
        diff: auditEvents.diff,
        createdAt: auditEvents.createdAt,
        actorName: users.name,
        actorEmail: users.email,
        agencyName: agencies.name,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .leftJoin(agencies, eq(agencies.id, auditEvents.agencyId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(100)

    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorName: r.actorName ?? r.actorEmail ?? null,
      diff: { entité: `${r.entityType}#${r.entityId}`, agence: r.agencyName ?? "—", ...(typeof r.diff === "object" && r.diff ? (r.diff as Record<string, unknown>) : {}) },
      createdAt: r.createdAt.toISOString(),
      entityType: r.entityType,
    }))
  })
}

export default async function SystemLogsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/logs")
  }

  const profile = await getCurrentAdminProfile(user.id)

  if (profile?.role !== "super_admin") {
    redirect("/admin")
  }

  if (!process.env.DATABASE_URL) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        Base de données non configurée — journal d&apos;audit indisponible.
      </div>
    )
  }

  const events = await loadAuditEvents()
  const stats: Record<string, number> = { total: events.length }
  for (const [group, types] of Object.entries(CATEGORY_GROUPS)) {
    stats[group] = events.filter((e) => types.includes(e.entityType)).length
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Logs Système
          </h1>
          <p className="text-muted-foreground mt-1">
            Journal d&apos;audit plateforme — 100 derniers événements, toutes agences
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        {Object.keys(CATEGORY_GROUPS).map((group) => (
          <Card key={group}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{group}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats[group]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Tous les événements
          </CardTitle>
          <CardDescription>
            Source : table <code>audit_events</code> — chaque mutation sensible (paiement, remboursement, changement de statut, notification) y écrit une ligne.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditTimeline entries={events as AuditTimelineEntry[]} />
        </CardContent>
      </Card>
    </div>
  )
}
