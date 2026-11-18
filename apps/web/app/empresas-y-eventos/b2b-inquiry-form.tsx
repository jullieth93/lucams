"use client";

/*
 * Configurador consultivo interactivo B2B / Eventos en `/empresas-y-eventos` (`ADR-210`).
 *
 * Capacidades:
 *   1. Selección multi-línea (1..5 referencias/tamaños/imán reales del catálogo activo)
 *      con traducción transparente de packs a piezas físicas, o modo asesoría abierta.
 *   2. Adaptación contextual Empresa vs. Evento Social (oculta NIT y jerga contable en
 *      bodas/colegios; gatea soporte tributario con `billingDocumentEnabled`).
 *   3. Preferencias estructuradas de arte (4 modos) y empaque (3 modos).
 *   4. Semáforo de viabilidad de fecha en días hábiles colombianos (`America/Bogota`).
 *   5. Rango económico orientativo no vinculante conforme a Ley 1480 arts. 23 y 29.
 */

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Heart,
  Info,
  Loader2,
  Package,
  Palette,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmailInput } from "@/components/email-input";
import { PhoneInput } from "@/components/phone-input";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { WhatsAppIcon } from "@/components/icons/brand";
import {
  DEPARTMENTS,
  getCitiesByDeptCode,
  getCityByCode,
  type DaneCity,
} from "@/lib/dane-divipola";
import {
  capitalizeName,
  normalizeAndValidateNit,
  normalizePhoneWithDial,
  personNameError,
} from "@/lib/colombia-validators";
import { formatCOP } from "@/lib/format";
import { formatIsoDateCO } from "@/lib/datetime";
import {
  B2B_ARTWORK_MODE_HINTS,
  B2B_ARTWORK_MODE_LABELS,
  B2B_ARTWORK_MODES,
  B2B_PACKAGING_TYPE_HINTS,
  B2B_PACKAGING_TYPE_LABELS,
  B2B_PACKAGING_TYPES,
  isCorporateEventType,
  OPPORTUNITY_EVENT_LABELS,
  OPPORTUNITY_EVENT_TYPES,
  type B2bArtworkMode,
  type B2bInquiryInput,
  type B2bPackagingType,
  type OpportunityEventType,
} from "@/features/opportunities/schemas";
import {
  computeConfiguratorEstimate,
  evaluateEventDateFeasibility,
  MIN_B2B_PHYSICAL_UNITS,
  type ConfiguratorCatalogPayload,
  type ConfiguratorProductOption,
} from "@/features/opportunities/configurator-math";
import {
  submitB2bInquiryAction,
  type B2bPublicActionState,
} from "@/features/opportunities/actions";

type Props = {
  catalog: ConfiguratorCatalogPayload;
  billingDocumentEnabled: boolean;
  waSupportUrl: string;
  initialUtmSource?: string;
  initialUtmMedium?: string;
  initialUtmCampaign?: string;
  initialUnits?: string;
  initialProductSlug?: string;
};

type LineDraft = {
  key: string;
  productId: string;
  variantId: string;
  commercialQty: string;
};

const QUICK_UNIT_TIERS = [25, 50, 100, 250, 500] as const;
const MAX_CONFIG_LINES = 5;
const MAX_FULL_NAME_WORDS = 5;

function matchInitialProduct(
  products: readonly ConfiguratorProductOption[],
  raw?: string,
): ConfiguratorProductOption | undefined {
  if (!raw) return products[0];
  const needle = raw.trim().toLowerCase();
  if (!needle) return products[0];
  return (
    products.find(
      (p) =>
        p.slug.toLowerCase() === needle ||
        p.name.toLowerCase() === needle ||
        p.name.toLowerCase().includes(needle),
    ) ?? products[0]
  );
}

