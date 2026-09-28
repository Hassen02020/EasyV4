/**
 * Source UNIQUE de calcul de nuitées + parsing/formatage de dates de séjour
 * (checkIn/checkOut) — Hotel Search Engine V2 (Tunisie + Monde).
 *
 * Root cause corrigée ici : `new Date("2026-09-19")` (constructeur natif,
 * une chaîne "date-only" sans offset) est parsé comme MINUIT UTC, pas
 * minuit local (spec ECMAScript) — `components/booking-engine.tsx` faisait
 * `new Date(checkOut)` / `new Date(checkIn)` sur des chaînes ISO
 * "yyyy-MM-dd" avant de les comparer avec `differenceInCalendarDays`, qui
 * lui raisonne en jours calendaires LOCAUX. Pour un visiteur dont l'heure
 * locale tombe entre minuit UTC et minuit local (tout fuseau UTC+, la
 * majorité des visiteurs Tunisie/Europe/Golfe), le jour calendaire obtenu
 * peut reculer d'un jour par rapport à la vraie date affichée dans le
 * `<input type="date">` — un séjour "12 → 13" pouvait see recalculé comme 0
 * ou 2 nuits selon l'heure de la requête. Même bug sur `iso()`
 * (`toISOString().slice(0,10)`, UTC) utilisé pour la date du jour par
 * défaut.
 *
 * Fix : `parseISO` (date-fns) interprète explicitement une chaîne
 * "yyyy-MM-dd" comme minuit LOCAL (jamais UTC) — c'est la seule fonction de
 * parsing utilisée ici pour convertir une chaîne de date en `Date`.
 * `calculateNights` ne calcule QUE sur des `Date` déjà résolues en local
 * (jamais un nouveau round-trip via chaîne), et `formatDateIso` utilise
 * `format(date, "yyyy-MM-dd")` (composants locaux), jamais `toISOString()`.
 */

import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfDay,
} from "date-fns"

/** Aujourd'hui à minuit local — jamais `new Date()` brut (contiendrait une heure, gênant pour des comparaisons "avant aujourd'hui"). */
export function todayLocal(): Date {
  return startOfDay(new Date())
}

/**
 * Parse une chaîne "yyyy-MM-dd" en `Date` locale (minuit local) — jamais
 * `new Date(iso)` (UTC pour une chaîne date-only, voir doc de tête).
 * Retourne `null` si la chaîne est vide/invalide plutôt que de propager un
 * "Invalid Date" silencieux.
 */
export function parseIsoDateLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const parsed = parseISO(iso)
  return isValid(parsed) ? parsed : null
}

/** Formate une `Date` en "yyyy-MM-dd" — composants locaux, jamais `toISOString()` (UTC). */
export function formatDateIso(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

export function addDaysLocal(date: Date, days: number): Date {
  return addDays(date, days)
}

/**
 * Fonction CANONIQUE unique de calcul de nuitées — calendaire pure
 * (jours entiers, jamais d'heures/timestamps), correcte pour tout mois,
 * année bissextile et changement d'année. `checkIn`/`checkOut` doivent déjà
 * être des `Date` résolues en local (ex. via `parseIsoDateLocal` ou
 * directement le `Date` sélectionné dans le calendrier) — jamais une
 * chaîne re-parsée ici.
 */
export function calculateNights(checkIn: Date | null, checkOut: Date | null): number {
  if (!checkIn || !checkOut) return 0
  const nights = differenceInCalendarDays(checkOut, checkIn)
  return nights > 0 ? nights : 0
}

export interface StayRange {
  checkIn: Date | null
  checkOut: Date | null
}

/** Un séjour est valide si les deux dates sont posées, le départ est strictement après l'arrivée, et l'arrivée n'est pas dans le passé. */
export function isValidStayRange({ checkIn, checkOut }: StayRange): boolean {
  if (!checkIn || !checkOut) return false
  if (calculateNights(checkIn, checkOut) < 1) return false
  return differenceInCalendarDays(checkIn, todayLocal()) >= 0
}
