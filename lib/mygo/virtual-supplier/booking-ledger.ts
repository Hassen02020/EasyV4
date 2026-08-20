/**
 * Registre des réservations créées par le Virtual MyGo Supplier — en
 * mémoire, process-local. Alimente BookingCreation (écriture) et
 * BookingList/BookingCancellation (lecture/mutation) exactement comme un
 * vrai fournisseur le ferait derrière son propre store.
 */

export type StoredBookingState = "OnRequest" | "Validated" | "Cancelled"

export interface StoredBooking {
  id: number
  hotelId: number
  hotelName: string
  cityId: number
  cityName: string
  checkIn: string
  checkOut: string
  roomId: number
  roomName: string
  boardingId: number
  boardingCode: string
  boardingName: string
  totalPrice: number
  currency: string
  state: StoredBookingState
  /** Format myGo "YYYY-MM-DD HH24:MI". */
  createdAt: string
  cancelledAt?: string
  fee?: number
}

let bookings: StoredBooking[] = []
let nextId = 800001

function nowMyGoFormat(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export function createBookingRecord(
  input: Omit<StoredBooking, "id" | "state" | "createdAt">,
): StoredBooking {
  const record: StoredBooking = {
    ...input,
    id: nextId++,
    state: "Validated",
    createdAt: nowMyGoFormat(),
  }
  bookings.push(record)
  return record
}

export function findBookingById(id: number): StoredBooking | undefined {
  return bookings.find((b) => b.id === id)
}

export function cancelBookingRecord(
  id: number,
  feePercent = 10,
): StoredBooking | undefined {
  const record = findBookingById(id)
  if (!record) return undefined
  if (record.state !== "Cancelled") {
    record.state = "Cancelled"
    record.cancelledAt = nowMyGoFormat()
    record.fee = Math.round(((record.totalPrice * feePercent) / 100) * 1000) / 1000
  }
  return record
}

export interface BookingListFilters {
  booking?: number
  hotel?: number
  fromDate?: string
  toDate?: string
  state?: StoredBookingState
}

export function listBookingRecords(filters: BookingListFilters = {}): StoredBooking[] {
  return bookings.filter((b) => {
    if (filters.booking != null && b.id !== filters.booking) return false
    if (filters.hotel != null && b.hotelId !== filters.hotel) return false
    if (filters.state && b.state !== filters.state) return false
    if (filters.fromDate && b.createdAt.slice(0, 10) < filters.fromDate) return false
    if (filters.toDate && b.createdAt.slice(0, 10) > filters.toDate) return false
    return true
  })
}

/** Insère directement un enregistrement déjà construit — utilisé par le scénario TWO_PLAUSIBLE_CANDIDATES pour simuler une réservation concurrente d'un autre client. */
export function injectBookingRecord(record: StoredBooking) {
  bookings.push(record)
}

export function peekNextId(): number {
  return nextId
}

export function resetLedger() {
  bookings = []
  nextId = 800001
}
