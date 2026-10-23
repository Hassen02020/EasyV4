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
  processFlightConfirmed,
  sendWhatsAppConfirmation,
  syncBookingCrm,
  processNewLead,
  autoConvertLead,
  notifyStaleLeads,
  // MUTUELLE-CONCURRENCY-COMPLETE-01 (CAS-C) — processMutuelleConfirmed était
  // exporté depuis lib/inngest/functions/index.ts mais jamais enregistré ici :
  // gap préexistant, non lié à ce correctif (même défaut constaté sur
  // processPackageConfirmed/processActivityConfirmed/deliverCampaign, hors
  // périmètre, non corrigés ici). Sans cet enregistrement, aucune fonction
  // Mutuelle (email existant + facture CAS-C) ne s'exécute jamais.
  processMutuelleConfirmed,
  recoverMutuelleMissingInvoices,
  processNetworkConfirmed,
} from "@/lib/inngest/functions"

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processConfirmedBooking,
    processWalletCredit,
    processTransferConfirmed,
    processOmraConfirmed,
    processFlightConfirmed,
    sendWhatsAppConfirmation,
    syncBookingCrm,
    processNewLead,
    autoConvertLead,
    notifyStaleLeads,
    processMutuelleConfirmed,
    recoverMutuelleMissingInvoices,
    processNetworkConfirmed,
  ],
})
