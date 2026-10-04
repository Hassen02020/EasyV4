"use client"

import { useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Loader2, Mail, AlertCircle } from "lucide-react"

import { createBrowserSupabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function CompteSignupForm() {
  const t = useTranslations("Compte")
  const tc = useTranslations("Common")
  const params = useSearchParams()
  const nextPath = params.get("next") ?? "/compte"

  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  function readableAuthError(message: string): string {
    if (/Email rate limit/i.test(message)) return t("rateLimitError")
    return message
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!email) {
      setError(t("emailRequired"))
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
        <AlertTitle>{t("linkSentTitle")}</AlertTitle>
        <AlertDescription>{t("linkSentDesc", { email })}</AlertDescription>
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
        <Label htmlFor="email">{tc("adresseEmail")}</Label>
        <div className="relative">
          <Mail className="text-muted-foreground absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            id="email"
            type="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={pending}
            className="ps-9"
          />
        </div>
        <p className="text-muted-foreground text-xs">{t("emailHintSignup")}</p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("sendFailedTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full gap-2">
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("sendingLabel")}
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            {t("createAccountButton")}
          </>
        )}
      </Button>
    </form>
  )
}
