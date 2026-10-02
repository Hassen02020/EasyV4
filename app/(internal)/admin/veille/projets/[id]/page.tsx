import { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDb } from "@/lib/db/client"
import { developmentProjects } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { updateDevelopmentProject } from "@/lib/market/admin-actions"

export const metadata: Metadata = { title: "Modifier le projet — Veille" }
export const dynamic = "force-dynamic"

export default async function EditDevelopmentProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/admin/veille/projets/${id}`)

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin")

  const db = getDb()
  const [project] = await db
    .select()
    .from(developmentProjects)
    .where(eq(developmentProjects.id, id))
    .limit(1)

  if (!project) notFound()

  const publishedAtLocal = new Date(project.publishedAt)
    .toISOString()
    .slice(0, 16)

  async function handleUpdate(formData: FormData) {
    "use server"
    const result = await updateDevelopmentProject({
      id,
      name: formData.get("name"),
      sourceUrl: formData.get("sourceUrl"),
      publishedAt: formData.get("publishedAt"),
      confidence: formData.get("confidence"),
      description: formData.get("description") || undefined,
      location: formData.get("location") || undefined,
      projectType: formData.get("projectType") || undefined,
      status: formData.get("status") || undefined,
    })
    if (result.ok) {
      redirect("/admin/veille/projets")
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/veille/projets">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Modifier le projet</h1>
      </div>

      <form action={handleUpdate} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nom du projet *</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={500}
            defaultValue={project.name}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourceUrl">URL source *</Label>
          <Input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            required
            defaultValue={project.sourceUrl}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="publishedAt">Date de publication *</Label>
            <Input
              id="publishedAt"
              name="publishedAt"
              type="datetime-local"
              required
              defaultValue={publishedAtLocal}
            />
          </div>
          <div className="space-y-2">
            <Label>Niveau de confiance *</Label>
            <Select name="confidence" defaultValue={project.confidence}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">Élevé (HIGH)</SelectItem>
                <SelectItem value="MEDIUM">Moyen (MEDIUM)</SelectItem>
                <SelectItem value="LOW">Faible (LOW)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="location">Lieu</Label>
            <Input
              id="location"
              name="location"
              maxLength={200}
              defaultValue={project.location ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectType">Type de projet</Label>
            <Input
              id="projectType"
              name="projectType"
              maxLength={100}
              defaultValue={project.projectType ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Statut</Label>
          <Input
            id="status"
            name="status"
            maxLength={100}
            defaultValue={project.status ?? ""}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={5}
            maxLength={4000}
            defaultValue={project.description ?? ""}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit">Enregistrer</Button>
          <Button variant="outline" asChild>
            <Link href="/admin/veille/projets">Annuler</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
