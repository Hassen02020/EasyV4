"use client"

/**
 * Connexion compte client B2C — lien magique UNIQUEMENT (jamais de mot de
 * passe) : contrairement au staff/B2B (`components/pro/pro-login-form.tsx`),
 * un client B2C n'a jamais défini de mot de passe — le guest checkout
 * (`app/booking/**`) reste le parcours par défaut, ce formulaire n'ajoute
 * qu'un moyen optionnel de retrouver TOUT son historique d'un coup. Même
 * mécanisme Supabase OTP + callback que `/pro/login` (`signInWithOtp` +
 * `/api/auth/callback`), réutilisé tel quel — aucun second système d'auth.
 */

import { useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Mail, AlertCircle } from "lucide-react"

import { createBrowserSupabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function CompteLoginForm() {
  const params = useSearchParams()
  const nextPath = params.get("next") ?? "/compte"

  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  function readableAuthError(message: string): string {
    if (/Email rate limit/i.test(message))
      return "Trop de tentatives. Réessayez dans quelques minutes."
    return message
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!email) {
      setError("Renseignez votre adresse email.")
      return
    }
    startTransition(async () => {
      const supabase = createBrowserSupabase()
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })
      if (otpError) {
        setError(readableAuthError(otpError.message))
        return
      }
      setSent(true)
    })
  }

  if (sent) {
    return (
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertTitle>Lien envoyé</AlertTitle>
        <AlertDescription>
          Un lien de connexion a été envoyé à {email}. Ouvrez-le depuis votre boîte mail pour
          accéder à votre compte.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-card border-border space-y-4 rounded-2xl border p-6 shadow-sm"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="email">Adresse email</Label>
        <div className="relative">
          <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            id="email"
            type="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={pending}
            className="pl-9"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Utilisez l&apos;email de vos réservations — nous vous envoyons un lien de connexion,
          aucun mot de passe à retenir.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Envoi impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full gap-2">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Envoi…
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            Recevoir mon lien de connexion
          </>
        )}
      </Button>
    </form>
  )
}
