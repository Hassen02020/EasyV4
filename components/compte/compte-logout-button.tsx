"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Loader2 } from "lucide-react"
import { createBrowserSupabase } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

export function CompteLogoutButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onLogout() {
    startTransition(async () => {
      const supabase = createBrowserSupabase()
      await supabase.auth.signOut()
      router.replace("/compte/connexion")
      router.refresh()
    })
  }

  return (
    <Button variant="ghost" size="sm" className="gap-1.5" onClick={onLogout} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      Se déconnecter
    </Button>
  )
}
