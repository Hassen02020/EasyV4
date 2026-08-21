/**
 * Back-office — Liste des réservations Omra
 *
 * Recherche, filtres (statut, programme, dates), tri et pagination.
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  Moon,
  Users,
  Phone,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import {
  loadOmraReservationsPage,
  loadOmraPackageOptions,
  type OmraReservationSort,
} from "@/lib/omra/reservations-data"
import { omraStatusConfig } from "@/lib/omra/reservation-status"
import { OmraReservationFilters } from "@/components/admin/omra-reservation-filters"
import { OmraReservationActions } from "@/components/admin/omra-reservation-actions"

export const metadata: Metadata = {
  title: "Réservations Omra — Back-office",
  description: "Traitement des réservations Omra",
}

export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["super_admin", "manager", "agent_resa"]

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "Toutes" },
  { value: "pending", label: "En attente" },
  { value: "confirmed", label: "Confirmées" },
  { value: "completed", label: "Complétées" },
  { value: "cancelled", label: "Annulées" },
]

type SearchParams = {
  status?: string
  search?: string
  packageId?: string
  departureFrom?: string
  departureTo?: string
  createdFrom?: string
  createdTo?: string
  sort?: string
  page?: string
}

function buildQuery(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v)
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

function formatDate(value: string | Date | null): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export default async function OmraReservationsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/admin/login?next=/admin/omra/reservations")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    redirect("/admin")
  }

  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1)

  const [result, packages] = await Promise.all([
    loadOmraReservationsPage(profile.agencyId, {
      status: sp.status,
      search: sp.search,
      packageId: sp.packageId,
      departureFrom: sp.departureFrom,
      departureTo: sp.departureTo,
      createdFrom: sp.createdFrom,
      createdTo: sp.createdTo,
      sort: sp.sort as OmraReservationSort | undefined,
      page,
    }),
    loadOmraPackageOptions(profile.agencyId),
  ])

  // Params conservés pour les liens (onglets / pagination).
  const carried = {
    search: sp.search,
    packageId: sp.packageId,
    departureFrom: sp.departureFrom,
    departureTo: sp.departureTo,
    createdFrom: sp.createdFrom,
    createdTo: sp.createdTo,
    sort: sp.sort,
  }

  const activeStatus = sp.status ?? ""

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-foreground flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Moon className="h-7 w-7 text-[#1e3a5f]" />
          Réservations Omra
        </h1>
        <p className="text-muted-foreground">
          Traitement des réservations : confirmation, annulation, suivi.
        </p>
      </div>

      {/* Onglets statut */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const isActive = activeStatus === tab.value
          return (
            <Button
              key={tab.value || "all"}
              asChild
              variant={isActive ? "default" : "outline"}
              size="sm"
            >
              <Link
                href={`/admin/omra/reservations${buildQuery({
                  ...carried,
                  status: tab.value || undefined,
                })}`}
              >
                {tab.label}
              </Link>
            </Button>
          )
        })}
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="pt-6">
          <OmraReservationFilters packages={packages} />
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {result.total} réservation{result.total > 1 ? "s" : ""}
          </CardTitle>
          <span className="text-muted-foreground text-sm">
            Page {result.page} / {result.pageCount}
          </span>
        </CardHeader>
        <CardContent>
          {result.rows.length === 0 ? (
            <div className="py-12 text-center">
              <Moon className="mx-auto h-12 w-12 text-gray-300" />
              <p className="text-muted-foreground mt-4">
                Aucune réservation ne correspond à ces critères.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Programme</TableHead>
                    <TableHead>Départ</TableHead>
                    <TableHead className="text-center">Pèlerins</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créée le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((r) => {
                    const status = omraStatusConfig(r.status)
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link
                            href={`/admin/omra/reservations/${r.id}`}
                            className="font-mono text-sm font-medium text-[#1e3a5f] hover:underline"
                          >
                            {r.publicRef}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.customerName}</div>
                          {r.customerEmail && (
                            <div className="text-muted-foreground text-xs">
                              {r.customerEmail}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.customerPhone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-gray-400" />
                              {r.customerPhone}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-sm">
                          {r.packageName ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(r.departureDate)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3 text-gray-400" />
                            {r.pilgrims}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {r.tndAmount.toLocaleString("fr-FR")} TND
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={status.badgeClass}
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(r.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <OmraReservationActions
                            id={r.id}
                            publicRef={r.publicRef}
                            status={r.status}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {result.pageCount > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                asChild={result.page > 1}
                variant="outline"
                size="sm"
                disabled={result.page <= 1}
              >
                {result.page > 1 ? (
                  <Link
                    href={`/admin/omra/reservations${buildQuery({
                      ...carried,
                      status: sp.status,
                      page: String(result.page - 1),
                    })}`}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Précédent
                  </Link>
                ) : (
                  <span>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Précédent
                  </span>
                )}
              </Button>
              <span className="text-muted-foreground text-sm">
                <Calendar className="mr-1 inline h-3 w-3" />
                {result.total} au total
              </span>
              <Button
                asChild={result.page < result.pageCount}
                variant="outline"
                size="sm"
                disabled={result.page >= result.pageCount}
              >
                {result.page < result.pageCount ? (
                  <Link
                    href={`/admin/omra/reservations${buildQuery({
                      ...carried,
                      status: sp.status,
                      page: String(result.page + 1),
                    })}`}
                  >
                    Suivant
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                ) : (
                  <span>
                    Suivant
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </span>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
