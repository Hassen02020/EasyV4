/**
 * Vue détail réservation — partagée entre `/admin/reservations/[id]`
 * (Master Admin) et `/pro/reservations/[id]` (agence), pour éviter deux
 * implémentations divergentes du même écran. Le contenu (paiements, résumé,
 * timeline d'audit) est purement informatif ; les actions mutantes
 * (vérifier un règlement, rembourser) sont injectées par le composant
 * parent via `actions` — ce composant lui-même ne fait aucun appel serveur.
 */

import Link from "next/link"
import {
  Building2,
  Calendar,
  CreditCard,
  Download,
  FileText,
  History,
  User,
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
import { AuditTimeline } from "@/components/admin/audit-timeline"
import type { ReservationDetail } from "@/lib/booking/reservation-detail"

const TND_FORMAT = new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PAYMENT_STATE_LABEL: Record<string, { label: string; className: string }> = {
  UNPAID: { label: "Non payé", className: "border-destructive/40 bg-destructive/15 text-destructive" },
  PARTIALLY_PAID: { label: "Partiellement payé", className: "border-warning/40 bg-warning/15 text-warning-foreground" },
  FULLY_PAID: { label: "Payé intégralement", className: "border-success/40 bg-success/15 text-success-foreground" },
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "Carte bancaire",
  wallet: "Wallet",
  transfer: "Virement / Dépôt / Mandat",
  cash: "Espèces",
  at_hotel: "Paiement à l'hôtel",
}

const MODULE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  flight: "Vol",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  transfer: "Transfert",
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
}

function formatDay(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "medium" })
}

export function ReservationDetailView({
  detail,
  showAgency = false,
  actions,
  voucherHref,
  invoiceHref,
}: {
  detail: ReservationDetail
  /** Affiche le panneau Agence/Partenaire — pertinent surtout pour la vue Master Admin cross-agence. */
  showAgency?: boolean
  actions?: React.ReactNode
  voucherHref?: string | null
  invoiceHref?: string | null
}) {
  const paymentState = PAYMENT_STATE_LABEL[detail.paymentSummary.paymentState] ?? PAYMENT_STATE_LABEL.UNPAID

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-foreground text-2xl font-bold tracking-tight">{detail.publicRef}</h1>
            <Badge variant="outline">{MODULE_LABEL[detail.module] ?? detail.module}</Badge>
            <Badge variant="outline">{detail.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Créée le {formatDate(detail.createdAt)}
            {detail.confirmedAt ? ` · Confirmée le ${formatDate(detail.confirmedAt)}` : ""}
            {detail.cancelledAt ? ` · Annulée le ${formatDate(detail.cancelledAt)}` : ""}
          </p>
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>

      {/* Résumé financier — total/collecté/restant/état, source unique getReservationPaymentSummary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{TND_FORMAT.format(detail.paymentSummary.totalTnd)} DT</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Encaissé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{TND_FORMAT.format(detail.paymentSummary.collectedTnd)} DT</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">Restant</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{TND_FORMAT.format(detail.paymentSummary.remainingTnd)} DT</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">État du paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={paymentState.className}>{paymentState.label}</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" /> Client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-medium">{detail.customer.name}</p>
            <p className="text-muted-foreground">{detail.customer.email ?? "—"}</p>
            <p className="text-muted-foreground">{detail.customer.phone ?? "—"}</p>
          </CardContent>
        </Card>

        {showAgency ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" /> Agence / Partenaire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{detail.agency.name}</p>
              <p className="text-muted-foreground">
                {detail.agency.agencyType === "ota" ? "Easy2Book (OTA)" : "Agence partenaire B2B"}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" /> Fournisseur / Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {detail.moduleDetail ? (
              <>
                <p className="font-medium">{detail.moduleDetail.supplierLabel}</p>
                <p className="text-muted-foreground">
                  {formatDay(detail.moduleDetail.startDate)}
                  {detail.moduleDetail.endDate ? ` → ${formatDay(detail.moduleDetail.endDate)}` : ""}
                </p>
                {detail.moduleDetail.providerBookingId ? (
                  <p className="text-muted-foreground font-mono text-xs">
                    Réf. fournisseur : {detail.moduleDetail.providerBookingId}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">Aucun détail spécifique disponible pour ce module.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Facture / Voucher
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              Facture :{" "}
              {detail.invoice ? (
                <span className="font-medium">
                  {detail.invoice.invoiceNumber} ({detail.invoice.status}, {TND_FORMAT.format(detail.invoice.totalTtc)} DT)
                </span>
              ) : (
                <span className="text-muted-foreground">Aucune facture générée</span>
              )}
              {detail.invoice && invoiceHref ? (
                <Link href={invoiceHref} className="text-primary inline-flex items-center gap-1 font-medium underline">
                  <Download className="h-3.5 w-3.5" /> Télécharger
                </Link>
              ) : null}
            </p>
            <p className="flex items-center gap-2">
              Voucher :{" "}
              {voucherHref ? (
                <Link href={voucherHref} className="text-primary inline-flex items-center gap-1 font-medium underline">
                  <Download className="h-3.5 w-3.5" /> Télécharger
                </Link>
              ) : (
                <span className="text-muted-foreground">Non disponible pour ce module/statut</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" /> Transactions de paiement
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.payments.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Aucun paiement encaissé pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Méthode</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Remboursé</TableHead>
                    <TableHead>Encaissé le</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{PAYMENT_METHOD_LABEL[p.method] ?? p.method}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{TND_FORMAT.format(p.tndAmount)} DT</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {p.refundedAmount > 0 ? `${TND_FORMAT.format(p.refundedAmount)} DT` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDate(p.capturedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Historique / Audit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTimeline entries={detail.auditTimeline} />
        </CardContent>
      </Card>
    </div>
  )
}
