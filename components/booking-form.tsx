"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, ChevronLeft, AlertTriangle, Phone, Home } from "lucide-react";

interface BookingFormProps {
  hotel: {
    id: number;
    name: string;
    location: string;
    image: string;
    roomType: string;
    mealPlan: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    adults: number;
    children: number;
    pricePerNight: number;
    totalPrice: number;
  };
  onBack: () => void;
}

interface GuestFormProps {
  guestNumber: number;
  isPrimary?: boolean;
  type: "adulte" | "enfant";
}

function GuestForm({ guestNumber, isPrimary, type }: GuestFormProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end py-4 border-b border-border last:border-b-0">
      <div>
        <span className="text-sm text-primary font-medium">
          {type} {guestNumber}
          {isPrimary && (
            <span className="block text-xs">(Principale)</span>
          )}
          <span className="text-destructive"> *</span>
        </span>
      </div>
      
      <div className="space-y-1.5">
        <Label htmlFor={`civilite-${type}-${guestNumber}`} className="text-sm text-muted-foreground">
          Civilité <span className="text-destructive">*</span>
        </Label>
        <Select defaultValue="mr">
          <SelectTrigger id={`civilite-${type}-${guestNumber}`} className="bg-card">
            <SelectValue placeholder="Sélectionner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mr">Mr.</SelectItem>
            <SelectItem value="mme">Mme.</SelectItem>
            <SelectItem value="mlle">Mlle.</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`nom-${type}-${guestNumber}`} className="text-sm text-muted-foreground">
          Nom <span className="text-destructive">*</span>
        </Label>
        <Input 
          id={`nom-${type}-${guestNumber}`}
          placeholder="Nom" 
          className="bg-card"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`prenom-${type}-${guestNumber}`} className="text-sm text-muted-foreground">
          Prénom <span className="text-destructive">*</span>
        </Label>
        <Input 
          id={`prenom-${type}-${guestNumber}`}
          placeholder="Prénom" 
          className="bg-card"
        />
      </div>
    </div>
  );
}

export function BookingForm({ hotel, onBack }: BookingFormProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">
                <span className="text-orange-500">Tunisia</span>
                <span className="text-primary">beds</span>
              </h1>
              <nav className="hidden md:flex items-center gap-6 ml-8 text-sm font-medium text-muted-foreground">
                <a href="#" className="hover:text-primary">ACCUEIL</a>
                <a href="#" className="hover:text-primary">HÔTELS</a>
                <a href="#" className="hover:text-primary">APPARTEMENTS</a>
                <a href="#" className="hover:text-primary">GESTION DES TICKETS</a>
                <a href="#" className="hover:text-primary">CONTACT</a>
              </nav>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-1 text-primary border border-primary rounded-full px-3 py-1">
                <Phone className="w-4 h-4" />
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">INFOS & RÉSERVATIONS</p>
                <p className="font-bold text-primary">+216 70 163 390</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Home className="w-4 h-4" />
            <span>/</span>
            <button onClick={onBack} className="text-primary hover:underline">
              Liste Hôtels
            </button>
            <span>/</span>
            <span className="text-primary">{hotel.name}</span>
            <span>/</span>
            <span>Tarif Dispo</span>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span className="text-amber-600 font-medium">Solde insuffisant,</span>
            <span className="text-primary font-medium">veuillez alimenter votre compte</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column - Forms */}
          <div className="flex-1 space-y-6">
            {/* Room Occupancy */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-xl font-bold text-primary mb-4">Occupations des chambres</h2>
              
              <div className="mb-4">
                <p className="text-primary font-medium">
                  1. {hotel.roomType} en {hotel.mealPlan}{" "}
                  <span className="text-orange-500">Sur demande</span>
                </p>
              </div>

              <div className="space-y-2">
                {Array.from({ length: hotel.adults }).map((_, i) => (
                  <GuestForm 
                    key={`adulte-${i}`}
                    guestNumber={i + 1}
                    isPrimary={i === 0}
                    type="adulte"
                  />
                ))}
                {Array.from({ length: hotel.children }).map((_, i) => (
                  <GuestForm 
                    key={`enfant-${i}`}
                    guestNumber={i + 1}
                    type="enfant"
                  />
                ))}
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-xl font-bold text-primary mb-4">Informations de contact</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm text-muted-foreground">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input 
                    id="email"
                    type="email"
                    placeholder="votre@email.com" 
                    className="bg-card"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="telephone" className="text-sm text-muted-foreground">
                    Téléphone <span className="text-destructive">*</span>
                  </Label>
                  <Input 
                    id="telephone"
                    type="tel"
                    placeholder="+216 XX XXX XXX" 
                    className="bg-card"
                  />
                </div>
              </div>
            </div>

            {/* Cancellation Policy */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-xl font-bold text-amber-600 mb-4">
                Conditions d&apos;annulations et informations importantes
              </h2>
              
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">Annulation gratuite</strong> jusqu&apos;à 48 heures avant la date d&apos;arrivée.
                </p>
                <p>
                  Les annulations effectuées dans les 48 heures précédant l&apos;arrivée seront facturées la première nuit.
                </p>
                <p>
                  Les non-présentations seront facturées le montant total de la réservation.
                </p>
                <p className="text-primary">
                  Les demandes spéciales sont soumises à disponibilité et peuvent entraîner des frais supplémentaires.
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <Button variant="outline" onClick={onBack} className="flex-1">
                <ChevronLeft className="w-4 h-4 mr-2" />
                Retour à la recherche
              </Button>
              <Button className="flex-1 bg-primary hover:bg-primary/90">
                RÉSERVER
              </Button>
            </div>
          </div>

          {/* Right Column - Booking Summary */}
          <div className="lg:w-80 shrink-0">
            <div className="bg-card rounded-lg border border-border overflow-hidden sticky top-20">
              {/* Hotel Image */}
              <div 
                className="h-48 bg-cover bg-center"
                style={{ backgroundImage: `url(${hotel.image})` }}
              />
              
              <div className="p-4 space-y-4">
                {/* Hotel Info */}
                <div>
                  <h3 className="font-bold text-primary text-lg">{hotel.name}</h3>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="w-3.5 h-3.5 text-amber-500" />
                    {hotel.location}
                  </div>
                </div>

                {/* Dates */}
                <div className="text-sm">
                  <p className="text-primary">
                    Du <span className="font-medium text-destructive">{hotel.checkIn}</span> Au{" "}
                    <span className="font-medium text-destructive">{hotel.checkOut}</span>, soit {hotel.nights} nuitée(s)
                  </p>
                </div>

                {/* Modify Search Link */}
                <button onClick={onBack} className="text-sm text-primary hover:underline flex items-center gap-1">
                  <ChevronLeft className="w-3 h-3" />
                  <ChevronLeft className="w-3 h-3 -ml-2" />
                  Modifier votre recherche
                </button>

                {/* Room Details */}
                <div className="border-t border-border pt-4">
                  <p className="font-medium text-foreground">
                    1. {hotel.roomType} en {hotel.mealPlan}
                  </p>
                  <p className="text-orange-500 text-sm">Sur demande</p>
                </div>

                {/* Guest Count */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Adultes</span>
                    <span className="font-medium">x{hotel.adults}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Enfants</span>
                    <span className="font-medium">x{hotel.children}</span>
                  </div>
                </div>

                {/* Total */}
                <div className="border-t border-border pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Sous total:</span>
                    <span className="text-xl font-bold text-primary">
                      {hotel.totalPrice.toLocaleString()}{" "}
                      <span className="text-sm font-normal text-destructive">DT</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
