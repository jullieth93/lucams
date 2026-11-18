"use client";

/*
 * Constructor interactivo de Propuestas Comerciales B2B (`/admin/oportunidades/[id]`, `ADR-210`).
 *
 * Exclusivo de roles con `opportunities:propose` (`SUPERADMIN`, `OPERATIONS_MANAGER`, `MANAGER`).
 * Calcula en vivo costo BOM (`Product.cost`), margen neto %, cotización logística Aveonline / LUCAMS,
 * adjunta muestra digital privada y emite el enlace único `/propuesta/[token]`.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Copy,
  FileCheck2,
  Loader2,
  Plus,
  Send,
  Save,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { AdminBadge, AdminCard } from "@/components/admin-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppIcon } from "@/components/icons/brand";
import { applyVolumePricing } from "@/features/cart/volume-pricing";
import { DEPARTMENTS, getCitiesByDeptCode } from "@/lib/dane-divipola";
import { formatCOP } from "@/lib/format";
import { formatDateCO, formatIsoDateCO } from "@/lib/datetime";
import {
  B2B_ARTWORK_MODE_LABELS,
  B2B_ARTWORK_MODES,
  B2B_PACKAGING_TYPE_LABELS,
  B2B_PACKAGING_TYPES,
  isProposalStatus,
  PROPOSAL_PROOF_MODE_LABELS,
  PROPOSAL_PROOF_MODES,
  PROPOSAL_SHIPPING_MODE_LABELS,
  PROPOSAL_SHIPPING_MODES,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_TONES,
  type B2bArtworkMode,
  type B2bPackagingType,
  type B2bRequestedConfig,
  type ProposalProofMode,
  type ProposalShippingMode,
} from "@/features/opportunities/schemas";
import { computeProposalMarginSummary } from "@/features/opportunities/configurator-math";
import type { AdminProposalCatalogPayload } from "@/features/opportunities/configurator-catalog";
import type { B2bShippingQuoteOption } from "@/features/opportunities/proposals-service";
import {
  quoteB2bProposalShippingAction,
  saveProposalDraftAction,
  sendProposalAction,
  uploadProposalProofAction,
} from "@/features/opportunities/proposals-actions";

export interface ExistingProposalSummary {
  id: string;
  version: number;
  number: string;
  status: string;
  validUntilIso: string;
  proofMode: string;
  hasProofAsset: boolean;
  artworkMode: string;
  packagingType: string;
  estimatedProductionDays: number;
  shippingMode: string;
  shippingCarrier: string | null;
  shippingService: string | null;
  packageCount: number;
  departmentCode: string | null;
  cityCode: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  allowDirectTransfer: boolean;
  clientNotes: string | null;
  termsNotes: string | null;
  sentAtIso: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  items: Array<{
    id: string;
    variantId: string;
    titleSnapshot: string;
    skuSnapshot: string;
    qty: number;
    designUnits: number;
    unitPriceCents: number;
    packagingNote: string | null;
  }>;
}

type BuilderRow = {
  key: string;
  variantId: string;
  qty: string;
  designUnits: string;
  unitPricePesos: string;
  packagingNote: string;
};

type Props = {
  opportunityId: string;
  opportunityNumber: string;
  contactName: string;
  contactEmail: string | null;
  contactWhatsappE164: string | null;
  defaultCityName: string | null;
  defaultDeptName: string | null;
  requestedConfig: B2bRequestedConfig | null;
  existingProposals: ExistingProposalSummary[];
  catalog: AdminProposalCatalogPayload;
  directPaymentConfigured: boolean;
  isSuperadmin: boolean;
  siteOrigin: string;
};

function defaultValidUntilIso(): string {
  return formatIsoDateCO(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

function inferDaneCodes(
  deptName: string | null,
  cityName: string | null,
  requested: B2bRequestedConfig | null,
): { deptCode: string; cityCode: string } {
  if (requested?.departmentCode && requested?.cityCode) {
    return { deptCode: requested.departmentCode, cityCode: requested.cityCode };
  }
  const cleanDept = (deptName ?? "").trim().toLowerCase();
  const matchedDept =
    DEPARTMENTS.find(
      (d) => d.name.toLowerCase() === cleanDept || cleanDept.includes(d.name.toLowerCase()),
    ) ?? DEPARTMENTS.find((d) => d.code === "11");
  const deptCode = matchedDept?.code ?? "11";
  const cities = getCitiesByDeptCode(deptCode);
  const cleanCity = (cityName ?? "").trim().toLowerCase();
  const matchedCity =
    cities.find(
      (c) => c.name.toLowerCase() === cleanCity || cleanCity.includes(c.name.toLowerCase()),
    ) ?? cities[0];
  return { deptCode, cityCode: matchedCity?.code ?? "11001" };
}

export function ProposalBuilder({
  opportunityId,
  opportunityNumber,
  contactName,
  contactEmail,
  contactWhatsappE164,
  defaultCityName,
  defaultDeptName,
  requestedConfig,
  existingProposals,
  catalog,
  directPaymentConfigured,
  isSuperadmin,
  siteOrigin,
}: Props) {
  const activeDraft = useMemo(
    () => existingProposals.find((p) => p.status === "DRAFT") ?? null,
    [existingProposals],
  );

  const initialDane = useMemo(
    () => inferDaneCodes(defaultDeptName, defaultCityName, requestedConfig),
    [defaultCityName, defaultDeptName, requestedConfig],
  );

  const [editingProposalId, setEditingProposalId] = useState<string>(activeDraft?.id ?? "");
  const [validUntilDate, setValidUntilDate] = useState<string>(() =>
    activeDraft ? formatIsoDateCO(new Date(activeDraft.validUntilIso)) : defaultValidUntilIso(),
  );
  const [proofMode, setProofMode] = useState<ProposalProofMode>(
    activeDraft?.proofMode === "BEFORE_PAYMENT" ? "BEFORE_PAYMENT" : "AFTER_PAYMENT",
  );
  const [hasProofUploaded, setHasProofUploaded] = useState<boolean>(
    Boolean(activeDraft?.hasProofAsset),
  );
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(
    activeDraft?.hasProofAsset ? `/api/b2b-proof/${encodeURIComponent(activeDraft.id)}` : null,
  );
  const [artworkMode, setArtworkMode] = useState<B2bArtworkMode>(
    (activeDraft?.artworkMode as B2bArtworkMode) ?? requestedConfig?.artworkMode ?? "SAME_DESIGN",
  );
  const [packagingType, setPackagingType] = useState<B2bPackagingType>(
    (activeDraft?.packagingType as B2bPackagingType) ??
      requestedConfig?.packagingType ??
      "BULK_STANDARD",
  );
  const [estimatedProductionDays, setEstimatedProductionDays] = useState<string>(
    String(activeDraft?.estimatedProductionDays ?? 4),
  );
  const [deptCode, setDeptCode] = useState<string>(
    activeDraft?.departmentCode ?? initialDane.deptCode,
  );
  const [cityCode, setCityCode] = useState<string>(activeDraft?.cityCode ?? initialDane.cityCode);
  const [shippingMode, setShippingMode] = useState<ProposalShippingMode>(
    activeDraft?.shippingMode === "PACTED_MANUAL" ? "PACTED_MANUAL" : "QUOTED",
  );
  const [shippingCarrier, setShippingCarrier] = useState<string>(
    activeDraft?.shippingCarrier ?? "",
  );
  const [shippingService, setShippingService] = useState<string>(
    activeDraft?.shippingService ?? "",
  );
  const [packageCount, setPackageCount] = useState<string>(String(activeDraft?.packageCount ?? 1));
  const [shippingPesos, setShippingPesos] = useState<string>(
    String(Math.round((activeDraft?.shippingCents ?? 0) / 100)),
  );
  const [discountPesos, setDiscountPesos] = useState<string>(
    String(Math.round((activeDraft?.discountCents ?? 0) / 100)),
  );
  const [allowDirectTransfer, setAllowDirectTransfer] = useState<boolean>(
    Boolean(activeDraft?.allowDirectTransfer && directPaymentConfigured),
  );
  const [allowBelowCostOverride, setAllowBelowCostOverride] = useState<boolean>(false);
  const [clientNotes, setClientNotes] = useState<string>(activeDraft?.clientNotes ?? "");
  const [termsNotes, setTermsNotes] = useState<string>(
    activeDraft?.termsNotes ??
      "Producción personalizada bajo muestra aprobada. Despacho asegurado a la dirección confirmada.",
  );

  const [rows, setRows] = useState<BuilderRow[]>(() => {
    if (activeDraft && activeDraft.items.length > 0) {
      return activeDraft.items.map((it, idx) => ({
        key: `row-${idx}-${it.id}`,
        variantId: it.variantId,
        qty: String(it.qty),
        designUnits: String(it.designUnits),
        unitPricePesos: String(Math.round(it.unitPriceCents / 100)),
        packagingNote: it.packagingNote ?? "",
      }));
    }
    if (requestedConfig && requestedConfig.lines.length > 0) {
      return requestedConfig.lines.map((line, idx) => ({
        key: `req-${idx}-${line.variantId}`,
        variantId: line.variantId,
        qty: String(line.commercialQty),
        designUnits: "1",
        unitPricePesos: String(Math.round(line.indicativeUnitCents / 100)),
        packagingNote: "",
      }));
    }
    const first = catalog.variants[0];
    if (!first) return [];
    const suggestedCents = applyVolumePricing(
      first.baseUnitPriceCents,
      catalog.tiers,
      first.productId,
      25,
      1,
      first.id,
    );
    return [
      {
        key: "row-init",
        variantId: first.id,
        qty: "25",
        designUnits: "1",
        unitPricePesos: String(Math.round(suggestedCents / 100)),
        packagingNote: "",
      },
    ];
  });

  const [quotes, setQuotes] = useState<B2bShippingQuoteOption[]>([]);
  const [quoteMeta, setQuoteMeta] = useState<{
    weightKg: number;
    suggestedBoxes: number;
    estimated: boolean;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ error?: string; success?: string } | null>(null);
  const [issuedLink, setIssuedLink] = useState<{
    proposalNumber: string;
    fullUrl: string;
    emailedTo: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const variantById = useMemo(
    () => new Map(catalog.variants.map((v) => [v.id, v])),
    [catalog.variants],
  );
  const cities = useMemo(() => (deptCode ? getCitiesByDeptCode(deptCode) : []), [deptCode]);

  const marginSummary = useMemo(() => {
    const mapped = rows.flatMap((r) => {
      const v = variantById.get(r.variantId);
      if (!v) return [];
      const qty = Math.max(1, Number.parseInt(r.qty || "1", 10) || 1);
      const designUnits = Math.max(1, Number.parseInt(r.designUnits || "1", 10) || 1);
      const unitPriceCents = Math.max(0, Number.parseInt(r.unitPricePesos || "0", 10) || 0) * 100;
      return [
        {
          sku: v.sku,
          qty,
          designUnits,
          unitPriceCents,
          unitCostCents: v.unitCostCents,
        },
      ];
    });
    const discountCents = Math.max(0, Number.parseInt(discountPesos || "0", 10) || 0) * 100;
    const shippingCents = Math.max(0, Number.parseInt(shippingPesos || "0", 10) || 0) * 100;
    return computeProposalMarginSummary({ items: mapped, discountCents, shippingCents });
  }, [discountPesos, rows, shippingPesos, variantById]);

  const addRow = () => {
    const first = catalog.variants[0];
    if (!first || rows.length >= 20) return;
    setRows((prev) => [
      ...prev,
      {
        key: `row-${Date.now()}-${prev.length}`,
        variantId: first.id,
        qty: "25",
        designUnits: "1",
        unitPricePesos: String(Math.round(first.baseUnitPriceCents / 100)),
        packagingNote: "",
      },
    ]);
  };

  const updateRowVariant = (key: string, nextVariantId: string) => {
    const v = variantById.get(nextVariantId);
    if (!v) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const qty = Math.max(1, Number.parseInt(r.qty || "25", 10) || 25);
        const tierPrice = applyVolumePricing(
          v.baseUnitPriceCents,
          catalog.tiers,
          v.productId,
          qty,
          1,
          v.id,
        );
        return {
          ...r,
          variantId: v.id,
          unitPricePesos: String(Math.round(tierPrice / 100)),
        };
      }),
    );
  };

  const applySuggestedTierToRow = (key: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const v = variantById.get(r.variantId);
        if (!v) return r;
        const qty =
          Math.max(1, Number.parseInt(r.qty || "1", 10) || 1) *
          Math.max(1, Number.parseInt(r.designUnits || "1", 10) || 1);
        const tierPrice = applyVolumePricing(
          v.baseUnitPriceCents,
          catalog.tiers,
          v.productId,
          qty,
          1,
          v.id,
        );
        return { ...r, unitPricePesos: String(Math.round(tierPrice / 100)) };
      }),
    );
  };

  const handleQuoteShipping = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await quoteB2bProposalShippingAction({
        cityCode,
        departmentCode: deptCode,
        items: rows.map((r) => ({
          variantId: r.variantId,
          qty: Math.max(1, Number.parseInt(r.qty || "1", 10) || 1),
          designUnits: Math.max(1, Number.parseInt(r.designUnits || "1", 10) || 1),
          unitPricePesos: Math.max(0, Number.parseInt(r.unitPricePesos || "0", 10) || 0),
        })),
      });
      if (!res.ok) {
        setFeedback({ error: res.error });
        return;
      }
      setQuotes(res.quotes);
      setQuoteMeta({
        weightKg: res.totalWeightKg,
        suggestedBoxes: res.suggestedPackageCount,
        estimated: res.estimated,
      });
      if (res.suggestedPackageCount > 1) {
        setPackageCount(String(res.suggestedPackageCount));
        setShippingMode("PACTED_MANUAL");
      }
      const best = res.quotes[0];
      if (best) {
        setShippingCarrier(best.carrier);
        setShippingService(best.carrierName);
        setShippingPesos(String(Math.round(best.fleteCents / 100) * res.suggestedPackageCount));
      }
    });
  };

  const buildPayload = (proposalIdOverride?: string) => ({
    opportunityId,
    proposalId: proposalIdOverride ?? editingProposalId,
    validUntilDate,
    proofMode,
    artworkMode,
    packagingType,
    estimatedProductionDays: Number.parseInt(estimatedProductionDays || "4", 10) || 4,
    shippingMode,
    shippingCarrier,
    shippingService,
    packageCount: Number.parseInt(packageCount || "1", 10) || 1,
    departmentCode: deptCode,
    cityCode,
    shippingPesos: Number.parseInt(shippingPesos || "0", 10) || 0,
    discountPesos: Number.parseInt(discountPesos || "0", 10) || 0,
    allowDirectTransfer,
    allowBelowCostOverride,
    clientNotes,
    termsNotes,
    items: rows.map((r) => ({
      variantId: r.variantId,
      qty: Math.max(1, Number.parseInt(r.qty || "1", 10) || 1),
      designUnits: Math.max(1, Number.parseInt(r.designUnits || "1", 10) || 1),
      unitPricePesos: Math.max(0, Number.parseInt(r.unitPricePesos || "0", 10) || 0),
      packagingNote: r.packagingNote,
      designId: "",
    })),
  });

  const handleSaveDraft = (forceNewVersion = false) => {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveProposalDraftAction(buildPayload(forceNewVersion ? "" : undefined));
      if (!res.ok) {
        setFeedback({ error: res.error });
        return;
      }
      setEditingProposalId(res.proposalId);
      if (forceNewVersion) {
        setHasProofUploaded(false);
        setProofPreviewUrl(null);
      }
      setFeedback({
        success: `Borrador ${res.proposalNumber} (v${res.version}) guardado correctamente.`,
      });
    });
  };

  const handleProofUpload = (file: File | null) => {
    if (!file) return;
    setFeedback(null);
    startTransition(async () => {
      let targetProposalId = editingProposalId;
      if (!targetProposalId) {
        const draftRes = await saveProposalDraftAction(buildPayload(""));
        if (!draftRes.ok) {
          setFeedback({ error: draftRes.error });
          return;
        }
        targetProposalId = draftRes.proposalId;
        setEditingProposalId(targetProposalId);
      }
      const fd = new FormData();
      fd.set("proposalId", targetProposalId);
      fd.set("opportunityId", opportunityId);
      fd.set("proofFile", file);
      const up = await uploadProposalProofAction(fd);
      if (!up.ok) {
        setFeedback({ error: up.error });
        return;
      }
      setHasProofUploaded(true);
      setProofPreviewUrl(up.proofUrl);
      setFeedback({ success: "Muestra digital adjuntada a la propuesta." });
    });
  };

  const handleSendProposal = (sendEmailToClient: boolean) => {
    setFeedback(null);
    startTransition(async () => {
      const draftRes = await saveProposalDraftAction(buildPayload());
      if (!draftRes.ok) {
        setFeedback({ error: draftRes.error });
        return;
      }
      setEditingProposalId(draftRes.proposalId);
      const sent = await sendProposalAction({
        proposalId: draftRes.proposalId,
        sendEmailToClient,
      });
      if (!sent.ok) {
        setFeedback({ error: sent.error });
        return;
      }
      const fullUrl = `${siteOrigin}${sent.publicPath}`;
      setIssuedLink({
        proposalNumber: sent.proposalNumber,
        fullUrl,
        emailedTo: sent.emailedTo,
      });
      setEditingProposalId(""); // La versión quedó en SENT; el próximo guardado creará v+1 si se necesita
      setFeedback({
        success: sent.emailedTo
          ? `Propuesta ${sent.proposalNumber} emitida y enviada a ${sent.emailedTo}.`
          : `Enlace privado generado para ${sent.proposalNumber}. Compártelo con el cliente.`,
      });
    });
  };

  const copyLink = async () => {
    if (!issuedLink) return;
    await navigator.clipboard.writeText(issuedLink.fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const waShareUrl = useMemo(() => {
    if (!issuedLink || !contactWhatsappE164) return null;
    const digits = contactWhatsappE164.replace(/\D/g, "");
    if (!digits) return null;
    const msg = `Hola ${contactName}, preparamos tu propuesta formal ${issuedLink.proposalNumber} en Lucams Shop (${opportunityNumber}). Puedes revisarla, confirmar dirección y aprobarla en este enlace privado: ${issuedLink.fullUrl}`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  }, [contactName, contactWhatsappE164, issuedLink, opportunityNumber]);

  return (
    <AdminCard className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div>
          <h2 className="text-brand-purple-dark font-display text-base font-bold">
            Propuesta formal B2B y enlace de pago
          </h2>
          <p className="text-brand-muted mt-0.5 text-xs">
            Arma versiones formales con cálculo de margen BOM en vivo, cotización logística y enlace
            privado para que el cliente apruebe y pague convirtiéndose en un pedido real.
          </p>
        </div>
        {existingProposals.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => handleSaveDraft(true)}
            className="text-xs"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nueva versión borrador
          </Button>
        )}
      </div>

      {/* Historial de versiones emitidas / borradores */}
      {existingProposals.length > 0 && (
        <div className="space-y-2">
          <p className="text-brand-purple-dark text-xs font-bold">Versiones de propuesta</p>
          <div className="divide-y rounded-xl border bg-[#FFF8F0]/40 text-xs">
            {existingProposals.map((p) => {
              const st = isProposalStatus(p.status) ? p.status : "DRAFT";
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-slate-800">{p.number}</span>
                    <AdminBadge tone={PROPOSAL_STATUS_TONES[st]}>
                      {PROPOSAL_STATUS_LABELS[st]}
                    </AdminBadge>
                    <span className="font-semibold text-slate-700">{formatCOP(p.totalCents)}</span>
                    <span className="text-brand-muted">
                      Vence: {formatDateCO(new Date(p.validUntilIso))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.orderNumber && (
                      <Link
                        href={`/admin/pedidos/${encodeURIComponent(p.orderNumber)}`}
                        className="font-mono font-semibold text-emerald-800 underline underline-offset-2"
                      >
                        {p.orderNumber} ({p.orderStatus})
                      </Link>
                    )}
                    {p.status === "SENT" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          startTransition(async () => {
                            const sent = await sendProposalAction({
                              proposalId: p.id,
                              sendEmailToClient: false,
                            });
                            if (sent.ok) {
                              setIssuedLink({
                                proposalNumber: sent.proposalNumber,
                                fullUrl: `${siteOrigin}${sent.publicPath}`,
                                emailedTo: null,
                              });
                            } else {
                              setFeedback({ error: sent.error });
                            }
                          });
                        }}
                        className="h-8 text-[11px]"
                      >
                        Regenerar enlace
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {issuedLink && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-50/70 p-4 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-bold">
            <FileCheck2 className="h-4 w-4 text-emerald-700" />
            Enlace privado activo para {issuedLink.proposalNumber}
          </div>
          <p className="mt-1 text-emerald-900/85">
            {issuedLink.emailedTo
              ? `Se envió por correo a ${issuedLink.emailedTo}. También puedes copiar el enlace o enviarlo por WhatsApp (guárdalo: por seguridad solo se muestra una vez en claro).`
              : "Guarda o comparte este enlace ahora (por seguridad solo almacenamos su hash en la base de datos)."}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="max-w-full flex-1 truncate rounded-lg border border-emerald-600/25 bg-white px-3 py-2 font-mono text-[11px]">
              {issuedLink.fullUrl}
            </code>
            <Button type="button" size="sm" variant="outline" onClick={copyLink}>
              {copied ? (
                <Check className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-1 h-3.5 w-3.5" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>
            {waShareUrl && (
              <a
                href={waShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <WhatsAppIcon className="h-3.5 w-3.5" />
                Enviar por WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {feedback?.error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
          {feedback.error}
        </div>
      )}
      {feedback?.success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800">
          {feedback.success}
        </div>
      )}

      {/* Líneas de la propuesta */}
      <div className="space-y-3">
        <Label className="text-brand-purple-dark text-xs font-bold">
          1. Referencias, cantidades y precios negociados
        </Label>
        {rows.map((row, idx) => {
          const v = variantById.get(row.variantId);
          const qty = Math.max(1, Number.parseInt(row.qty || "1", 10) || 1);
          const dUnits = Math.max(1, Number.parseInt(row.designUnits || "1", 10) || 1);
          const unitCents = (Number.parseInt(row.unitPricePesos || "0", 10) || 0) * 100;
          const belowBom = v?.unitCostCents != null && unitCents < v.unitCostCents;

          return (
            <div key={row.key} className="space-y-2.5 rounded-xl border bg-slate-50/70 p-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <Label className="text-[11px] text-slate-600">Producto / Opción</Label>
                  <select
                    value={row.variantId}
                    onChange={(e) => updateRowVariant(row.key, e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border bg-white px-2.5 text-xs"
                  >
                    {catalog.variants.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.productName} · {opt.name} ({opt.sku})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-[11px] text-slate-600">
                    {v && v.piecesPerUnit > 1 ? `Packs (×${v.piecesPerUnit})` : "Copias / Uds."}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key ? { ...r, qty: e.target.value.replace(/\D/g, "") } : r,
                        ),
                      )
                    }
                    className="mt-1 h-9 bg-white text-xs"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-[11px] text-slate-600">Diseños/tanda</Label>
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    value={row.designUnits}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key
                            ? { ...r, designUnits: e.target.value.replace(/\D/g, "") }
                            : r,
                        ),
                      )
                    }
                    className="mt-1 h-9 bg-white text-xs"
                  />
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-[11px] text-slate-600">Precio unit. (COP)</Label>
                  <div className="mt-1 flex gap-1">
                    <Input
                      type="number"
                      min={0}
                      value={row.unitPricePesos}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, unitPricePesos: e.target.value.replace(/\D/g, "") }
                              : r,
                          ),
                        )
                      }
                      className="h-9 bg-white text-xs font-semibold"
                    />
                    {rows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRows((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
                        aria-label="Eliminar línea"
                        className="h-9 px-2 text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-3 text-slate-600">
                  <span>
                    Base catálogo: <strong>{v ? formatCOP(v.baseUnitPriceCents) : "—"}</strong>
                  </span>
                  <span>
                    Costo BOM:{" "}
                    <strong>
                      {v?.unitCostCents != null ? formatCOP(v.unitCostCents) : "Sin definir"}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => applySuggestedTierToRow(row.key)}
                    className="text-brand-purple font-semibold underline underline-offset-2"
                  >
                    Aplicar escala mayorista
                  </button>
                  {belowBom && <span className="font-bold text-rose-700">⚠ Bajo costo BOM</span>}
                </div>
                <span className="font-semibold text-slate-800">
                  Subtotal línea: {formatCOP(unitCents * qty * dUnits)}
                </span>
              </div>

              <Input
                placeholder="Nota de taller / presentación para esta línea (ej. bolsita individual con sticker)..."
                value={row.packagingNote}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.key === row.key ? { ...r, packagingNote: e.target.value } : r,
                    ),
                  )
                }
                maxLength={240}
                className="h-8 bg-white text-xs"
              />
            </div>
          );
        })}

        <Button type="button" variant="outline" size="sm" onClick={addRow} className="text-xs">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Agregar referencia
        </Button>
      </div>

      {/* Condiciones operativas y Muestra Digital */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs font-semibold">Vigencia de la propuesta</Label>
          <Input
            type="date"
            value={validUntilDate}
            onChange={(e) => setValidUntilDate(e.target.value)}
            className="mt-1 h-9 bg-white text-xs"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold">Días hábiles taller</Label>
          <Input
            type="number"
            min={1}
            max={90}
            value={estimatedProductionDays}
            onChange={(e) => setEstimatedProductionDays(e.target.value.replace(/\D/g, ""))}
            className="mt-1 h-9 bg-white text-xs"
          />
        </div>
        <div>
          <Label className="text-xs font-semibold">Descuento global (COP)</Label>
          <Input
            type="number"
            min={0}
            value={discountPesos}
            onChange={(e) => setDiscountPesos(e.target.value.replace(/\D/g, ""))}
            className="mt-1 h-9 bg-white text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs font-semibold">Modalidad de arte</Label>
          <select
            value={artworkMode}
            onChange={(e) => setArtworkMode(e.target.value as B2bArtworkMode)}
            className="mt-1 h-9 w-full rounded-md border bg-white px-2.5 text-xs"
          >
            {B2B_ARTWORK_MODES.map((m) => (
              <option key={m} value={m}>
                {B2B_ARTWORK_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold">Empaque acordado</Label>
          <select
            value={packagingType}
            onChange={(e) => setPackagingType(e.target.value as B2bPackagingType)}
            className="mt-1 h-9 w-full rounded-md border bg-white px-2.5 text-xs"
          >
            {B2B_PACKAGING_TYPES.map((p) => (
              <option key={p} value={p}>
                {B2B_PACKAGING_TYPE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs font-semibold">Momento de muestra digital</Label>
          <select
            value={proofMode}
            onChange={(e) => setProofMode(e.target.value as ProposalProofMode)}
            className="mt-1 h-9 w-full rounded-md border bg-white px-2.5 text-xs"
          >
            {PROPOSAL_PROOF_MODES.map((pm) => (
              <option key={pm} value={pm}>
                {PROPOSAL_PROOF_MODE_LABELS[pm]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Carga de Muestra Digital cuando aplica */}
      <div className="rounded-xl border border-dashed bg-[#FFF8F0]/50 p-3.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-bold text-slate-800">
              Muestra digital para el enlace del cliente{" "}
              {proofMode === "BEFORE_PAYMENT" ? "(obligatoria antes de enviar)" : "(opcional)"}
            </p>
            <p className="text-brand-muted text-[11px]">
              Se almacena en bucket privado y solo se sirve con el token secreto de la propuesta.
            </p>
          </div>
          <label className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 font-semibold">
            <Upload className="h-3.5 w-3.5" />
            {hasProofUploaded ? "Reemplazar imagen" : "Subir muestra"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={isPending}
              onChange={(e) => handleProofUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {proofPreviewUrl && (
          <p className="mt-2 font-medium text-emerald-800">
            ✓ Muestra digital adjunta ({" "}
            <a
              href={proofPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              ver vista previa privada
            </a>{" "}
            )
          </p>
        )}
      </div>

      {/* Cotizador Logístico Aveonline / LUCAMS / Multi-caja */}
      <div className="space-y-3 rounded-xl border bg-slate-50/70 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Truck className="text-brand-purple h-4 w-4" />
            2. Logística de entrega (Aveonline / LUCAMS / Multi-caja)
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={handleQuoteShipping}
            className="h-8 text-xs"
          >
            {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Cotizar envío en vivo
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
          <div>
            <Label className="text-[11px] text-slate-600">Departamento DANE</Label>
            <select
              value={deptCode}
              onChange={(e) => {
                const nextDept = e.target.value;
                setDeptCode(nextDept);
                const firstCity = getCitiesByDeptCode(nextDept)[0];
                setCityCode(firstCity?.code ?? "");
              }}
              className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[11px] text-slate-600">Municipio DANE</Label>
            <select
              value={cityCode}
              onChange={(e) => setCityCode(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs"
            >
              {cities.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[11px] text-slate-600">Modalidad logística</Label>
            <select
              value={shippingMode}
              onChange={(e) => setShippingMode(e.target.value as ProposalShippingMode)}
              className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-xs"
            >
              {PROPOSAL_SHIPPING_MODES.map((sm) => (
                <option key={sm} value={sm}>
                  {PROPOSAL_SHIPPING_MODE_LABELS[sm]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-slate-600">Cajas</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={packageCount}
                onChange={(e) => setPackageCount(e.target.value.replace(/\D/g, ""))}
                className="mt-1 h-9 bg-white text-xs"
              />
            </div>
            <div>
              <Label className="text-[11px] text-slate-600">Flete (COP)</Label>
              <Input
                type="number"
                min={0}
                value={shippingPesos}
                onChange={(e) => setShippingPesos(e.target.value.replace(/\D/g, ""))}
                className="mt-1 h-9 bg-white text-xs font-semibold"
              />
            </div>
          </div>
        </div>

        {quoteMeta && (
          <p className="text-[11px] text-slate-600">
            Peso consolidado estimado: <strong>{quoteMeta.weightKg} kg</strong> · Cajas sugeridas:{" "}
            <strong>{quoteMeta.suggestedBoxes}</strong>
            {quoteMeta.estimated ? " · (tarifa de respaldo en caché)" : ""}
          </p>
        )}

        {quotes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quotes.map((q) => {
              const selected = shippingCarrier === q.carrier;
              return (
                <button
                  key={q.carrier}
                  type="button"
                  onClick={() => {
                    setShippingCarrier(q.carrier);
                    setShippingService(q.carrierName);
                    const boxes = Math.max(1, Number.parseInt(packageCount || "1", 10) || 1);
                    setShippingPesos(String(Math.round(q.fleteCents / 100) * boxes));
                    if (boxes === 1) setShippingMode("QUOTED");
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                    selected
                      ? "border-brand-purple bg-brand-purple/10 font-bold text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {q.carrierName} · {formatCOP(q.fleteCents)} ({q.deliveryDays}d)
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Medios de pago y Notas */}
      <div className="space-y-3">
        <label className="flex items-start gap-2.5 rounded-xl border bg-[#FFF8F0]/50 p-3 text-xs">
          <input
            type="checkbox"
            checked={allowDirectTransfer}
            disabled={!directPaymentConfigured}
            onChange={(e) => setAllowDirectTransfer(e.target.checked)}
            className="accent-brand-purple mt-0.5 h-4 w-4 rounded"
          />
          <div>
            <span className="font-bold text-slate-800">
              Habilitar opción «Pago directo por Bre-B o Transferencia bancaria» en esta propuesta
            </span>
            <p className="text-brand-muted mt-0.5 text-[11px]">
              {directPaymentConfigured
                ? "Wompi en línea (100 % automático) permanece activo por defecto. Al activar esta casilla, el cliente también podrá transferir sin comisión de pasarela y reportar su comprobante para tu confirmación en 1 clic con MFA."
                : "Configura DIRECT_PAYMENT_BREB_KEY o cuenta bancaria en las variables del servidor para habilitar esta opción."}
            </p>
          </div>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold">Mensaje para el cliente (visible)</Label>
            <Textarea
              rows={2}
              value={clientNotes}
              onChange={(e) => setClientNotes(e.target.value)}
              placeholder="Ej. Incluye adaptación de logotipo e impresión fotográfica laminada UV."
              className="mt-1 bg-white text-xs"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold">Términos de esta propuesta</Label>
            <Textarea
              rows={2}
              value={termsNotes}
              onChange={(e) => setTermsNotes(e.target.value)}
              className="mt-1 bg-white text-xs"
            />
          </div>
        </div>
      </div>

      {/* Semáforo de Margen BOM y Total */}
      <div className="rounded-2xl border bg-slate-900 p-4 text-white">
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-white/65">Mercancía neta</p>
            <p className="mt-0.5 text-sm font-bold">
              {formatCOP(marginSummary.merchandiseNetCents)}
            </p>
          </div>
          <div>
            <p className="text-white/65">Envío</p>
            <p className="mt-0.5 text-sm font-bold">{formatCOP(marginSummary.shippingCents)}</p>
          </div>
          <div>
            <p className="text-white/65">Margen s/ BOM</p>
            <p
              className={`mt-0.5 text-sm font-bold ${
                marginSummary.marginPct === null
                  ? "text-amber-300"
                  : marginSummary.marginPct < 0
                    ? "text-rose-400"
                    : marginSummary.marginPct < 20
                      ? "text-amber-300"
                      : "text-emerald-400"
              }`}
            >
              {marginSummary.grossMarginCents !== null && marginSummary.marginPct !== null
                ? `${formatCOP(marginSummary.grossMarginCents)} (${marginSummary.marginPct}%)`
                : "Falta costo BOM"}
            </p>
          </div>
          <div>
            <p className="text-white/65">Total a cobrar</p>
            <p className="mt-0.5 text-base font-extrabold text-[#5DD9D1]">
              {formatCOP(marginSummary.totalCents)}
            </p>
          </div>
        </div>

        {marginSummary.hasBelowCostLine && (
          <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-950/60 p-2.5 text-xs text-rose-100">
            <p className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="h-4 w-4 text-rose-300" />
              Propuesta por debajo del costo unitario BOM ({marginSummary.belowCostSkus.join(", ")})
            </p>
            {isSuperadmin ? (
              <label className="mt-1.5 flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={allowBelowCostOverride}
                  onChange={(e) => setAllowBelowCostOverride(e.target.checked)}
                />
                Autorizo explícitamente como SUPERADMIN guardar/emitir bajo costo BOM.
              </label>
            ) : (
              <p className="mt-1 text-[11px]">
                Solo SUPERADMIN puede autorizar una propuesta por debajo del costo de producción.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Acciones de guardado y emisión */}
      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => handleSaveDraft(false)}
        >
          <Save className="mr-1.5 h-4 w-4" />
          Guardar borrador
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => handleSendProposal(false)}
        >
          Generar solo enlace privado
        </Button>
        <Button
          type="button"
          disabled={isPending || !contactEmail}
          onClick={() => handleSendProposal(true)}
          className="bg-brand-purple hover:bg-brand-purple-dark text-white"
        >
          {isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          Emitir y enviar por correo
        </Button>
      </div>
    </AdminCard>
  );
}
