"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star,
  MapPin,
  Wifi,
  Waves,
  Coffee,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Heart,
  ChevronRight as ArrowRight,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { useState } from "react";

interface RoomOption {
  id: number;
  name: string;
  freeCancellationDate: string;
  available: boolean;
  price: number;
}

interface HotelCardProps {
  hotel: {
    id: number;
    name: string;
    location: string;
    rating: number;
    stars: number;
    amenities: string[];
    tags: string[];
    originalPrice: number;
    discountedPrice: number;
    discountPercent: number;
    images: string[];
    mealPlan: string;
    mealOptions?: string[];
    rooms?: RoomOption[];
  };
  onBook?: (mealPlan: string, room?: RoomOption) => void;
}

const amenityIcons: Record<string, React.ReactNode> = {
  "Wi-Fi": <Wifi className="w-4 h-4" />,
  Pool: <Waves className="w-4 h-4" />,
  Breakfast: <Coffee className="w-4 h-4" />,
  Spa: <Sparkles className="w-4 h-4" />,
};

export function HotelCard({ hotel, onBook }: HotelCardProps) {
  const [currentImage, setCurrentImage] = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [selectedMealPlan, setSelectedMealPlan] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);

  const mealOptions = hotel.mealOptions || [hotel.mealPlan];
  
  const defaultRooms: RoomOption[] = [
    { id: 1, name: "Double Room Garden View", freeCancellationDate: "05/30/2026 00:00", available: true, price: hotel.discountedPrice },
    { id: 2, name: "Double Room Garden View", freeCancellationDate: "05/30/2026 00:00", available: true, price: Math.round(hotel.discountedPrice * 1.1) },
    { id: 3, name: "Double Room Sea View", freeCancellationDate: "05/30/2026 00:00", available: true, price: Math.round(hotel.discountedPrice * 1.25) },
  ];
  
  const rooms = hotel.rooms || defaultRooms;

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % hotel.images.length);
  };

  const prevImage = () => {
    setCurrentImage((prev) => (prev - 1 + hotel.images.length) % hotel.images.length);
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Main Card Content */}
      <div className="flex flex-col md:flex-row">
        {/* Image Gallery */}
        <div className="relative w-full md:w-64 lg:w-72 h-48 md:h-auto shrink-0 bg-muted group">
          <div
            className="w-full h-full bg-cover bg-center min-h-[180px]"
            style={{
              backgroundImage: `url(${hotel.images[currentImage]})`,
            }}
          />
          
          {/* Image Navigation */}
          <button
            onClick={prevImage}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-card/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <button
            onClick={nextImage}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-card/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-card"
            aria-label="Next image"
          >
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>

          {/* Image Dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {hotel.images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentImage(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentImage ? "bg-card" : "bg-card/50"
                }`}
                aria-label={`View image ${i + 1}`}
              />
            ))}
          </div>

          {/* Wishlist Button */}
          <button
            onClick={() => setIsWishlisted(!isWishlisted)}
            className="absolute top-2 right-2 w-8 h-8 bg-card/90 rounded-full flex items-center justify-center hover:bg-card transition-colors"
            aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Heart
              className={`w-4 h-4 ${
                isWishlisted ? "fill-destructive text-destructive" : "text-foreground"
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row flex-1 p-4 gap-4">
          {/* Hotel Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-lg font-bold text-primary truncate">{hotel.name}</h3>
              <div className="flex items-center gap-0.5 shrink-0">
                {Array.from({ length: hotel.stars }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
            </div>

            <a
              href="#"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-3"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-500" />
              {hotel.location}
            </a>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {hotel.tags.map((tag) => (
                <Badge 
                  key={tag} 
                  variant="outline" 
                  className="text-xs py-0.5 px-2 bg-secondary/30 border-primary/30 text-primary font-normal rounded-full"
                >
                  {tag}
                </Badge>
              ))}
            </div>

            {/* Amenities */}
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
              {hotel.amenities.map((amenity) => (
                <div key={amenity} className="flex items-center gap-1.5 text-sm">
                  {amenityIcons[amenity]}
                  <span>{amenity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing Section */}
          <div className="flex flex-col items-end justify-between border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 md:pl-4 min-w-[150px]">
            {/* Exclusive Badge */}
            {hotel.discountPercent > 0 && (
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold px-2 py-1 rounded mb-2">
                Exclusive
              </div>
            )}
            
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-1">from</p>
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-2xl font-bold text-primary">${hotel.discountedPrice}</span>
                {hotel.discountPercent > 0 && (
                  <span className="text-xs text-destructive font-semibold">DT</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{mealOptions[selectedMealPlan]}</p>
            </div>

            <Button 
              className="w-full mt-3 gap-1"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              Rates & Rooms
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Meal Plan Tabs */}
      {mealOptions.length > 1 && (
        <div className="border-t border-border bg-muted/30">
          <div className="flex">
            {mealOptions.map((plan, index) => (
              <button
                key={plan}
                onClick={() => setSelectedMealPlan(index)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  selectedMealPlan === index
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {plan}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Room Selection Section */}
      {isExpanded && (
        <div className="border-t border-border bg-card">
          {/* Room Header */}
          <div className="px-4 py-3 bg-muted/30 border-b border-border">
            <h4 className="font-semibold text-foreground">Room 1: 2 adults</h4>
          </div>

          {/* Room Options */}
          <div className="divide-y divide-border">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room.id)}
                className={`w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left ${
                  selectedRoom === room.id ? "bg-primary/5 border-l-4 border-l-primary" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {selectedRoom === room.id && (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary-foreground" />
                    </div>
                  )}
                  <div>
                    <p className={`font-medium ${selectedRoom === room.id ? "text-primary" : "text-foreground"}`}>
                      {room.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                        Free cancellation before {room.freeCancellationDate}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        room.available 
                          ? "bg-muted text-muted-foreground" 
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {room.available ? "Available" : "On Request"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-primary">{room.price.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground ml-1">DT</span>
                </div>
              </button>
            ))}
          </div>

          {/* Book Button */}
          <div className="px-4 py-3 bg-muted/30 border-t border-border flex justify-end">
            <Button 
              onClick={() => {
                const selected = rooms.find(r => r.id === selectedRoom);
                onBook?.(mealOptions[selectedMealPlan], selected);
              }}
              disabled={!selectedRoom}
              className="gap-2"
            >
              Book Now
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
