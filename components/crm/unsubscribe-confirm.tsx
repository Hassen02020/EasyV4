"use client"

/**
 * CRM-CAMPAIGN-SAFETY-01 — confirmation de désinscription. Un clic explicite
 * est demandé (jamais de désinscription sur simple ouverture de la page :
 * les scanners de liens des messageries ouvrent les URL des emails).
 */

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { unsubscribeCampaign } from "@/app/actions/unsubscribe-campaign"

type State = "idle" | "done" | "already" | "notFound" | "error"

export function UnsubscribeConfirm({ targetId }: { targetId: string }) {
  const t = useTranslations("Unsubscribe")
  const [state, setState] = useState<State>("idle")
  const [pending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await unsubscribeCampaign(targetId)
      if (result.ok) setState(result.alreadyUnsubscribed ? "already" : "done")
      else if (result.code === "NOT_FOUND") setState("notFound")
      else setState("error")
    })
  }

  if (state !== "idle" && state !== "error") {
    return (
      <p role="status" className="text-sm">
        {state === "done"
          ? t("done")
          : state === "already"
            ? t("already")
            : t("notFound")}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <Button onClick={confirm} disabled={pending}>
        {t("confirmButton")}
      </Button>
      {state === "error" && (
        <p role="alert" className="text-destructive text-sm">
          {t("error")}
        </p>
      )}
    </div>
  )
}
