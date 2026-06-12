/**
 * Composant Client pour la gestion des configurations de modules
 *
 * Ce composant affiche l'interface interactive des Feature Flags avec
 * des switches shadcn/ui pour activer/désactiver les modules et
 * configurer leurs marges.
 */

"use client"

import { useState, useTransition } from "react"
import { toggleModuleActive, updateModuleMargin } from "./actions"
import type { ModuleConfig } from "@/lib/db/schema"

interface ConfigurationsClientProps {
  initialConfigs: ModuleConfig[]
}

const MODULE_LABELS: Record<string, { name: string; description: string }> = {
  hotel: { name: "Hôtels Tunisie", description: "Flux MyGo - Production" },
  flight: { name: "Vols", description: "Flux Amadeus/Sabre - À venir" },
  package: { name: "Voyages Organisés", description: "Catalog interne - À venir" },
  activity: { name: "Activités", description: "Catalog interne - À venir" },
  transfer: { name: "Transferts", description: "Catalog interne - À venir" },
  omra: { name: "Omraty", description: "Flux API Omra - À venir" },
}

export function ConfigurationsClient({ initialConfigs }: ConfigurationsClientProps) {
  const [configs, setConfigs] = useState<ModuleConfig[]>(initialConfigs)
  const [isPending, startTransition] = useTransition()
  const [editingMargin, setEditingMargin] = useState<string | null>(null)
  const [marginValues, setMarginValues] = useState<Record<string, string>>({})

  const handleToggle = (moduleType: string, currentValue: boolean) => {
    startTransition(async () => {
      const result = await toggleModuleActive(moduleType, !currentValue)
      if (result.success) {
        setConfigs((prev) =>
          prev.map((c) => (c.moduleType === moduleType ? { ...c, isActive: !currentValue } : c)),
        )
      }
    })
  }

  const handleMarginUpdate = (moduleType: string) => {
    const newMargin = parseFloat(marginValues[moduleType] || "0")
    if (isNaN(newMargin) || newMargin < 0 || newMargin > 100) {
      alert("Marge invalide. Veuillez entrer un nombre entre 0 et 100.")
      return
    }

    startTransition(async () => {
      const result = await updateModuleMargin(moduleType, newMargin)
      if (result.success) {
        setConfigs((prev) =>
          prev.map((c) =>
            c.moduleType === moduleType ? { ...c, marginPercentage: newMargin.toString() } : c,
          ),
        )
        setEditingMargin(null)
        setMarginValues((prev) => ({ ...prev, [moduleType]: "" }))
      }
    })
  }

  const getConfigForModule = (moduleType: string) => {
    return configs.find((c) => c.moduleType === moduleType)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Configurations - Feature Flags</h1>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Activation des Modules</h2>
          <p className="text-gray-500 text-sm mt-1">
            Activez ou désactivez les flux XML de chaque module de réservation et configurez les
            marges
          </p>
        </div>

        <div className="divide-y">
          {Object.entries(MODULE_LABELS).map(([moduleType, { name, description }]) => {
            const config = getConfigForModule(moduleType)
            const isActive = config?.isActive ?? false
            const marginPercentage = config?.marginPercentage
              ? parseFloat(config.marginPercentage)
              : 0

            return (
              <div key={moduleType} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-medium">{name}</h3>
                    <p className="text-sm text-gray-500">{description}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label htmlFor={`switch-${moduleType}`} className="text-sm text-gray-600">
                        {isActive ? "Actif" : "Inactif"}
                      </label>
                      <button
                        id={`switch-${moduleType}`}
                        onClick={() => handleToggle(moduleType, isActive)}
                        disabled={isPending}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          isActive ? "bg-blue-600" : "bg-gray-200"
                        } ${isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isActive ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Configuration de la marge */}
                <div className="flex items-center gap-4 mt-2">
                  <label className="text-sm text-gray-600 min-w-[100px]">
                    Marge: {marginPercentage.toFixed(2)}%
                  </label>
                  {editingMargin === moduleType ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="Ex: 15.00"
                        value={marginValues[moduleType] || ""}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setMarginValues((prev) => ({ ...prev, [moduleType]: e.target.value }))
                        }
                        className="w-32 border rounded px-2 py-1"
                      />
                      <button
                        onClick={() => handleMarginUpdate(moduleType)}
                        disabled={isPending}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                      >
                        OK
                      </button>
                      <button
                        onClick={() => {
                          setEditingMargin(null)
                          setMarginValues((prev) => ({ ...prev, [moduleType]: "" }))
                        }}
                        disabled={isPending}
                        className="border border-gray-300 px-3 py-1 rounded text-sm disabled:opacity-50"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingMargin(moduleType)
                        setMarginValues((prev) => ({
                          ...prev,
                          [moduleType]: marginPercentage.toString(),
                        }))
                      }}
                      disabled={isPending}
                      className="border border-gray-300 px-3 py-1 rounded text-sm disabled:opacity-50"
                    >
                      Modifier
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <p className="text-sm text-gray-600">
            Les modifications sont appliquées immédiatement et affectent le frontend en temps réel.
          </p>
        </div>
      </div>
    </div>
  )
}
