/**
 * /admin/suppliers/network — Connectivity Network
 *
 * Vue globale du réseau fournisseurs Easy2Book :
 * - Connectivity Ladder L0→L5 (dimension technique)
 * - Certification status (dimension qualité/commerciale)
 *
 * Ces deux dimensions sont INTENTIONNELLEMENT SÉPARÉES (vision §5) :
 * un artisan L0 peut être premium_partner. Un GDS L5 peut être registered.
 * Cette page ne mélange jamais les deux comme signal de qualité unique.
 */
import { Metadata } from "next"
import { redirect } from "next/navigation"
import {
  Network,
  CheckCircle2,
  Circle,
  ShieldCheck,
  Star,
  Award,
  Badge as BadgeIcon,
  Wifi,
  FileSpreadsheet,
  Globe,
  Layers,
  Zap,
  PenSquare,
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
import { listSuppliers } from "@/lib/suppliers/list-suppliers"
import {
  CONNECTIVITY_LEVEL_LABELS,
  CONNECTIVITY_LEVEL_DESCRIPTIONS,
  CONNECTIVITY_LEVELS,
  CERTIFICATION_STATUS_LABELS,
  type ConnectivityLevel,
  type CertificationStatus,
} from "@/lib/suppliers/connectivity"

export const metadata: Metadata = {
  title: "Réseau Fournisseurs — Easy2Book Network",
  description: "Connectivity Ladder L0→L5 · Certification commerciale · Vue globale du réseau",
}

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const LEVEL_ICON: Record<ConnectivityLevel, typeof PenSquare> = {
  l0_manual:   PenSquare,
  l1_portal:   Layers,
  l2_file:     FileSpreadsheet,
  l3_api:      Wifi,
  l4_xml_gds:  Globe,
  l5_native:   Zap,
}

const LEVEL_COLOR: Record<ConnectivityLevel, string> = {
  l0_manual:   "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  l1_portal:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  l2_file:     "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  l3_api:      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  l4_xml_gds:  "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  l5_native:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
}

const CERT_ICON: Record<CertificationStatus, typeof Circle> = {
  registered:      Circle,
  verified:        CheckCircle2,
  connected:       ShieldCheck,
  certified:       Award,
  premium_partner: Star,
}

const CERT_COLOR: Record<CertificationStatus, string> = {
  registered:      "bg-slate-100 text-slate-600",
  verified:        "bg-blue-100 text-blue-700",
  connected:       "bg-teal-100 text-teal-700",
  certified:       "bg-amber-100 text-amber-700",
  premium_partner: "bg-yellow-100 text-yellow-800",
}

const STATUS_COLOR: Record<string, string> = {
  active:      "bg-emerald-100 text-emerald-800",
  inactive:    "bg-slate-100 text-slate-600",
  maintenance: "bg-yellow-100 text-yellow-700",
  error:       "bg-red-100 text-red-800",
}

const TYPE_LABEL: Record<string, string> = {
  mygo:        "MyGo",
  amadeus:     "Amadeus",
  sabre:       "Sabre",
  expedia:     "Expedia",
  booking:     "Booking.com",
  travelgate:  "TravelGate",
  hotelbeds:   "HotelBeds",
  custom:      "Custom",
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SupplierNetworkPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/suppliers/network")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.role !== "super_admin") redirect("/admin")

  const rows = await listSuppliers()

  // Stats per connectivity level
  const countByLevel = Object.fromEntries(
    CONNECTIVITY_LEVELS.map((l) => [l, rows.filter((r) => r.connectivityLevel === l).length]),
  ) as Record<ConnectivityLevel, number>

  const activeCount = rows.filter((r) => r.status === "active").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Network className="text-primary h-6 w-6" />
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Réseau Fournisseurs</h1>
        </div>
        <p className="text-muted-foreground">
          Connectivity Ladder L0→L5 — dimension technique indépendante de la valeur commerciale.
          Un artisan L0 peut être <strong>Premium Partner</strong>. Un GDS L5 peut être simplement <em>Enregistré</em>.
        </p>
      </div>

      {/* Connectivity Ladder cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CONNECTIVITY_LEVELS.map((level) => {
          const Icon = LEVEL_ICON[level]
          const count = countByLevel[level]
          return (
            <Card key={level} className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-1">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {CONNECTIVITY_LEVEL_LABELS[level].split(" · ")[0]}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground/50" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {CONNECTIVITY_LEVEL_LABELS[level].split(" · ")[1]}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Ladder description (collapsed info) */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Connectivity Ladder — Référence rapide
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {CONNECTIVITY_LEVELS.map((level) => {
              const Icon = LEVEL_ICON[level]
              return (
                <div key={level} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${LEVEL_COLOR[level]}`}>
                    <Icon className="h-3 w-3" />
                    {CONNECTIVITY_LEVEL_LABELS[level].split(" · ")[0]}
                  </span>
                  <span className="text-muted-foreground leading-relaxed">
                    {CONNECTIVITY_LEVEL_DESCRIPTIONS[level]}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Supplier table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Fournisseurs enregistrés
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {rows.length} total · {activeCount} actifs
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Connectivity</TableHead>
                  <TableHead>Certification</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Dernière sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Aucun fournisseur enregistré dans la table réseau.
                      Les fournisseurs hôteliers (Phase 27) sont gérés dans{" "}
                      <a href="/admin/suppliers" className="underline">Fournisseurs hôteliers</a>.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const LevelIcon = LEVEL_ICON[row.connectivityLevel]
                    const CertIcon = CERT_ICON[row.certificationStatus]
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{row.name}</p>
                            {row.website && (
                              <p className="text-xs text-muted-foreground">{row.website}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {TYPE_LABEL[row.type] ?? row.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${LEVEL_COLOR[row.connectivityLevel]}`}
                          >
                            <LevelIcon className="h-3 w-3" />
                            {CONNECTIVITY_LEVEL_LABELS[row.connectivityLevel]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${CERT_COLOR[row.certificationStatus]}`}
                          >
                            <CertIcon className="h-3 w-3" />
                            {CERTIFICATION_STATUS_LABELS[row.certificationStatus]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[row.status] ?? "bg-slate-100 text-slate-600"}`}
                          >
                            {row.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.lastSyncAt
                            ? new Date(row.lastSyncAt).toLocaleString("fr-FR")
                            : row.autoSync
                              ? "Auto-sync activé"
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
