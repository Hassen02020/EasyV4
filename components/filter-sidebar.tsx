"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Star } from "lucide-react";

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function FilterSection({ title, defaultOpen = true, children }: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b border-border pb-4">
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-left group">
        <h3 className="text-sm font-semibold text-primary">{title}</h3>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 space-y-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface CheckboxItemProps {
  id: string;
  label: string;
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

function CheckboxItem({ id, label, count, checked, onCheckedChange }: CheckboxItemProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
        <label
          htmlFor={id}
          className="text-sm text-foreground cursor-pointer hover:text-primary transition-colors"
        >
          {label}
        </label>
      </div>
      <span className="text-sm text-muted-foreground">({count})</span>
    </div>
  );
}

function StarRating({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: stars }).map((_, i) => (
        <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
      ))}
    </div>
  );
}

export function FilterSidebar() {
  const [priceRange, setPriceRange] = useState([50, 300]);

  return (
    <aside className="bg-card rounded-lg border border-border p-5 sticky top-20">
      <h2 className="text-lg font-bold text-primary mb-5">Affinez vos résultats</h2>

      <div className="space-y-4">
        {/* Tarifs et disponibilités */}
        <FilterSection title="Tarifs et disponibilités">
          <CheckboxItem id="recommended" label="Hôtel recommander" count={7} />
          <CheckboxItem id="promotion" label="Tarifs en promotion" count={21} />
          <CheckboxItem id="free-child" label="Enfant gratuit" count={1} />
          <CheckboxItem id="available" label="Disponible seulement" count={39} />
          <CheckboxItem id="free-cancel" label="Annulation gratuite" count={7} />
        </FilterSection>

        {/* Catégorie (Star Rating) */}
        <FilterSection title="Catégorie">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="3-star" />
                <label htmlFor="3-star" className="cursor-pointer">
                  <StarRating stars={3} />
                </label>
              </div>
              <span className="text-sm text-muted-foreground">(15)</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="4-star" />
                <label htmlFor="4-star" className="cursor-pointer">
                  <StarRating stars={4} />
                </label>
              </div>
              <span className="text-sm text-muted-foreground">(36)</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="5-star" />
                <label htmlFor="5-star" className="cursor-pointer">
                  <StarRating stars={5} />
                </label>
              </div>
              <span className="text-sm text-muted-foreground">(16)</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="parc" />
                <label htmlFor="parc" className="text-sm text-foreground cursor-pointer hover:text-primary transition-colors">
                  Parc d&apos;attraction
                </label>
              </div>
              <span className="text-sm text-muted-foreground">(1)</span>
            </div>
          </div>
        </FilterSection>

        {/* Prix par nuit */}
        <FilterSection title="Prix par nuit">
          <div className="px-1">
            <Slider
              value={priceRange}
              onValueChange={setPriceRange}
              min={0}
              max={500}
              step={10}
              className="w-full"
            />
            <div className="flex justify-between mt-2 text-sm text-muted-foreground">
              <span>{priceRange[0]} DT</span>
              <span>{priceRange[1]}+ DT</span>
            </div>
          </div>
        </FilterSection>

        {/* Type de pension */}
        <FilterSection title="Type de pension">
          <CheckboxItem id="logement" label="Logement Petit Déjeuner" count={45} />
          <CheckboxItem id="demi-pension" label="Demi Pension" count={38} />
          <CheckboxItem id="pension-complete" label="Pension Complète" count={28} />
          <CheckboxItem id="all-inclusive" label="All Inclusive" count={52} />
          <CheckboxItem id="soft-all" label="Soft All Inclusive" count={18} />
        </FilterSection>

        {/* Équipements */}
        <FilterSection title="Équipements">
          <CheckboxItem id="pool" label="Piscine" count={45} />
          <CheckboxItem id="beach" label="Bord de Mer" count={32} />
          <CheckboxItem id="spa" label="Centre de Thalasso" count={18} />
          <CheckboxItem id="wifi" label="Wi-Fi gratuit" count={67} />
          <CheckboxItem id="parking" label="Parking" count={54} />
          <CheckboxItem id="gym" label="Salle de sport" count={28} />
        </FilterSection>

        {/* Convient pour */}
        <FilterSection title="Convient pour">
          <CheckboxItem id="famille" label="Famille" count={42} />
          <CheckboxItem id="couple" label="Couple" count={38} />
          <CheckboxItem id="business" label="Voyage d'affaires" count={15} />
          <CheckboxItem id="groupe" label="Groupe" count={22} />
        </FilterSection>

        {/* Activités */}
        <FilterSection title="Activités" defaultOpen={false}>
          <CheckboxItem id="water-park" label="Parc aquatique" count={12} />
          <CheckboxItem id="mini-club" label="Mini Club" count={28} />
          <CheckboxItem id="animation" label="Animation" count={35} />
          <CheckboxItem id="golf" label="Golf" count={8} />
          <CheckboxItem id="tennis" label="Tennis" count={14} />
        </FilterSection>

        {/* Zone */}
        <FilterSection title="Zone" defaultOpen={false}>
          <CheckboxItem id="hammamet-nord" label="Hammamet Nord" count={18} />
          <CheckboxItem id="hammamet-sud" label="Hammamet Sud" count={22} />
          <CheckboxItem id="yasmine" label="Yasmine Hammamet" count={15} />
          <CheckboxItem id="nabeul" label="Nabeul" count={8} />
          <CheckboxItem id="cap-bon" label="Cap Bon" count={5} />
        </FilterSection>
      </div>

      {/* Reset Filters Button */}
      <button className="w-full mt-5 py-2.5 text-sm font-medium text-primary border border-primary rounded-lg hover:bg-primary/5 transition-colors">
        Réinitialiser les filtres
      </button>
    </aside>
  );
}
