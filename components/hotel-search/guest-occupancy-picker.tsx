/**
 * GuestOccupancyPicker - Sélecteur d'occupation multi-chambres
 * 
 * Fonctionnalités :
 * - Ajout/Suppression de chambres
 * - Gestion adultes (1-4) par chambre
 * - Gestion enfants (0-N) avec âge obligatoire
 * - Focus automatique sur sélecteur d'âge lors de l'ajout d'un enfant
 * - Résumé en temps réel de l'occupation
 * - Sélecteur de nationalité (Résident vs Non-résident)
 */

"use client"

import { useReducer, useRef, useEffect } from "react"
import { Plus, Minus, X, Users, Baby, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { RoomOccupancy, RoomAction, Nationality, ChildAge } from "@/lib/hotel-search/types"
import { hotelSearchReducer, calculateOccupancySummary } from "@/lib/hotel-search/reducer"
import { SEARCH_CONSTRAINTS } from "@/lib/hotel-search/types"

interface GuestOccupancyPickerProps {
  initialState?: RoomOccupancy[]
  onChange?: (rooms: RoomOccupancy[]) => void
  nationality?: Nationality
  onNationalityChange?: (nationality: Nationality) => void
}

const CHILD_AGE_OPTIONS: ChildAge[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]

export function GuestOccupancyPicker({
  initialState,
  onChange,
  nationality = "resident",
  onNationalityChange,
}: GuestOccupancyPickerProps) {
  const [rooms, dispatch] = useReducer(
    (state: RoomOccupancy[], action: RoomAction) => {
      const newState = hotelSearchReducer({ rooms: state, dates: { checkIn: new Date(), checkOut: new Date(), nights: 0 }, nationality, destination: {} }, action)
      onChange?.(newState.rooms)
      return newState.rooms
    },
    initialState || [{ adults: 2, children: 0, childAges: [] }]
  )

  const childAgeRefs = useRef<(HTMLButtonElement | null)[][]>([])

  // Focus automatique sur le sélecteur d'âge lors de l'ajout d'un enfant
  useEffect(() => {
    rooms.forEach((room, roomIndex) => {
      if (room.childAges.length > 0) {
        const childIndex = room.childAges.length - 1
        const selectElement = childAgeRefs.current[roomIndex]?.[childIndex]
        if (selectElement) {
          selectElement.click()
        }
      }
    })
  }, [rooms])

  const summary = calculateOccupancySummary({ rooms, dates: { checkIn: new Date(), checkOut: new Date(), nights: 0 }, nationality, destination: {} })

  const handleAddRoom = () => {
    if (rooms.length < SEARCH_CONSTRAINTS.MAX_ROOMS) {
      dispatch({ type: "ADD_ROOM" })
    }
  }

  const handleRemoveRoom = (roomIndex: number) => {
    if (rooms.length > 1) {
      dispatch({ type: "REMOVE_ROOM", payload: { roomIndex } })
    }
  }

  const handleUpdateAdults = (roomIndex: number, delta: number) => {
    dispatch({ type: "UPDATE_ADULTS", payload: { roomIndex, delta } })
  }

  const handleAddChild = (roomIndex: number) => {
    if (rooms[roomIndex].children < SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM) {
      dispatch({ type: "ADD_CHILD", payload: { roomIndex } })
    }
  }

  const handleRemoveChild = (roomIndex: number, childIndex: number) => {
    dispatch({ type: "REMOVE_CHILD", payload: { roomIndex, childIndex } })
  }

  const handleUpdateChildAge = (roomIndex: number, childIndex: number, age: ChildAge) => {
    dispatch({ type: "UPDATE_CHILD_AGE", payload: { roomIndex, childIndex, age } })
  }

  const handleNationalityChange = (value: Nationality) => {
    onNationalityChange?.(value)
  }

  return (
    <div className="space-y-4">
      {/* Nationalité */}
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Nationalité
        </Label>
        <RadioGroup
          value={nationality}
          onValueChange={handleNationalityChange}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="resident" id="resident" />
            <Label htmlFor="resident" className="font-normal cursor-pointer">
              Résident
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="non_resident" id="non_resident" />
            <Label htmlFor="non_resident" className="font-normal cursor-pointer">
              Non-résident
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Chambres */}
      <div className="space-y-3">
        {rooms.map((room, roomIndex) => (
          <Card key={roomIndex}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  {/* Header chambre */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Chambre {roomIndex + 1}
                    </span>
                    {rooms.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveRoom(roomIndex)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  {/* Adultes */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Adultes</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={room.adults <= SEARCH_CONSTRAINTS.MIN_ADULTS_PER_ROOM}
                        onClick={() => handleUpdateAdults(roomIndex, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">
                        {room.adults}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        disabled={room.adults >= SEARCH_CONSTRAINTS.MAX_ADULTS_PER_ROOM}
                        onClick={() => handleUpdateAdults(roomIndex, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Enfants */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Baby className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Enfants</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={room.children === 0}
                          onClick={() => handleRemoveChild(roomIndex, room.children - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">
                          {room.children}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={room.children >= SEARCH_CONSTRAINTS.MAX_CHILDREN_PER_ROOM}
                          onClick={() => handleAddChild(roomIndex)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Âges des enfants */}
                    {room.children > 0 && (
                      <div className="space-y-2 pl-6">
                        {room.childAges.map((age, childIndex) => (
                          <div key={childIndex} className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">
                              Âge enfant {childIndex + 1}
                            </Label>
                            <Select
                              value={age.toString()}
                              onValueChange={(value) =>
                                handleUpdateChildAge(roomIndex, childIndex, parseInt(value) as ChildAge)
                              }
                            >
                              <SelectTrigger
                                ref={(el) => {
                                  if (!childAgeRefs.current[roomIndex]) {
                                    childAgeRefs.current[roomIndex] = []
                                  }
                                  childAgeRefs.current[roomIndex][childIndex] = el
                                }}
                                className="h-7 w-24"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CHILD_AGE_OPTIONS.map((ageOption) => (
                                  <SelectItem key={ageOption} value={ageOption.toString()}>
                                    {ageOption} {ageOption === 1 ? "an" : "ans"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Bouton ajouter chambre */}
        {rooms.length < SEARCH_CONSTRAINTS.MAX_ROOMS && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleAddRoom}
          >
            <Plus className="mr-2 h-4 w-4" />
            Ajouter une chambre
          </Button>
        )}
      </div>

      {/* Résumé */}
      <div className="bg-muted/50 rounded-lg p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            {summary.totalRooms} chambre{summary.totalRooms > 1 ? "s" : ""} • {summary.totalAdults} adulte{summary.totalAdults > 1 ? "s" : ""}
            {summary.hasChildren && ` • ${summary.totalChildren} enfant${summary.totalChildren > 1 ? "s" : ""}`}
          </span>
          <span className="font-medium">
            {summary.totalGuests} voyageur{summary.totalGuests > 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  )
}
