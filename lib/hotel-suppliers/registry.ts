/**
 * Registre des drivers fournisseurs — point d'entrée unique pour ajouter
 * un futur fournisseur #5 (section 25 de la mission) : un nouveau dossier
 * `lib/hotel-suppliers/<provider>/` + une ligne ici, jamais de changement à
 * Booking Core, Payment Core, au schéma de réservation ou à l'UI B2C/B2B.
 */
import type { HotelSupplierDriver } from "./core/supplier"
import { createMyGoDriver } from "./mygo/driver"
import { createTunisiaBedDriver } from "./tunisia-bed/driver"
import { createCyberesaDriver } from "./cyberesa/driver"
import { createThreeTDriver } from "./3t/driver"

export function createAllHotelSupplierDrivers(): HotelSupplierDriver[] {
  return [createMyGoDriver(), createTunisiaBedDriver(), createCyberesaDriver(), createThreeTDriver()]
}
