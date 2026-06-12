"use client"

import { ReactNode } from "react"

type B2BShellProps = {
  agencyId: string
  displayName: string
  role: string
  children: ReactNode
}

/**
 * Shell B2B — wrapper layout pour le portail partenaire.
 * Stub minimal à enrichir avec sidebar/nav dans un sprint ultérieur.
 */
export function B2BShell({ children, displayName }: B2BShellProps) {
  return (
    <div className="bg-background min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="text-lg font-semibold">Easy2Book B2B</span>
        <span className="text-muted-foreground text-sm">{displayName}</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  )
}
