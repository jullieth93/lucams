"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Landmark,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCOP } from "@/lib/format";
import {
  DIRECT_PAYMENT_METHOD_LABELS,
  isDirectPaymentMethod,
} from "@/features/opportunities/schemas";
import { confirmDirectTransferPaymentAction, uploadB2bOrderPrintMastersAction } from "./actions";

export interface DirectPaymentPanelProps {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  totalCents: number;
  withholdingCents: number;
  directPaymentMethod: string | null;
  directPaymentReference: string | null;
  directPaymentReportedLabel: string | null;
  directPaymentConfirmedLabel: string | null;
  directPaymentNotes: string | null;
  receiptSignedUrl: string | null;
  canConfirm: boolean;
}

export function DirectPaymentVerificationPanel({
  orderId,
  orderStatus,
  totalCents,
  withholdingCents,
  directPaymentMethod,
  directPaymentReference,
  directPaymentReportedLabel,
  directPaymentConfirmedLabel,
  directPaymentNotes,
  receiptSignedUrl,
  canConfirm,
}: DirectPaymentPanelProps) {
  const totalPesos = Math.round(totalCents / 100);
  const [cashPesos, setCashPesos] = useState(String(totalPesos));
  const [withholdingPesos, setWithholdingPesos] = useState("0");
  const [state, action, isPending] = useActionState(confirmDirectTransferPaymentAction, null);

  const parsedCash = Number.parseInt(cashPesos.replace(/[^\d]/g, "") || "0", 10);
  const parsedWithholding = Number.parseInt(withholdingPesos.replace(/[^\d]/g, "") || "0", 10);
  const sumMatchesTotal = parsedCash + parsedWithholding === totalPesos;

  const methodLabel =
    directPaymentMethod && isDirectPaymentMethod(directPaymentMethod)
      ? DIRECT_PAYMENT_METHOD_LABELS[directPaymentMethod]
      : (directPaymentMethod ?? "Pendiente de reporte del cliente");

  return (
    <div className="border-brand-purple/20 rounded-xl border bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center gap-2">
        <Landmark className="text-brand-purple h-4 w-4" />
        <h3 className="text-brand-purple-dark text-sm font-bold">
          Pago Directo B2B (Bre-B / Transferencia)
        </h3>
      </div>

      <dl className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-brand-muted">Riel reportado</dt>
          <dd className="text-brand-purple-dark text-right font-semibold">{methodLabel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-brand-muted">Referencia / CUS</dt>
          <dd className="font-mono font-semibold text-slate-800">
            {directPaymentReference ?? "—"}
          </dd>
        </div>
        {directPaymentReportedLabel && (
          <div className="flex justify-between gap-2">
            <dt className="text-brand-muted">Reportado por cliente</dt>
            <dd className="text-slate-700">{directPaymentReportedLabel}</dd>
          </div>
        )}
        {directPaymentConfirmedLabel && (
          <div className="flex justify-between gap-2">
            <dt className="text-brand-muted">Verificado en banco</dt>
            <dd className="font-semibold text-emerald-700">{directPaymentConfirmedLabel}</dd>
          </div>
        )}
        {withholdingCents > 0 && (
          <>
            <div className="flex justify-between gap-2">
              <dt className="text-brand-muted">Retenciones practicadas</dt>
              <dd className="font-medium text-amber-800">{formatCOP(withholdingCents)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-brand-muted">Abono neto en banco</dt>
              <dd className="font-bold text-emerald-800">
                {formatCOP(Math.max(0, totalCents - withholdingCents))}
              </dd>
            </div>
          </>
        )}
      </dl>

      {directPaymentNotes && (
        <p className="mt-2.5 rounded-md bg-slate-50 p-2 text-[11px] text-slate-700">
          <strong>Nota:</strong> {directPaymentNotes}
        </p>
      )}

      {receiptSignedUrl && (
        <a
          href={receiptSignedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-purple hover:text-brand-purple-dark mt-2.5 inline-flex items-center gap-1 text-xs font-semibold underline"
        >
          Ver imagen del comprobante adjunto
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      {orderStatus === "PENDING_PAYMENT" && canConfirm && (
        <form action={action} className="border-brand-purple/15 mt-4 space-y-3 border-t pt-3">
          <input type="hidden" name="orderId" value={orderId} />
          <p className="text-[11px] font-semibold text-amber-900">
            Confirma únicamente tras verificar el ingreso real en el extracto bancario o llave Bre-B
            (requiere sesión SUPERADMIN con MFA reciente).
          </p>

          {state?.error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">
              <p>{state.error}</p>
              {state.requiresReauth && (
                <Link
                  href="/admin/mfa-verify"
                  className="mt-1 inline-block font-semibold underline"
                >
                  Revalidar código 2FA ahora →
                </Link>
              )}
            </div>
          )}

          {state?.success && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-900">
              {state.success}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="receivedCashPesos" className="text-[11px]">
                Efectivo en banco (COP) *
              </Label>
              <Input
                id="receivedCashPesos"
                name="receivedCashPesos"
                inputMode="numeric"
                value={cashPesos}
                onChange={(e) => setCashPesos(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="withholdingPesos" className="text-[11px]">
                Retenciones (COP)
              </Label>
              <Input
                id="withholdingPesos"
                name="withholdingPesos"
                inputMode="numeric"
                value={withholdingPesos}
                onChange={(e) => setWithholdingPesos(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <p
            className={`text-[11px] font-medium ${sumMatchesTotal ? "text-emerald-700" : "text-rose-700"
              }`}
          >
            Cuadre contable: $ {(parsedCash + parsedWithholding).toLocaleString("es-CO")} / ${" "}
            {totalPesos.toLocaleString("es-CO")} COP
          </p>

          <div className="space-y-1">
            <Label htmlFor="referenceOverride" className="text-[11px]">
              Referencia bancaria verificada *
            </Label>
            <Input
              id="referenceOverride"
              name="referenceOverride"
              required={!directPaymentReference}
              defaultValue={directPaymentReference ?? ""}
              placeholder="N.º de comprobante o CUS en extracto"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirmNotes" className="text-[11px]">
              Nota contable / conciliación (opcional)
            </Label>
            <Input
              id="confirmNotes"
              name="notes"
              placeholder="Ej. Verificado en Bancolombia empresarial"
              className="h-8 text-xs"
            />
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={isPending || !sumMatchesTotal}
            className="w-full gap-1.5"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {isPending ? "Confirmando pago…" : "Confirmar abono en banco (MFA)"}
          </Button>
        </form>
      )}
    </div>
  );
}

export interface B2bWorkshopLineSummary {
  orderItemId: string;
  title: string;
  sku: string;
  qty: number;
  designUnits: number;
  productionCount: number;
  moderationStatus: string | null;
}

function B2bWorkshopLineForm({ orderId, line }: { orderId: string; line: B2bWorkshopLineSummary }) {
  const [state, action, isPending] = useActionState(uploadB2bOrderPrintMastersAction, null);
  const isReady = line.productionCount > 0 && line.moderationStatus === "APPROVED";

  return (
    <form
      action={action}
      className="border-brand-purple/10 space-y-2.5 rounded-lg border bg-slate-50/70 p-3"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="orderItemId" value={line.orderItemId} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-brand-purple-dark text-xs font-bold">{line.title}</p>
          <p className="text-brand-muted text-[11px]">
            SKU <span className="font-mono">{line.sku}</span> · {line.designUnits} diseño(s) ×{" "}
            {line.qty} copia(s)
          </p>
        </div>
        {isReady ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            <CheckCircle2 className="h-3 w-3" />
            {line.productionCount} PNG 300 DPI listo(s)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
            <ShieldAlert className="h-3 w-3" />
            Arte 300 DPI pendiente
          </span>
        )}
      </div>

      {state?.error && (
        <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-800">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{state.success}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-12">
        <div className="sm:col-span-6">
          <Input
            name="masterFiles"
            type="file"
            multiple
            required
            accept="image/png,image/jpeg,image/webp"
            className="h-8 bg-white text-xs"
          />
        </div>
        <div className="sm:col-span-4">
          <Input
            name="workshopNote"
            placeholder="Nota para LEEME.txt (opcional)"
            maxLength={240}
            className="h-8 bg-white text-xs"
          />
        </div>
        <div className="sm:col-span-2">
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={isPending}
            className="h-8 w-full text-xs"
          >
            {isPending ? "Subiendo…" : isReady ? "Reemplazar" : "Cargar 300 DPI"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function B2bWorkshopMastersPanel({
  orderId,
  b2bArtworkReady,
  lines,
}: {
  orderId: string;
  b2bArtworkReady: boolean;
  lines: B2bWorkshopLineSummary[];
}) {
  if (lines.length === 0) return null;

  return (
    <div className="border-brand-purple/20 rounded-xl border bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ImagePlus className="text-brand-purple h-4 w-4" />
          <h3 className="text-brand-purple-dark text-sm font-bold">
            Arte maestro 300 DPI · Pedido B2B / Eventos
          </h3>
        </div>
        {b2bArtworkReady ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            ✔ Todas las líneas personalizadas tienen arte 300 DPI
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
            ⚠ Pendiente cargar arte maestro — bloquea ZIP y despacho
          </span>
        )}
      </div>

      <p className="text-brand-muted mt-1 text-xs">
        Sube los archivos finales revisados con el cliente corporativo o de evento (PNG, JPG o WebP
        en alta resolución). Se normalizan automáticamente como PNG de producción sin pérdida y
        habilitan el paquete ZIP con <code>LEEME.txt</code>.
      </p>

      <div className="mt-3 space-y-2.5">
        {lines.map((line) => (
          <B2bWorkshopLineForm key={line.orderItemId} orderId={orderId} line={line} />
        ))}
      </div>
    </div>
  );
}
