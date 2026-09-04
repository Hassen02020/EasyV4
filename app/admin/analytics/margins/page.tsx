/**
 * Dashboard Marges - Easy2Book V6
 *
 * Page d'administration pour le suivi des marges en temps réel
 * Affiche les KPIs, les tendances et les classements
 */

"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { CalendarIcon, TrendingUp, TrendingDown, Minus, DollarSign, Package, Users } from "lucide-react"
import {
  getMarginKPIs,
  getMarginBySupplier,
  getMarginByProductType,
  getTopMarginReservations,
  getMarginEvolution,
  type MarginBySupplier,
  type MarginByProductType,
  type TopMarginReservation,
} from "@/lib/reporting/margin-analytics"

type MarginKPIs = {
  period: { start: Date; end: Date }
  totalRevenue: number
  totalRevenueTnd: number
  totalCost: number
  totalCostTnd: number
  totalMargin: number
  totalMarginTnd: number
  averageMarginPercent: number
  totalCommission: number
  totalReservations: number
  confirmedReservations: number
  marginTrend: "up" | "down" | "stable"
  marginTrendPercent: number
}

type MarginEvolutionPoint = { date: string; margin: number; revenue: number }

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  hotel: "Hôtel",
  flight: "Vol",
  omra: "Omra",
  package: "Voyage organisé",
  activity: "Activité",
  transfer: "Transfert",
  car: "Location voiture",
}

