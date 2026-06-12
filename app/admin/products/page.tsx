/**
 * Catalogue Produits — Manager
 *
 * Gestion des produits B2C (Hôtels, Vols, Packages, etc.)
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  Package,
  Plus,
  Building2,
  Plane,
  Moon,
  Briefcase,
  Bus,
  Search,
  Edit,
  Eye,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

export const metadata: Metadata = {
  title: "Catalogue Produits — Manager",
  description: "Gestion des produits B2C",
}

export const dynamic = "force-dynamic"

const PRODUCT_TYPES = [
  {
    id: "hotel",
    name: "Hôtels Tunisie",
    icon: Building2,
    count: 245,
    active: 198,
    color: "bg-blue-500",
  },
  {
    id: "flight",
    name: "Vols",
    icon: Plane,
    count: 12,
    active: 12,
    color: "bg-sky-500",
  },
  {
    id: "package",
    name: "Voyages Organisés",
    icon: Briefcase,
    count: 45,
    active: 38,
    color: "bg-emerald-500",
  },
  {
    id: "omra",
    name: "Omra",
    icon: Moon,
    count: 8,
    active: 6,
    color: "bg-purple-500",
  },
  {
    id: "transfer",
    name: "Transferts",
    icon: Bus,
    count: 34,
    active: 30,
    color: "bg-orange-500",
  },
]

// Mock produits
const MOCK_PRODUCTS = [
  {
    id: "H-001",
    name: "Hôtel Royal Garden",
    type: "hotel",
    location: "Hammamet",
    price: 180,
    status: "active",
    bookings: 45,
  },
  {
    id: "H-002",
    name: "Mövenpick Resort",
    type: "hotel",
    location: "Sousse",
    price: 220,
    status: "active",
    bookings: 32,
  },
  {
    id: "V-001",
    name: "Tunis → Paris",
    type: "flight",
    airline: "Tunisair",
    price: 450,
    status: "active",
    bookings: 28,
  },
  {
    id: "P-001",
    name: "Circuit Désert 4J",
    type: "package",
    location: "Douz",
    price: 890,
    status: "active",
    bookings: 15,
  },
  {
    id: "O-001",
    name: "Omra Ramadan 2024",
    type: "omra",
    location: "Makkah",
    price: 4500,
    status: "pending",
    bookings: 0,
  },
]

export default async function ProductsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/products")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager", "agent_resa"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-bold tracking-tight">
            Catalogue Produits
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez votre offre B2C (hôtels, vols, packages...)
          </p>
        </div>
        <Button className="bg-[#1e3a5f]" asChild>
          <Link href="/admin/products/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau produit
          </Link>
        </Button>
      </div>

      {/* Product Type Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PRODUCT_TYPES.map((type) => {
          const Icon = type.icon
          return (
            <Card key={type.id} className="overflow-hidden">
              <div className={`h-1 ${type.color}`} />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-gray-600" />
                  <Badge variant="outline">
                    {type.active}/{type.count}
                  </Badge>
                </div>
                <CardTitle className="text-base">{type.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{type.count}</p>
                <p className="text-xs text-gray-500">produits</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Products List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Tabs defaultValue="all" className="flex-1">
              <TabsList>
                <TabsTrigger value="all">Tous</TabsTrigger>
                <TabsTrigger value="hotel">Hôtels</TabsTrigger>
                <TabsTrigger value="flight">Vols</TabsTrigger>
                <TabsTrigger value="package">Packages</TabsTrigger>
                <TabsTrigger value="omra">Omra</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Rechercher un produit..." className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-3 text-left font-medium text-gray-500">
                    Produit
                  </th>
                  <th className="py-3 text-left font-medium text-gray-500">
                    Type
                  </th>
                  <th className="py-3 text-left font-medium text-gray-500">
                    Localisation
                  </th>
                  <th className="py-3 text-right font-medium text-gray-500">
                    Prix
                  </th>
                  <th className="py-3 text-center font-medium text-gray-500">
                    Réservations
                  </th>
                  <th className="py-3 text-center font-medium text-gray-500">
                    Statut
                  </th>
                  <th className="py-3 text-right font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {MOCK_PRODUCTS.map((product) => {
                  const typeInfo = PRODUCT_TYPES.find(
                    (t) => t.id === product.type,
                  )
                  const TypeIcon = typeInfo?.icon || Package

                  return (
                    <tr key={product.id} className="border-b hover:bg-gray-50">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-8 w-8 rounded-lg ${typeInfo?.color || "bg-gray-500"} flex items-center justify-center`}
                          >
                            <TypeIcon className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-gray-500">
                              {product.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline">
                          {typeInfo?.name || product.type}
                        </Badge>
                      </td>
                      <td className="py-3 text-gray-600">
                        {product.location || "—"}
                      </td>
                      <td className="py-3 text-right font-semibold">
                        {product.price.toLocaleString("fr-FR")} DT
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                          <span>{product.bookings}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <Badge
                          className={
                            product.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }
                        >
                          {product.status === "active" ? "Actif" : "En attente"}
                        </Badge>
                      </td>
                      <td className="py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/products/${product.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Voir
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="mr-2 h-4 w-4" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className={
                                product.status === "active"
                                  ? "text-amber-600"
                                  : "text-emerald-600"
                              }
                            >
                              {product.status === "active"
                                ? "Désactiver"
                                : "Activer"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
