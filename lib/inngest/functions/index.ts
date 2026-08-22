/**
 * Barrel export — toutes les fonctions Inngest.
 * Importé par la route API /api/inngest pour l'enregistrement.
 */

export { processConfirmedBooking } from "./process-confirmed-booking"
export { processWalletCredit } from "./process-wallet-credit"
export { processTransferConfirmed } from "./process-transfer-confirmed"
export { processOmraConfirmed } from "./process-omra-confirmed"
export { sendWhatsAppConfirmation } from "./send-whatsapp-confirmation"
export { syncBookingCrm } from "./sync-booking-crm"
