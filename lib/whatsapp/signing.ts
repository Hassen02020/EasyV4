/**
 * Vérification de signature du webhook entrant Meta WhatsApp Business
 * Cloud API — même principe que lib/payment/signing.ts (HMAC,
 * `timingSafeEqual`), fichier séparé car canal différent (notifications
 * clients, pas un PSP).
 *
 * Référence : header `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 du
 * corps brut de la requête avec le App Secret Meta (PAS le
 * WHATSAPP_ACCESS_TOKEN utilisé côté sortant).
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */

import { createHmac, timingSafeEqual } from "crypto"

export function computeWhatsAppSignature(payload: Buffer, appSecret: string): string {
  return createHmac("sha256", appSecret).update(payload).digest("hex")
}

export function verifyWhatsAppSignature(
  payload: Buffer,
  sigHeader: string | null,
  appSecret: string,
): boolean {
  if (!sigHeader) return false
  const [scheme, hex] = sigHeader.split("=")
  if (scheme !== "sha256" || !hex) return false

  const expected = computeWhatsAppSignature(payload, appSecret)
  try {
    return timingSafeEqual(Buffer.from(hex, "hex"), Buffer.from(expected, "hex"))
  } catch {
    return false
  }
}
