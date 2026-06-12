"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, Mail, Lock, AlertCircle } from "lucide-react"
import { Chrome } from "lucide-react"

import { createBrowserSupabase } from "@/lib/supabase/client"
import { PasskeyAuth } from "@/components/passkey-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useLanguageCurrency } from "@/lib/i18n/LanguageCurrencyContext"

export function LoginForm() {
  const { t } = useLanguageCurrency()
  const router = useRouter()
  const params = useSearchParams()
  const nextPath = params.get("next") ?? "/admin"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function readableAuthError(message: string): string {
    if (/Invalid login credentials/i.test(message))
      return t("login_form.error.invalid_credentials")
    if (/Email not confirmed/i.test(message))
      return t("login_form.error.email_not_confirmed")
    if (/Email rate limit/i.test(message))
      return t("login_form.error.rate_limit")
    return message
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)

    if (!email || !password) {
      setError(t("login_form.error.fill_fields"))
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
      router.replace(nextPath.startsWith("/") ? nextPath : "/admin")
      router.refresh()
    })
  }

  async function onMagicLink() {
    setError(null)
    setInfo(null)
    if (!email) {
      setError(t("login_form.error.fill_email_first"))
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
        t("login_form.success.magic_link_sent"),
      )
    })
  }

  async function onGoogleSignIn() {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const supabase = createBrowserSupabase()
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })
      if (oauthError) {
        setError(readableAuthError(oauthError.message))
        return
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-card space-y-4 rounded-lg border p-6 shadow-sm"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="email">{t("login_form.email")}</Label>
        <div className="relative">
          <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            id="email"
            type="email"
            placeholder={t("login_form.email_placeholder")}
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
        <Label htmlFor="password">{t("login_form.password")}</Label>
        <div className="relative">
          <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            id="password"
            type="password"
            placeholder={t("login_form.password_placeholder")}
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
          <AlertTitle>{t("login_form.login_failed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {info ? (
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertTitle>{t("login_form.link_sent")}</AlertTitle>
          <AlertDescription>{info}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 pt-2">
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("login_form.logining")}
            </>
          ) : (
            t("login_form.login")
          )}
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card text-muted-foreground px-2">Ou</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onGoogleSignIn}
          className="w-full"
        >
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Chrome className="mr-2 h-4 w-4" />
          )}
          Continuer avec Google
        </Button>

        <PasskeyAuth />

        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onMagicLink}
          className="w-full"
        >
          {t("login_form.magic_link")}
        </Button>
      </div>
    </form>
  )
}
