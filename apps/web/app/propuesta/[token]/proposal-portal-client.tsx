"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck2,
  Landmark,
  Lock,
  MapPin,
  Package,
  Printer,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCOP } from "@/lib/format";
import { getCityByCode } from "@/lib/dane-divipola";
import {
  EMPTY_STRUCTURED_ADDRESS,
  StructuredAddressFields,
  type StructuredAddressValue,
} from "@/components/address/structured-address-fields";
import {
  B2B_ARTWORK_MODE_LABELS,
  B2B_PACKAGING_TYPE_LABELS,
  DIRECT_PAYMENT_METHOD_LABELS,
  OPPORTUNITY_EVENT_LABELS,
  PROPOSAL_STATUS_LABELS,
  isB2bArtworkMode,
  isB2bPackagingType,
  isOpportunityEventType,
  isProposalStatus,
  type DirectPaymentMethodKind,
} from "@/features/opportunities/schemas";
import { approveAndPayProposalAction, reportDirectTransferAction } from "./actions";

export interface PublicDirectPaymentView {
  hasBreb: boolean;
  hasBankAccount: boolean;
  brebKey: string | null;
  brebHolder: string | null;
  bankName: string | null;
  accountType: string | null;
  accountNumber: string | null;
  holderDoc: string | null;
  instructions: string | null;
  maxBrebCopCents: number;
}

