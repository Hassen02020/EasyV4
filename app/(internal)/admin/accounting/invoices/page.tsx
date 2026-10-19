/**
 * /admin/finance/invoices — Consultation des factures (Phase 18, P1).
 *
 * `listPartnerInvoices` existait déjà (utilisée par /pro/factures) mais
 * aucune page `/admin` ne permettait de parcourir les factures sans accès
 * DB direct. Réutilise la même requête/logique — `listAdminInvoices`
 * (lib/finance/invoice-actions.ts) n'ajoute que le nom d'agence pour la
 * vue cross-agence super_admin.
 */

import { Metadata } from "next"
import { redirect } from "next/navigation"
import { FileText } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { isAllowedIntoAdmin } from "@/lib/auth/admin-gate"
import { listAdminInvoices } from "@/lib/finance/invoice-actions"
import { MANUAL_PAYMENT_ALLOWED_ROLES } from "@/lib/finance/manual-payment-logic"
import { ConfirmMutuelleInvoiceSettlementButton } from "@/components/admin/confirm-mutuelle-invoice-settlement-button"

export const metadata: Metadata = { title: "Factures — Admin Easy2Book" }
export const dynamic = "force-dynamic"

const TND_FORMAT = new Intl.NumberFormat("fr-TN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * MUTUELLE-INVOICE-SETTLEMENT-01 — distingue visuellement "issued" (émise,
 * non réglée — ex. facture Mutuelle avant confirmation de règlement) de
 * "paid" (réglée, avec preuve). Les autres statuts restent affichés tels
 * quels (draft/partial/overdue/cancelled), aucun cas réel connu pour eux
 * à ce jour en dehors de "paid" (14 flux) et "issued" (Mutuelle).
 */
const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  paid: {
    label: "Payée",
    className: "border-green-300 bg-green-100 text-green-900",
  },
  issued: {
    label: "Émise — non réglée",
    className: "border-amber-300 bg-amber-100 text-amber-900",
  },
}

export default async function AdminInvoicesPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/accounting/invoices")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !isAllowedIntoAdmin(profile.role, profile.agencyType)) {
    redirect("/admin")
  }

  const isSuperAdmin = profile.role === "super_admin"
  const invoices = await listAdminInvoices(
    isSuperAdmin ? null : profile.agencyId,
    user.id,
    isSuperAdmin,
  )
  const canConfirmSettlement = (
    MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]
  ).includes(profile.role)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          Factures
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isSuperAdmin ? "Toutes agences" : "Votre agence"} — {invoices.length}{" "}
          facture(s)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Liste des factures
          </CardTitle>
          <CardDescription>
            Générées automatiquement à la confirmation d&apos;une réservation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              Aucune facture.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° facture</TableHead>
                    {isSuperAdmin ? <TableHead>Agence</TableHead> : null}
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                    <TableHead className="text-right">Payé</TableHead>
                    <TableHead>Statut</TableHead>
                    {canConfirmSettlement ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const statusInfo = STATUS_LABEL[inv.status]
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs">
                          {inv.invoiceNumber}
                        </TableCell>
                        {isSuperAdmin ? (
                          <TableCell>{inv.agencyName ?? "—"}</TableCell>
                        ) : null}
                        <TableCell>{inv.invoiceType}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {inv.validationDate ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {TND_FORMAT.format(Number.parseFloat(inv.totalTtc))}{" "}
                          DT
                        </TableCell>
                        <TableCell className="text-right">
                          {TND_FORMAT.format(Number.parseFloat(inv.amountPaid))}{" "}
                          DT
                        </TableCell>
                        <TableCell>
                          {statusInfo ? (
                            <Badge
                              variant="outline"
                              className={statusInfo.className}
                            >
                              {statusInfo.label}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{inv.status}</Badge>
                          )}
                        </TableCell>
                        {canConfirmSettlement ? (
                          <TableCell>
                            {inv.status === "issued" ? (
                              <ConfirmMutuelleInvoiceSettlementButton
                                invoiceId={inv.id}
                                invoiceNumber={inv.invoiceNumber}
                              />
                            ) : null}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
