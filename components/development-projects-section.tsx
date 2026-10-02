import { Building2, MapPin, ExternalLink } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { getLatestDevelopmentProjects } from "@/lib/market/development-projects-queries"
import { WaitlistButton } from "@/components/waitlist-button"
import type { DevelopmentProject } from "@/lib/db/schema"

const CONFIDENCE_CLASSES: Record<DevelopmentProject["confidence"], string> = {
  HIGH: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  MEDIUM:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  LOW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
}

export async function DevelopmentProjectsSection() {
  const [projects, t] = await Promise.all([
    getLatestDevelopmentProjects(),
    getTranslations("DevelopmentProjects"),
  ])

  if (projects.length === 0) return null

  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex items-center gap-3">
          <Building2 className="h-6 w-6 text-violet-600" />
          <h2 className="text-foreground text-2xl font-bold">{t("heading")}</h2>
          <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
            {t("badge")}
          </span>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {projects.map((project) => (
            <li
              key={project.id}
              className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CONFIDENCE_CLASSES[project.confidence]}`}
                >
                  {t(`confidence.${project.confidence}`)}
                </span>
                {project.status && (
                  <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600 dark:bg-violet-900/20 dark:text-violet-400">
                    {project.status}
                  </span>
                )}
              </div>

              <p className="text-foreground leading-snug font-semibold">
                {project.name}
              </p>

              {project.location && (
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {project.location}
                </p>
              )}

              {project.description && (
                <p className="text-muted-foreground line-clamp-2 flex-1 text-xs">
                  {project.description}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between gap-2">
                <WaitlistButton projectId={project.id} />
                <a
                  href={project.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground flex items-center gap-1 text-xs hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t("source")}
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
