/**
 * /admin/accounting/settlements — Settlement des commissions Easy2Book.
 *
 * Chantier 41 : les fonctions `settleCommissions` et `markSettlementPaid`
 * existaient (37C) mais n'avaient aucune UI. Cette page ferme le trou :
 * seul un super_admin peut déclencher ou valider un settlement.
 *
 * Sécurité : vérification profile.role === "super_admin" ici + dans les
 * wrappers `lib/finance/settlement-actions.ts` (defense-in-depth).
 */

import { redirect } from "next/navigation"
import { BadgeDollarSign, Clock } from "lucide-react"
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
import { withSystemContext } from "@/lib/db/tenant-context"
import { commissionSettlements } from "@/lib/db/schema"
import { getUnsettledCommissionBalance } from "@/lib/finance/commission-settlement"
import { NewSettlementButton, MarkPaidButton } from "@/components/admin/settlement-buttons"
import { desc } from "drizzle-orm"

export const metadata = { title: "Settlements commissions | Admin Easy2Book" }
export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  paid: "Payé",
  cancelled: "Annulé",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  paid: "default",
  cancelled: "destructive",
}

async function loadSettlements() {
  return withSystemContext((db) =>
    db
      .select()
      .from(commissionSettlements)
      .orderBy(desc(commissionSettlements.createdAt))
      .limit(100),
  )
}

export default async function SettlementsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/accounting/settlements")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const [settlements, unsettledBalance] = await Promise.all([
    loadSettlements(),
    getUnsettledCommissionBalance(),
  ])

  const pendingCount = settlements.filter((s) => s.status === "pending").length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Settlements commissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Solde non settlé :{" "}
            <strong>
              {unsettledBalance.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} DT
            </strong>
            {pendingCount > 0 && (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                · {pendingCount} settlement{pendingCount > 1 ? "s" : ""} en attente de virement
              </span>
            )}
          </p>
        </div>
        <NewSettlementButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5" />
            Historique ({settlements.length})
          </CardTitle>
          <CardDescription>
            Chaque ligne représente un settlement périodique. Cliquer &quot;Marquer payé&quot; après
            confirmation du virement réel — action irréversible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <div className="py-12 text-center">
              <Clock className="mx-auto h-12 w-12 text-gray-300" />
              <p className="text-muted-foreground mt-4">Aucun settlement créé.</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Utilisez le bouton &quot;Nouveau settlement&quot; pour grouper les commissions non
                settlées sur une période.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead className="text-right">Montant (TND)</TableHead>
                    <TableHead className="text-right">Entrées</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm">
                        {row.periodStart} → {row.periodEnd}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {Number.parseFloat(row.totalAmount).toLocaleString("fr-FR", {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.ledgerEntryCount}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                          {STATUS_LABEL[row.status] ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(row.createdAt).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate text-sm">
                        {row.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status === "pending" ? (
                          <MarkPaidButton settlementId={row.id} />
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
