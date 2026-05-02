"use client"

import { useState } from "react"
import { 
  Search, 
  Filter, 
  Download, 
  Eye, 
  MoreHorizontal,
  CheckCircle,
  Clock,
  XCircle,
  Plane,
  Building2,
  Moon,
  Calendar,
  ChevronLeft,
  ChevronRight
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// Mock data - All reservations
const allReservations = [
  {
    id: "BK-2026-0501",
    client: { name: "Ahmed Ben Ali", email: "ahmed.benali@gmail.com", phone: "+216 98 123 456" },
    type: "hotel",
    destination: "Hammamet",
    details: "Vincci Nozha Beach 4* - All Inclusive",
    checkin: "15/05/2026",
    checkout: "22/05/2026",
    pax: { adults: 2, children: [8, 12] },
    amount: "890 TND",
    status: "confirmed",
    createdAt: "01/05/2026 14:32",
    mygoRef: "MYG-HTL-789456",
  },
  {
    id: "BK-2026-0502",
    client: { name: "Fatma Trabelsi", email: "fatma.t@outlook.com", phone: "+216 55 987 654" },
    type: "flight",
    destination: "Istanbul",
    details: "Tunisair TU 784 - Aller/Retour",
    checkin: "20/05/2026",
    checkout: "27/05/2026",
    pax: { adults: 1, children: [] },
    amount: "1,450 TND",
    status: "pending",
    createdAt: "01/05/2026 12:15",
    mygoRef: null,
  },
  {
    id: "BK-2026-0503",
    client: { name: "Mohamed Gharbi", email: "m.gharbi@yahoo.fr", phone: "+216 22 456 789" },
    type: "omra",
    destination: "La Mecque",
    details: "Programme Omra 10 jours - Hôtel 5* Al Safwa",
    checkin: "10/06/2026",
    checkout: "20/06/2026",
    pax: { adults: 2, children: [] },
    amount: "3,200 TND",
    status: "confirmed",
    createdAt: "01/05/2026 09:45",
    mygoRef: "MYG-OMR-123789",
  },
  {
    id: "BK-2026-0504",
    client: { name: "Sonia Mejri", email: "sonia.mejri@gmail.com", phone: "+216 99 111 222" },
    type: "hotel",
    destination: "Djerba",
    details: "Radisson Blu Djerba 5* - Demi-Pension",
    checkin: "08/05/2026",
    checkout: "15/05/2026",
    pax: { adults: 2, children: [5] },
    amount: "1,250 TND",
    status: "cancelled",
    createdAt: "30/04/2026 16:20",
    mygoRef: "MYG-HTL-456123",
  },
  {
    id: "BK-2026-0505",
    client: { name: "Karim Sassi", email: "karim.sassi@live.com", phone: "+216 50 333 444" },
    type: "flight",
    destination: "Paris",
    details: "Nouvelair BJ 1502 - Aller Simple",
    checkin: "25/05/2026",
    checkout: null,
    pax: { adults: 1, children: [] },
    amount: "680 TND",
    status: "confirmed",
    createdAt: "01/05/2026 08:00",
    mygoRef: null,
  },
  {
    id: "BK-2026-0506",
    client: { name: "Leila Mansour", email: "leila.m@gmail.com", phone: "+216 25 666 777" },
    type: "hotel",
    destination: "Sousse",
    details: "Mövenpick Resort 5* - All Inclusive",
    checkin: "01/06/2026",
    checkout: "08/06/2026",
    pax: { adults: 2, children: [3, 7] },
    amount: "1,890 TND",
    status: "pending",
    createdAt: "01/05/2026 11:30",
    mygoRef: "MYG-HTL-789012",
  },
  {
    id: "BK-2026-0507",
    client: { name: "Youssef Bouazizi", email: "y.bouazizi@outlook.com", phone: "+216 98 888 999" },
    type: "omra",
    destination: "La Mecque",
    details: "Programme Omra 14 jours - Hôtel 4* Dar Al Tawhid",
    checkin: "15/06/2026",
    checkout: "29/06/2026",
    pax: { adults: 3, children: [] },
    amount: "8,400 TND",
    status: "confirmed",
    createdAt: "29/04/2026 15:45",
    mygoRef: "MYG-OMR-567890",
  },
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

function getTypeBadge(type: string) {
  switch (type) {
    case "hotel":
      return (
        <Badge variant="outline" className="border-[#1e3a5f] text-[#1e3a5f]">
          <Building2 className="mr-1 size-3" />
          Hôtel
        </Badge>
      )
    case "flight":
      return (
        <Badge variant="outline" className="border-[#e5b94e] text-[#e5b94e]">
          <Plane className="mr-1 size-3" />
          Vol
        </Badge>
      )
    case "omra":
      return (
        <Badge variant="outline" className="border-orange-500 text-orange-500">
          <Moon className="mr-1 size-3" />
          Omra
        </Badge>
      )
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

function ReservationDetails({ reservation }: { reservation: typeof allReservations[0] }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {getTypeIcon(reservation.type)}
          <div>
            <h3 className="font-semibold">{reservation.id}</h3>
            <p className="text-sm text-muted-foreground">{reservation.createdAt}</p>
          </div>
        </div>
        {getStatusBadge(reservation.status)}
      </div>

      {/* Client Info */}
      <div className="rounded-lg border p-4 space-y-2">
        <h4 className="font-medium text-sm text-muted-foreground">Client</h4>
        <p className="font-semibold">{reservation.client.name}</p>
        <p className="text-sm">{reservation.client.email}</p>
        <p className="text-sm">{reservation.client.phone}</p>
      </div>

      {/* Booking Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Destination</h4>
          <p className="font-semibold">{reservation.destination}</p>
          <p className="text-sm text-muted-foreground">{reservation.details}</p>
        </div>
        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Dates</h4>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="size-4 text-muted-foreground" />
            <span>{reservation.checkin}</span>
            {reservation.checkout && (
              <>
                <span>→</span>
                <span>{reservation.checkout}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Passengers & Amount */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Passagers</h4>
          <p className="text-sm">
            {reservation.pax.adults} Adulte{reservation.pax.adults > 1 ? "s" : ""}
            {reservation.pax.children.length > 0 && (
              <>, {reservation.pax.children.length} Enfant{reservation.pax.children.length > 1 ? "s" : ""} ({reservation.pax.children.join(", ")} ans)</>
            )}
          </p>
        </div>
        <div className="rounded-lg border p-4 space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Montant Total</h4>
          <p className="text-xl font-bold text-orange-500">{reservation.amount}</p>
        </div>
      </div>

      {/* MyGo Reference */}
      {reservation.mygoRef && (
        <div className="rounded-lg bg-muted/50 border p-4 space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Référence MyGo</h4>
          <p className="font-mono text-sm">{reservation.mygoRef}</p>
        </div>
      )}
    </div>
  )
}

export default function ReservationsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filteredReservations = allReservations.filter((res) => {
    const matchesSearch = 
      res.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      res.client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      res.destination.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesType = typeFilter === "all" || res.type === typeFilter
    const matchesStatus = statusFilter === "all" || res.status === statusFilter

    return matchesSearch && matchesType && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">Gestion des Réservations</h1>
          <p className="text-muted-foreground">
            Toutes les réservations (Vols, Hôtels, Omra)
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 size-4" />
          Exporter CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher par ID, client ou destination..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 size-4" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous types</SelectItem>
                  <SelectItem value="hotel">Hôtels</SelectItem>
                  <SelectItem value="flight">Vols</SelectItem>
                  <SelectItem value="omra">Omra</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="confirmed">Confirmé</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="cancelled">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reservations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des réservations</CardTitle>
          <CardDescription>
            {filteredReservations.length} réservation{filteredReservations.length > 1 ? "s" : ""} trouvée{filteredReservations.length > 1 ? "s" : ""}
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
                <TableHead>Dates</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservations.map((reservation) => (
                <TableRow key={reservation.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    {reservation.id}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{reservation.client.name}</p>
                      <p className="text-xs text-muted-foreground">{reservation.client.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getTypeBadge(reservation.type)}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{reservation.destination}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {reservation.details}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {reservation.checkin}
                    {reservation.checkout && (
                      <span className="text-muted-foreground"> → {reservation.checkout}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {reservation.amount}
                  </TableCell>
                  <TableCell>{getStatusBadge(reservation.status)}</TableCell>
                  <TableCell>
                    <Dialog>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DialogTrigger asChild>
                            <DropdownMenuItem>
                              <Eye className="mr-2 size-4" />
                              Voir détails
                            </DropdownMenuItem>
                          </DialogTrigger>
                          <DropdownMenuItem>
                            <Download className="mr-2 size-4" />
                            Télécharger voucher
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Détails de la réservation</DialogTitle>
                          <DialogDescription>
                            Informations complètes de la réservation
                          </DialogDescription>
                        </DialogHeader>
                        <ReservationDetails reservation={reservation} />
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              Affichage 1-{filteredReservations.length} sur {filteredReservations.length}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="sm" disabled>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
