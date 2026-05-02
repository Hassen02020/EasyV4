"use client"

import { useState } from "react"
import { Plane, Building2, Globe, Moon, Bus, MapPin, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HotelsTunisieSearch } from "@/components/hotels-tunisie-search"

const tabs = [
  { id: "vols", label: "Vols", icon: Plane },
  { id: "hotels-tunisie", label: "Hôtels Tunisie", icon: Building2 },
  { id: "hotels-monde", label: "Hôtels Monde", icon: Globe },
  { id: "omraty", label: "Omraty", icon: Moon },
  { id: "transferts", label: "Transferts", icon: Bus },
]

export function BookingEngine() {
  const [activeTab, setActiveTab] = useState("hotels-tunisie")

  return (
    <div className="relative">
      {/* Hero Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/IMG-20260501-WA0041-eEioL2VOvdD4Q0y1vNh5nTWdB55XSO.jpg')",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#1e3a5f]/20 via-transparent to-[#1e3a5f]/40" />
      </div>

      {/* Content */}
      <div className="relative max-w-5xl mx-auto px-4 py-12 sm:py-16 lg:py-20">
        <div className="bg-card rounded-3xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-border">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[80px] flex flex-col items-center gap-1.5 py-4 px-2 sm:px-3 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? "border-[#e5b94e] text-[#1e3a5f] bg-[#1e3a5f]/5"
                      : "border-transparent text-muted-foreground hover:text-[#1e3a5f] hover:bg-muted/50"
                  }`}
                >
                  <Icon className="size-5" />
                  <span className="whitespace-nowrap text-xs sm:text-sm">{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Search Form */}
          <div className="p-4 sm:p-6">
            {activeTab === "vols" && <VolsForm />}
            {activeTab === "hotels-tunisie" && <HotelsTunisieSearch />}
            {activeTab === "hotels-monde" && <HotelsMondeForm />}
            {activeTab === "omraty" && <OmratyForm />}
            {activeTab === "transferts" && <TransfertsForm />}
          </div>
        </div>
      </div>
    </div>
  )
}

function VolsForm() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Départ de</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input 
              placeholder="Tunis (TUN)" 
              defaultValue="Tunis (TUN)"
              className="pl-9 rounded-xl"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Destination</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input 
              placeholder="Istanbul (IST)"
              defaultValue="Istanbul (IST)"
              className="pl-9 rounded-xl"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Dates</label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input 
              placeholder="Choisir les dates"
              className="pl-9 rounded-xl"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Classe</label>
          <Select defaultValue="economique">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Classe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="economique">Économique</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="business">Business</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2">
          <Checkbox id="flexible" />
          <label htmlFor="flexible" className="text-sm text-muted-foreground cursor-pointer">
            Comparer avec les prix flexibles
          </label>
        </div>
        <Button className="w-full sm:w-auto px-8 text-base font-semibold bg-orange-500 hover:bg-orange-600 rounded-xl">
          RECHERCHER
        </Button>
      </div>
    </div>
  )
}

function HotelsMondeForm() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5 lg:col-span-2">
          <label className="text-xs text-muted-foreground font-medium">Destination mondiale</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Ville, hôtel ou aéroport" className="pl-9 rounded-xl" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Check-in</label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Date d'arrivée" className="pl-9 rounded-xl" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Check-out</label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Date de départ" className="pl-9 rounded-xl" />
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button className="w-full sm:w-auto px-8 text-base font-semibold bg-orange-500 hover:bg-orange-600 rounded-xl">
          RECHERCHER
        </Button>
      </div>
    </div>
  )
}

function OmratyForm() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Programme</label>
          <Select defaultValue="economique">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Sélectionner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="economique">Économique</SelectItem>
              <SelectItem value="confort">Confort</SelectItem>
              <SelectItem value="prestige">Prestige</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Mois de départ</label>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Choisir le mois" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jan">Janvier 2026</SelectItem>
              <SelectItem value="feb">Février 2026</SelectItem>
              <SelectItem value="mar">Mars 2026</SelectItem>
              <SelectItem value="apr">Avril 2026</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Distance Haram</label>
          <Select defaultValue="400">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Distance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="400">400m à pied</SelectItem>
              <SelectItem value="600">600m à pied</SelectItem>
              <SelectItem value="1000">1km à pied</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Type de vol</label>
          <Select defaultValue="direct">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Type de vol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Vol direct</SelectItem>
              <SelectItem value="escale">Avec escale</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button className="w-full sm:w-auto px-8 text-base font-semibold bg-orange-500 hover:bg-orange-600 rounded-xl">
          RECHERCHER
        </Button>
      </div>
    </div>
  )
}

function TransfertsForm() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Lieu de prise en charge</label>
          <Select>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Aéroport / Port" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tunis-airport">Aéroport Tunis-Carthage</SelectItem>
              <SelectItem value="enfidha">Aéroport Enfidha</SelectItem>
              <SelectItem value="djerba-airport">Aéroport Djerba</SelectItem>
              <SelectItem value="monastir">Aéroport Monastir</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Lieu de dépose</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Hôtel ou adresse" className="pl-9 rounded-xl" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Date et heure</label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Date d'arrivée" className="pl-9 rounded-xl" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Passagers</label>
          <Select defaultValue="2">
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue placeholder="Passagers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 Passager</SelectItem>
              <SelectItem value="2">2 Passagers</SelectItem>
              <SelectItem value="3">3 Passagers</SelectItem>
              <SelectItem value="4">4 Passagers</SelectItem>
              <SelectItem value="5">5+ Passagers</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <Button className="w-full sm:w-auto px-8 text-base font-semibold bg-orange-500 hover:bg-orange-600 rounded-xl">
          RECHERCHER
        </Button>
      </div>
    </div>
  )
}
