"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { saveTopupPaymentMethodAction } from "@/lib/admin/topup-payment-methods-actions"

export interface TopupMethodFieldSpec {
  key: string
  label: string
  required: boolean
  hint?: string
}

interface Props {
  method: string
  title: string
  fields: TopupMethodFieldSpec[]
  initialEnabled: boolean
  initialDetails: Record<string, string>
  initialInstructions: string
}

/** Formulaire super_admin d'un moyen de recharge manuel. Champs vides par
 * défaut : aucune coordonnée n'est proposée ni devinée. */
export function TopupMethodConfigForm({
  method,
  title,
  fields,
  initialEnabled,
  initialDetails,
  initialInstructions,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [details, setDetails] = useState<Record<string, string>>(initialDetails)
  const [instructions, setInstructions] = useState(initialInstructions)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  )
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    startTransition(async () => {
      const result = await saveTopupPaymentMethodAction({
        method,
        enabled,
        details,
        instructions,
      })
      setMessage(
        result.ok
          ? {
              ok: true,
              text: enabled
                ? "Enregistré — moyen proposé aux clients."
                : "Enregistré — moyen masqué aux clients.",
            }
          : { ok: false, text: result.error },
      )
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          Proposé aux clients
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label
              htmlFor={`${method}-${f.key}`}
              className="text-sm font-medium"
            >
              {f.label}
              {f.required ? " *" : " (facultatif)"}
            </label>
            <Input
              id={`${method}-${f.key}`}
              value={details[f.key] ?? ""}
              onChange={(e) =>
                setDetails((d) => ({ ...d, [f.key]: e.target.value }))
              }
            />
            {f.hint && (
              <p className="text-muted-foreground text-xs">{f.hint}</p>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <label
          htmlFor={`${method}-instructions`}
          className="text-sm font-medium"
        >
          Instructions affichées au client (facultatif)
        </label>
        <textarea
          id={`${method}-instructions`}
          maxLength={1000}
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-green-700 dark:text-green-400" : "text-red-500"}`}
        >
          {message.text}
        </p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Enregistrer
      </Button>
    </form>
  )
}
