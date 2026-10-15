/**
 * /admin/suppliers/nodes/[id]/settlements — SUPPLIER-SETTLEMENT-ADMIN-UI-01.
 *
 * Ferme le trou documenté dans ROADMAP.md (APPLY-SUPPLIER-SETTLEMENT-0135-PRODUCTION) :
 * la migration 0135 (tables + 5 fonctions SECURITY DEFINER) était en
 * production sans aucun appelant. `lib/finance/supplier-settlement.ts` et
 * `lib/finance/supplier-settlement-actions.ts` existaient déjà (PR #203,
 * testés, avec garde super_admin) — ce fichier n'ajoute que la UI.
 *
 * Sécurité : vérification profile.role === "super_admin" ici + dans les
 * wrappers `supplier-settlement-actions.ts` (defense-in-depth) + dans les
 * fonctions SQL elles-mêmes (`assert_supplier_settlement_actor`).
 *
 * Périmètre V1 (hérité de 0135, pas réinventé ici) : uniquement les
 * créances `party_type='supplier_node'` (module Network).
 */
import { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Receipt } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withSystemContext } from "@/lib/db/tenant-context"
import { supplierNodes } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import {
  listUnsettledSupplierDebts,
  listSupplierSettlements,
} from "@/lib/finance/supplier-settlement"
import {
  DeclareSettlementDialog,
  ConfirmSettlementButton,
  CancelSettlementButton,
  ReverseSettlementDialog,
  RefundEntryDialog,
  CorrectDebtDialog,
} from "@/components/admin/supplier-settlement-buttons"

export const metadata: Metadata = {
  title: "Règlements fournisseur — Portail Easy2Book",
}

export const dynamic = "force-dynamic"

const STATUS_LABEL: Record<string, string> = {
  pending: "Brouillon",
  declared: "Déclaré",
  paid: "Payé",
  reversed: "Réversé",
  failed: "Échoué",
  cancelled: "Annulé",
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  declared: "secondary",
  paid: "default",
  reversed: "destructive",
  failed: "destructive",
  cancelled: "outline",
}

const REVERSAL_CAUSE_LABEL: Record<string, string> = {
  rejected_payment: "paiement rejeté",
  erroneous_confirmation: "confirmation erronée",
  duplicate_payment: "paiement en double",
  other: "autre",
}

function settlementTypeLabel(row: {
  correctionType: "amount_correction" | "reversal" | null
  correctionCause:
    | "calculation_error"
    | "duplicate_entry"
    | "supplier_refund"
    | null
  reversalCause: string | null
}): string {
  if (row.correctionType === "reversal") {
    return `Réversion (${REVERSAL_CAUSE_LABEL[row.reversalCause ?? ""] ?? row.reversalCause})`
  }
  if (row.correctionType === "amount_correction") {
    if (row.correctionCause === "supplier_refund") return "Remboursement réel"
    if (row.correctionCause === "calculation_error")
      return "Correction (erreur de calcul)"
    if (row.correctionCause === "duplicate_entry") return "Correction (doublon)"
  }
  return "Règlement normal"
}

export default async function SupplierSettlementsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/suppliers/nodes/${id}/settlements`)

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.role !== "super_admin") redirect("/admin")

  const [node] = await withSystemContext((db) =>
    db.select().from(supplierNodes).where(eq(supplierNodes.id, id)).limit(1),
  )
  if (!node) notFound()

  const [debts, settlements] = await Promise.all([
    listUnsettledSupplierDebts(id),
    listSupplierSettlements(id),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/admin/suppliers/nodes/${id}`}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {node.displayName}
        </Link>
        <h1 className="text-foreground text-3xl font-bold tracking-tight">
          Règlements fournisseur
        </h1>
        <p className="text-muted-foreground text-sm">
          Périmètre V1 : créances Network (party_type=supplier_node) uniquement.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5" />
              Dettes non réglées
              <span className="text-muted-foreground text-sm font-normal">
                {debts.length}
              </span>
            </CardTitle>
            <CardDescription>
              Reste à payer ou trop-payé par créance (jamais confondus).
            </CardDescription>
          </div>
          <DeclareSettlementDialog supplierNodeId={id} debts={debts} />
        </CardHeader>
        <CardContent>
          {debts.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Aucune créance avec un reste à payer ou un trop-payé.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Créance</TableHead>
                    <TableHead>Réservation</TableHead>
                    <TableHead className="text-right">Reste dû</TableHead>
                    <TableHead className="text-right">Trop-payé</TableHead>
                    <TableHead className="text-right">Net décaissé</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debts.map((d) => (
                    <TableRow key={d.entitlementId}>
                      <TableCell className="font-mono text-xs">
                        {d.entitlementId.slice(0, 8)}
                        {d.disputedCancellation && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-amber-600 dark:text-amber-400"
                          >
                            {d.reservationStatus}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {d.reservationId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(d.remaining) > 0 ? (
                          <strong>{d.remaining} TND</strong>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(d.overpaid) > 0 ? (
                          <strong className="text-amber-600 dark:text-amber-400">
                            {d.overpaid} TND
                          </strong>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {d.netDecaisse} TND
                      </TableCell>
                      <TableCell className="text-right">
                        <CorrectDebtDialog entitlementId={d.entitlementId} />
                      </TableCell>
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
          <CardTitle className="text-base">
            Historique des règlements
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {settlements.length}
            </span>
          </CardTitle>
          <CardDescription>
            Règlements normaux, corrections comptables, remboursements réels et
            réversions — tous confondus, triés par date de création.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Aucun règlement déclaré pour ce fournisseur.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Montant (TND)</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead>Confirmé le</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlements.map((s) => {
                    const normalEntry = s.entries.find(
                      (e) => e.entryKind === "normal" && !e.unlinkedAt,
                    )
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">
                          {settlementTypeLabel(s)}
                          <span className="text-muted-foreground ml-1 font-mono text-xs">
                            ({s.id.slice(0, 8)})
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {s.totalAmount}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={STATUS_VARIANT[s.status] ?? "secondary"}
                          >
                            {STATUS_LABEL[s.status] ?? s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(s.createdAt).toLocaleDateString("fr-FR")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.confirmedAt
                            ? new Date(s.confirmedAt).toLocaleDateString(
                                "fr-FR",
                              )
                            : "—"}
                        </TableCell>
                        <TableCell className="flex justify-end gap-1.5">
                          {(s.status === "pending" ||
                            s.status === "declared") && (
                            <>
                              <ConfirmSettlementButton settlementId={s.id} />
                              <CancelSettlementButton settlementId={s.id} />
                            </>
                          )}
                          {s.status === "paid" && !s.reversedBySettlementId && (
                            <>
                              {s.correctionType === null && normalEntry && (
                                <RefundEntryDialog
                                  entitlementId={normalEntry.entitlementId}
                                  targetSettlementId={s.id}
                                />
                              )}
                              <ReverseSettlementDialog settlementId={s.id} />
                            </>
                          )}
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
