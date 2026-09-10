/**
 * `DrizzleQueryError` (drizzle-orm) does not set its own `.code` — the real
 * Postgres error code (e.g. "23505" unique_violation) lives on `.cause`
 * (the underlying postgres-js error). Callers that only checked `err.code`
 * never matched, silently rethrowing on genuine constraint conflicts that
 * were meant to be handled as idempotent no-ops.
 */
export function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined
  const direct = (err as { code?: unknown }).code
  if (typeof direct === "string") return direct
  const cause = (err as { cause?: { code?: unknown } }).cause
  const causeCode = cause && typeof cause === "object" ? cause.code : undefined
  return typeof causeCode === "string" ? causeCode : undefined
}
