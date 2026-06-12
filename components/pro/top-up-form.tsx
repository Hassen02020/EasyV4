"use client"

import { useState, useTransition, useRef } from "react"
import {
  Building2,
  CreditCard,
  Banknote,
  Upload,
  CheckCircle,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { requestWalletTopUp } from "@/lib/wallet/actions"
import type { WalletActionResult } from "@/lib/wallet/actions"
import type { WalletTopUpMethod } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Config méthodes de paiement                                                */
/* -------------------------------------------------------------------------- */

const METHODS: {
  id: WalletTopUpMethod
  label: string
  description: string
  icon: React.ReactNode
  needsProof: boolean
  needsRef: boolean
  instant: boolean
  banks?: string[]
}[] = [
  {
    id: "VIREMENT",
    label: "Virement Bancaire",
    description: "STB, BNA, Attijari, BH, BIAT, UIB…",
    icon: <Building2 className="size-5" />,
    needsProof: true,
    needsRef: true,
    instant: false,
    banks: ["STB", "BNA", "Attijari Bank", "BH Bank", "BIAT", "UIB", "Amen Bank"],
  },
  {
    id: "MANDAT",
    label: "Mandat WafaCash / Postenet",
    description: "Bordereau de mandat postal ou WafaCash",
    icon: <Banknote className="size-5" />,
    needsProof: true,
    needsRef: true,
    instant: false,
  },
  {
    id: "ZITOUNA_PAY",
    label: "Zitouna Pay",
    description: "Paiement instantané via Zitouna Pay gateway",
    icon: <CreditCard className="size-5" />,
    needsProof: false,
    needsRef: false,
    instant: true,
  },
  {
    id: "CASH",
    label: "Espèces en agence",
    description: "Dépôt cash directement à nos bureaux",
    icon: <Banknote className="size-5" />,
    needsProof: false,
    needsRef: false,
    instant: false,
  },
]

/* -------------------------------------------------------------------------- */
/* Composant                                                                   */
/* -------------------------------------------------------------------------- */

interface TopUpFormProps {
  agencyId: string
  userId?: string
  onSuccess?: (txId: string) => void
}

export function TopUpForm({ agencyId, userId, onSuccess }: TopUpFormProps) {
  const [selectedMethod, setSelectedMethod] = useState<WalletTopUpMethod | null>(null)
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<WalletActionResult<{ txId: string }> | null>(null)
  const [zitounaPayUrl, setZitounaPayUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const method = METHODS.find((m) => m.id === selectedMethod)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert("Fichier trop grand — maximum 5 MB")
      return
    }
    setProofFile(file)
    if (file.type.startsWith("image/")) {
      setProofPreview(URL.createObjectURL(file))
    } else {
      setProofPreview(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedMethod) return

    const parsedAmount = parseFloat(amount.replace(",", "."))
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    startTransition(async () => {
      let proofFileBase64: string | undefined
      let proofFileName: string | undefined

      if (proofFile) {
        const buffer = await proofFile.arrayBuffer()
        proofFileBase64 = Buffer.from(buffer).toString("base64")
        proofFileName = proofFile.name
      }

      const res = await requestWalletTopUp({
        agencyId,
        amount: parsedAmount,
        method: selectedMethod,
        referenceNumber: reference || undefined,
        proofFileBase64,
        proofFileName,
        createdByUserId: userId,
      })

      setResult(res)

      if (res.ok) {
        const meta = res.data as unknown as { zitounaPayUrl?: string }
        if (meta?.zitounaPayUrl) {
          setZitounaPayUrl(meta.zitounaPayUrl)
        }
        onSuccess?.(res.data.txId)
      }
    })
  }

  /* --- Succès --- */
  if (result?.ok && !zitounaPayUrl) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle className="size-12 text-emerald-500" />
        <div>
          <p className="text-lg font-semibold">Demande envoyée avec succès</p>
          <p className="text-muted-foreground text-sm mt-1">
            {method?.instant
              ? "Votre paiement est en cours de traitement."
              : "Notre équipe va vérifier votre reçu sous 24h ouvrées et créditer votre wallet."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setResult(null)
            setAmount("")
            setReference("")
            setProofFile(null)
            setProofPreview(null)
            setSelectedMethod(null)
          }}
        >
          Nouvelle demande
        </Button>
      </div>
    )
  }

  /* --- Redirection Zitouna Pay --- */
  if (zitounaPayUrl) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CreditCard className="size-12 text-[#1e3a5f]" />
        <div>
          <p className="text-lg font-semibold">Redirection vers Zitouna Pay</p>
          <p className="text-muted-foreground text-sm mt-1">
            Cliquez pour finaliser votre paiement en ligne.
          </p>
        </div>
        <Button asChild className="gap-2 bg-[#1e3a5f] hover:bg-[#152d4a]">
          <a href={zitounaPayUrl} target="_blank" rel="noopener noreferrer">
            Payer maintenant
            <ExternalLink className="size-4" />
          </a>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Méthode */}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Méthode de rechargement
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedMethod(m.id)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                selectedMethod === m.id
                  ? "border-[#1e3a5f] bg-[#1e3a5f]/5 ring-1 ring-[#1e3a5f]"
                  : "border-border hover:border-[#1e3a5f]/40 hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 rounded-lg p-1.5",
                  selectedMethod === m.id
                    ? "bg-[#1e3a5f] text-white"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {m.icon}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-sm">
                  {m.label}
                  {m.instant && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0">
                      Instantané
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {m.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </fieldset>

      {selectedMethod && (
        <>
          <Separator />

          {/* Montant */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">
              Montant à recharger{" "}
              <span className="text-muted-foreground font-normal">(DT)</span>
            </Label>
            <div className="relative">
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min="1"
                max="500000"
                step="0.001"
                placeholder="Ex : 1 000.000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pr-12 text-lg font-semibold"
                required
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                DT
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              Maximum 500 000 DT par demande
            </p>
          </div>

          {/* Référence */}
          {method?.needsRef && (
            <div className="space-y-1.5">
              <Label htmlFor="reference">
                {selectedMethod === "VIREMENT"
                  ? "Numéro de virement / bordereau"
                  : "Numéro de mandat"}
              </Label>
              <Input
                id="reference"
                placeholder={
                  selectedMethod === "VIREMENT"
                    ? "Ex : VRT-2026-00123456"
                    : "Ex : MND-12345678"
                }
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                required
              />
            </div>
          )}

          {/* Banques disponibles */}
          {method?.banks && (
            <div className="flex flex-wrap gap-1.5">
              {method.banks.map((b) => (
                <Badge
                  key={b}
                  variant="secondary"
                  className="text-xs font-normal"
                >
                  {b}
                </Badge>
              ))}
            </div>
          )}

          {/* Upload reçu */}
          {method?.needsProof && (
            <div className="space-y-2">
              <Label>Joindre le reçu / bordereau</Label>
              <div
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                  proofFile
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-border hover:border-[#1e3a5f]/40 hover:bg-muted/30",
                )}
                onClick={() => fileRef.current?.click()}
              >
                {proofPreview ? (
                  <img
                    src={proofPreview}
                    alt="Aperçu reçu"
                    className="max-h-32 rounded-lg object-contain"
                  />
                ) : proofFile ? (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <CheckCircle className="size-5" />
                    <span className="text-sm font-medium">{proofFile.name}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="size-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Photo ou scan du reçu
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      JPG, PNG, PDF — max 5 MB
                    </p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  onChange={handleFile}
                />
              </div>
              {proofFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground h-7"
                  onClick={() => {
                    setProofFile(null)
                    setProofPreview(null)
                    if (fileRef.current) fileRef.current.value = ""
                  }}
                >
                  <X className="size-3.5" />
                  Supprimer le fichier
                </Button>
              )}
            </div>
          )}

          {/* Erreur */}
          {result && !result.ok && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {result.error}
            </p>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={
              isPending ||
              !amount ||
              parseFloat(amount) <= 0 ||
              (!!method?.needsRef && !reference) ||
              (!!method?.needsProof && !proofFile)
            }
            className="w-full gap-2 bg-[#1e3a5f] hover:bg-[#152d4a]"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Envoi en cours…
              </>
            ) : selectedMethod === "ZITOUNA_PAY" ? (
              <>
                <CreditCard className="size-4" />
                Payer via Zitouna Pay
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Soumettre la demande
              </>
            )}
          </Button>
        </>
      )}
    </form>
  )
}
