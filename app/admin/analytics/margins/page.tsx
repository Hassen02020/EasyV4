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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { CalendarIcon, TrendingUp, TrendingDown, Minus, DollarSign, Package, Users } from "lucide-react"
import {
  getMarginKPIs,
  getMarginBySupplier,
  getMarginByProductType,
  getTopMarginReservations,
  getMarginEvolution,
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

  useEffect(() => {
    loadKPIs()
  }, [dateRange])

  const loadKPIs = async () => {
    setLoading(true)
    try {
      // TODO: Remplacer avec l'agencyId réel
      const data = await getMarginKPIs("agency-id", dateRange.from, dateRange.to)
      setKpis(data)
    } catch (error) {
      console.error("Erreur chargement KPIs:", error)
    } finally {
      setLoading(false)
    }
  }

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Marges</h1>
          <p className="text-muted-foreground">
            Suivi des marges en temps réel
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateRange.from, "dd/MM/yyyy", { locale: fr })} -{" "}
                {format(dateRange.to, "dd/MM/yyyy", { locale: fr })}
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
      ) : kpis ? (
        <>
          {/* KPIs Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Chiffre d'affaires
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
                  Sur le chiffre d'affaires
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
              <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
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
                  <p className="text-muted-foreground">
                    Graphique d'évolution des marges dans le temps (à implémenter)
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="suppliers" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Marges par fournisseur</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Tableau des marges par fournisseur (à implémenter)
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Marges par type de produit</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Tableau des marges par type de produit (à implémenter)
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="top" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Top réservations (marge)</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Liste des réservations avec les meilleures marges (à implémenter)
                  </p>
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
