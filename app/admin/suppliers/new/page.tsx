/**
 * /admin/suppliers/new — Formulaire d'ajout d'un fournisseur API XML
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, Save, TestTube } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { AdminShell, type AdminShellUser } from "@/components/admin-shell"

export const metadata: Metadata = {
  title: "Nouveau Fournisseur — Manager",
  description: "Ajouter un nouveau fournisseur API XML",
}

export const dynamic = "force-dynamic"

export default async function NewSupplierPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login?next=/admin/suppliers/new")
  }

  const profile = await getCurrentAdminProfile(user.id)
  const allowedRoles = ["super_admin", "manager"]
  if (!profile || !allowedRoles.includes(profile.role)) {
    redirect("/admin")
  }

  const adminUser: AdminShellUser = {
    email: user.email || "",
    displayName: profile.name || user.email || "",
    initials: (profile.name || user.email || "").slice(0, 2).toUpperCase(),
    role: profile.role as any,
  }

  async function createSupplier(formData: FormData) {
    "use server"
    
    const db = (await import("@/lib/db/client")).getDb()
    const { suppliers } = await import("@/lib/db/schema")
    
    const supplierData = {
      name: formData.get("name") as string,
      type: formData.get("type") as "mygo" | "amadeus" | "sabre" | "expedia" | "booking" | "travelgate" | "hotelbeds" | "custom",
      apiUrl: formData.get("apiUrl") as string,
      apiKey: formData.get("apiKey") as string,
      apiSecret: formData.get("apiSecret") as string,
      apiUsername: formData.get("apiUsername") as string,
      apiPassword: formData.get("apiPassword") as string,
      xmlEndpoint: formData.get("xmlEndpoint") as string,
      xmlNamespace: formData.get("xmlNamespace") as string,
      xmlVersion: formData.get("xmlVersion") as string,
      website: formData.get("website") as string,
      supportEmail: formData.get("supportEmail") as string,
      supportPhone: formData.get("supportPhone") as string,
      syncInterval: formData.get("syncInterval") as string,
      autoSync: formData.get("autoSync") === "on",
      status: "inactive" as const,
    }

    await db.insert(suppliers).values(supplierData)
    redirect("/admin/suppliers")
  }

  return (
    <AdminShell user={adminUser}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/suppliers">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-foreground text-3xl font-bold tracking-tight">
              Nouveau Fournisseur
            </h1>
            <p className="text-muted-foreground mt-1">
              Configurez une nouvelle connexion API XML
            </p>
          </div>
        </div>

        <form action={createSupplier}>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Informations générales */}
            <Card>
              <CardHeader>
                <CardTitle>Informations générales</CardTitle>
                <CardDescription>
                  Détails de base sur le fournisseur
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du fournisseur *</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Ex: MyGo, Amadeus, etc."
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type de fournisseur *</Label>
                  <Select name="type" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mygo">MyGo</SelectItem>
                      <SelectItem value="amadeus">Amadeus</SelectItem>
                      <SelectItem value="sabre">Sabre</SelectItem>
                      <SelectItem value="expedia">Expedia</SelectItem>
                      <SelectItem value="booking">Booking.com</SelectItem>
                      <SelectItem value="travelgate">Travelgate</SelectItem>
                      <SelectItem value="hotelbeds">Hotelbeds</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Site web</Label>
                  <Input
                    id="website"
                    name="website"
                    placeholder="https://example.com"
                    type="url"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail">Email support</Label>
                    <Input
                      id="supportEmail"
                      name="supportEmail"
                      type="email"
                      placeholder="support@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportPhone">Téléphone support</Label>
                    <Input
                      id="supportPhone"
                      name="supportPhone"
                      placeholder="+216 XX XXX XXX"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuration API */}
            <Card>
              <CardHeader>
                <CardTitle>Configuration API</CardTitle>
                <CardDescription>
                  Identifiants et endpoints de connexion
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apiUrl">URL de l'API</Label>
                  <Input
                    id="apiUrl"
                    name="apiUrl"
                    placeholder="https://api.example.com"
                    type="url"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="apiKey">API Key</Label>
                    <Input
                      id="apiKey"
                      name="apiKey"
                      type="password"
                      placeholder="Clé API"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiSecret">API Secret</Label>
                    <Input
                      id="apiSecret"
                      name="apiSecret"
                      type="password"
                      placeholder="Secret API"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="apiUsername">Username</Label>
                    <Input
                      id="apiUsername"
                      name="apiUsername"
                      placeholder="Nom d'utilisateur"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiPassword">Password</Label>
                    <Input
                      id="apiPassword"
                      name="apiPassword"
                      type="password"
                      placeholder="Mot de passe"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuration XML */}
            <Card>
              <CardHeader>
                <CardTitle>Configuration XML</CardTitle>
                <CardDescription>
                  Paramètres spécifiques aux échanges XML
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="xmlEndpoint">Endpoint XML</Label>
                  <Input
                    id="xmlEndpoint"
                    name="xmlEndpoint"
                    placeholder="https://api.example.com/xml"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="xmlNamespace">Namespace XML</Label>
                  <Input
                    id="xmlNamespace"
                    name="xmlNamespace"
                    placeholder="http://www.example.com/xml"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="xmlVersion">Version XML</Label>
                  <Input
                    id="xmlVersion"
                    name="xmlVersion"
                    placeholder="1.0"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Synchronisation */}
            <Card>
              <CardHeader>
                <CardTitle>Synchronisation</CardTitle>
                <CardDescription>
                  Paramètres de synchronisation automatique
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoSync">Synchronisation automatique</Label>
                    <p className="text-muted-foreground text-sm">
                      Activer la sync automatique de l'inventaire
                    </p>
                  </div>
                  <Checkbox id="autoSync" name="autoSync" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="syncInterval">Intervalle de sync</Label>
                  <Select name="syncInterval" defaultValue="1h">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Toutes les heures</SelectItem>
                      <SelectItem value="6h">Toutes les 6 heures</SelectItem>
                      <SelectItem value="12h">Toutes les 12 heures</SelectItem>
                      <SelectItem value="24h">Tous les jours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" asChild>
              <Link href="/admin/suppliers">Annuler</Link>
            </Button>
            <Button variant="outline" type="button">
              <TestTube className="mr-2 h-4 w-4" />
              Tester la connexion
            </Button>
            <Button className="bg-[#1e3a5f]" type="submit">
              <Save className="mr-2 h-4 w-4" />
              Enregistrer
            </Button>
          </div>
        </form>
      </div>
    </AdminShell>
  )
}
