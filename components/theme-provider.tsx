"use client"

/**
 * ThemeProvider — wrapper next-themes pour la racine de l'application.
 *
 * Mode "class" → bascule la classe `dark` sur <html>, ce qui active la palette
 * OKLCH déjà définie dans `app/globals.css`. Persistance via `localStorage`,
 * détection system par défaut, désactivation des transitions au switch pour
 * éviter le flash de couleur.
 */

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
