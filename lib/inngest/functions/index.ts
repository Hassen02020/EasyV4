/**
 * Barrel export — toutes les fonctions Inngest.
 * Importé par la route API /api/inngest pour l'enregistrement.
 */

export { processConfirmedBooking } from "./process-confirmed-booking"
export { processCarConfirmed } from "./process-car-confirmed"
export { processWalletCredit } from "./process-wallet-credit"
export { processWalletCustomerCredited } from "./process-wallet-customer-credited"
export { processTransferConfirmed } from "./process-transfer-confirmed"
export { processOmraConfirmed } from "./process-omra-confirmed"
export { processFlightConfirmed } from "./process-flight-confirmed"
export { processPackageConfirmed } from "./process-package-confirmed"
export { processActivityConfirmed } from "./process-activity-confirmed"
export { sendWhatsAppConfirmation } from "./send-whatsapp-confirmation"
export { syncBookingCrm } from "./sync-booking-crm"
export { processNewLead } from "./process-new-lead"
export { autoConvertLead } from "./auto-convert-lead"
export { notifyStaleLeads } from "./notify-stale-leads"
export { deliverCampaign } from "./deliver-campaign"
