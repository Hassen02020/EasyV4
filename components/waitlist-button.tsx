"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { submitWaitlistEntry } from "@/lib/market/waitlist-actions"

type State = "idle" | "open" | "loading" | "success" | "error"

export function WaitlistButton({ projectId }: { projectId: string }) {
  const t = useTranslations("DevelopmentProjects.waitlist")
  const locale = useLocale()
  const [state, setState] = useState<State>("idle")
  const [email, setEmail] = useState("")

  if (state === "success") {
    return (
      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        {t("success")}
      </p>
    )
  }

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("open")}
        className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
      >
        {t("cta")}
      </button>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState("loading")
    const result = await submitWaitlistEntry({ projectId, email, locale })
    setState(result.ok ? "success" : "error")
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-1">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("placeholder")}
        disabled={state === "loading"}
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="shrink-0 rounded bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {state === "loading" ? "…" : t("submit")}
      </button>
      {state === "error" && (
        <p className="absolute mt-6 text-xs text-red-500">{t("error")}</p>
      )}
    </form>
  )
}
