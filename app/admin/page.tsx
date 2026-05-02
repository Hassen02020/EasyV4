"use client"

import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign, 
  AlertTriangle, 
  Users,
  Plane,
  Building2,
  Moon,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Mock data
const stats = [
  {
    title: "Chiffre d'Affaires",
    value: "47,250 TND",
    change: "+12.5%",
    trend: "up",
    icon: DollarSign,
    description: "Ce mois",
  },
  {
    title: "Réservations Aujourd'hui",
    value: "23",
    change: "+5",
    trend: "up",
    icon: Calendar,
    description: "vs. hier",
  },
  {
    title: "Erreurs API MyGo",
    value: "3",
    change: "-2",
    trend: "down",
    icon: AlertTriangle,
    description: "Dernières 24h",
  },
  {
    title: "Clients Actifs",
    value: "1,847",
    change: "+89",
    trend: "up",
    icon: Users,
    description: "Ce mois",
  },
]

const recentBookings = [
  {
    id: "BK-2026-0501",
    client: "Ahmed Ben Ali",
    type: "hotel",
    destination: "Hammamet",
    date: "01/05/2026",
    amount: "890 TND",
    status: "confirmed",
  },
  {
    id: "BK-2026-0502",
    client: "Fatma Trabelsi",
    type: "flight",
    destination: "Istanbul",
    date: "01/05/2026",
    amount: "1,450 TND",
    status: "pending",
  },
  {
    id: "BK-2026-0503",
    client: "Mohamed Gharbi",
    type: "omra",
    destination: "La Mecque",
    date: "01/05/2026",
    amount: "3,200 TND",
    status: "confirmed",
  },
  {
    id: "BK-2026-0504",
    client: "Sonia Mejri",
    type: "hotel",
    destination: "Djerba",
    date: "01/05/2026",
    amount: "650 TND",
    status: "cancelled",
  },
  {
    id: "BK-2026-0505",
    client: "Karim Sassi",
    type: "flight",
    destination: "Paris",
    date: "01/05/2026",
    amount: "2,100 TND",
    status: "confirmed",
  },
]

const apiErrors = [
  {
    id: 1,
    endpoint: "HotelSearch",
    error: "Timeout - 30s exceeded",
    time: "14:32",
    resolved: false,
  },
  {
    id: 2,
    endpoint: "GetAvailability",
    error: "Invalid credentials",
    time: "12:15",
    resolved: true,
  },
  {
    id: 3,
    endpoint: "BookHotel",
    error: "Room not available",
    time: "09:45",
    resolved: false,
  },
]

const bookingsByType = [
  { type: "Hôtels Tunisie", count: 145, percentage: 58, icon: Building2, color: "bg-[#1e3a5f]" },
  { type: "Vols", count: 67, percentage: 27, icon: Plane, color: "bg-[#e5b94e]" },
  { type: "Omra", count: 38, percentage: 15, icon: Moon, color: "bg-orange-500" },
]

function getTypeIcon(type: string) {
  switch (type) {
    case "hotel":
      return <Building2 className="size-4 text-[#1e3a5f]" />
    case "flight":
      return <Plane className="size-4 text-[#e5b94e]" />
    case "omra":
      return <Moon className="size-4 text-orange-500" />
    default:
      return null
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "confirmed":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          <CheckCircle className="mr-1 size-3" />
          Confirmé
        </Badge>
      )
    case "pending":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          <Clock className="mr-1 size-3" />
          En attente
        </Badge>
      )
    case "cancelled":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          <XCircle className="mr-1 size-3" />
          Annulé
        </Badge>
      )
    default:
      return null
  }
}

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">Tableau de bord</h1>
          <p className="text-muted-foreground">
            Vue d&apos;ensemble de votre activité Easy2Book
          </p>
        </div>
        <Button className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
          <RefreshCw className="mr-2 size-4" />
          Actualiser
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`size-5 ${
                stat.title === "Erreurs API MyGo" ? "text-amber-500" : "text-[#1e3a5f]"
              }`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {stat.trend === "up" ? (
                  <TrendingUp className="size-3 text-green-500" />
                ) : (
                  <TrendingDown className="size-3 text-green-500" />
                )}
                <span className={stat.trend === "up" && stat.title !== "Erreurs API MyGo" ? "text-green-500" : stat.title === "Erreurs API MyGo" ? "text-green-500" : ""}>
                  {stat.change}
                </span>
                <span>{stat.description}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Bookings Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Réservations récentes</CardTitle>
            <CardDescription>
              Les 5 dernières réservations enregistrées
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Réf.</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentBookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-mono text-xs">
                      {booking.id}
                    </TableCell>
                    <TableCell className="font-medium">
                      {booking.client}
                    </TableCell>
                    <TableCell>{getTypeIcon(booking.type)}</TableCell>
                    <TableCell>{booking.destination}</TableCell>
                    <TableCell className="font-semibold">
                      {booking.amount}
                    </TableCell>
                    <TableCell>{getStatusBadge(booking.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sidebar Cards */}
        <div className="space-y-6">
          {/* Bookings by Type */}
          <Card>
            <CardHeader>
              <CardTitle>Réservations par type</CardTitle>
              <CardDescription>Ce mois-ci</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {bookingsByType.map((item) => (
                <div key={item.type} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <item.icon className="size-4 text-muted-foreground" />
                      <span>{item.type}</span>
                    </div>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                  <Progress value={item.percentage} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* API Errors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                Erreurs API MyGo
              </CardTitle>
              <CardDescription>Dernières 24 heures</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {apiErrors.map((error) => (
                  <div
                    key={error.id}
                    className="flex items-start justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium">
                          {error.endpoint}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {error.time}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {error.error}
                      </p>
                    </div>
                    {error.resolved ? (
                      <Badge variant="outline" className="text-green-600 border-green-200">
                        Résolu
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-200">
                        Actif
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