export interface PublicProposalPortalData {
  id: string;
  number: string;
  version: number;
  status: string;
  validUntilIso: string;
  validUntilLabel: string;
  isExpired: boolean;
  proofMode: string;
  hasProofAsset: boolean;
  proofApprovedLabel: string | null;
  artworkMode: string;
  packagingType: string;
  clientNotes: string | null;
  termsNotes: string | null;
  estimatedProductionDays: number;
  shippingMode: string;
  shippingCarrier: string | null;
  shippingService: string | null;
  packageCount: number;
  departmentCode: string | null;
  departmentName: string | null;
  cityCode: string | null;
  cityName: string | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  allowDirectTransfer: boolean;
  opportunity: {
    number: string;
    eventType: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string;
    organizationName: string | null;
    organizationNit: string | null;
  };
  items: Array<{
    id: string;
    titleSnapshot: string;
    skuSnapshot: string;
    qty: number;
    designUnits: number;
    piecesPerUnit: number;
    unitPriceCents: number;
    lineTotalCents: number;
    packagingNote: string | null;
    warrantyMonths: number;
    imageUrl: string | null;
  }>;
  order: {
    id: string;
    number: string;
    status: string;
    total: number;
    paymentMethod: string;
    directPaymentMethod: string | null;
    directPaymentReference: string | null;
    directPaymentReportedLabel: string | null;
    directPaymentConfirmedLabel: string | null;
  } | null;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Esperando confirmación de pago",
  PAID: "Pago confirmado",
  FULFILLING: "En producción en taller 300 DPI",
  SHIPPED: "Despachado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

export function ProposalPortalClient({
  rawToken,
  proposal,
  directPayment,
  billingDocCopy,
  waSupportUrl,
}: {
  rawToken: string;
  proposal: PublicProposalPortalData;
  directPayment: PublicDirectPaymentView | null;
  billingDocCopy: string;
  waSupportUrl: string;
}) {
  const defaultDeptCode = proposal.departmentCode ?? "11";
  const defaultCityCode = proposal.cityCode ?? "11001";
  const defaultZip = getCityByCode(defaultCityCode)?.zip ?? "";

  const [address, setAddress] = useState<StructuredAddressValue>(() => ({
    ...EMPTY_STRUCTURED_ADDRESS,
    deptCode: defaultDeptCode,
    cityCode: defaultCityCode,
    zip: defaultZip,
    destinationType: proposal.opportunity.organizationName ? "oficina" : "casa",
    companyName: proposal.opportunity.organizationName ?? "",
  }));

  const [recipientFullName, setRecipientFullName] = useState(proposal.opportunity.contactName);
  const [recipientPhone, setRecipientPhone] = useState(
    proposal.opportunity.contactPhone.replace(/^\+?57/, "").trim(),
  );
  const canUseDirect = Boolean(proposal.allowDirectTransfer && directPayment);
  const [paymentChoice, setPaymentChoice] = useState<"WOMPI" | "DIRECT_TRANSFER">("WOMPI");

  const [approveState, approveAction, isApproving] = useActionState(
    approveAndPayProposalAction,
    null,
  );
  const [reportState, reportAction, isReporting] = useActionState(reportDirectTransferAction, null);

  const defaultDirectMethod: DirectPaymentMethodKind =
    directPayment?.hasBreb && proposal.totalCents <= directPayment.maxBrebCopCents
      ? "BRE_B"
      : directPayment?.hasBankAccount
        ? "BANK_TRANSFER"
        : "BRE_B";
  const [directMethod, setDirectMethod] = useState<DirectPaymentMethodKind>(defaultDirectMethod);

  useEffect(() => {
    if (approveState?.ok && approveState.redirectUrl) {
      window.location.assign(approveState.redirectUrl);
    }
  }, [approveState]);

  const activeOrder = proposal.order;
  const isSupersededOrCancelled =
    proposal.status === "SUPERSEDED" || proposal.status === "CANCELLED";
  const canSubmitApproval =
    !isSupersededOrCancelled &&
    !proposal.isExpired &&
    (!activeOrder || activeOrder.status === "PENDING_PAYMENT");

  const showDirectTransferInstructions =
    canUseDirect &&
    ((approveState?.ok && approveState.awaitingDirectTransfer) ||
      (activeOrder?.status === "PENDING_PAYMENT" &&
        activeOrder.paymentMethod === "DIRECT_TRANSFER"));

  const artworkLabel = isB2bArtworkMode(proposal.artworkMode)
    ? B2B_ARTWORK_MODE_LABELS[proposal.artworkMode]
    : proposal.artworkMode;
  const packagingLabel = isB2bPackagingType(proposal.packagingType)
    ? B2B_PACKAGING_TYPE_LABELS[proposal.packagingType]
    : proposal.packagingType;
  const eventLabel = isOpportunityEventType(proposal.opportunity.eventType)
    ? OPPORTUNITY_EVENT_LABELS[proposal.opportunity.eventType]
    : proposal.opportunity.eventType;
  const statusLabel = isProposalStatus(proposal.status)
    ? PROPOSAL_STATUS_LABELS[proposal.status]
    : proposal.status;

  const totalPhysicalPieces = proposal.items.reduce(
    (sum, it) => sum + it.qty * it.designUnits * it.piecesPerUnit,
    0,
  );

  return (
    <div className="space-y-8">
      {/* Encabezado ejecutivo imprimible */}
      <div className="border-brand-purple/15 rounded-2xl border bg-white p-6 shadow-sm sm:p-8 print:border-slate-300 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-brand-purple/10 text-brand-purple-dark rounded-full px-3 py-1 text-xs font-semibold">
                Propuesta formal {proposal.number}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                Versión v{proposal.version} · {statusLabel}
              </span>
            </div>
            <h1 className="text-brand-purple-dark mt-3 font-serif text-2xl font-bold sm:text-3xl">
              {proposal.opportunity.organizationName
                ? `Propuesta para ${proposal.opportunity.organizationName}`
                : `Propuesta para ${proposal.opportunity.contactName}`}
            </h1>
            <p className="text-brand-muted mt-1 text-sm">
              Solicitud {proposal.opportunity.number} · {eventLabel}
              {proposal.opportunity.organizationNit
                ? ` · NIT ${proposal.opportunity.organizationNit}`
                : ""}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end print:hidden">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Imprimir / Guardar PDF
            </Button>
            <div className="text-brand-muted flex items-center gap-1.5 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Vigente hasta el{" "}
              <strong className="text-slate-800">{proposal.validUntilLabel}</strong>
            </div>
          </div>
        </div>

        {/* Estado de pedido ya pagado o en curso */}
        {activeOrder && activeOrder.status !== "PENDING_PAYMENT" && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div className="space-y-1 text-sm text-emerald-950">
                <p className="font-semibold">
                  Pedido {activeOrder.number} confirmado ·{" "}
                  {ORDER_STATUS_LABELS[activeOrder.status] ?? activeOrder.status}
                </p>
                <p className="text-emerald-800">
                  Tu pedido ya entró a nuestro flujo operativo de taller 300 DPI y logística. Te
                  enviamos las notificaciones y el enlace de seguimiento a{" "}
                  <strong>{proposal.opportunity.contactEmail}</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Alertas de vigencia o versión reemplazada */}
        {isSupersededOrCancelled && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Esta versión fue reemplazada o cancelada.</p>
            <p className="mt-1 text-amber-800">
              Revisa tu correo para abrir la versión más reciente o escríbenos por{" "}
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                WhatsApp
              </a>
              .
            </p>
          </div>
        )}

        {!activeOrder && proposal.isExpired && !isSupersededOrCancelled && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
            <p className="font-semibold">La vigencia de esta propuesta venció.</p>
            <p className="mt-1 text-rose-800">
              Escríbenos por{" "}
              <a
                href={waSupportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                WhatsApp
              </a>{" "}
              para renovar precios y tiempos de producción actualizados.
            </p>
          </div>
        )}

        {/* Tabla de líneas negociadas */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
                <th className="py-3 pr-4">Referencia</th>
                <th className="px-3 py-3 text-right">Cantidad</th>
                <th className="px-3 py-3 text-right">Piezas físicas</th>
                <th className="px-3 py-3 text-right">Valor unitario</th>
                <th className="py-3 pl-3 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {proposal.items.map((it) => {
                const commercialUnits = it.qty * it.designUnits;
                const physicalPieces = commercialUnits * it.piecesPerUnit;
                return (
                  <tr key={it.id}>
                    <td className="py-3.5 pr-4">
                      <div className="text-brand-purple-dark font-semibold">{it.titleSnapshot}</div>
                      <div className="text-brand-muted text-xs">
                        SKU {it.skuSnapshot} · Garantía {it.warrantyMonths} meses
                      </div>
                      {it.packagingNote && (
                        <div className="mt-1 text-xs text-slate-600">
                          Detalle línea: {it.packagingNote}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-right font-medium text-slate-800">
                      {commercialUnits.toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-3.5 text-right text-slate-600">
                      {physicalPieces.toLocaleString("es-CO")} pzas
                    </td>
                    <td className="px-3 py-3.5 text-right text-slate-700">
                      {formatCOP(it.unitPriceCents)}
                    </td>
                    <td className="py-3.5 pl-3 text-right font-semibold text-slate-900">
                      {formatCOP(it.lineTotalCents)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totales y condiciones operativas */}
        <div className="mt-6 grid gap-6 border-t border-slate-200 pt-6 lg:grid-cols-12">
          <div className="space-y-3 text-sm text-slate-700 lg:col-span-7">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3.5">
                <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
                  <Package className="h-3.5 w-3.5" />
                  Arte y presentación
                </div>
                <p className="mt-1 font-medium text-slate-900">{artworkLabel}</p>
                <p className="text-xs text-slate-600">{packagingLabel}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Total consolidado: {totalPhysicalPieces.toLocaleString("es-CO")} piezas físicas
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3.5">
                <div className="text-brand-muted flex items-center gap-1.5 text-xs font-semibold uppercase">
                  <Truck className="h-3.5 w-3.5" />
                  Producción y despacho
                </div>
                <p className="mt-1 font-medium text-slate-900">
                  {proposal.estimatedProductionDays} días hábiles de producción
                </p>
                <p className="text-xs text-slate-600">
                  Destino cotizado: {proposal.cityName ?? "Colombia"}
                  {proposal.departmentName ? `, ${proposal.departmentName}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {proposal.packageCount > 1
                    ? `${proposal.packageCount} cajas estimadas`
                    : "1 paquete consolidado"}
                  {proposal.shippingService ? ` · ${proposal.shippingService}` : ""}
                </p>
              </div>
            </div>

            {proposal.clientNotes && (
              <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Alcance y notas para tu proyecto
                </p>
                <p className="mt-1 text-sm whitespace-pre-line text-slate-800">
                  {proposal.clientNotes}
                </p>
              </div>
            )}

            {proposal.termsNotes && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Condiciones específicas
                </p>
                <p className="mt-1 text-xs whitespace-pre-line text-slate-700">
                  {proposal.termsNotes}
                </p>
              </div>
            )}

            <p className="text-xs text-slate-500">
              <Building2 className="mr-1 inline h-3.5 w-3.5" />
              Soporte contable: {billingDocCopy}
            </p>
          </div>

          <div className="bg-brand-cream/40 border-brand-purple/15 space-y-2.5 rounded-xl border p-5 lg:col-span-5">
            <div className="flex justify-between text-sm text-slate-700">
              <span>Subtotal líneas</span>
              <span className="font-medium">{formatCOP(proposal.subtotalCents)}</span>
            </div>
            {proposal.discountCents > 0 && (
              <div className="flex justify-between text-sm text-emerald-700">
                <span>Descuento comercial B2B</span>
                <span className="font-medium">-{formatCOP(proposal.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-slate-700">
              <span>Envío asegurado ({proposal.cityName ?? "Destino"})</span>
              <span className="font-medium">
                {proposal.shippingCents === 0
                  ? "Incluido ($ 0)"
                  : formatCOP(proposal.shippingCents)}
              </span>
            </div>
            <div className="border-brand-purple/15 flex items-baseline justify-between border-t pt-3">
              <span className="text-brand-purple-dark text-base font-bold">Total a pagar</span>
              <span className="text-brand-purple-dark text-2xl font-bold">
                {formatCOP(proposal.totalCents)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Valores expresados en pesos colombianos (COP). Productos personalizados a medida (Art.
              47 num. 3 Ley 1480 de 2011) cuentan con garantía legal completa por defectos de
              fabricación o transporte.
            </p>
          </div>
        </div>
      </div>

      {/* Muestra digital privada */}
      {(proposal.hasProofAsset || proposal.proofMode === "AFTER_PAYMENT") && (
        <div className="border-brand-purple/15 rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-2">
            <FileCheck2 className="text-brand-purple h-5 w-5" />
            <h2 className="text-brand-purple-dark font-serif text-xl font-bold">
              Muestra digital y validación de arte
            </h2>
          </div>

          {proposal.hasProofAsset ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-700">
                Revisa cuidadosamente la composición visual, textos, logos y proporciones de tu
                muestra digital antes de autorizar producción:
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/b2b-proof/${encodeURIComponent(proposal.id)}?pt=${encodeURIComponent(rawToken)}`}
                  alt={`Muestra digital ${proposal.number}`}
                  className="mx-auto max-h-[480px] w-auto rounded-lg object-contain"
                />
              </div>
              {proposal.proofApprovedLabel && (
                <p className="text-xs font-medium text-emerald-700">
                  ✓ Muestra aprobada el {proposal.proofApprovedLabel}.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              Acordamos validar la muestra digital <strong>después de confirmar tu pedido</strong>.
              Ninguna pieza pasará a impresión 300 DPI ni despacho sin tu visto bueno final sobre el
              arte.
            </p>
          )}
        </div>
      )}

      {/* Instrucciones y reporte de Pago Directo (Bre-B / Transferencia) cuando ya eligió DIRECT_TRANSFER */}
      {showDirectTransferInstructions && directPayment && (
        <div className="border-brand-purple/25 rounded-2xl border-2 bg-white p-6 shadow-sm sm:p-8 print:border-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Landmark className="text-brand-purple h-5 w-5" />
              <h2 className="text-brand-purple-dark font-serif text-xl font-bold">
                Instrucciones de Pago Directo · Pedido{" "}
                {approveState?.ok ? approveState.orderNumber : activeOrder?.number}
              </h2>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
              Reserva vigente hasta el {proposal.validUntilLabel}
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-700">
            Realiza el pago por{" "}
            <strong className="text-slate-900">{formatCOP(proposal.totalCents)}</strong> indicando
            en el concepto o referencia el número{" "}
            <strong className="text-brand-purple-dark">
              {approveState?.ok ? approveState.orderNumber : activeOrder?.number}
            </strong>
            , y registra abajo el número de comprobante para activar producción tras verificar el
            abono en banco.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {directPayment.hasBreb && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-brand-purple-dark text-sm font-bold">
                    Pago inmediato Bre-B
                  </span>
                  {proposal.totalCents > directPayment.maxBrebCopCents && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                      Supera tope estándar 1.000 UVB
                    </span>
                  )}
                </div>
                <p className="mt-2 font-mono text-base font-semibold text-slate-900">
                  Llave: {directPayment.brebKey}
                </p>
                {directPayment.brebHolder && (
                  <p className="mt-1 text-xs text-slate-600">Titular: {directPayment.brebHolder}</p>
                )}
              </div>
            )}

            {directPayment.hasBankAccount && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-brand-purple-dark text-sm font-bold">
                  Transferencia bancaria
                </span>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {directPayment.bankName}
                  {directPayment.accountType ? ` · Cuenta ${directPayment.accountType}` : ""}
                </p>
                <p className="font-mono text-base font-semibold text-slate-900">
                  N.º {directPayment.accountNumber}
                </p>
                {directPayment.holderDoc && (
                  <p className="mt-1 text-xs text-slate-600">
                    Titular / Documento: {directPayment.holderDoc}
                  </p>
                )}
              </div>
            )}
          </div>

          {directPayment.instructions && (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {directPayment.instructions}
            </p>
          )}

          {activeOrder?.directPaymentReportedLabel || reportState?.ok ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <p className="font-semibold">
                ✓ Recibimos tu reporte de pago
                {activeOrder?.directPaymentReference
                  ? ` (Ref: ${activeOrder.directPaymentReference})`
                  : ""}
                .
              </p>
              <p className="mt-1 text-emerald-800">
                Nuestro equipo financiero verificará el abono efectivo en banco y te enviará la
                confirmación automática a <strong>{proposal.opportunity.contactEmail}</strong>.
              </p>
            </div>
          ) : null}

          <form
            action={reportAction}
            className="mt-5 space-y-4 border-t border-slate-200 pt-5 print:hidden"
          >
            <input type="hidden" name="token" value={rawToken} />
            <h3 className="text-brand-purple-dark text-sm font-bold">
              {activeOrder?.directPaymentReportedLabel
                ? "Actualizar referencia o comprobante"
                : "Reportar comprobante de transferencia / Bre-B"}
            </h3>

            {reportState && !reportState.ok && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                {reportState.error}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="direct-method">Medio utilizado *</Label>
                <select
                  id="direct-method"
                  name="method"
                  value={directMethod}
                  onChange={(e) => setDirectMethod(e.target.value as DirectPaymentMethodKind)}
                  className="border-brand-purple/25 focus:border-brand-purple h-9 w-full rounded-md border bg-white px-2 text-sm"
                >
                  {directPayment.hasBreb && (
                    <option value="BRE_B">{DIRECT_PAYMENT_METHOD_LABELS.BRE_B}</option>
                  )}
                  {directPayment.hasBankAccount && (
                    <option value="BANK_TRANSFER">
                      {DIRECT_PAYMENT_METHOD_LABELS.BANK_TRANSFER}
                    </option>
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="direct-ref">N.º de comprobante / referencia *</Label>
                <Input
                  id="direct-ref"
                  name="reference"
                  required
                  minLength={4}
                  maxLength={120}
                  defaultValue={activeOrder?.directPaymentReference ?? ""}
                  placeholder="Ej. 009482716 o CUS"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receiptFile">Imagen del soporte (opcional, máx. 5 MB)</Label>
                <Input
                  id="receiptFile"
                  name="receiptFile"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="direct-notes">
                Observaciones de tesorería / retenciones practicadas (opcional)
              </Label>
              <Input
                id="direct-notes"
                name="notes"
                maxLength={500}
                placeholder="Ej. Pago desde Bancolombia empresarial; incluye certificado de ReteFuente."
              />
            </div>

            <Button type="submit" disabled={isReporting}>
              {isReporting ? "Enviando reporte…" : "Enviar comprobante para verificación"}
            </Button>
          </form>
        </div>
      )}

      {/* Formulario de aprobación, dirección DANE exacta y selección de medio de pago */}
      {canSubmitApproval && (
        <form
          action={approveAction}
          className="border-brand-purple/15 space-y-6 rounded-2xl border bg-white p-6 shadow-sm sm:p-8 print:hidden"
        >
          <input type="hidden" name="token" value={rawToken} />

          <div>
            <h2 className="text-brand-purple-dark font-serif text-xl font-bold">
              {activeOrder
                ? `Completar o cambiar método de pago · Pedido ${activeOrder.number}`
                : "Aprobar propuesta y coordinar entrega"}
            </h2>
            <p className="text-brand-muted mt-1 text-sm">
              Ingresa la dirección exacta en{" "}
              <strong>
                {proposal.cityName ?? "el municipio cotizado"}
                {proposal.departmentName ? ` (${proposal.departmentName})` : ""}
              </strong>{" "}
              para generar tu guía asegurada sin contratiempos.
            </p>
          </div>

          {approveState && !approveState.ok && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              {approveState.error}
            </div>
          )}

          {/* Destinatario en destino */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="recipientFullName">Nombre de quien recibe en destino *</Label>
              <Input
                id="recipientFullName"
                name="recipientFullName"
                required
                value={recipientFullName}
                onChange={(e) => setRecipientFullName(e.target.value)}
                placeholder="Ej. Camila Gómez"
              />
              {approveState && !approveState.ok && approveState.fieldErrors?.recipientFullName && (
                <p className="text-destructive text-xs">
                  {approveState.fieldErrors.recipientFullName[0]}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipientPhone">Celular de contacto para la transportadora *</Label>
              <Input
                id="recipientPhone"
                name="recipientPhone"
                type="tel"
                inputMode="numeric"
                required
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="300 123 4567"
              />
              {approveState && !approveState.ok && approveState.fieldErrors?.recipientPhone && (
                <p className="text-destructive text-xs">
                  {approveState.fieldErrors.recipientPhone[0]}
                </p>
              )}
            </div>
          </div>

          {/* Dirección estructurada DANE bloqueada al municipio cotizado */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-600">
              <MapPin className="text-brand-purple h-4 w-4" />
              <span>
                El departamento y municipio están fijados según el flete cotizado en esta propuesta.
              </span>
            </div>
            <StructuredAddressFields
              value={address}
              onChange={(patch) => setAddress((prev) => ({ ...prev, ...patch }))}
              errors={approveState && !approveState.ok ? approveState.fieldErrors : undefined}
              lockCityDept={Boolean(proposal.departmentCode && proposal.cityCode)}
              neighborhoodPlaceholder="Ej. Chicó Norte, El Poblado, Ciudad Jardín"
            />
          </div>

          {/* Selección de riel de pago */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Elige cómo deseas realizar el pago *</Label>
            <input type="hidden" name="paymentChoice" value={paymentChoice} />
            <div className={`grid gap-3 ${canUseDirect ? "sm:grid-cols-2" : "grid-cols-1"}`}>
              <button
                type="button"
                onClick={() => setPaymentChoice("WOMPI")}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  paymentChoice === "WOMPI"
                    ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CreditCard className="text-brand-purple h-4 w-4" />
                  <span className="text-brand-purple-dark text-sm font-bold">
                    Pago en línea inmediato · Wompi Bancolombia
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  PSE empresarial o personal, tarjetas débito/crédito, Nequi o Botón Bancolombia.
                  Confirmación automática al instante.
                </p>
              </button>

              {canUseDirect && directPayment && (
                <button
                  type="button"
                  onClick={() => setPaymentChoice("DIRECT_TRANSFER")}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    paymentChoice === "DIRECT_TRANSFER"
                      ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Landmark className="text-brand-purple h-4 w-4" />
                    <span className="text-brand-purple-dark text-sm font-bold">
                      Bre-B / Transferencia bancaria directa
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Ideal para tesorería corporativa o pagos desde portal empresarial. Verás la
                    llave Bre-B / cuenta al confirmar y podrás adjuntar tu soporte.
                  </p>
                </button>
              )}
            </div>
          </div>

          {/* Checkboxes legales de muestra digital y Habeas Data */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            {proposal.proofMode === "BEFORE_PAYMENT" && !proposal.proofApprovedLabel && (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  name="acceptProof"
                  required
                  className="accent-brand-purple mt-1 h-4 w-4 shrink-0"
                />
                <span className="text-slate-800">
                  <strong>Apruebo la muestra digital adjunta</strong> y autorizo la producción de
                  las piezas personalizadas conforme a las especificaciones de esta propuesta.
                </span>
              </label>
            )}

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                name="acceptTermsAndHabeas"
                required
                className="accent-brand-purple mt-1 h-4 w-4 shrink-0"
              />
              <span className="text-slate-700">
                Acepto los{" "}
                <Link
                  href="/terminos"
                  target="_blank"
                  className="text-brand-purple font-medium underline"
                >
                  Términos y Condiciones
                </Link>{" "}
                (incluyendo el régimen de bienes personalizados del Art. 47 num. 3 de la Ley 1480 de
                2011), declaro contar con derechos de uso sobre las imágenes/logos suministrados y
                autorizo el tratamiento de datos personales conforme a la{" "}
                <Link
                  href="/privacidad"
                  target="_blank"
                  className="text-brand-purple font-medium underline"
                >
                  Política de Privacidad
                </Link>{" "}
                (Ley 1581 de 2012).
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="text-brand-muted flex items-center gap-2 text-xs">
              <Lock className="h-4 w-4 text-emerald-600" />
              <span>Enlace cifrado y transacción protegida · Lucams Shop</span>
            </div>

            <Button type="submit" size="lg" disabled={isApproving} className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              {isApproving
                ? "Procesando aprobación…"
                : paymentChoice === "WOMPI"
                  ? `Aprobar y pagar ${formatCOP(proposal.totalCents)} en Wompi`
                  : `Aprobar propuesta y ver datos de transferencia`}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
