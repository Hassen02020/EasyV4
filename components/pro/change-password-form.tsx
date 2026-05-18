"use client"

import { useState } from "react"
import {
  Eye,
  EyeOff,
  Key,
  Lock,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type Rule = {
  label: string
  test: (v: string) => boolean
}

const RULES: Rule[] = [
  { label: "Au moins 10 caractères", test: (v) => v.length >= 10 },
  { label: "Au moins 1 majuscule", test: (v) => /[A-Z]/.test(v) },
  { label: "Au moins 1 minuscule", test: (v) => /[a-z]/.test(v) },
  { label: "Au moins 1 chiffre", test: (v) => /\d/.test(v) },
  { label: "Au moins 1 caractère spécial", test: (v) => /[!@#$%^&*?]/.test(v) },
]

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rulesState = RULES.map((r) => ({ ...r, valid: r.test(next) }))
  const allRulesPass = rulesState.every((r) => r.valid)
  const passwordsMatch = next.length > 0 && next === confirm
  const canSubmit = current.length > 0 && allRulesPass && passwordsMatch

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!canSubmit) return
    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      if (current === next) {
        setError("Le nouveau mot de passe doit être différent de l'ancien.")
        return
      }
      setCurrent("")
      setNext("")
      setConfirm("")
      toast.success(
        "Mot de passe modifié (mock — phase 9 : Supabase auth.updateUser)",
      )
    }, 700)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border-border/60 shadow-e2b-soft mx-auto max-w-xl space-y-4 rounded-2xl border p-5 md:p-6"
    >
      <PasswordField
        id="current"
        label="Mot de passe actuel"
        value={current}
        onChange={setCurrent}
        show={showCurrent}
        onToggle={() => setShowCurrent((s) => !s)}
        icon={Lock}
        autoComplete="current-password"
      />

      <PasswordField
        id="next"
        label="Nouveau mot de passe"
        value={next}
        onChange={setNext}
        show={showNext}
        onToggle={() => setShowNext((s) => !s)}
        icon={Key}
        autoComplete="new-password"
      />

      <ul className="space-y-1">
        {rulesState.map((r) => (
          <li
            key={r.label}
            className={cn(
              "inline-flex items-center gap-2 text-xs",
              r.valid ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {r.valid ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {r.label}
          </li>
        ))}
      </ul>

      <PasswordField
        id="confirm"
        label="Confirmer le nouveau mot de passe"
        value={confirm}
        onChange={setConfirm}
        show={showNext}
        onToggle={() => setShowNext((s) => !s)}
        icon={Key}
        autoComplete="new-password"
      />
      {confirm.length > 0 && !passwordsMatch ? (
        <p className="text-destructive text-xs">
          Les deux mots de passe ne correspondent pas.
        </p>
      ) : null}

      {error ? (
        <p className="text-destructive border-destructive/30 bg-destructive/5 rounded-lg border px-3 py-2 text-xs">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full rounded-xl"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Mise à jour…
          </>
        ) : (
          <>
            <Save className="mr-1.5 h-4 w-4" />
            Modifier mon mot de passe
          </>
        )}
      </Button>
    </form>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  icon: Icon,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  icon: typeof Lock
  autoComplete?: string
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="relative mt-1">
        <Icon className="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="px-9"
        />
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          aria-label={show ? "Masquer" : "Afficher"}
        >
          {show ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}
