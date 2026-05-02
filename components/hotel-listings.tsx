"use client";

import { HotelCard } from "@/components/hotel-card";

const hotels = [
  {
    id: 1,
    name: "BluMar Resort Aqua Park & Spa",
    location: "Hammamet, Cap Bon",
    rating: 4.5,
    stars: 4,
    amenities: ["Wi-Fi", "Pool", "Spa", "Breakfast"],
    tags: ["All Inclusive", "Family", "Best Price", "Mini Club", "Water Park"],
    originalPrice: 149,
    discountedPrice: 126,
    discountPercent: 15,
    images: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=600&h=400&fit=crop",
    ],
    mealPlan: "Breakfast Included",
    mealOptions: ["Breakfast Included", "Half Board", "Soft All Inclusive"],
  },
  {
    id: 2,
    name: "Grand Azur Resort & Spa",
    location: "Hammamet, Yasmine",
    rating: 4.8,
    stars: 5,
    amenities: ["Wi-Fi", "Pool", "Spa", "Breakfast"],
    tags: ["Luxury", "Beachfront", "Romantic"],
    originalPrice: 220,
    discountedPrice: 187,
    discountPercent: 15,
    images: [
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=600&h=400&fit=crop",
    ],
    mealPlan: "Half Board",
    mealOptions: ["Half Board", "Full Board", "All Inclusive"],
  },
  {
    id: 3,
    name: "Palms Beach Hotel",
    location: "Hammamet, Downtown",
    rating: 4.2,
    stars: 3,
    amenities: ["Wi-Fi", "Pool", "Breakfast"],
    tags: ["Budget Friendly", "Central"],
    originalPrice: 85,
    discountedPrice: 85,
    discountPercent: 0,
    images: [
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1596436889106-be35e843f974?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=600&h=400&fit=crop",
    ],
    mealPlan: "Room Only",
  },
  {
    id: 4,
    name: "Coral Bay Resort",
    location: "Hammamet, Marina",
    rating: 4.6,
    stars: 4,
    amenities: ["Wi-Fi", "Pool", "Spa"],
    tags: ["Sea View", "Adults Only", "Quiet"],
    originalPrice: 175,
    discountedPrice: 140,
    discountPercent: 20,
    images: [
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1586611292717-f828b167408c?w=600&h=400&fit=crop",
    ],
    mealPlan: "Breakfast Included",
    mealOptions: ["Breakfast Included", "Half Board"],
  },
  {
    id: 5,
    name: "Medina Palace Hotel",
    location: "Hammamet, Old Town",
    rating: 4.4,
    stars: 4,
    amenities: ["Wi-Fi", "Breakfast", "Spa"],
    tags: ["Historic", "Boutique", "Cultural"],
    originalPrice: 130,
    discountedPrice: 110,
    discountPercent: 15,
    images: [
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&h=400&fit=crop",
    ],
    mealPlan: "Breakfast Included",
  },
  {
    id: 6,
    name: "Sunset Beach Club",
    location: "Hammamet, South Beach",
    rating: 4.3,
    stars: 4,
    amenities: ["Wi-Fi", "Pool", "Breakfast"],
    tags: ["All Inclusive", "Family", "Entertainment"],
    originalPrice: 160,
    discountedPrice: 136,
    discountPercent: 15,
    images: [
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=600&h=400&fit=crop",
      "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600&h=400&fit=crop",
    ],
    mealPlan: "All Inclusive",
    mealOptions: ["All Inclusive", "Ultra All Inclusive"],
  },
];

interface BookingData {
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
}

interface HotelListingsProps {
  onBookHotel?: (data: BookingData) => void;
}

interface RoomOption {
  id: number;
  name: string;
  freeCancellationDate: string;
  available: boolean;
  price: number;
}

export function HotelListings({ onBookHotel }: HotelListingsProps) {
  const handleBookHotel = (hotel: typeof hotels[0], mealPlan: string, room?: RoomOption) => {
    if (onBookHotel && room) {
      onBookHotel({
        id: hotel.id,
        name: hotel.name,
        location: hotel.location,
        image: hotel.images[0],
        roomType: room.name,
        mealPlan: mealPlan,
        checkIn: "06/01/2026",
        checkOut: "06/02/2026",
        nights: 1,
        adults: 2,
        children: 0,
        pricePerNight: room.price,
        totalPrice: room.price,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Results Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            68 hotels found in Hammamet
          </h1>
          <p className="text-sm text-muted-foreground">
            May 2 - May 3, 2026 · 1 room · 2 adults
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search for a hotel in the list..."
          className="w-full px-4 py-3 border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Hotel Cards */}
      <div className="space-y-4">
        {hotels.map((hotel) => (
          <HotelCard 
            key={hotel.id} 
            hotel={hotel} 
            onBook={(mealPlan, room) => handleBookHotel(hotel, mealPlan, room)}
          />
        ))}
      </div>

      {/* Load More */}
      <div className="text-center pt-4">
        <button className="px-6 py-2 text-primary font-medium hover:bg-primary/10 rounded-lg transition-colors">
          Load more hotels
        </button>
      </div>
    </div>
  );
}
