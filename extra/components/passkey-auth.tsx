"use client"

import { useState } from "react"
import { Fingerprint, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createBrowserSupabase } from "@/lib/supabase/client"
import { useRouter, useSearchParams } from "next/navigation"

export function PasskeyAuth() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const params = useSearchParams()
  const nextPath = params.get("next") ?? "/admin"

  async function onPasskeySignIn() {
    setLoading(true)
    setError(null)

    try {
      const supabase = createBrowserSupabase()

      // Vérifier si WebAuthn est supporté
      if (!window.PublicKeyCredential) {
        setError("Votre navigateur ne supporte pas les passkeys. Utilisez Chrome, Safari ou Edge.")
        return
      }

      // Sign in with passkey
      const { data, error: signInError } = await supabase.auth.signInWithPasskey()

      if (signInError) {
        if (signInError.message.includes("No passkey found")) {
          // Proposer l'enregistrement
          await onPasskeyRegister()
          return
        }
        throw signInError
      }

      if (data?.user) {
        router.replace(nextPath.startsWith("/") ? nextPath : "/admin")
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'authentification par passkey")
    } finally {
      setLoading(false)
    }
  }

  async function onPasskeyRegister() {
    try {
      const supabase = createBrowserSupabase()

      // Nécessite une session active pour enregistrer un passkey
      // L'utilisateur doit d'abord se connecter avec email/password ou Google
      const { data: sessionData } = await supabase.auth.getSession()

      if (!sessionData.session) {
        setError("Connectez-vous d'abord avec email ou Google pour enregistrer un passkey.")
        return
      }

      // Enregistrer un nouveau passkey
      const { data, error: registerError } = await supabase.auth.enrollPasskey({
        friendlyName: "TunisiaGo - " + navigator.platform,
      })

      if (registerError) {
        throw registerError
      }

      alert("Passkey enregistré avec succès ! Vous pouvez maintenant vous connecter sans mot de passe.")
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement du passkey")
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={loading}
        onClick={onPasskeySignIn}
        className="w-full"
      >
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Fingerprint className="mr-2 h-4 w-4" />
        )}
        Connexion avec Passkey
      </Button>

      {error && (
        <p className="text-destructive text-xs text-center">{error}</p>
      )}

      <p className="text-muted-foreground text-xs text-center">
        Authentification sans mot de passe via empreinte digitale, Face ID ou PIN.
      </p>
    </div>
  )
}