export default function MarginsDashboardPage() {
  const [kpis, setKpis] = useState<MarginKPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<{
    from: Date
    to: Date
  }>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  })

  const [loadError, setLoadError] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<MarginBySupplier[]>([])
  const [productTypes, setProductTypes] = useState<MarginByProductType[]>([])
  const [topReservations, setTopReservations] = useState<TopMarginReservation[]>([])
  const [evolution, setEvolution] = useState<MarginEvolutionPoint[]>([])

  const loadKPIs = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // L'agence est résolue côté serveur depuis la session admin —
      // jamais fournie par le client (voir lib/reporting/margin-analytics.ts).
      const [data, bySupplier, byProductType, topMargins, evolutionData] = await Promise.all([
        getMarginKPIs(dateRange.from, dateRange.to),
        getMarginBySupplier(dateRange.from, dateRange.to),
        getMarginByProductType(dateRange.from, dateRange.to),
        getTopMarginReservations(dateRange.from, dateRange.to),
        getMarginEvolution(dateRange.from, dateRange.to),
      ])
      setKpis(data)
      setSuppliers(bySupplier)
      setProductTypes(byProductType)
      setTopReservations(topMargins)
      setEvolution(evolutionData)
    } catch (error) {
      console.error("Erreur chargement KPIs:", error)
      setKpis(null)
      setLoadError(error instanceof Error ? error.message : "Erreur lors du chargement des KPIs.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dateRange change; loadKPIs manages its own loading state
    loadKPIs()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadKPIs is stable for the lifetime of this component (recreated each render but reads current dateRange via closure)
  }, [dateRange])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-TN", {
      style: "currency",
      currency: "TND",
    }).format(amount)
  }

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`
  }

  const getTrendIcon = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up":
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case "down":
        return <TrendingDown className="h-4 w-4 text-red-500" />
      default:
        return <Minus className="h-4 w-4 text-gray-500" />
    }
  }

  const getTrendColor = (trend: "up" | "down" | "stable") => {
    switch (trend) {
      case "up":
        return "text-green-500"
      case "down":
        return "text-red-500"
      default:
        return "text-gray-500"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Marges</h1>
          <p className="text-muted-foreground">
            Suivi des marges en temps réel
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">
                  {format(dateRange.from, "dd/MM/yyyy", { locale: fr })} -{" "}
                  {format(dateRange.to, "dd/MM/yyyy", { locale: fr })}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to })
                  }
                }}
                locale={fr}
              />
            </PopoverContent>
          </Popover>
          <Button onClick={loadKPIs}>Actualiser</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 h-64 text-center">
            <p className="text-destructive text-sm font-medium">{loadError}</p>
            <Button variant="outline" onClick={loadKPIs}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : kpis ? (
        <>
          {/* KPIs Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Chiffre d&apos;affaires
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(kpis.totalRevenue)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {kpis.totalReservations} réservations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Marge totale
                </CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(kpis.totalMargin)}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {getTrendIcon(kpis.marginTrend)}
                  <span className={getTrendColor(kpis.marginTrend)}>
                    {formatPercent(kpis.marginTrendPercent)}
                  </span>
                  <span className="text-muted-foreground">vs période précédente</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Marge moyenne
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatPercent(kpis.averageMarginPercent)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sur le chiffre d&apos;affaires
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Commission
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(kpis.totalCommission)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Prélevée sur les marges
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
              <TabsTrigger value="suppliers">Par fournisseur</TabsTrigger>
              <TabsTrigger value="products">Par type</TabsTrigger>
              <TabsTrigger value="top">Top marges</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Évolution des marges</CardTitle>
                </CardHeader>
                <CardContent>
                  {evolution.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Aucune réservation sur cette période.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Chiffre d&apos;affaires</TableHead>
                          <TableHead className="text-right">Marge</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {evolution.map((point) => (
                          <TableRow key={point.date}>
                            <TableCell>{format(new Date(point.date), "dd/MM/yyyy", { locale: fr })}</TableCell>
                            <TableCell className="text-right">{formatCurrency(point.revenue)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(point.margin)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="suppliers" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Marges par fournisseur</CardTitle>
                </CardHeader>
                <CardContent>
                  {suppliers.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Aucune réservation sur cette période.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fournisseur</TableHead>
                          <TableHead className="text-right">Réservations</TableHead>
                          <TableHead className="text-right">Chiffre d&apos;affaires</TableHead>
                          <TableHead className="text-right">Marge</TableHead>
                          <TableHead className="text-right">% Marge</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {suppliers.map((s) => (
                          <TableRow key={s.supplierId}>
                            <TableCell>{s.supplierName}</TableCell>
                            <TableCell className="text-right">{s.reservationCount}</TableCell>
                            <TableCell className="text-right">{formatCurrency(s.totalRevenue)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(s.totalMargin)}</TableCell>
                            <TableCell className="text-right">{formatPercent(s.marginPercent)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Marges par type de produit</CardTitle>
                </CardHeader>
                <CardContent>
                  {productTypes.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Aucune réservation sur cette période.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type de produit</TableHead>
                          <TableHead className="text-right">Réservations</TableHead>
                          <TableHead className="text-right">Chiffre d&apos;affaires</TableHead>
                          <TableHead className="text-right">Marge</TableHead>
                          <TableHead className="text-right">% Marge</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productTypes.map((p) => (
                          <TableRow key={p.productType}>
                            <TableCell>{PRODUCT_TYPE_LABEL[p.productType] ?? p.productType}</TableCell>
                            <TableCell className="text-right">{p.reservationCount}</TableCell>
                            <TableCell className="text-right">{formatCurrency(p.totalRevenue)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(p.totalMargin)}</TableCell>
                            <TableCell className="text-right">{formatPercent(p.marginPercent)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="top" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top réservations (marge)</CardTitle>
                </CardHeader>
                <CardContent>
                  {topReservations.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Aucune réservation sur cette période.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Référence</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Prix de vente</TableHead>
                          <TableHead className="text-right">Marge</TableHead>
                          <TableHead className="text-right">% Marge</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topReservations.map((r) => (
                          <TableRow key={r.reservationId}>
                            <TableCell className="font-mono text-xs">{r.publicRef}</TableCell>
                            <TableCell>{PRODUCT_TYPE_LABEL[r.productType] ?? r.productType}</TableCell>
                            <TableCell>{format(new Date(r.createdAt), "dd/MM/yyyy", { locale: fr })}</TableCell>
                            <TableCell className="text-right">{formatCurrency(r.salePriceTnd)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(r.marginAmount)}</TableCell>
                            <TableCell className="text-right">{formatPercent(r.marginPercent)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Aucune donnée disponible</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
