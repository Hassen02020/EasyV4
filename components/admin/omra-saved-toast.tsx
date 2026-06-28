"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

const MESSAGES: Record<string, string> = {
  created: "Programme créé avec succès.",
  updated: "Modifications enregistrées.",
}

/**
 * Affiche un toast de succès après une redirection `?saved=created|updated`
 * (création/édition d'un programme Omra), puis nettoie l'URL.
 */
export function OmraSavedToast() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const shown = useRef(false)

  useEffect(() => {
    const saved = searchParams.get("saved")
    if (!saved || shown.current) return
    const message = MESSAGES[saved]
    if (message) {
      shown.current = true
      toast.success(message)
      router.replace(pathname)
    }
  }, [searchParams, pathname, router])

  return null
}
