/**
 * Custom Error Classes - Easy2Book V6
 *
 * Classes d'erreur personnalisées pour une gestion cohérente des erreurs
 * Permet une meilleure expérience utilisateur et un debug facilité
 */

/**
 * Base class pour toutes les erreurs applicatives
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    }
  }
}

/**
 * Erreur de base de données
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    public dbCode: string,
    details?: unknown
  ) {
    super(message, "DATABASE_ERROR", 500, details)
    this.dbCode = dbCode
  }
}

/**
 * Erreur d'enregistrement non trouvé
 */
export class NotFoundError extends AppError {
  constructor(
    entity: string,
    id: string,
    details?: unknown
  ) {
    const errorDetails = details ? { entity, id, ...(details as Record<string, unknown>) } : { entity, id }
    super(
      `${entity} not found: ${id}`,
      "NOT_FOUND",
      404,
      errorDetails
    )
  }
}

/**
 * Erreur de validation
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public field?: string,
    details?: unknown
  ) {
    const errorDetails = field ? { field, ...(details as Record<string, unknown> || {}) } : { ...(details as Record<string, unknown> || {}) }
    super(message, "VALIDATION_ERROR", 400, errorDetails)
  }
}

/**
 * Erreur d'autorisation (non authentifié)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized", details?: unknown) {
    super(message, "UNAUTHORIZED", 401, details)
  }
}

/**
 * Erreur d'accès refusé (authentifié mais pas autorisé)
 */
export class ForbiddenError extends AppError {
  constructor(
    message: string = "Forbidden",
    public requiredRole?: string,
    details?: unknown
  ) {
    const errorDetails = requiredRole ? { requiredRole, ...(details as Record<string, unknown> || {}) } : { ...(details as Record<string, unknown> || {}) }
    super(message, "FORBIDDEN", 403, errorDetails)
  }
}

/**
 * Erreur de conflit (ressource déjà existante)
 */
export class ConflictError extends AppError {
  constructor(
    message: string,
    public resource?: string,
    details?: unknown
  ) {
    const errorDetails = resource ? { resource, ...(details as Record<string, unknown> || {}) } : { ...(details as Record<string, unknown> || {}) }
    super(message, "CONFLICT", 409, errorDetails)
  }
}

/**
 * Erreur de taux limite dépassé
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = "Rate limit exceeded",
    public retryAfter?: number,
    details?: unknown
  ) {
    const errorDetails = retryAfter ? { retryAfter, ...(details as Record<string, unknown> || {}) } : { ...(details as Record<string, unknown> || {}) }
    super(message, "RATE_LIMIT", 429, errorDetails)
  }
}

/**
 * Erreur de paiement
 */
export class PaymentError extends AppError {
  constructor(
    message: string,
    public paymentCode?: string,
    details?: unknown
  ) {
    const errorDetails = paymentCode ? { paymentCode, ...(details as Record<string, unknown> || {}) } : { ...(details as Record<string, unknown> || {}) }
    super(message, "PAYMENT_ERROR", 400, errorDetails)
  }
}

/**
 * Erreur de wallet (solde insuffisant, etc.)
 */
export class WalletError extends AppError {
  constructor(
    message: string,
    public walletCode: string,
    details?: unknown
  ) {
    const errorDetails = { walletCode, ...(details as Record<string, unknown> || {}) }
    super(message, "WALLET_ERROR", 400, errorDetails)
  }
}

/**
 * Erreur de solde insuffisant
 */
export class InsufficientBalanceError extends WalletError {
  constructor(
    currentBalance: number,
    requiredAmount: number,
    currency: string = "TND"
  ) {
    super(
      `Insufficient balance: ${currentBalance} ${currency} required, ${requiredAmount} ${currency} available`,
      "INSUFFICIENT_BALANCE",
      { currentBalance, requiredAmount, currency }
    )
  }
}

/**
 * Erreur de fournisseur API
 */
export class SupplierError extends AppError {
  constructor(
    message: string,
    public supplierName?: string,
    public supplierCode?: string,
    details?: unknown
  ) {
    const errorDetails = { supplierName, supplierCode, ...(details as Record<string, unknown> || {}) }
    super(message, "SUPPLIER_ERROR", 502, errorDetails)
  }
}

/**
 * Erreur de réservation
 */
export class ReservationError extends AppError {
  constructor(
    message: string,
    public reservationId?: string,
    details?: unknown
  ) {
    const errorDetails = reservationId ? { reservationId, ...(details as Record<string, unknown> || {}) } : { ...(details as Record<string, unknown> || {}) }
    super(message, "RESERVATION_ERROR", 400, errorDetails)
  }
}

/**
 * Erreur de disponibilité (plus de places)
 */
export class AvailabilityError extends AppError {
  constructor(
    message: string,
    public productId?: string,
    public available?: number,
    public requested?: number,
    details?: unknown
  ) {
    const errorDetails = { productId, available, requested, ...(details as Record<string, unknown> || {}) }
    super(message, "AVAILABILITY_ERROR", 409, errorDetails)
  }
}

/**
 * Erreur de configuration
 */
export class ConfigurationError extends AppError {
  constructor(
    message: string,
    public configKey?: string,
    details?: unknown
  ) {
    const errorDetails = configKey ? { configKey, ...(details as Record<string, unknown> || {}) } : { ...(details as Record<string, unknown> || {}) }
    super(message, "CONFIGURATION_ERROR", 500, errorDetails)
  }
}

/**
 * Helper pour convertir une erreur générique en AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    // Tenter de déterminer le type d'erreur basé sur le message
    const message = error.message.toLowerCase()
    
    if (message.includes("not found") || message.includes("no rows")) {
      return new NotFoundError("Resource", "unknown", { originalError: error.message })
    }
    
    if (message.includes("unauthorized") || message.includes("authentication")) {
      return new UnauthorizedError(error.message)
    }
    
    if (message.includes("forbidden") || message.includes("permission")) {
      return new ForbiddenError(error.message)
    }
    
    if (message.includes("validation") || message.includes("invalid")) {
      return new ValidationError(error.message)
    }
    
    if (message.includes("duplicate") || message.includes("unique")) {
      return new ConflictError(error.message)
    }
    
    if (message.includes("rate limit") || message.includes("too many")) {
      return new RateLimitError(error.message)
    }
    
    if (message.includes("balance") || message.includes("insufficient")) {
      return new WalletError(error.message, "UNKNOWN")
    }
    
    // Erreur générique
    return new AppError(error.message, "UNKNOWN_ERROR", 500, {
      originalError: error.message,
      stack: error.stack,
    })
  }

  // Erreur inconnue (pas une instance d'Error)
  return new AppError(
    String(error),
    "UNKNOWN_ERROR",
    500,
    { originalError: error }
  )
}

/**
 * Helper pour logger les erreurs de manière cohérente
 */
export function logError(error: unknown, context?: Record<string, unknown>) {
  const appError = toAppError(error)
  
  console.error(`[${appError.code}] ${appError.message}`, {
    ...appError.toJSON(),
    ...context,
  })
  
  // TODO: Envoyer à un service de monitoring (Sentry, etc.)
  // if (process.env.NODE_ENV === "production") {
  //   Sentry.captureException(appError, { extra: context })
  // }
}
