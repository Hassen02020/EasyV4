"use client"

/**
 * ThemeToggle — bouton de bascule clair / sombre / système.
 *
 * Utilise next-themes côté client. Évite l'hydratation mismatch en attendant
 * que `mounted` soit vrai (l'icône défaut est neutre pendant ce délai).
 */

import * as React from "react"
import { useSyncExternalStore } from "react"
import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// useSyncExternalStore résout proprement le hydration mismatch sans setState
// synchrone dans un effect (interdit par les nouvelles règles eslint).
function subscribe() {
  return () => {}
}

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Changer le thème"
          className="size-9"
        >
          {mounted && theme === "dark" ? (
            <Moon className="size-4" />
          ) : mounted && theme === "system" ? (
            <Monitor className="size-4" />
          ) : (
            <Sun className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 size-4" />
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 size-4" />
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 size-4" />
          Système
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
