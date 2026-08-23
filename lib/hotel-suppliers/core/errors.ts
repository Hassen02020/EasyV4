/**
 * Erreurs provider-neutres du Hub. Chaque driver traduit ses erreurs
 * spécifiques (ex. MyGoApiError, MyGoTimeoutError) vers cette hiérarchie —
 * Booking Core ne doit jamais avoir à connaître un type d'erreur fournisseur.
 */

export class SupplierError extends Error {
  constructor(
    public readonly supplier: string,
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message)
    this.name = "SupplierError"
  }
}

export class SupplierNotConfiguredError extends SupplierError {
  constructor(supplier: string, reason = "DOCUMENTATION_REQUIRED") {
    super(supplier, "NOT_CONFIGURED", `Fournisseur "${supplier}" non configuré (${reason}).`)
    this.name = "SupplierNotConfiguredError"
  }
}

export class SupplierTimeoutError extends SupplierError {
  constructor(supplier: string, operation: string, timeoutMs: number) {
    super(supplier, "TIMEOUT", `Fournisseur "${supplier}" — timeout après ${timeoutMs}ms sur ${operation}.`)
    this.name = "SupplierTimeoutError"
  }
}

export class SupplierAuthError extends SupplierError {
  constructor(supplier: string, message: string, cause?: unknown) {
    super(supplier, "AUTH_ERROR", message, cause)
    this.name = "SupplierAuthError"
  }
}

export class SupplierApiError extends SupplierError {
  constructor(supplier: string, message: string, cause?: unknown) {
    super(supplier, "SUPPLIER_ERROR", message, cause)
    this.name = "SupplierApiError"
  }
}
