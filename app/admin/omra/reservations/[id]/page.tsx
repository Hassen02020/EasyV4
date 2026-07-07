/**
 * Back-office — Détail d'une réservation Omra
 *
 * Informations réservation, liste des pèlerins, historique et actions métier.
 */

import { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import {
  ArrowLeft,
  Moon,
  User,
  Phone,
  Mail,
  Calendar,
  CreditCard,
  Plane,
  History,
  ExternalLink,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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
import { loadOmraReservationDetail } from "@/lib/omra/reservations-data"
import {
  omraStatusConfig,
  OMRA_HISTORY_ACTION_LABEL,
} from "@/lib/omra/reservation-status"
import { OmraReservationActions } from "@/components/admin/omra-reservation-actions"
import { OmraReservationNoteForm } from "@/components/admin/omra-reservation-note-form"

export const metadata: Metadata = {
  title: "Détail réservation Omra — Back-office",
}

export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["super_admin", "manager", "agent_resa"]

const GENDER_LABEL: Record<string, string> = {
  male: "Homme",
  female: "Femme",
  m: "Homme",
  f: "Femme",
}

const VISA_LABEL: Record<string, string> = {
  pending: "En attente",
  submitted: "Soumis",
  approved: "Approuvé",
  rejected: "Rejeté",
  issued: "Délivré",
}

function fmtDate(value: string | Date | null): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

function fmtDateTime(value: Date | null): string {
  if (!value) return "—"
  return value.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function historyLabel(action: string): string {
  return OMRA_HISTORY_ACTION_LABEL[action] ?? action
}

function historyDetail(
  action: string,
  diff: Record<string, unknown> | null,
): string | null {
  if (!diff) return null
  if (action === "note") return String(diff.note ?? "")
  if (action === "create") {
    const parts: string[] = []
    if (diff.packageName) parts.push(String(diff.packageName))
    if (diff.pilgrims) parts.push(`${diff.pilgrims} pèlerin(s)`)
    if (diff.totalTnd)
      parts.push(`${Number(diff.totalTnd).toLocaleString("fr-FR")} TND`)
    return parts.join(" · ") || null
  }
  if (action === "cancel" && diff.reason) return `Motif : ${diff.reason}`
  if (diff.from && diff.to) return `${diff.from} → ${diff.to}`
  return null
}

export default async function OmraReservationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/admin/login?next=/admin/omra/reservations/${id}`)
  }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    redirect("/admin")
  }

  const res = await loadOmraReservationDetail(profile.agencyId, id)
  if (!res) notFound()

  const status = omraStatusConfig(res.status)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/admin/omra/reservations">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Retour à la liste
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Moon className="h-6 w-6 text-[#1e3a5f]" />
            <span className="font-mono">{res.publicRef}</span>
            <Badge variant="outline" className={status.badgeClass}>
              {status.label}
            </Badge>
          </h1>
          <p className="text-muted-foreground">
            {res.packageName ?? "Programme Omra"}
          </p>
        </div>
        <OmraReservationActions
          id={res.id}
          publicRef={res.publicRef}
          status={res.status}
          variant="buttons"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="space-y-6 lg:col-span-2">
          {/* Informations réservation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Informations réservation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Info label="Référence" value={res.publicRef} mono />
                <Info
                  label="Programme"
                  value={
                    res.packageSlug ? (
                      <Link
                        href={`/omra/${res.packageSlug}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 text-[#1e3a5f] hover:underline"
                      >
                        {res.packageName}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : (
                      (res.packageName ?? "—")
                    )
                  }
                />
                <Info
                  label="Départ"
                  value={fmtDate(res.departureDate)}
                  icon={<Plane className="h-4 w-4 text-gray-400" />}
                />
                <Info
                  label="Retour"
                  value={fmtDate(res.returnDate)}
                  icon={<Calendar className="h-4 w-4 text-gray-400" />}
                />
                <Info
                  label="Montant total"
                  value={`${res.tndAmount.toLocaleString("fr-FR")} TND`}
                />
                <Info
                  label="Acompte"
                  value={`${res.depositPaid.toLocaleString("fr-FR")} / ${res.depositAmount.toLocaleString("fr-FR")} TND`}
                  icon={<CreditCard className="h-4 w-4 text-gray-400" />}
                />
                <Info label="Créée le" value={fmtDateTime(res.createdAt)} />
                <Info
                  label={
                    res.status === "cancelled"
                      ? "Annulée le"
                      : "Confirmée le"
                  }
                  value={
                    res.status === "cancelled"
                      ? fmtDateTime(res.cancelledAt)
                      : fmtDateTime(res.confirmedAt)
                  }
                />
              </dl>
            </CardContent>
          </Card>

          {/* Pèlerins */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pèlerins ({res.pilgrims.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {res.pilgrims.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucune fiche pèlerin.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Sexe</TableHead>
                        <TableHead>Passeport</TableHead>
                        <TableHead>Expiration</TableHead>
                        <TableHead>Nationalité</TableHead>
                        <TableHead>Visa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {res.pilgrims.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.firstName} {p.lastName}
                          </TableCell>
                          <TableCell>
                            {GENDER_LABEL[p.gender] ?? p.gender}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {p.passportNumber}
                          </TableCell>
                          <TableCell className="text-sm">
                            {fmtDate(p.passportExpiryDate)}
                          </TableCell>
                          <TableCell>{p.nationality}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {VISA_LABEL[p.visaStatus] ?? p.visaStatus}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historique */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                Historique
              </CardTitle>
              <CardDescription>
                Création, changements de statut, notes et actions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <OmraReservationNoteForm id={res.id} />
              <Separator />
              {res.history.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucun événement.
                </p>
              ) : (
                <ol className="space-y-4">
                  {res.history.map((h) => {
                    const detail = historyDetail(h.action, h.diff)
                    return (
                      <li key={h.id} className="flex gap-3">
                        <div className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[#1e3a5f]" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {historyLabel(h.action)}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {fmtDateTime(h.createdAt)}
                            </span>
                          </div>
                          {detail && (
                            <p className="text-muted-foreground mt-0.5 text-sm whitespace-pre-line">
                              {detail}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Colonne client */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-lg font-semibold">
                {res.customer.firstName} {res.customer.lastName}
              </div>
              {res.customer.phone && (
                <a
                  href={`tel:${res.customer.phone}`}
                  className="flex items-center gap-2 text-sm text-[#1e3a5f] hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {res.customer.phone}
                </a>
              )}
              {res.customer.email && (
                <a
                  href={`mailto:${res.customer.email}`}
                  className="flex items-center gap-2 text-sm text-[#1e3a5f] hover:underline"
                >
                  <Mail className="h-4 w-4" />
                  {res.customer.email}
                </a>
              )}
            </CardContent>
          </Card>

          {res.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {res.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function Info({
  label,
  value,
  mono,
  icon,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </dt>
      <dd
        className={`mt-1 flex items-center gap-1.5 text-sm ${mono ? "font-mono" : ""}`}
      >
        {icon}
        {value}
      </dd>
    </div>
  )
}
