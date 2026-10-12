/**
 * ADMIN-FINANCIALS-REPORTING-01
 * /admin/analytics/finances — synthèse financière des annulations.
 *
 * Données source : reservation_financials.(cancellation_fee, refund_amount,
 * cancelled_at) + reservations.module — fenêtre 90 jours glissants.
 * Aucune migration requise : colonnes présentes depuis ADMIN-CANCEL-FINANCIALS-01.
 * Lecture seule, withSystemContext.
 */

import { getCancellationFinancialsSummary } from "@/lib/finance/cancellation-reporting"
import { formatTnd } from "@/lib/pro/booking-actions"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { XCircle, TrendingDown, Wallet, BarChart2 } from "lucide-react"

/** Labels affichage pour les modules réservation. */
const MODULE_LABELS: Record<string, string> = {
  hotel: "Hôtel myGo",
  hotel_monde: "Hôtel Monde",
  omra: "Omra",
  package: "Package",
  activity: "Activité",
  flight: "Vol",
  car: "Voiture",
  transfer: "Transfert",
  network: "Réseau",
  mutuelle: "Mutuelle",
}

function moduleLabel(module: string) {
  return MODULE_LABELS[module] ?? module
}

/** Couleur badge par module (cosmétique uniquement). */
function moduleBadgeVariant(
  module: string,
): "default" | "secondary" | "outline" {
  if (module === "hotel" || module === "hotel_monde") return "default"
  if (module === "omra" || module === "package") return "secondary"
  return "outline"
}

export default async function CancellationFinancesPage() {
  const data = await getCancellationFinancialsSummary()

  const netRetained = data.totalFeesTnd - data.totalRefundedTnd

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* En-tête */}
      <div>
        <div className="flex items-center gap-2">
          <XCircle className="text-muted-foreground h-6 w-6" />
          <h1 className="text-2xl font-semibold">Finances Annulations</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Synthèse sur {data.windowDays} jours glissants — frais retenus et
          remboursements effectifs.
        </p>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Annulations</CardTitle>
            <XCircle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {data.totalCancellations.toLocaleString("fr-TN")}
            </p>
            <p className="text-muted-foreground text-xs">
              sur {data.windowDays} jours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Frais retenus</CardTitle>
            <TrendingDown className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatTnd(data.totalFeesTnd)}
            </p>
            <p className="text-muted-foreground text-xs">TND cumulé</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Remboursements
            </CardTitle>
            <Wallet className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatTnd(data.totalRefundedTnd)}
            </p>
            <p className="text-muted-foreground text-xs">wallet TND crédité</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net retenu</CardTitle>
            <BarChart2 className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatTnd(netRetained)}
            </p>
            <p className="text-muted-foreground text-xs">frais − remboursements</p>
          </CardContent>
        </Card>
      </div>

      {/* Répartition par module */}
      <Card>
        <CardHeader>
          <CardTitle>Répartition par module</CardTitle>
          <CardDescription>
            Détail annulations / frais / remboursements par type de produit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.byModule.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Aucune annulation avec données financières sur la période.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead className="text-right">Annulations</TableHead>
                  <TableHead className="text-right">Frais (TND)</TableHead>
                  <TableHead className="text-right">
                    Remboursements (TND)
                  </TableHead>
                  <TableHead className="text-right">Net retenu (TND)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byModule.map((row) => (
                  <TableRow key={row.module}>
                    <TableCell>
                      <Badge variant={moduleBadgeVariant(row.module)}>
                        {moduleLabel(row.module)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.count.toLocaleString("fr-TN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTnd(row.totalFees)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTnd(row.totalRefunded)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTnd(row.totalFees - row.totalRefunded)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tendance journalière */}
      {data.dailyTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tendance journalière</CardTitle>
            <CardDescription>
              Annulations par jour sur les {data.windowDays} derniers jours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Annulations</TableHead>
                  <TableHead className="text-right">Frais (TND)</TableHead>
                  <TableHead className="text-right">
                    Remboursements (TND)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.dailyTrend.slice(-30).map((row) => (
                  <TableRow key={row.day}>
                    <TableCell className="tabular-nums">{row.day}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.count.toLocaleString("fr-TN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTnd(row.fees)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTnd(row.refunded)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
