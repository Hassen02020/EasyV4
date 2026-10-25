/**
 * Libellés d'affichage des moyens de recharge B2C (WALLET-B2C-RECHARGE-
 * METHODS-01) — module pur, importable côté client (contrairement à
 * customer-topup-manual-core.ts qui touche la base). Les clés renvoient au
 * namespace i18n `Compte`.
 */

export const TOPUP_METHOD_LABEL_KEYS = {
  card: "walletMethodCard",
  bank_transfer: "walletMethodBankTransfer",
  bank_deposit: "walletMethodBankDeposit",
  cash_agency: "walletMethodCashAgency",
  d17: "walletMethodD17",
} as const

export type TopupMethodKey = keyof typeof TOPUP_METHOD_LABEL_KEYS

/** Ordre d'affichage des coordonnées et clé i18n de chaque champ. */
export const TOPUP_DETAIL_FIELDS = [
  ["beneficiary", "walletFieldBeneficiary"],
  ["agency_name", "walletFieldAgencyName"],
  ["bank_name", "walletFieldBankName"],
  ["rib", "walletFieldRib"],
  ["iban", "walletFieldIban"],
  ["bic", "walletFieldBic"],
  ["d17_number", "walletFieldD17Number"],
  ["address", "walletFieldAddress"],
  ["opening_hours", "walletFieldOpeningHours"],
  ["phone", "walletFieldPhone"],
] as const

export const TOPUP_STATUS_LABEL_KEYS = {
  pending: "walletRequestStatusPending",
  completed: "walletRequestStatusCompleted",
  rejected: "walletRequestStatusRejected",
  failed: "walletRequestStatusFailed",
} as const

/** Libellés FR du back-office (non traduit, comme le reste de /admin). */
export const TOPUP_METHOD_LABELS_FR: Record<TopupMethodKey, string> = {
  card: "Carte (Paymee)",
  bank_transfer: "Virement bancaire",
  bank_deposit: "Versement bancaire",
  cash_agency: "Espèces à l'agence",
  d17: "D17",
}

/** Montant saisi : deux décimales au plus (même règle que le serveur). */
export function hasAtMostTwoDecimals(raw: string): boolean {
  return /^\d+(?:[.,]\d{1,2})?$/.test(raw.trim())
}
