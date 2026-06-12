/**
 * Route API Inngest — /api/inngest
 *
 * Expose les fonctions Inngest au service cloud.
 * En dev : Inngest Dev Server doit tourner localement (npx inngest-cli@latest dev).
 * En prod : l'URL est auto-détectée via INNGEST_SIGNING_KEY.
 */

import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import {
  processConfirmedBooking,
  processWalletCredit,
  processTransferConfirmed,
  processOmraConfirmed,
} from "@/lib/inngest/functions"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processConfirmedBooking,
    processWalletCredit,
    processTransferConfirmed,
    processOmraConfirmed,
  ],
})
