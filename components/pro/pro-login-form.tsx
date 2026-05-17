"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Mail, Lock, AlertCircle, Building2 } from "lucide-react"

import { createBrowserSupabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function ProLoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const nextPath = params.get("next") ?? "/pro"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function readableAuthError(message: string): string {
    if (/Invalid login credentials/i.test(message))
      return "Email ou mot de passe incorrect."
    if (/Email not confirmed/i.test(message))
      return "Votre email n'a pas encore été confirmé. Vérifiez votre boîte mail."
    if (/Email rate limit/i.test(message))
      return "Trop de tentatives. Réessayez dans quelques minutes."
    return message
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)

    if (!email || !password) {
      setError("Renseignez votre email et votre mot de passe.")
      return
    }

    startTransition(async () => {
      const supabase = createBrowserSupabase()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signInError) {
        setError(readableAuthError(signInError.message))
        return
      }
      router.replace(nextPath.startsWith("/pro") ? nextPath : "/pro")
      router.refresh()
    })
  }

  async function onMagicLink() {
    setError(null)
    setInfo(null)
    if (!email) {
      setError("Renseignez d'abord votre email pour recevoir un lien magique.")
      return
    }
    startTransition(async () => {
      const supabase = createBrowserSupabase()
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(
            nextPath,
          )}`,
        },
      })
      if (otpError) {
        setError(readableAuthError(otpError.message))
        return
      }
      setInfo(
        "Un lien de connexion a été envoyé à votre adresse email. Vérifiez votre boîte mail.",
      )
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-card border-border/60 shadow-e2b-soft space-y-4 rounded-2xl border p-6"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email professionnel</Label>
        <div className="relative">
          <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            id="email"
            type="email"
            placeholder="agence@exemple.tn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={pending}
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <div className="relative">
          <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={pending}
            className="pl-9"
          />
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connexion impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {info ? (
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertTitle>Lien envoyé</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connexion…
            </>
          ) : (
            <>
              <Building2 className="mr-2 h-4 w-4" />
              Accéder à mon Espace Pro
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onMagicLink}
          className="w-full"
        >
          Recevoir un lien de connexion par email
        </Button>
      </div>
    </form>
  )
}
