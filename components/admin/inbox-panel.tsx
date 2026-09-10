"use client"

/**
 * CRM / Inbox omnicanal — panneau conversations + thread pour
 * `/admin/support`. Seul WhatsApp est réellement branché (voir
 * app/api/webhooks/whatsapp/route.ts) : les autres canaux du modèle
 * (Instagram/Messenger/Call) apparaîtraient ici s'ils avaient des
 * conversations, mais aucun n'a de provider entrant/sortant configuré —
 * jamais simulé, voir "canal non connecté" dans sendReply.
 */

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, MessageCircle, Send, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listConversations, getConversationThread, sendReply } from "@/lib/admin/inbox-actions"
import type { ConversationRow, MessageRow } from "@/lib/crm/inbox-core"

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  call: "Appel",
  email: "Email",
  web: "Web",
}

function formatTime(d: Date | string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function InboxPanel() {
  const [conversations, setConversations] = useState<ConversationRow[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<{ conversation: ConversationRow; messages: MessageRow[]; canReply: boolean } | null>(
    null,
  )
  const [threadLoading, setThreadLoading] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)

  function loadConversations() {
    listConversations()
      .then((result) => {
        if (result.ok) {
          setConversations(result.conversations)
        } else {
          toast.error(result.error || "Échec du chargement.")
          setConversations([])
        }
      })
      .catch(() => {
        toast.error("Erreur technique. Veuillez réessayer.")
        setConversations([])
      })
  }

  useEffect(() => {
    loadConversations()
  }, [])

  function openConversation(id: string) {
    setSelectedId(id)
    setThreadLoading(true)
    setThread(null)
    getConversationThread(id)
      .then((result) => {
        if (result.ok) {
          setThread(result)
        } else {
          toast.error(result.error || "Échec du chargement.")
        }
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setThreadLoading(false))
  }

  function handleSend() {
    if (!selectedId || !replyText.trim() || sending) return
    setSending(true)
    sendReply({ conversationId: selectedId, body: replyText.trim() })
      .then((result) => {
        if (result.ok) {
          setReplyText("")
          openConversation(selectedId)
          loadConversations()
        } else {
          toast.error(result.error || "Échec de l'envoi.")
        }
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setSending(false))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4" />
          Inbox omnicanal
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          WhatsApp est le seul canal réellement connecté aujourd&apos;hui — Instagram, Messenger et Appel
          apparaîtront ici une fois leurs credentials configurés (App Review Meta / téléphonie).
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg border">
            {conversations === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="text-muted-foreground p-4 text-center text-xs">Aucune conversation pour le moment.</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={`hover:bg-muted/50 block w-full border-b p-3 text-left text-xs last:border-b-0 ${
                    selectedId === c.id ? "bg-muted/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.contactName || c.contactPhone || "Contact"}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {CHANNEL_LABEL[c.channel] ?? c.channel}
                    </Badge>
                  </div>
                  {c.lastMessagePreview && (
                    <p className="text-muted-foreground mt-1 line-clamp-1">{c.lastMessagePreview}</p>
                  )}
                  <p className="text-muted-foreground mt-1">{formatTime(c.lastMessageAt)}</p>
                </button>
              ))
            )}
          </div>

          <div className="rounded-lg border">
            {!selectedId ? (
              <p className="text-muted-foreground flex h-full min-h-40 items-center justify-center p-4 text-center text-sm">
                Sélectionnez une conversation.
              </p>
            ) : threadLoading || !thread ? (
              <div className="flex min-h-40 items-center justify-center py-8">
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="max-h-64 flex-1 space-y-2 overflow-y-auto p-3">
                  {thread.messages.length === 0 ? (
                    <p className="text-muted-foreground text-center text-xs">Aucun message.</p>
                  ) : (
                    thread.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                          m.direction === "outbound"
                            ? "bg-primary/10 ml-auto"
                            : "bg-muted"
                        }`}
                      >
                        <p>{m.body}</p>
                        <p className="text-muted-foreground mt-1 text-[10px]">{formatTime(m.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t p-3">
                  {thread.canReply ? (
                    <div className="flex gap-2">
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Répondre…"
                        className="h-16 text-xs"
                      />
                      <Button size="sm" onClick={handleSend} disabled={sending || !replyText.trim()}>
                        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {thread.conversation.channel === "whatsapp"
                        ? "Fenêtre de service WhatsApp de 24h dépassée — réponse libre indisponible."
                        : "Ce canal n'est pas connecté."}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
