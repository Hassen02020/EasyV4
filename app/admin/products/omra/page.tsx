/**
 * /admin/products/omra — Liste des programmes Omra (back-office)
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Moon, Plus, Pencil, Star, Eye } from "lucide-react"
import { desc } from "drizzle-orm"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { omraPackages } from "@/lib/db/schema"
import type { OmraPackage } from "@/lib/db/schema/omra"

export const metadata: Metadata = {
  title: "Programmes Omra — Back-office",
  description: "Gestion des programmes Omra",
}

export const dynamic = "force-dynamic"

const TYPE_LABELS: Record<string, string> = {
  omra: "Omra Régulière",
  ramadan: "Omra Ramadan",
  umrah_plus: "Omra + Ziarat",
  hajj: "Hajj",
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  draft: "bg-amber-100 text-amber-800",
  archived: "bg-gray-100 text-gray-600",
}

async function getPrograms(): Promise<OmraPackage[]> {
  try {
    const db = getDb()
    return await db
      .select()
      .from(omraPackages)
      .orderBy(desc(omraPackages.createdAt))
  } catch {
    return []
  }
}

export default async function AdminOmraProgramsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/admin/login?next=/admin/products/omra")

  const profile = await getCurrentAdminProfile(user.id)
  const allowed = ["super_admin", "manager", "agent_resa"]
  if (!profile || !allowed.includes(profile.role)) redirect("/admin")

  const canEdit = ["super_admin", "manager"].includes(profile.role)
  const programs = await getPrograms()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-foreground flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Moon className="h-7 w-7 text-emerald-600" />
            Programmes Omra
          </h1>
          <p className="text-muted-foreground mt-1">
            Saisie et gestion des forfaits Omra publiés sur le site
          </p>
        </div>
        {canEdit ? (
          <Button className="bg-emerald-700 hover:bg-emerald-800" asChild>
            <Link href="/admin/products/omra/new">
              <Plus className="mr-2 h-4 w-4" />
              Nouveau programme
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>{programs.length} programme(s)</CardTitle>
          <CardDescription>
            Liste de tous les programmes (actifs, brouillons et archivés)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {programs.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-muted/30 p-12 text-center">
              <Moon className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
              <p className="text-sm text-muted-foreground">
                Aucun programme pour le moment.
                {canEdit ? " Cliquez sur « Nouveau programme »." : ""}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-3 font-medium">Programme</th>
                    <th className="py-3 font-medium">Type</th>
                    <th className="py-3 font-medium">Durée</th>
                    <th className="py-3 text-right font-medium">Prix / pers</th>
                    <th className="py-3 text-center font-medium">Statut</th>
                    <th className="py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-muted/40">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {p.featured ? (
                            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                          ) : null}
                          <div>
                            <p className="font-medium">{p.name}</p>
                            {p.nameAr ? (
                              <p
                                dir="rtl"
                                className="text-xs text-muted-foreground"
                              >
                                {p.nameAr}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline">
                          {TYPE_LABELS[p.type] ?? p.type}
                        </Badge>
                      </td>
                      <td className="py-3 text-gray-600">
                        {p.durationDays} j
                      </td>
                      <td className="py-3 text-right font-semibold">
                        {Number(p.basePrice).toLocaleString("fr-FR")} TND
                      </td>
                      <td className="py-3 text-center">
                        <Badge
                          className={
                            STATUS_STYLES[p.status] ?? "bg-gray-100 text-gray-600"
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" asChild>
                            <Link
                              href={`/omra/${p.slug ?? p.id}`}
                              target="_blank"
                            >
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          {canEdit ? (
                            <Button variant="ghost" size="icon" asChild>
                              <Link href={`/admin/products/omra/${p.id}`}>
                                <Pencil className="h-4 w-4" />
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