export function B2bInquiryForm({
  catalog,
  billingDocumentEnabled,
  waSupportUrl,
  initialUtmSource = "",
  initialUtmMedium = "",
  initialUtmCampaign = "",
  initialUnits,
  initialProductSlug,
}: Props) {
  const [state, formAction, pending] = useActionState<B2bPublicActionState, FormData>(
    submitB2bInquiryAction,
    null,
  );

  const hasCatalog = catalog.products.length > 0;
  const parsedInitialUnits = useMemo(() => {
    const n = initialUnits ? Number.parseInt(initialUnits, 10) : Number.NaN;
    return Number.isFinite(n) && n >= 25 && n <= 50_000 ? n : 60;
  }, [initialUnits]);

  const [eventType, setEventType] = useState<OpportunityEventType>("CORPORATE_GIFT");
  const [configMode, setConfigMode] = useState<"CATALOG_LINES" | "ADVISORY_OPEN">(
    hasCatalog ? "CATALOG_LINES" : "ADVISORY_OPEN",
  );
  const [lines, setLines] = useState<LineDraft[]>(() => {
    const firstProd = matchInitialProduct(catalog.products, initialProductSlug);
    const firstVar = firstProd?.variants[0];
    if (!firstProd || !firstVar) return [];
    const initialCommercial = Math.max(
      1,
      Math.ceil(parsedInitialUnits / Math.max(1, firstVar.piecesPerUnit)),
    );
    return [
      {
        key: "line-0",
        productId: firstProd.id,
        variantId: firstVar.id,
        commercialQty: String(initialCommercial),
      },
    ];
  });
  const [advisoryUnits, setAdvisoryUnits] = useState<string>(String(parsedInitialUnits));
  const [artworkMode, setArtworkMode] = useState<B2bArtworkMode>("SAME_DESIGN");
  const [packagingType, setPackagingType] = useState<B2bPackagingType>("BULK_STANDARD");
  const [eventDate, setEventDate] = useState<string>("");
  const [contactName, setContactName] = useState<string>("");
  const [organizationName, setOrganizationName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<{ national: string; dial: string }>({
    national: "",
    dial: "57",
  });
  const [nit, setNit] = useState<string>("");
  const [deptCode, setDeptCode] = useState<string>("");
  const [cityCode, setCityCode] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [acceptHabeasData, setAcceptHabeasData] = useState<boolean>(false);
  const [acceptNewsletter, setAcceptNewsletter] = useState<boolean>(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));
  const todayIso = useMemo(() => formatIsoDateCO(new Date()), []);
  const isCorporate = isCorporateEventType(eventType);

  const cities = useMemo<DaneCity[]>(
    () => (deptCode ? getCitiesByDeptCode(deptCode) : []),
    [deptCode],
  );
  const selectedDept = useMemo(() => DEPARTMENTS.find((d) => d.code === deptCode), [deptCode]);
  const selectedCity = useMemo(() => getCityByCode(cityCode), [cityCode]);

  const normalizedLinesForCalc = useMemo(
    () =>
      lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        commercialQty: Math.max(1, Number.parseInt(l.commercialQty || "0", 10) || 0),
      })),
    [lines],
  );

  const estimate = useMemo(
    () => computeConfiguratorEstimate(catalog, normalizedLinesForCalc, artworkMode, packagingType),
    [catalog, normalizedLinesForCalc, artworkMode, packagingType],
  );

  const effectiveTotalPieces =
    configMode === "CATALOG_LINES"
      ? estimate.totalPhysicalPieces
      : Math.max(0, Number.parseInt(advisoryUnits || "0", 10) || 0);

  const maxProdDays = useMemo(() => {
    if (configMode !== "CATALOG_LINES") return 2;
    let maxD = 2;
    for (const line of lines) {
      const prod = catalog.products.find((p) => p.id === line.productId);
      if (prod && prod.productionDays > maxD) maxD = prod.productionDays;
    }
    return maxD;
  }, [catalog.products, configMode, lines]);

  const dateFeasibility = useMemo(
    () =>
      evaluateEventDateFeasibility({
        todayIso,
        eventDateIso: eventDate,
        cityCode: cityCode || null,
        cityName: selectedCity?.name ?? null,
        totalPhysicalPieces: Math.max(MIN_B2B_PHYSICAL_UNITS, effectiveTotalPieces),
        maxBaseProductionDays: maxProdDays,
        artworkMode,
        packagingType,
      }),
    [
      artworkMode,
      cityCode,
      effectiveTotalPieces,
      eventDate,
      maxProdDays,
      packagingType,
      selectedCity?.name,
      todayIso,
    ],
  );

  const srvErr = (field: keyof B2bInquiryInput | string): string | null => {
    if (!state || state.ok) return null;
    const map = state.fieldErrors as Record<string, string[] | undefined> | undefined;
    return map?.[field]?.[0] ?? null;
  };

  const contactNameLiveErr = touched.contactName
    ? personNameError(contactName, MAX_FULL_NAME_WORDS)
    : null;
  const contactNameErr = contactNameLiveErr ?? srvErr("contactName");

  const phoneLiveErr =
    touched.whatsapp &&
    phone.national.length > 0 &&
    normalizePhoneWithDial(`+${phone.dial} ${phone.national}`) === null
      ? phone.dial === "57"
        ? "Móvil colombiano: 10 dígitos empezando con 3 (ej. 300 123 4567)."
        : "Revisa el número: debe tener entre 6 y 15 dígitos."
      : null;
  const whatsappErr = phoneLiveErr ?? srvErr("whatsapp");

  const nitCheck = useMemo(() => (nit.trim() ? normalizeAndValidateNit(nit) : null), [nit]);
  const nitLiveErr = touched.nit && nitCheck && !nitCheck.valid ? nitCheck.error : null;
  const nitErr = nitLiveErr ?? srvErr("nit");
  const nitAutoDvHint =
    nitCheck && nitCheck.valid && nitCheck.providedDv === null
      ? `Dígito de verificación DIAN: ${nitCheck.expectedDv} (se guardará ${nitCheck.normalized})`
      : null;

  const addLine = () => {
    if (lines.length >= MAX_CONFIG_LINES || catalog.products.length === 0) return;
    const usedVariantIds = new Set(lines.map((l) => l.variantId));
    let chosenProd = catalog.products[0]!;
    let chosenVar = chosenProd.variants[0]!;
    outer: for (const p of catalog.products) {
      for (const v of p.variants) {
        if (!usedVariantIds.has(v.id)) {
          chosenProd = p;
          chosenVar = v;
          break outer;
        }
      }
    }
    const defaultQty = Math.max(1, Math.ceil(30 / Math.max(1, chosenVar.piecesPerUnit)));
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}-${prev.length}`,
        productId: chosenProd.id,
        variantId: chosenVar.id,
        commercialQty: String(defaultQty),
      },
    ]);
  };

  const removeLine = (key: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const updateLineProduct = (key: string, nextProductId: string) => {
    const prod = catalog.products.find((p) => p.id === nextProductId);
    const firstVar = prod?.variants[0];
    if (!prod || !firstVar) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const currentPhysical =
          (Number.parseInt(l.commercialQty || "0", 10) || MIN_B2B_PHYSICAL_UNITS) *
          (catalog.products
            .find((p) => p.id === l.productId)
            ?.variants.find((v) => v.id === l.variantId)?.piecesPerUnit ?? 1);
        const adaptedQty = Math.max(
          1,
          Math.ceil(Math.max(MIN_B2B_PHYSICAL_UNITS, currentPhysical) / firstVar.piecesPerUnit),
        );
        return {
          ...l,
          productId: prod.id,
          variantId: firstVar.id,
          commercialQty: String(adaptedQty),
        };
      }),
    );
  };

  const updateLineVariant = (key: string, nextVariantId: string) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, variantId: nextVariantId } : l)));
  };

  const updateLineQty = (key: string, rawQty: string) => {
    const digits = rawQty.replace(/\D/g, "").slice(0, 6);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, commercialQty: digits } : l)));
  };

  if (state?.ok) {
    return (
      <div className="border-brand-purple/20 rounded-3xl border bg-gradient-to-br from-[#FFF8F0] via-white to-[#5DD9D1]/10 p-6 text-center shadow-sm sm:p-8">
        <div className="bg-brand-purple/15 text-brand-purple mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="font-display text-brand-purple-dark mt-4 text-2xl font-bold">
          ¡Recibimos la configuración de tu proyecto!
        </h3>
        <p className="text-brand-purple-dark/80 mx-auto mt-2 max-w-md text-sm">
          Te enviamos copia por correo electrónico y en menos de 24 horas hábiles recibirás tu
          propuesta formal con enlace privado de aprobación. Tu código de referencia es{" "}
          <span className="border-brand-purple/25 text-brand-purple-dark inline-block rounded-lg border bg-white px-2.5 py-0.5 font-mono text-xs font-bold">
            {state.opportunityNumber}
          </span>
          .
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={waSupportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-800"
          >
            <WhatsAppIcon className="h-4 w-4" />
            Adelantar logo o detalles por WhatsApp
          </a>
          <Link
            href="/productos"
            className="border-brand-purple/25 text-brand-purple-dark hover:bg-brand-purple/10 inline-flex min-h-11 items-center rounded-full border bg-white px-5 py-2.5 text-sm font-semibold transition-colors"
          >
            Explorar el catálogo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="eventType" value={eventType} />
      <input type="hidden" name="configMode" value={configMode} />
      <input type="hidden" name="artworkMode" value={artworkMode} />
      <input type="hidden" name="packagingType" value={packagingType} />
      <input type="hidden" name="cityCode" value={cityCode} />
      <input type="hidden" name="departmentCode" value={deptCode} />
      <input
        type="hidden"
        name="configuredLinesJson"
        value={configMode === "CATALOG_LINES" ? JSON.stringify(normalizedLinesForCalc) : ""}
      />
      {configMode === "CATALOG_LINES" && (
        <input
          type="hidden"
          name="expectedUnits"
          value={String(Math.max(0, estimate.totalPhysicalPieces))}
        />
      )}
      {!isCorporate && <input type="hidden" name="nit" value="" />}
      <input type="hidden" name="utmSource" value={initialUtmSource} />
      <input type="hidden" name="utmMedium" value={initialUtmMedium} />
      <input type="hidden" name="utmCampaign" value={initialUtmCampaign} />
      <input type="hidden" name="landingPath" value="/empresas-y-eventos" />

      {state && !state.ok && state.error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          {state.error}
        </div>
      )}

      {/* 1. Tipo de proyecto: adapta el lenguaje Empresa vs. Evento Social */}
      <div className="space-y-2.5">
        <Label className="text-brand-purple-dark text-sm font-semibold">
          1. ¿Para quién es este proyecto?
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPPORTUNITY_EVENT_TYPES.map((type) => {
            const active = eventType === type;
            const corporateType = isCorporateEventType(type);
            const Icon = corporateType ? Building2 : type === "WEDDING_SOCIAL" ? Heart : Sparkles;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setEventType(type)}
                className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-all ${
                  active
                    ? "border-brand-purple bg-brand-purple text-white shadow-xs"
                    : "border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 bg-[#FFF8F0]/50"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{OPPORTUNITY_EVENT_LABELS[type]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Selección de productos reales del catálogo o asesoría abierta */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-brand-purple-dark text-sm font-semibold">
            2. ¿Qué productos y cantidades necesitas?
          </Label>
          {hasCatalog && (
            <div className="border-brand-purple/15 inline-flex rounded-full border bg-[#FFF8F0] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setConfigMode("CATALOG_LINES")}
                className={`min-h-9 rounded-full px-3 py-1 font-semibold transition-colors ${
                  configMode === "CATALOG_LINES"
                    ? "bg-brand-purple text-white"
                    : "text-brand-purple-dark hover:text-brand-purple"
                }`}
              >
                Elegir referencias
              </button>
              <button
                type="button"
                onClick={() => setConfigMode("ADVISORY_OPEN")}
                className={`min-h-9 rounded-full px-3 py-1 font-semibold transition-colors ${
                  configMode === "ADVISORY_OPEN"
                    ? "bg-brand-purple text-white"
                    : "text-brand-purple-dark hover:text-brand-purple"
                }`}
              >
                Quiero asesoría abierta
              </button>
            </div>
          )}
        </div>

        {configMode === "CATALOG_LINES" && hasCatalog ? (
          <div className="space-y-3">
            {lines.map((line, idx) => {
              const prod =
                catalog.products.find((p) => p.id === line.productId) ?? catalog.products[0]!;
              const variant =
                prod.variants.find((v) => v.id === line.variantId) ?? prod.variants[0]!;
              const qtyNum = Math.max(0, Number.parseInt(line.commercialQty || "0", 10) || 0);
              const piecesNum = qtyNum * variant.piecesPerUnit;

              return (
                <div
                  key={line.key}
                  className="border-brand-purple/15 rounded-2xl border bg-[#FFF8F0]/45 p-3.5 sm:p-4"
                >
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <span className="text-brand-purple-dark inline-flex items-center gap-1.5 text-xs font-bold">
                      <Package className="text-brand-purple h-3.5 w-3.5" />
                      Referencia {idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                        aria-label={`Quitar referencia ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                    <div className="min-w-0 space-y-1 sm:col-span-5">
                      <Label
                        htmlFor={`cfg-prod-${line.key}`}
                        className="text-brand-muted text-[11px] font-semibold"
                      >
                        Producto del catálogo
                      </Label>
                      <select
                        id={`cfg-prod-${line.key}`}
                        value={prod.id}
                        onChange={(e) => updateLineProduct(line.key, e.target.value)}
                        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-11 w-full rounded-xl border bg-white px-3 text-xs font-medium focus:ring-2 focus:outline-none"
                      >
                        {catalog.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="min-w-0 space-y-1 sm:col-span-4">
                      <Label
                        htmlFor={`cfg-var-${line.key}`}
                        className="text-brand-muted text-[11px] font-semibold"
                      >
                        Tamaño / Acabado
                      </Label>
                      <select
                        id={`cfg-var-${line.key}`}
                        value={variant.id}
                        onChange={(e) => updateLineVariant(line.key, e.target.value)}
                        className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-11 w-full rounded-xl border bg-white px-3 text-xs font-medium focus:ring-2 focus:outline-none"
                      >
                        {prod.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({formatCOP(v.unitPriceCents)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="min-w-0 space-y-1 sm:col-span-3">
                      <Label
                        htmlFor={`cfg-qty-${line.key}`}
                        className="text-brand-muted text-[11px] font-semibold"
                      >
                        {variant.piecesPerUnit > 1
                          ? `Packs (×${variant.piecesPerUnit} uds.)`
                          : "Unidades"}
                      </Label>
                      <Input
                        id={`cfg-qty-${line.key}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100000}
                        value={line.commercialQty}
                        onChange={(e) => updateLineQty(line.key, e.target.value)}
                        className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-11 rounded-xl bg-white text-sm font-semibold"
                      />
                    </div>
                  </div>

                  {variant.piecesPerUnit > 1 && (
                    <p className="text-brand-purple-dark/80 mt-2 text-[11px] font-medium">
                      Equivale a <strong>{piecesNum.toLocaleString("es-CO")} piezas físicas</strong>{" "}
                      ({qtyNum} {qtyNum === 1 ? "pack" : "packs"} de {variant.piecesPerUnit}{" "}
                      unidades).
                    </p>
                  )}
                </div>
              );
            })}

            {lines.length < MAX_CONFIG_LINES && (
              <button
                type="button"
                onClick={addLine}
                className="border-brand-purple/25 text-brand-purple hover:bg-brand-purple/5 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed bg-white px-4 py-2 text-xs font-semibold transition-colors"
              >
                <Plus className="h-4 w-4" />
                Agregar otra referencia al proyecto (máx. {MAX_CONFIG_LINES})
              </button>
            )}

            {!estimate.meetsMinimumUnits && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  En este canal atendemos proyectos desde{" "}
                  <strong>{MIN_B2B_PHYSICAL_UNITS} unidades físicas</strong> (llevas{" "}
                  {estimate.totalPhysicalPieces}). Si necesitas menos unidades, puedes diseñarlas y
                  comprarlas al instante en nuestro{" "}
                  <Link href="/productos" className="font-semibold underline underline-offset-2">
                    catálogo online
                  </Link>
                  .
                </div>
              </div>
            )}

            {srvErr("configuredLinesJson") && (
              <p className="text-xs text-rose-700">{srvErr("configuredLinesJson")}</p>
            )}
            {srvErr("expectedUnits") && (
              <p className="text-xs text-rose-700">{srvErr("expectedUnits")}</p>
            )}
          </div>
        ) : (
          <div className="border-brand-purple/15 space-y-2 rounded-2xl border bg-[#FFF8F0]/45 p-4">
            <Label htmlFor="b2b-units" className="text-brand-purple-dark text-xs font-semibold">
              Cantidad total aproximada de unidades *
            </Label>
            <Input
              id="b2b-units"
              name="expectedUnits"
              type="number"
              inputMode="numeric"
              min={MIN_B2B_PHYSICAL_UNITS}
              max={100000}
              required
              value={advisoryUnits}
              onChange={(e) => setAdvisoryUnits(e.target.value.replace(/\D/g, ""))}
              aria-invalid={Boolean(srvErr("expectedUnits"))}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-11 bg-white"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUICK_UNIT_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setAdvisoryUnits(String(tier))}
                  className={`min-h-9 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                    advisoryUnits === String(tier)
                      ? "border-brand-purple bg-brand-purple/15 text-brand-purple-dark"
                      : "border-brand-purple/15 text-brand-muted hover:text-brand-purple-dark bg-white"
                  }`}
                >
                  {tier} uds.
                </button>
              ))}
            </div>
            {srvErr("expectedUnits") && (
              <p className="text-xs text-rose-700">{srvErr("expectedUnits")}</p>
            )}
          </div>
        )}
      </div>

      {/* 3. Preferencias de Arte y Empaque */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-semibold">
            <Palette className="text-brand-purple h-4 w-4" />
            3. Modalidad de diseño / arte
          </Label>
          <div className="space-y-1.5">
            {B2B_ARTWORK_MODES.map((mode) => {
              const active = artworkMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setArtworkMode(mode)}
                  className={`block min-h-11 w-full rounded-xl border px-3 py-2 text-left transition-all ${
                    active
                      ? "border-brand-purple bg-brand-purple/10 text-brand-purple-dark"
                      : "border-brand-purple/15 text-brand-purple-dark/85 hover:bg-brand-purple/5 bg-white"
                  }`}
                >
                  <p className="text-xs font-semibold">{B2B_ARTWORK_MODE_LABELS[mode]}</p>
                  <p className="text-brand-muted mt-0.5 text-[11px] leading-snug">
                    {B2B_ARTWORK_MODE_HINTS[mode]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-brand-purple-dark flex items-center gap-1.5 text-sm font-semibold">
            <Package className="text-brand-purple h-4 w-4" />
            4. Empaque y presentación
          </Label>
          <div className="space-y-1.5">
            {B2B_PACKAGING_TYPES.map((pkg) => {
              const active = packagingType === pkg;
              return (
                <button
                  key={pkg}
                  type="button"
                  onClick={() => setPackagingType(pkg)}
                  className={`block min-h-11 w-full rounded-xl border px-3 py-2 text-left transition-all ${
                    active
                      ? "border-brand-purple bg-brand-purple/10 text-brand-purple-dark"
                      : "border-brand-purple/15 text-brand-purple-dark/85 hover:bg-brand-purple/5 bg-white"
                  }`}
                >
                  <p className="text-xs font-semibold">{B2B_PACKAGING_TYPE_LABELS[pkg]}</p>
                  <p className="text-brand-muted mt-0.5 text-[11px] leading-snug">
                    {B2B_PACKAGING_TYPE_HINTS[pkg]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tarjeta viva de Estimado Orientativo (Ley 1480 arts. 23 y 29) */}
      {configMode === "CATALOG_LINES" && estimate.totalPhysicalPieces > 0 && (
        <div className="border-brand-purple/20 rounded-2xl border bg-gradient-to-br from-[#FFF8F0] via-white to-[#5DD9D1]/10 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
                Estimado orientativo de mercancía (
                {estimate.totalPhysicalPieces.toLocaleString("es-CO")} piezas)
              </p>
              <p className="font-display text-brand-purple-dark mt-1 text-xl font-bold sm:text-2xl">
                {estimate.estimatedMinCents === estimate.estimatedMaxCents
                  ? formatCOP(estimate.estimatedMaxCents)
                  : `${formatCOP(estimate.estimatedMinCents)} – ${formatCOP(estimate.estimatedMaxCents)}`}
              </p>
            </div>
            {estimate.hasCustomExtrasPendingQuote && (
              <span className="border-brand-purple/25 text-brand-purple-dark rounded-full border bg-white px-3 py-1 text-[11px] font-semibold">
                + Empaque / personalización especial a medida
              </span>
            )}
          </div>
          <p className="text-brand-muted mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Valor referencial no vinculante calculado sobre tarifas vigentes de catálogo. El
              precio definitivo (incluyendo descuentos corporativos por volumen, presentación
              elegida y envío nacional) se formaliza en tu propuesta personalizada.
            </span>
          </p>
        </div>
      )}

      {/* 5. Destino DANE y Fecha con Semáforo de Días Hábiles Colombianos */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-dept" className="text-brand-purple-dark text-sm font-semibold">
            Departamento de entrega *
          </Label>
          <select
            id="b2b-dept"
            required
            value={deptCode}
            onChange={(e) => {
              setDeptCode(e.target.value);
              setCityCode("");
            }}
            aria-invalid={Boolean(srvErr("department"))}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-11 w-full rounded-xl border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="">Selecciona...</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="department" value={selectedDept?.name ?? ""} />
          {srvErr("department") && <p className="text-xs text-rose-700">{srvErr("department")}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-city" className="text-brand-purple-dark text-sm font-semibold">
            Ciudad / Municipio *
          </Label>
          <select
            id="b2b-city"
            required
            disabled={!deptCode}
            value={cityCode}
            onChange={(e) => setCityCode(e.target.value)}
            aria-invalid={Boolean(srvErr("city"))}
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-11 w-full rounded-xl border bg-white px-3 text-sm focus:ring-2 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">{deptCode ? "Selecciona ciudad..." : "Elige primero depto."}</option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="city" value={selectedCity?.name ?? ""} />
          {srvErr("city") && <p className="text-xs text-rose-700">{srvErr("city")}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-date" className="text-brand-purple-dark text-sm font-semibold">
            {isCorporate ? "Fecha ideal de entrega" : "Fecha de la celebración"}
          </Label>
          <Input
            id="b2b-date"
            name="eventDate"
            type="date"
            min={todayIso}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            aria-invalid={Boolean(srvErr("eventDate"))}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-11 rounded-xl bg-white"
          />
          {srvErr("eventDate") && <p className="text-xs text-rose-700">{srvErr("eventDate")}</p>}
        </div>
      </div>

      {/* Semáforo interactivo de viabilidad de fecha */}
      <div
        className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-xs ${
          dateFeasibility.state === "COMFORTABLE"
            ? "border-emerald-300/70 bg-emerald-50/80 text-emerald-950"
            : dateFeasibility.state === "URGENT_VIABLE"
              ? "border-amber-300/80 bg-amber-50/80 text-amber-950"
              : dateFeasibility.state === "CRITICAL_TIGHT" || dateFeasibility.state === "PAST"
                ? "border-rose-300/80 bg-rose-50/80 text-rose-950"
                : "border-brand-purple/15 text-brand-purple-dark bg-[#FFF8F0]/60"
        }`}
      >
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-bold">{dateFeasibility.headline}</p>
          <p className="mt-0.5 opacity-85">{dateFeasibility.detail}</p>
        </div>
      </div>

      {/* 6. Datos de contacto adaptados a Empresa vs. Evento Social */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-name" className="text-brand-purple-dark text-sm font-semibold">
            Tu nombre completo *
          </Label>
          <Input
            id="b2b-name"
            name="contactName"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            placeholder="Ej. Valentina Gómez Rojas"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            onBlur={() => {
              if (contactName.trim()) setContactName(capitalizeName(contactName));
              markTouched("contactName");
            }}
            aria-invalid={Boolean(contactNameErr)}
            aria-describedby={contactNameErr ? "b2b-name-error" : undefined}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-11 rounded-xl bg-white"
          />
          {contactNameErr ? (
            <p id="b2b-name-error" className="text-xs text-rose-700">
              {contactNameErr}
            </p>
          ) : (
            <p className="text-brand-muted text-[11px]">Solo letras, máximo 5 palabras.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-org" className="text-brand-purple-dark text-sm font-semibold">
            {isCorporate
              ? "Razón social o nombre de tu empresa (opcional)"
              : "Homenajeados, colegio o nombre del evento (opcional)"}
          </Label>
          <div className="relative">
            <Building2 className="text-brand-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="b2b-org"
              name="organizationName"
              maxLength={140}
              autoComplete="organization"
              placeholder={
                isCorporate ? "Ej. Estudio Creativo SAS" : "Ej. Boda Ana & Juan / Promoción 2027"
              }
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              onBlur={() => {
                if (organizationName.trim()) {
                  setOrganizationName(organizationName.trim().replace(/\s+/g, " "));
                }
              }}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-11 rounded-xl bg-white pl-9"
            />
          </div>
          {srvErr("organizationName") && (
            <p className="text-xs text-rose-700">{srvErr("organizationName")}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b2b-email" className="text-brand-purple-dark text-sm font-semibold">
            Correo electrónico *
          </Label>
          <EmailInput
            id="b2b-email"
            name="email"
            required
            maxLength={180}
            autoComplete="email"
            placeholder={isCorporate ? "compras@empresa.co" : "tu-correo@ejemplo.com"}
            value={email}
            onValueChange={setEmail}
            aria-invalid={Boolean(srvErr("email"))}
            aria-describedby={srvErr("email") ? "b2b-email-error" : undefined}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-11 rounded-xl bg-white"
          />
          {srvErr("email") && (
            <p id="b2b-email-error" className="text-xs text-rose-700">
              {srvErr("email")}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="b2b-whatsapp" className="text-brand-purple-dark text-sm font-semibold">
            WhatsApp / Celular *
          </Label>
          <PhoneInput
            id="b2b-whatsapp"
            name="whatsapp"
            size="lg"
            required
            disabled={pending}
            error={whatsappErr}
            onChange={(national, dial) => setPhone({ national, dial })}
            onBlur={() => markTouched("whatsapp")}
          />
        </div>

        {isCorporate && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="b2b-nit" className="text-brand-purple-dark text-sm font-semibold">
              NIT empresarial (opcional)
            </Label>
            <Input
              id="b2b-nit"
              name="nit"
              inputMode="numeric"
              maxLength={12}
              placeholder="900123456-8"
              value={nit}
              onChange={(e) => setNit(e.target.value.replace(/[^\d-]/g, "").slice(0, 12))}
              onBlur={() => {
                markTouched("nit");
                if (nitCheck?.valid) setNit(nitCheck.normalized);
              }}
              aria-invalid={Boolean(nitErr)}
              aria-describedby={nitErr ? "b2b-nit-error" : undefined}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30 h-11 rounded-xl bg-white"
            />
            {nitErr ? (
              <p id="b2b-nit-error" className="text-xs text-rose-700">
                {nitErr}
              </p>
            ) : nitAutoDvHint ? (
              <p className="text-brand-purple text-[11px] font-medium">{nitAutoDvHint}</p>
            ) : (
              <p className="text-brand-muted text-[11px]">
                {billingDocumentEnabled
                  ? "Para facturación electrónica DIAN (calculamos el DV automáticamente)."
                  : "Para emitir cuenta de cobro y adjuntar RUT a tu tesorería."}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Notas adicionales */}
      <div className="space-y-1.5">
        <Label htmlFor="b2b-notes" className="text-brand-purple-dark text-sm font-semibold">
          {configMode === "CATALOG_LINES"
            ? "Detalles adicionales de tu idea o mensaje (opcional)"
            : "Cuéntanos sobre tu idea *"}
        </Label>
        <Textarea
          id="b2b-notes"
          name="notes"
          required={configMode === "ADVISORY_OPEN"}
          minLength={configMode === "ADVISORY_OPEN" ? 10 : undefined}
          maxLength={2500}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            isCorporate
              ? "Ej. Queremos incluir nuestro logo institucional, frase de agradecimiento y entregar en la primera semana del mes."
              : "Ej. Nos gustaría incluir la fecha de nuestra boda, tonos pastel y una tarjeta de recuerdo para cada invitado."
          }
          aria-invalid={Boolean(srvErr("notes"))}
          className="border-brand-purple/20 focus-visible:ring-brand-purple/30 rounded-xl bg-white"
        />
        {srvErr("notes") && <p className="text-xs text-rose-700">{srvErr("notes")}</p>}
      </div>

      {/* Consentimientos Ley 1581 de 2012 */}
      <div className="border-brand-purple/15 space-y-2.5 rounded-2xl border bg-[#FFF8F0]/70 p-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-xs">
          <input
            type="checkbox"
            name="acceptHabeasData"
            required
            checked={acceptHabeasData}
            onChange={(e) => setAcceptHabeasData(e.target.checked)}
            className="accent-brand-purple mt-0.5 h-4 w-4 shrink-0 rounded"
          />
          <span className="text-brand-purple-dark/90">
            Autorizo el tratamiento de mis datos personales para gestionar esta propuesta conforme a
            la{" "}
            <Link
              href="/legal/privacidad"
              target="_blank"
              className="text-brand-purple-dark hover:text-brand-purple font-semibold underline underline-offset-2"
            >
              Política de Privacidad
            </Link>{" "}
            (Ley 1581 de 2012). *
          </span>
        </label>
        {srvErr("acceptHabeasData") && (
          <p className="text-xs text-rose-700">{srvErr("acceptHabeasData")}</p>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 text-xs">
          <input
            type="checkbox"
            name="acceptNewsletter"
            checked={acceptNewsletter}
            onChange={(e) => setAcceptNewsletter(e.target.checked)}
            className="accent-brand-purple mt-0.5 h-4 w-4 shrink-0 rounded"
          />
          <span className="text-brand-purple-dark/80">
            Quiero recibir ideas para eventos, temporadas especiales y beneficios por volumen
            (opcional, puedes darte de baja cuando quieras).
          </span>
        </label>
      </div>

      <TurnstileWidget />

      <Button
        type="submit"
        disabled={pending || (configMode === "CATALOG_LINES" && !estimate.meetsMinimumUnits)}
        className="bg-brand-purple hover:bg-brand-purple-dark min-h-12 w-full rounded-full text-sm font-semibold text-white shadow-sm"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando configuración...
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Recibir propuesta formal personalizada
          </>
        )}
      </Button>
    </form>
  );
}
