/**
 * HOTEL-ERROR-MESSAGE-01 — réponse d'erreur PUBLIQUE des routes hôtels.
 *
 * Avant : `message: err.message` renvoyait au navigateur le texte technique
 * brut (messages réseau, noms de fournisseur…), puis la fiche hôtel
 * l'affichait au client. Désormais : le détail reste dans le journal serveur ;
 * la réponse ne porte qu'un code stable (`error`, contrat inchangé) et un
 * message neutre. L'écran affiche un texte traduit choisi côté client.
 */
import { NextResponse } from "next/server"
import { MyGoAuthError, MyGoError } from "@/lib/mygo"
import { logger } from "@/lib/logger"

/** Message public unique : aucune information interne. */
export const PUBLIC_HOTEL_ERROR_MESSAGE =
  "Service temporairement indisponible. Merci de réessayer."

export function hotelErrorResponse(err: unknown, route: string): NextResponse {
  const detail = err instanceof Error ? err.message : "unknown"
  if (err instanceof MyGoAuthError) {
    logger.error(`[${route}] myGo auth_failed`, { err: detail })
    return NextResponse.json(
      { error: "auth_failed", message: PUBLIC_HOTEL_ERROR_MESSAGE },
      { status: 502 },
    )
  }
  if (err instanceof MyGoError) {
    logger.error(`[${route}] myGo ${err.kind}`, { err: detail })
    return NextResponse.json(
      { error: err.kind, message: PUBLIC_HOTEL_ERROR_MESSAGE },
      { status: 502 },
    )
  }
  logger.error(`[${route}] internal`, { err: detail })
  return NextResponse.json(
    { error: "internal", message: PUBLIC_HOTEL_ERROR_MESSAGE },
    { status: 500 },
  )
}
