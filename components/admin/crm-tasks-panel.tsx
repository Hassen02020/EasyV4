"use client"

/**
 * CRM-C — Panneau de gestion des tâches CRM pour /admin/support.
 * Affiche toutes les tâches ouvertes + formulaire de création.
 */

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  CheckCircle2,
  XCircle,
  ClipboardList,
  Plus,
  CalendarClock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  listAllOpenTasks,
  createTask,
  completeTask,
  cancelTask,
} from "@/lib/admin/task-actions"
import type { TaskRow } from "@/lib/admin/task-actions"
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

export function CrmTasksPanel() {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState("")
  const [type, setType] = useState<CrmTaskType>("followup")
  const [notes, setNotes] = useState("")
  const [dueAt, setDueAt] = useState("")

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    setLoading(true)
    const result = await listAllOpenTasks()
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
        type,
        title: title.trim(),
        notes: notes.trim() || null,
        dueAt: dueAt ? new Date(dueAt) : null,
      })
      if (result.ok) {
        toast.success("Tâche créée")
        setTitle("")
        setNotes("")
        setDueAt("")
        setType("followup")
        setShowForm(false)
        await loadTasks()
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" />
          Tâches CRM
          {tasks.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {tasks.length}
            </Badge>
          )}
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nouvelle tâche
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {showForm && (
          <div className="bg-muted/40 space-y-3 rounded-lg border p-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Titre de la tâche *"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <Select
                value={type}
                onValueChange={(v) => setType(v as CrmTaskType)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRM_TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              placeholder="Échéance (optionnel)"
            />

            <Textarea
              placeholder="Notes (optionnel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />

            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Annuler
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={isPending}>
                Créer
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm">Chargement…</p>
        ) : tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune tâche ouverte.</p>
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-start gap-3 py-3">
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLOR[task.type as CrmTaskType] ?? ""}`}
                    >
                      {TYPE_LABEL[task.type as CrmTaskType] ?? task.type}
                    </span>
                    <span className="text-sm font-medium">{task.title}</span>
                  </div>
                  {task.notes && (
                    <p className="text-muted-foreground text-xs">
                      {task.notes}
                    </p>
                  )}
                  {task.dueAt && (
                    <p
                      className={`flex items-center gap-1 text-xs ${isOverdue(task.dueAt) ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {formatDue(task.dueAt)}
                      {isOverdue(task.dueAt) && " — En retard"}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-green-600 hover:text-green-700"
                    title="Clôturer"
                    disabled={isPending}
                    onClick={() => handleComplete(task.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground h-7 w-7 hover:text-red-600"
                    title="Annuler"
                    disabled={isPending}
                    onClick={() => handleCancel(task.id)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
