"use client"

/**
 * CRM-LEAD-TASK-01 — Mini-panneau tâches par lead.
 * Intégré dans Customer360Button dialog (lead-pipeline + leads-table).
 * Réutilise task-actions existants ; leadId pré-rempli automatiquement.
 */

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Plus,
  XCircle,
} from "lucide-react"
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
  listLeadTasks,
  createTask,
  completeTask,
  cancelTask,
} from "@/lib/admin/task-actions"
import type { TaskRow } from "@/lib/crm/task-core"
import { CRM_TASK_TYPES, type CrmTaskType } from "@/lib/crm/task-core"

const TYPE_LABEL: Record<CrmTaskType, string> = {
  callback: "Rappel",
  email: "Email",
  visit: "Visite",
  followup: "Suivi",
  other: "Autre",
}

const TYPE_COLOR: Record<CrmTaskType, string> = {
  callback: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  email:
    "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  visit: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  followup: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
}

function formatDue(d: Date | string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function isOverdue(dueAt: Date | string | null): boolean {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

export function LeadTasksPanel({ leadId }: { leadId: string }) {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState("")
  const [type, setType] = useState<CrmTaskType>("callback")
  const [dueAt, setDueAt] = useState("")

  useEffect(() => {
    load()
  }, [leadId])

  async function load() {
    setLoading(true)
    const result = await listLeadTasks(leadId)
    if (result.ok) setTasks(result.tasks)
    else toast.error("Erreur chargement tâches : " + result.error)
    setLoading(false)
  }

  function handleCreate() {
    if (!title.trim()) {
      toast.error("Le titre est requis")
      return
    }
    startTransition(async () => {
      const result = await createTask({
        leadId,
        type,
        title: title.trim(),
        dueAt: dueAt ? new Date(dueAt) : null,
      })
      if (result.ok) {
        toast.success("Tâche créée")
        setTitle("")
        setDueAt("")
        setType("callback")
        setShowForm(false)
        setTasks((prev) => [result.task, ...prev])
      } else {
        toast.error("Erreur : " + result.error)
      }
    })
  }

  function handleComplete(taskId: string) {
    startTransition(async () => {
      const result = await completeTask(taskId)
      if (result.ok) {
        toast.success("Tâche clôturée")
        setTasks((prev) => prev.filter((t) => t.id !== taskId))
      } else {
        toast.error("Erreur : " + result.error)
      }
    })
  }

  function handleCancel(taskId: string) {
    startTransition(async () => {
      const result = await cancelTask(taskId)
      if (result.ok) {
        toast.success("Tâche annulée")
        setTasks((prev) => prev.filter((t) => t.id !== taskId))
      } else {
        toast.error("Erreur : " + result.error)
      }
    })
  }

  const openTasks = tasks.filter((t) => t.status === "open")

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardList className="h-3.5 w-3.5" />
          Tâches
          {openTasks.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {openTasks.length}
            </Badge>
          )}
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="h-3 w-3" />
          Ajouter
        </Button>
      </div>

      {showForm && (
        <div className="bg-muted/40 mb-3 space-y-2 rounded-lg border p-3">
          <div className="flex gap-2">
            <Input
              className="h-7 text-xs"
              placeholder="Titre *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Select
              value={type}
              onValueChange={(v) => setType(v as CrmTaskType)}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRM_TASK_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            type="datetime-local"
            className="h-7 text-xs"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setShowForm(false)}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleCreate}
              disabled={isPending}
            >
              Créer
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-xs">Chargement…</p>
      ) : openTasks.length === 0 ? (
        <p className="text-muted-foreground text-xs">Aucune tâche ouverte.</p>
      ) : (
        <ul className="divide-y">
          {openTasks.map((task) => (
            <li key={task.id} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_COLOR[task.type as CrmTaskType] ?? ""}`}
                  >
                    {TYPE_LABEL[task.type as CrmTaskType] ?? task.type}
                  </span>
                  <span className="text-xs font-medium">{task.title}</span>
                </div>
                {task.dueAt && (
                  <p
                    className={`flex items-center gap-1 text-[10px] ${isOverdue(task.dueAt) ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                  >
                    <CalendarClock className="h-2.5 w-2.5" />
                    {formatDue(task.dueAt)}
                    {isOverdue(task.dueAt) && " — En retard"}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-green-600 hover:text-green-700"
                  title="Clôturer"
                  disabled={isPending}
                  onClick={() => handleComplete(task.id)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground h-6 w-6 hover:text-red-600"
                  title="Annuler"
                  disabled={isPending}
                  onClick={() => handleCancel(task.id)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
