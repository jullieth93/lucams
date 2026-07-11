"use client";

/*
 * Campos de dirección ESTRUCTURADA colombiana (mismo formato que el checkout):
 * departamento/ciudad DANE en cascada + urbano/rural + vía/cruce/complemento |
 * vereda/finca/referencia. Componente CONTROLADO (value + onChange) que renderiza
 * inputs con `name=` para que un <form action> capture el formData.
 *
 * Se usa en /mi-cuenta/direcciones para que lo guardado se reuse 100% al pagar.
 * (El checkout mantiene su propio formulario inline; comparte el MISMO shape de
 * datos, así que puede adoptar este componente después sin cambiar la data.)
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEPARTMENTS,
  getCitiesByDeptCode,
  getDepartmentByCode,
  getCityByCode,
} from "@/lib/dane-divipola";
import { VIA_TYPES } from "@/features/checkout/schemas";

export type StructuredAddressValue = {
  deptCode: string;
  cityCode: string;
  zip: string;
  kind: "urban" | "rural";
  viaType: string;
  viaNumber: string;
  viaBis: boolean;
  viaCardinal: string;
  cruceNumber: string;
  cruceCardinal: string;
  detail: string;
  vereda: string;
  finca: string;
  referencia: string;
};

export const EMPTY_STRUCTURED_ADDRESS: StructuredAddressValue = {
  deptCode: "",
  cityCode: "",
  zip: "",
  kind: "urban",
  viaType: "Calle",
  viaNumber: "",
  viaBis: false,
  viaCardinal: "",
  cruceNumber: "",
  cruceCardinal: "",
  detail: "",
  vereda: "",
  finca: "",
  referencia: "",
};

const CARDINALS = ["", "Norte", "Sur", "Este", "Oeste"] as const;
const selectClass =
  "border-brand-purple/25 focus:border-brand-purple h-9 w-full rounded-md border bg-white px-2 text-sm focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";

export function StructuredAddressFields({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: StructuredAddressValue;
  onChange: (patch: Partial<StructuredAddressValue>) => void;
  errors?: Record<string, string[] | undefined>;
  disabled?: boolean;
}) {
  const cities = value.deptCode ? getCitiesByDeptCode(value.deptCode) : [];
  const deptName = getDepartmentByCode(value.deptCode)?.name ?? "";
  const cityName = getCityByCode(value.cityCode)?.name ?? "";
  const err = (k: string) => errors?.[k]?.[0];

  return (
    <div className="space-y-4">
      {/* Nombres humanos ocultos (para el snapshot que se guarda/muestra) */}
      <input type="hidden" name="department" value={deptName} />
      <input type="hidden" name="city" value={cityName} />
      <input type="hidden" name="addressKind" value={value.kind} />

      {/* Depto + Ciudad + CP */}
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="deptCode">Departamento *</Label>
          <select
            id="deptCode"
            name="deptCode"
            required
            value={value.deptCode}
            disabled={disabled}
            onChange={(e) => onChange({ deptCode: e.target.value, cityCode: "", zip: "" })}
            className={selectClass}
          >
            <option value="">Elige departamento…</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
          {err("deptCode") && <p className="text-destructive text-sm">{err("deptCode")}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="cityCode">Ciudad *</Label>
          <select
            id="cityCode"
            name="cityCode"
            required
            value={value.cityCode}
            disabled={disabled || !value.deptCode}
            onChange={(e) => {
              const city = getCityByCode(e.target.value);
              onChange({ cityCode: e.target.value, ...(city?.zip ? { zip: city.zip } : {}) });
            }}
            className={selectClass}
          >
            <option value="">
              {value.deptCode ? "Elige ciudad…" : "Elige departamento primero"}
            </option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {err("cityCode") && <p className="text-destructive text-sm">{err("cityCode")}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-6">
          <Label htmlFor="zip">Código postal (opcional)</Label>
          <Input
            id="zip"
            name="zip"
            value={value.zip}
            disabled={disabled}
            onChange={(e) => onChange({ zip: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="110111"
            inputMode="numeric"
            aria-invalid={Boolean(err("zip"))}
          />
          {err("zip") && <p className="text-destructive text-sm">{err("zip")}</p>}
        </div>
      </div>

      {/* Urbana / Rural */}
      <div>
        <Label className="mb-2 block">Tipo de dirección *</Label>
        <div role="radiogroup" aria-label="Tipo de dirección" className="grid grid-cols-2 gap-2">
          {(["urban", "rural"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={value.kind === k}
              disabled={disabled}
              onClick={() => onChange({ kind: k })}
              className={`rounded-lg border-2 p-3 text-left transition-all ${
                value.kind === k
                  ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                  : "border-brand-purple/15 hover:border-brand-purple/30"
              }`}
            >
              <div className="text-brand-purple-dark text-sm font-semibold">
                {k === "urban" ? "🏙️ Urbana" : "🌳 Rural"}
              </div>
              <div className="text-brand-muted text-xs">
                {k === "urban"
                  ? "Calle / Carrera + número"
                  : "Vereda / Finca / Corregimiento + referencias"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {value.kind === "urban" ? (
        <>
          <div className="space-y-1.5">
            <Label>Dirección *</Label>
            <p className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
              Vía principal
            </p>
            <div className="grid gap-2 sm:grid-cols-12">
              <select
                name="viaType"
                value={value.viaType}
                disabled={disabled}
                onChange={(e) => onChange({ viaType: e.target.value })}
                aria-label="Tipo de vía"
                className={`${selectClass} sm:col-span-4`}
              >
                {VIA_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <Input
                name="viaNumber"
                required
                value={value.viaNumber}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ viaNumber: e.target.value.toUpperCase().replace(/[^\dA-Z]/g, "") })
                }
                placeholder="7A"
                maxLength={10}
                aria-label="Número de vía"
                className="sm:col-span-3"
              />
              <label className="border-brand-purple/20 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-white px-2 text-xs sm:col-span-2">
                <input
                  type="checkbox"
                  name="viaBis"
                  checked={value.viaBis}
                  disabled={disabled}
                  onChange={(e) => onChange({ viaBis: e.target.checked })}
                  className="accent-brand-purple h-3.5 w-3.5"
                />
                <span className="text-brand-purple-dark font-semibold">Bis</span>
              </label>
              <select
                name="viaCardinal"
                value={value.viaCardinal}
                disabled={disabled}
                onChange={(e) => onChange({ viaCardinal: e.target.value })}
                aria-label="Cuadrante de vía"
                className={`${selectClass} sm:col-span-3`}
              >
                {CARDINALS.map((c) => (
                  <option key={c} value={c}>
                    {c || "— Cuadrante —"}
                  </option>
                ))}
              </select>
            </div>
            {err("viaNumber") && <p className="text-destructive text-sm">{err("viaNumber")}</p>}
            <p className="text-brand-muted text-xs">Ej. Carrera 7A Bis Sur</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-brand-muted text-[10px] font-semibold tracking-wide uppercase">
              Cruce
            </p>
            <div className="grid gap-2 sm:grid-cols-12">
              <div className="border-brand-purple/20 hidden h-9 items-center justify-center rounded-md border bg-slate-50 text-sm font-bold text-slate-600 sm:col-span-1 sm:flex">
                #
              </div>
              <Input
                name="cruceNumber"
                required
                value={value.cruceNumber}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ cruceNumber: e.target.value.toUpperCase().replace(/[^\dA-Z-]/g, "") })
                }
                placeholder="23-45"
                maxLength={20}
                aria-label="Cruce"
                className="sm:col-span-8"
              />
              <select
                name="cruceCardinal"
                value={value.cruceCardinal}
                disabled={disabled}
                onChange={(e) => onChange({ cruceCardinal: e.target.value })}
                aria-label="Cuadrante del cruce"
                className={`${selectClass} sm:col-span-3`}
              >
                {CARDINALS.map((c) => (
                  <option key={c} value={c}>
                    {c || "— Cuadrante —"}
                  </option>
                ))}
              </select>
            </div>
            {err("cruceNumber") && <p className="text-destructive text-sm">{err("cruceNumber")}</p>}
            <p className="text-brand-muted text-xs">Formato: 23-45 o 13B-42C</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="detail">Complemento (opcional)</Label>
            <Input
              id="detail"
              name="detail"
              value={value.detail}
              disabled={disabled}
              onChange={(e) => onChange({ detail: e.target.value })}
              placeholder="Apto 401, Torre 3, casa color rosa…"
              maxLength={200}
            />
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vereda">Vereda / Corregimiento / Sector *</Label>
              <Input
                id="vereda"
                name="vereda"
                required
                value={value.vereda}
                disabled={disabled}
                onChange={(e) => onChange({ vereda: e.target.value })}
                placeholder="Ej. Vereda El Roble"
                maxLength={120}
              />
              {err("vereda") && <p className="text-destructive text-sm">{err("vereda")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="finca">Finca / Lugar (opcional)</Label>
              <Input
                id="finca"
                name="finca"
                value={value.finca}
                disabled={disabled}
                onChange={(e) => onChange({ finca: e.target.value })}
                placeholder="Ej. Finca Las Flores"
                maxLength={120}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="referencia">Indicaciones para llegar *</Label>
            <textarea
              id="referencia"
              name="referencia"
              required
              value={value.referencia}
              disabled={disabled}
              onChange={(e) => onChange({ referencia: e.target.value })}
              rows={3}
              maxLength={300}
              placeholder="Ej. A 200m del puente, casa de dos pisos color azul, portón de madera."
              className="border-brand-purple/25 focus:border-brand-purple w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none"
            />
            {err("referencia") && <p className="text-destructive text-sm">{err("referencia")}</p>}
          </div>
        </>
      )}
    </div>
  );
}
