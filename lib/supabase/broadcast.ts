/**
 * Helper serveur pour émettre un événement Supabase Realtime Broadcast.
 *
 * Utilisé par les server actions du back-office (ex. `updateReservationStatus`)
 * pour notifier en temps réel les clients abonnés à un canal nommé, sans
 * dépendre de RLS (anon peut s'abonner sans avoir de droit SELECT sur les
 * tables).
 *
 * Fail-safe : si l'env Supabase est absente, no-op silencieux.
 */
type BroadcastMessage = {
  topic: string
  event: string
  payload: Record<string, unknown>
}

export async function sendBroadcast(message: BroadcastMessage): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return

  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: message.topic,
            event: message.event,
            payload: message.payload,
            private: false,
          },
        ],
      }),
      // Don't block server action on broadcast failures
      cache: "no-store",
    })
  } catch {
    /* best-effort, never fail the calling mutation */
  }
}
