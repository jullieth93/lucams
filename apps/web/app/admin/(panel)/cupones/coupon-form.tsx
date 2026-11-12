"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { AlertCircle, HelpCircle, Lock } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { Hint } from "@/components/ui/tooltip";
import { SlugRestrictionSelect, type SlugOption } from "./slug-restriction-select";
import type { CouponActionState } from "./actions";
import { formatIsoDateCO } from "@/lib/datetime";

export type EditableCoupon = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED" | "FREE_SHIPPING";
  /** Centavos COP para FIXED; porcentaje (1-100) para PERCENT; 0 en FREE_SHIPPING. */
  value: number;
  description: string | null;
  isPublic: boolean;
  isActive: boolean;
  validFrom: Date;
  validTo: Date;
  /** Centavos COP (null = sin mínimo). */
  minOrder: number | null;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  requiresMinQuantity: number | null;
  appliesToCategories: string[];
  appliesToProductSlugs: string[];
  /** Si es true, el cupón pertenece a un cliente puntual (D3: isPublic bloqueado). */
  isPersonal?: boolean;
};

const inputCls =
  "border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-10 w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

export function CouponForm({
  mode,
  action,
  coupon,
  categories,
  products,
  readOnly = false,
}: {
  mode: "create" | "edit";
  action: (state: CouponActionState | null, payload: FormData) => Promise<CouponActionState | null>;
  coupon?: EditableCoupon;
  categories: SlugOption[];
  products: SlugOption[];
  readOnly?: boolean;
}) {
  const [state, formAction, isPending] = useActionState<CouponActionState | null, FormData>(
    action,
    null,
  );
  const [type, setType] = useState<"PERCENT" | "FIXED" | "FREE_SHIPPING">(
    coupon?.type ?? "PERCENT",
  );
  const [valueStr, setValueStr] = useState(
    coupon ? (coupon.type === "FIXED" ? String(coupon.value / 100) : String(coupon.value)) : "",
  );
  const [minOrderStr, setMinOrderStr] = useState(
    coupon?.minOrder != null ? String(coupon.minOrder / 100) : "",
  );

  const isPersonal = Boolean(coupon?.isPersonal);
  const toDateInput = (d: Date) => formatIsoDateCO(d);
  const today = toDateInput(new Date());
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const nextMonthStr = toDateInput(nextMonth);

  return (
    <form action={formAction} className="space-y-4">
      {coupon && <input type="hidden" name="id" value={coupon.id} />}

      <fieldset disabled={readOnly} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              Código <span className="text-rose-600">*</span>
            </label>
            <input
              name="code"
              required
              defaultValue={coupon?.code}
              placeholder={coupon ? undefined : "ej. MAMA2026"}
              pattern="[A-Z0-9_-]+"
              className={`${inputCls} font-mono uppercase`}
              style={{ textTransform: "uppercase" }}
            />
            {state?.fieldErrors?.code && (
              <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.code[0]}</p>
            )}
          </div>

          <div>
            <label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              Tipo de beneficio <span className="text-rose-600">*</span>
            </label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className={inputCls}
            >
              <option value="PERCENT">% Descuento porcentual</option>
              <option value="FIXED">$ Descuento fijo en pesos</option>
              <option value="FREE_SHIPPING">Envío gratis</option>
            </select>
          </div>

          <div>
            <label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              Valor
              {type === "PERCENT" && (
                <span className="text-brand-muted font-normal"> (1–100%)</span>
              )}
              {type === "FIXED" && (
                <span className="text-brand-muted font-normal"> (pesos COP, máx. $100.000)</span>
              )}
              {type === "FREE_SHIPPING" && (
                <span className="text-brand-muted font-normal"> (no aplica)</span>
              )}
            </label>
            <input
              name="value"
              type="number"
              min={type === "FREE_SHIPPING" ? 0 : 1}
              max={type === "PERCENT" ? 100 : type === "FIXED" ? 100000 : undefined}
              step={1}
              required
              value={type === "FREE_SHIPPING" ? "0" : valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              disabled={readOnly || type === "FREE_SHIPPING"}
              placeholder={type === "PERCENT" ? "15" : type === "FIXED" ? "10000" : "—"}
              className={`${inputCls} tabular-nums`}
            />
            {type === "FIXED" && Number(valueStr) > 0 && (
              <p className="text-brand-muted mt-1 text-xs tabular-nums">
                = {formatCOP(Math.round(Number(valueStr) * 100))} de descuento sobre elegibles
              </p>
            )}
            {type === "PERCENT" && Number(valueStr) > 0 && (
              <p className="text-brand-muted mt-1 text-xs tabular-nums">
                = {valueStr}% de descuento sobre productos elegibles
              </p>
            )}
            {state?.fieldErrors?.value && (
              <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.value[0]}</p>
            )}
          </div>
        </div>

        <div>
          <label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
            Descripción comercial o nota interna
          </label>
          <input
            name="description"
            maxLength={200}
            defaultValue={coupon?.description ?? ""}
            placeholder="ej. 15% de descuento campaña Día de la Madre"
            className={inputCls}
          />
          <p className="text-brand-muted mt-1 text-xs">
            Si marcas el cupón como público, esta descripción podrá mostrarse a los compradores.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              Válido desde (hora Colombia) <span className="text-rose-600">*</span>
            </label>
            <input
              name="validFrom"
              type="date"
              required
              defaultValue={coupon ? toDateInput(coupon.validFrom) : today}
              className={inputCls}
            />
            {state?.fieldErrors?.validFrom && (
              <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.validFrom[0]}</p>
            )}
          </div>
          <div>
            <label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              Válido hasta (23:59 COT) <span className="text-rose-600">*</span>
            </label>
            <input
              name="validTo"
              type="date"
              required
              defaultValue={coupon ? toDateInput(coupon.validTo) : nextMonthStr}
              className={inputCls}
            />
            {state?.fieldErrors?.validTo && (
              <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.validTo[0]}</p>
            )}
          </div>
        </div>

        <div className="border-brand-purple/15 bg-brand-cream/25 space-y-3 rounded-xl border p-4">
          <p className="text-brand-purple-dark text-xs font-bold tracking-wide uppercase">
            Condiciones y alcance (opcional)
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-brand-purple-dark/85 mb-1 block text-xs font-medium">
                Subtotal mínimo del carrito (pesos COP)
              </label>
              <input
                name="minOrder"
                type="number"
                min={0}
                max={5000000}
                step={1}
                value={minOrderStr}
                onChange={(e) => setMinOrderStr(e.target.value)}
                placeholder="ej. 50000"
                className={`${inputCls} tabular-nums`}
              />
              {Number(minOrderStr) > 0 && (
                <p className="text-brand-muted mt-1 text-xs tabular-nums">
                  = {formatCOP(Math.round(Number(minOrderStr) * 100))}
                </p>
              )}
              {state?.fieldErrors?.minOrder && (
                <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.minOrder[0]}</p>
              )}
            </div>

            <div>
              <label className="text-brand-purple-dark/85 mb-1 flex items-center gap-1.5 text-xs font-medium">
                Cantidad mínima de unidades
                <Hint content="Unidades totales del carrito elegible que el cliente debe llevar para que el cupón aplique. Si el cupón restringe por categoría o producto, solo cuentan las unidades elegibles.">
                  <span tabIndex={0} className="text-brand-muted cursor-help">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </span>
                </Hint>
              </label>
              <input
                name="requiresMinQuantity"
                type="number"
                min={1}
                max={100000}
                step={1}
                defaultValue={coupon?.requiresMinQuantity ?? ""}
                placeholder="ej. 3"
                className={`${inputCls} tabular-nums`}
              />
              {state?.fieldErrors?.requiresMinQuantity && (
                <p className="mt-1 text-xs text-rose-600">
                  {state.fieldErrors.requiresMinQuantity[0]}
                </p>
              )}
            </div>

            <div>
              <label className="text-brand-purple-dark/85 mb-1 flex items-center gap-1.5 text-xs font-medium">
                Máximo de usos globales
                <Hint content="Tope total de redenciones confirmadas entre todos los clientes. Vacío = sin tope global.">
                  <span tabIndex={0} className="text-brand-muted cursor-help">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </span>
                </Hint>
              </label>
              <input
                name="maxUses"
                type="number"
                min={1}
                max={1000000}
                step={1}
                defaultValue={coupon?.maxUses ?? ""}
                placeholder="ej. 100"
                className={`${inputCls} tabular-nums`}
              />
              {state?.fieldErrors?.maxUses && (
                <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.maxUses[0]}</p>
              )}
            </div>

            <div>
              <label className="text-brand-purple-dark/85 mb-1 flex items-center gap-1.5 text-xs font-medium">
                Máximo de usos por cliente
                <Hint content="Cuántas veces puede redimir el cupón cada comprador (validado por cuenta y correo electrónico con bloqueo transaccional en base de datos).">
                  <span tabIndex={0} className="text-brand-muted cursor-help">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </span>
                </Hint>
              </label>
              <input
                name="maxUsesPerCustomer"
                type="number"
                min={1}
                max={1000000}
                step={1}
                defaultValue={coupon?.maxUsesPerCustomer ?? ""}
                placeholder="ej. 1"
                className={`${inputCls} tabular-nums`}
              />
              {state?.fieldErrors?.maxUsesPerCustomer && (
                <p className="mt-1 text-xs text-rose-600">
                  {state.fieldErrors.maxUsesPerCustomer[0]}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="text-brand-purple-dark/85 mb-1 flex items-center gap-1.5 text-xs font-medium">
                Solo aplica en estas categorías
                <Hint content="El descuento solo aplica a productos de las categorías elegidas. Vacío = aplica a todo el catálogo.">
                  <span tabIndex={0} className="text-brand-muted cursor-help">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </span>
                </Hint>
              </label>
              <SlugRestrictionSelect
                name="appliesToCategories"
                options={categories}
                initialSelected={coupon?.appliesToCategories}
                placeholder="Buscar categoría…"
                disabled={readOnly}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-brand-purple-dark/85 mb-1 flex items-center gap-1.5 text-xs font-medium">
                Solo aplica en estos productos
                <Hint content="El descuento solo aplica a los productos elegidos. Vacío = aplica a todo el catálogo.">
                  <span tabIndex={0} className="text-brand-muted cursor-help">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </span>
                </Hint>
              </label>
              <SlugRestrictionSelect
                name="appliesToProductSlugs"
                options={products}
                initialSelected={coupon?.appliesToProductSlugs}
                placeholder="Buscar producto…"
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={coupon ? coupon.isActive : true}
              className="accent-brand-purple h-4 w-4 rounded"
            />
            <span>Activo</span>
          </label>

          {isPersonal ? (
            <span className="text-brand-muted inline-flex items-center gap-1.5 text-xs">
              <Lock className="h-3.5 w-3.5" />
              Cupón personal e intransferible: bloqueado como privado (nunca se lista en el feed
              público).
            </span>
          ) : (
            <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="isPublic"
                defaultChecked={coupon?.isPublic ?? false}
                className="accent-brand-purple h-4 w-4 rounded"
              />
              <span>
                Público{" "}
                <span className="text-brand-muted font-normal">
                  (visible en el feed público de promociones vigentes de la tienda)
                </span>
              </span>
            </label>
          )}
        </div>
      </fieldset>

      {state?.error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        {!readOnly && (
          <button
            type="submit"
            disabled={isPending}
            className="bg-gradient-brand inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {mode === "create"
              ? isPending
                ? "Creando…"
                : "Crear cupón"
              : isPending
                ? "Guardando…"
                : "Guardar cambios"}
          </button>
        )}

        {mode === "create" ? (
          <button
            type="reset"
            disabled={isPending}
            onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")}
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex h-10 items-center rounded-lg border bg-white px-4 text-sm font-semibold disabled:opacity-60"
          >
            Cancelar
          </button>
        ) : (
          <Link
            href="/admin/cupones"
            className="border-brand-purple/20 text-brand-purple-dark hover:bg-brand-purple/5 inline-flex h-10 items-center rounded-lg border bg-white px-4 text-sm font-semibold"
          >
            {readOnly ? "Volver a Cupones" : "Cancelar"}
          </Link>
        )}
      </div>
    </form>
  );
}
