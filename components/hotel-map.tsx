"use client"

/**
 * Carte interactive des résultats hôtel — Leaflet + OpenStreetMap (aucune
 * clé API, aucun engagement de facturation, adapté au pilote). Marqueurs en
 * pastille de prix (style OTA moderne) plutôt que l'icône Leaflet par défaut
 * (évite le problème classique des images d'icône par défaut cassées sous
 * bundler, et donne directement le signal le plus utile — le prix — au
 * survol de la carte).
 *
 * Clustering réel (leaflet.markercluster) : au-delà d'une poignée d'hôtels
 * proches (ex. zone hôtelière dense comme Hammamet/Sousse), les pastilles se
 * regroupent en un cercle avec un compteur plutôt que de se superposer.
 *
 * Synchronisation bidirectionnelle avec la liste (voir hotel-listings.tsx) :
 * `selectedId` (venant d'un clic carte OU liste) fait zoomer/dézoomer la
 * carte jusqu'à faire apparaître le marqueur (même hors du cluster visible
 * actuel) puis ouvre sa popup ; `hoveredId` ne fait que changer le style du
 * marqueur (jamais de pan/zoom sur un simple survol, pour ne pas rendre la
 * carte instable pendant un défilement de la liste).
 */

import "leaflet/dist/leaflet.css"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet.markercluster"
import { MapContainer, TileLayer, useMap } from "react-leaflet"

export interface HotelMapPoint {
  id: number
  name: string
  latitude: number
  longitude: number
  /** Prix déjà formaté dans la devise active (voir useCurrency().format()) — jamais reformaté ici. */
  priceLabel: string
}

type MarkerState = "default" | "hovered" | "selected"

function markerIcon(label: string, state: MarkerState): L.DivIcon {
  const styleClass =
    state === "selected"
      ? "bg-primary text-primary-foreground border-primary scale-110 z-10"
      : state === "hovered"
        ? "bg-accent text-accent-foreground border-accent scale-105"
        : "bg-card text-foreground border-border"
  return L.divIcon({
    className: "e2b-hotel-marker",
    html: `<div class="rounded-full border px-2 py-1 text-xs font-semibold shadow-md whitespace-nowrap transition-transform ${styleClass}">${label}</div>`,
    iconSize: undefined,
    iconAnchor: [24, 14],
  })
}

interface MarkersLayerProps {
  points: HotelMapPoint[]
  selectedId: number | null
  hoveredId: number | null
  onMarkerSelect: (id: number) => void
}

function MarkersLayer({ points, selectedId, hoveredId, onMarkerSelect }: MarkersLayerProps) {
  const map = useMap()
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const prevSelectedRef = useRef<number | null>(null)

  // Reconstruction complète des marqueurs quand l'ensemble de points change
  // (nouvelle recherche/filtre) — coût négligeable à l'échelle d'une page de
  // résultats (quelques dizaines d'hôtels), jamais un souci de perf réel ici.
  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 50 })
    clusterGroupRef.current = clusterGroup
    markersRef.current = new Map()

    for (const point of points) {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: markerIcon(point.priceLabel, "default"),
      })
      marker.bindPopup(`<strong>${escapeHtml(point.name)}</strong><br/>${escapeHtml(point.priceLabel)}`)
      marker.on("click", () => onMarkerSelect(point.id))
      markersRef.current.set(point.id, marker)
      clusterGroup.addLayer(marker)
    }

    map.addLayer(clusterGroup)

    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]))
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    } else {
      // Tunisie entière — repli honnête, jamais un centrage arbitraire sur
      // un point qui n'existe pas quand aucun hôtel n'a de coordonnées.
      map.setView([34.5, 9.5], 6)
    }

    return () => {
      map.removeLayer(clusterGroup)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, map])

  // Style des marqueurs (survol/sélection) — ne touche jamais au zoom/pan.
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const point = points.find((p) => p.id === id)
      if (!point) continue
      const state: MarkerState = id === selectedId ? "selected" : id === hoveredId ? "hovered" : "default"
      marker.setIcon(markerIcon(point.priceLabel, state))
    }
  }, [selectedId, hoveredId, points])

  // Sélection (clic carte OU liste) — zoome/dézoome jusqu'à faire apparaître
  // le marqueur même s'il est actuellement absorbé dans un cluster fermé,
  // puis ouvre sa popup. Ne se déclenche que sur un CHANGEMENT réel de
  // sélection, jamais sur un simple re-render.
  useEffect(() => {
    if (selectedId == null || selectedId === prevSelectedRef.current) {
      prevSelectedRef.current = selectedId
      return
    }
    prevSelectedRef.current = selectedId
    const marker = markersRef.current.get(selectedId)
    const clusterGroup = clusterGroupRef.current
    if (!marker || !clusterGroup) return
    clusterGroup.zoomToShowLayer(marker, () => marker.openPopup())
  }, [selectedId])

  return null
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export interface HotelMapProps {
  points: HotelMapPoint[]
  selectedId: number | null
  hoveredId: number | null
  onMarkerSelect: (id: number) => void
  className?: string
}

export function HotelMap({ points, selectedId, hoveredId, onMarkerSelect, className }: HotelMapProps) {
  return (
    <div className={className}>
      <MapContainer
        center={[34.5, 9.5]}
        zoom={6}
        scrollWheelZoom
        className="h-full w-full rounded-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MarkersLayer
          points={points}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onMarkerSelect={onMarkerSelect}
        />
      </MapContainer>
    </div>
  )
}
