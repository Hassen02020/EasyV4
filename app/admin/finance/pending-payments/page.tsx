/**
 * /admin/finance/pending-payments — file d'attente Wallet/Payment Core.
 *
 * Réservations `pending` en attente d'un règlement manuel (cash/virement/
 * dépôt) pour l'agence courante. Le bouton "Vérifier" appelle le vrai
 * `verifyManualPayment` (lib/finance/manual-payment-actions.ts) — le staff
 * ne peut PAS se contenter de changer le statut depuis cette page : il n'y
 * a pas de bouton "Confirmer" direct, seulement "Vérifier le règlement"
 * (référence obligatoire), qui capture le paiement, confirme, facture et
 * déclenche le voucher dans cet ordre.
 */

import { redirect } from "next/navigation"
import { Clock } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { reservations, customers } from "@/lib/db/schema"
import { and, eq, desc } from "drizzle-orm"
import { MANUAL_PAYMENT_ALLOWED_ROLES } from "@/lib/finance/manual-payment-logic"
import { VerifyPaymentButton } from "@/components/admin/verify-payment-button"

export const metadata = { title: "Paiements en attente | Admin Easy2Book" }
export const dynamic = "force-dynamic"

const METHOD_LABEL: Record<string, string> = {
  cash: "Espèces",
  transfer: "Virement",
  card: "Carte (non configurée)",
  wallet: "Wallet",
}

async function loadPendingPayments(agencyId: string) {
  return withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, async (db) => {
    const rows = await db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        tndAmount: reservations.tndAmount,
        createdAt: reservations.createdAt,
        paymentExpiresAt: reservations.paymentExpiresAt,
        providerPayload: reservations.providerPayload,
        customerId: reservations.customerId,
      })
      .from(reservations)
      .where(and(eq(reservations.agencyId, agencyId), eq(reservations.status, "pending")))
      .orderBy(desc(reservations.createdAt))
      .limit(100)

    const customerIds = [...new Set(rows.map((r) => r.customerId))]
    const customerRows =
      customerIds.length > 0
        ? await db
            .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName, email: customers.email })
            .from(customers)
            .where(eq(customers.agencyId, agencyId))
        : []
    const customerMap = new Map(customerRows.map((c) => [c.id, c]))

    const now = Date.now()
    return rows.map((r) => {
      const payload = (r.providerPayload as Record<string, unknown> | null) ?? {}
      const expiresAt = r.paymentExpiresAt ? new Date(r.paymentExpiresAt) : null
      return {
        ...r,
        method: typeof payload.paymentMethod === "string" ? payload.paymentMethod : "—",
        customer: customerMap.get(r.customerId),
        expiresAt,
        isPastDeadline: expiresAt ? expiresAt.getTime() < now : false,
      }
    })
  })
}

export default async function PendingPaymentsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/finance/pending-payments")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !(MANUAL_PAYMENT_ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    redirect("/admin")
  }

  const pending = await loadPendingPayments(profile.agencyId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">Paiements en attente</h1>
        <p className="text-muted-foreground mt-1">
          Réservations en attente d&apos;un règlement manuel (espèces, virement, dépôt). Vérifier un
          règlement capture le paiement, confirme la réservation, génère la facture et déclenche le
          voucher — dans cet ordre.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>File d&apos;attente ({pending.length})</CardTitle>
          <CardDescription>Triée par date de création, la plus récente en premier.</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <div className="py-12 text-center">
              <Clock className="mx-auto h-12 w-12 text-gray-300" />
              <p className="text-muted-foreground mt-4">Aucun paiement en attente.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Référence</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Méthode</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Expiration (24h)</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) => {
                    const { expiresAt, isPastDeadline } = row
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <code className="rounded bg-gray-100 px-2 py-1 font-mono text-sm">{row.publicRef}</code>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {row.customer?.firstName} {row.customer?.lastName}
                          </p>
                          <p className="text-muted-foreground text-xs">{row.customer?.email}</p>
                        </TableCell>
                        <TableCell>{METHOD_LABEL[row.method] ?? row.method}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {Number.parseFloat(row.tndAmount).toLocaleString("fr-FR")} DT
                        </TableCell>
                        <TableCell>
                          {expiresAt ? (
                            <Badge variant={isPastDeadline ? "destructive" : "outline"}>
                              {isPastDeadline ? "Délai dépassé" : expiresAt.toLocaleString("fr-FR")}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <VerifyPaymentButton
                            reservationId={row.id}
                            defaultMethod={row.method === "cash" ? "cash" : "transfer"}
                            disabled={isPastDeadline}
                          />
                        </TableCell>
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
