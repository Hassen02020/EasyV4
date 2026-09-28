/**
 * /admin/suppliers/nodes — Supplier Nodes (Phase 35)
 *
 * Vue des nœuds fournisseurs dans le réseau Easy2Book :
 * - Portail L0/L1 (self-service fournisseur)
 * - Statut d'onboarding
 * - Modules couverts
 */
import { Metadata } from "next"
import { redirect } from "next/navigation"
import {
  Store,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  LogOut,
  Mail,
  Globe2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { listSupplierNodes } from "@/lib/suppliers/portal-actions"
import type { SupplierOnboardingStatus } from "@/lib/db/schema"

export const metadata: Metadata = {
  title: "Nœuds Fournisseurs — Portail Easy2Book",
  description: "Gestion des nœuds fournisseurs et du portail self-service L0/L1",
}

export const dynamic = "force-dynamic"

const STATUS_CONFIG: Record<
  SupplierOnboardingStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  invited:        { label: "Invité",             className: "bg-sky-100 text-sky-700",      icon: Mail },
  onboarding:     { label: "En cours",           className: "bg-blue-100 text-blue-700",    icon: Clock },
  pending_review: { label: "En attente review",  className: "bg-amber-100 text-amber-700",  icon: AlertCircle },
  active:         { label: "Actif",              className: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 },
  suspended:      { label: "Suspendu",           className: "bg-red-100 text-red-800",      icon: XCircle },
  offboarded:     { label: "Hors réseau",        className: "bg-slate-100 text-slate-600",  icon: LogOut },
}

const STATUS_ORDER: SupplierOnboardingStatus[] = [
  "invited", "onboarding", "pending_review", "active", "suspended", "offboarded",
]

export default async function SupplierNodesPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/suppliers/nodes")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.role !== "super_admin") redirect("/admin")

  const nodes = await listSupplierNodes()

  const countByStatus = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, nodes.filter((n) => n.onboardingStatus === s).length]),
  ) as Record<SupplierOnboardingStatus, number>

  const activeCount  = countByStatus.active
  const pendingCount = countByStatus.pending_review + countByStatus.onboarding + countByStatus.invited

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Store className="text-primary h-6 w-6" />
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Nœuds Fournisseurs</h1>
        </div>
        <p className="text-muted-foreground">
          Portail self-service L0/L1 — onboarding, modules couverts, accès portail.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDER.map((status) => {
          const cfg = STATUS_CONFIG[status]
          const Icon = cfg.icon
          return (
            <Card key={status} className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {cfg.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground/50" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{countByStatus[status]}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Nœuds enregistrés
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {nodes.length} total · {activeCount} actifs · {pendingCount} en attente
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nœud</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Modules</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Portail</TableHead>
                  <TableHead>Activé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Aucun nœud fournisseur enregistré. Les nœuds sont créés via l'invitation
                      d'un fournisseur dans le réseau.
                    </TableCell>
                  </TableRow>
                ) : (
                  nodes.map((node) => {
                    const cfg = STATUS_CONFIG[node.onboardingStatus]
                    const StatusIcon = cfg.icon
                    const mods = (node.modules as string[]) ?? []
                    return (
                      <TableRow key={node.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{node.displayName}</p>
                            <p className="text-xs text-muted-foreground font-mono">{node.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs">
                            {node.contactEmail && (
                              <p className="flex items-center gap-1">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                {node.contactEmail}
                              </p>
                            )}
                            {node.contactCountry && (
                              <p className="flex items-center gap-1 text-muted-foreground">
                                <Globe2 className="h-3 w-3" />
                                {node.contactCountry}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {mods.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              mods.map((m) => (
                                <Badge key={m} variant="outline" className="text-xs">
                                  {m}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${cfg.className}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {node.portalEnabled ? (
                            <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800">
                              Actif
                            </span>
                          ) : (
                            <span className="inline-flex rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500">
                              Inactif
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {node.activatedAt
                            ? new Date(node.activatedAt).toLocaleDateString("fr-FR")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
