import { Metadata } from "next"
import { redirect } from "next/navigation"
import { Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { getDb } from "@/lib/db/client"
import { destinations } from "@/lib/db/schema"
import { asc, eq } from "drizzle-orm"
import { setFeaturedDestination } from "@/lib/destinations/admin-actions"

export const metadata: Metadata = { title: "Destinations en vedette — Veille" }
export const dynamic = "force-dynamic"

export default async function FeaturedDestinationsAdminPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/veille/destinations")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const db = getDb()
  const allDestinations = await db
    .select()
    .from(destinations)
    .where(eq(destinations.isActive, true))
    .orderBy(asc(destinations.name))

  const featured = allDestinations
    .filter((d) => d.isFeatured)
    .sort((a, b) => a.displayOrder - b.displayOrder)
  const notFeatured = allDestinations.filter((d) => !d.isFeatured)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Destinations en vedette</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {featured.length} destination{featured.length !== 1 ? "s" : ""} mise
          {featured.length !== 1 ? "s" : ""} en avant sur la page d&apos;accueil
        </p>
      </div>

      {featured.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            En vedette
          </h2>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destination</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-36">Ordre d&apos;affichage</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {featured.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        {d.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <form
                        action={async (formData: FormData) => {
                          "use server"
                          await setFeaturedDestination({
                            id: d.id,
                            isFeatured: true,
                            displayOrder: Number(formData.get("order")) || 0,
                          })
                        }}
                        className="flex items-center gap-2"
                      >
                        <Input
                          name="order"
                          type="number"
                          min={0}
                          max={9999}
                          defaultValue={d.displayOrder}
                          className="h-8 w-20"
                        />
                        <Button size="sm" variant="outline" type="submit">
                          OK
                        </Button>
                      </form>
                    </TableCell>
                    <TableCell>
                      <form
                        action={async () => {
                          "use server"
                          await setFeaturedDestination({
                            id: d.id,
                            isFeatured: false,
                            displayOrder: 0,
                          })
                        }}
                      >
                        <Button size="sm" variant="ghost" type="submit">
                          Retirer
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {notFeatured.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
            Non mises en avant
          </h2>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destination</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {notFeatured.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <form
                        action={async () => {
                          "use server"
                          await setFeaturedDestination({
                            id: d.id,
                            isFeatured: true,
                            displayOrder: featured.length,
                          })
                        }}
                      >
                        <Button size="sm" variant="outline" type="submit">
                          Mettre en avant
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {allDestinations.length === 0 && (
        <div className="text-muted-foreground rounded-lg border p-12 text-center">
          Aucune destination active trouvée.
        </div>
      )}
    </div>
  )
}
