/**
 * Instant de prise en charge d'un transfert (VOUCHER-CAR-TRANSFER-DATA-01,
 * lot "transfer").
 *
 * Les formulaires saisissent une date (YYYY-MM-DD) et une heure (HH:MM)
 * LOCALES tunisiennes. Les stocker telles quelles dans un `timestamptz` via
 * `new Date("2026-11-03T14:30:00")` les interpréterait dans le fuseau du
 * serveur (UTC sur Vercel) : l'heure serait décalée d'une heure. Ce module
 * convertit explicitement l'heure murale Africa/Tunis en instant UTC, sans
 * dépendre du fuseau du processus, et refuse toute date ou heure invalide
 * (jamais de valeur devinée).
 */

export const TRANSFER_TIME_ZONE = "Africa/Tunis"

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^(\d{2}):(\d{2})$/

/** Décalage (ms) de Africa/Tunis par rapport à UTC à l'instant `utcMs`. */
function zoneOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TRANSFER_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs))
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  )
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/**
 * Convertit une date + heure locales tunisiennes en instant UTC.
 * Retourne `null` si la date ou l'heure est invalide (format, jour
 * inexistant comme le 30 février, heure hors 00:00–23:59).
 */
export function buildTransferPickupAt(
  pickupDate: string,
  pickupTime: string,
): Date | null {
  const d = DATE_RE.exec(pickupDate)
  const t = TIME_RE.exec(pickupTime)
  if (!d || !t) return null
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])]
  const [hour, minute] = [Number(t[1]), Number(t[2])]
  if (hour > 23 || minute > 59) return null

  // Jour réel du calendrier (refuse 2026-02-30, 2026-13-01…).
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null
  }

  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  // Deux passes : le décalage est évalué à l'instant résultant, ce qui reste
  // exact même si les règles du fuseau changent un jour (heure d'été).
  let utc = wallAsUtc - zoneOffsetMs(wallAsUtc)
  utc = wallAsUtc - zoneOffsetMs(utc)
  return new Date(utc)
}

/**
 * Affiche un instant de prise en charge en heure locale tunisienne.
 * Une chaîne sans désignateur de fuseau (événements antérieurs à ce lot,
 * `YYYY-MM-DDTHH:MM:SS`) est déjà une heure murale : elle est affichée telle
 * quelle, sans conversion.
 */
export function formatTransferPickupAt(
  value: string,
  locale: string = "fr-FR",
): string {
  const naive = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(
    value,
  )
  if (naive) {
    const [, y, mo, d, h, mi] = naive
    return new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)),
    ).toLocaleString(locale, { timeZone: "UTC" })
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { timeZone: TRANSFER_TIME_ZONE })
}
