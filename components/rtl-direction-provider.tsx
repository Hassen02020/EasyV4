"use client"

import { DirectionProvider } from "@radix-ui/react-direction"
import type { ReactNode } from "react"

/**
 * Câble le sens de lecture (ltr/rtl) dans les primitives Radix (Popover,
 * Select, Command…) utilisées par tous les widgets de recherche — sans ce
 * provider, Radix suppose toujours LTR et positionne mal ses popovers en
 * arabe quel que soit le `dir` posé sur `<html>`.
 */
export function RtlDirectionProvider({
  dir,
  children,
}: {
  dir: "ltr" | "rtl"
  children: ReactNode
}) {
  return <DirectionProvider dir={dir}>{children}</DirectionProvider>
}
