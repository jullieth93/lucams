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
import { getZoneCityByCode } from "@/lib/lucams-zones";
import { VIA_TYPES } from "@/features/checkout/schemas";
import {
  ALT_PHONE_HINT,
  ALT_PHONE_LABEL,
  DESTINATION_CONFIG,
  DESTINATION_FIELD_LABELS,
  DESTINATION_FIELD_MAX,
  DESTINATION_FIELD_PLACEHOLDERS,
  DESTINATION_GROUPS,
  DESTINATION_SUBTOGGLE,
  DESTINATION_TYPE_LABEL,
  FINCA_LABEL,
  RURAL_REF_PLACEHOLDER,
  type DestinationField,
  type DestinationType,
} from "@/features/checkout/destination-types";
import { CRUCE_HINT, viaHintText } from "@/lib/colombia-validators";

export type StructuredAddressValue = {
  deptCode: string;
  cityCode: string;
  // Zona de entrega (id de lib/lucams-zones.ts) — mismo campo `localityId` del
  // checkout: obligatoria cuando la ciudad está en el catálogo de zonas.
  localityId: string;
  zip: string;
  neighborhood: string;
  kind: "urban" | "rural";
  viaType: string;
  viaNumber: string;
  viaBis: boolean;
  viaCardinal: string;
  cruceNumber: string;
  cruceCardinal: string;
  // Tipo de destino + campos estructurados por tipo (2026-10, anti-devoluciones).
  // "" = sin elegir (direcciones viejas): el server lo exige al guardar.
  destinationType: DestinationType | "";
  apartment: string;
  tower: string;
  houseNumber: string;
  blockCode: string;
  complexName: string;
  floor: string;
  buildingName: string;
  officeNumber: string;
  companyName: string;
  referencePoint: string;
  vereda: string;
  finca: string;
  referencia: string;
  // Teléfono alternativo en la zona (rural, opcional) — va a la guía como
  // «Tel. zona: …» (anti-devoluciones: el mensajero no localiza a nadie).
  altPhone: string;
};

export const EMPTY_STRUCTURED_ADDRESS: StructuredAddressValue = {
  deptCode: "",
  cityCode: "",
  localityId: "",
  zip: "",
  neighborhood: "",
  kind: "urban",
  viaType: "Calle",
  viaNumber: "",
  viaBis: false,
  viaCardinal: "",
  cruceNumber: "",
  cruceCardinal: "",
  destinationType: "",
  apartment: "",
  tower: "",
  houseNumber: "",
  blockCode: "",
  complexName: "",
  floor: "",
  buildingName: "",
  officeNumber: "",
  companyName: "",
  referencePoint: "",
  vereda: "",
  finca: "",
  referencia: "",
  altPhone: "",
};

const CARDINALS = ["", "Norte", "Sur", "Este", "Oeste"] as const;
const selectClass =
  "border-brand-purple/25 focus:border-brand-purple h-9 w-full rounded-md border bg-white px-2 text-sm focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";

export function StructuredAddressFields({
  value,
  onChange,
  errors,
  disabled,
  neighborhoodPlaceholder,
}: {
  value: StructuredAddressValue;
  onChange: (patch: Partial<StructuredAddressValue>) => void;
  errors?: Record<string, string[] | undefined>;
  disabled?: boolean;
  /* Copy CMS (account.address.neighborhood-placeholder): baja resuelto por
     props porque este client no lee el CMS (mismo patrón que los demás
     textos del área de cliente). */
  neighborhoodPlaceholder: string;
}) {
  const cities = value.deptCode ? getCitiesByDeptCode(value.deptCode) : [];
  const deptName = getDepartmentByCode(value.deptCode)?.name ?? "";
  const cityName = getCityByCode(value.cityCode)?.name ?? "";
  // Zona de entrega (Localidad/Comuna) — solo si la ciudad está en el catálogo
  // (mismo criterio del checkout: allí es obligatoria; acá también lo valida el
  // server de /mi-cuenta/direcciones).
  const zoneCity = getZoneCityByCode(value.cityCode);
  const err = (k: string) => errors?.[k]?.[0];

  return (
    <div className="space-y-4">
      {/* Nombres humanos ocultos (para el snapshot que se guarda/muestra) */}
      <input type="hidden" name="department" value={deptName} />
      <input type="hidden" name="city" value={cityName} />
      <input type="hidden" name="addressKind" value={value.kind} />

      {/* Depto → Ciudad → Localidad → Barrio */}
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="deptCode">Departamento *</Label>
          <select
            id="deptCode"
            name="deptCode"
            required
            value={value.deptCode}
            disabled={disabled}
            onChange={(e) =>
              onChange({ deptCode: e.target.value, cityCode: "", localityId: "", zip: "" })
            }
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
              // CP derivado de la ciudad elegida (mismo criterio que el checkout):
              // solo el CP REAL del catálogo DANE; si la ciudad no lo tiene, el
              // campo queda VACÍO (el prefijo departamental no es un CP válido).
              // La localidad es específica de la ciudad — cambiarla la invalida.
              const city = getCityByCode(e.target.value);
              onChange({ cityCode: e.target.value, localityId: "", zip: city?.zip ?? "" });
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
        {zoneCity && (
          <div className="space-y-1.5 sm:col-span-6">
            <Label htmlFor="localityId">{zoneCity.zoneLabel} *</Label>
            <select
              id="localityId"
              name="localityId"
              required
              value={value.localityId}
              disabled={disabled}
              onChange={(e) => onChange({ localityId: e.target.value })}
              className={selectClass}
            >
              <option value="">Elige tu {zoneCity.zoneLabel.toLowerCase()}…</option>
              {zoneCity.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            {err("localityId") && <p className="text-destructive text-sm">{err("localityId")}</p>}
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-6">
          <Label htmlFor="neighborhood">Barrio (opcional)</Label>
          <Input
            id="neighborhood"
            name="neighborhood"
            value={value.neighborhood}
            disabled={disabled}
            onChange={(e) => onChange({ neighborhood: e.target.value })}
            placeholder={neighborhoodPlaceholder}
            maxLength={100}
            aria-invalid={Boolean(err("neighborhood"))}
          />
          {err("neighborhood") && <p className="text-destructive text-sm">{err("neighborhood")}</p>}
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
            <p className="text-brand-muted text-xs">{viaHintText(value.viaType)}</p>
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
            <p className="text-brand-muted text-xs">{CRUCE_HINT}</p>
          </div>

          {/* Tipo de destino + campos estructurados por tipo (2026-10,
              anti-devoluciones) — mismo selector y misma obligatoriedad que el
              checkout (fuente única: features/checkout/destination-types.ts).
              Reemplaza al «Complemento» libre. */}
          <div className="space-y-1.5">
            <Label className="mb-2 block">{DESTINATION_TYPE_LABEL} *</Label>
            <input type="hidden" name="destinationType" value={value.destinationType} />
            <div
              role="radiogroup"
              aria-label={DESTINATION_TYPE_LABEL}
              className="grid grid-cols-2 gap-2"
            >
              {DESTINATION_GROUPS.map((g) => {
                const checked =
                  g.id === "conjunto"
                    ? value.destinationType === "conjunto_torres" ||
                      value.destinationType === "conjunto_casas"
                    : value.destinationType === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        destinationType:
                          g.id === "conjunto" ? "conjunto_torres" : (g.id as DestinationType),
                      })
                    }
                    className={`rounded-lg border-2 p-2.5 text-center text-sm font-semibold transition-all ${
                      checked
                        ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 text-brand-purple-dark ring-2"
                        : "border-brand-purple/15 text-brand-purple-dark hover:border-brand-purple/30"
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
            {(value.destinationType === "conjunto_torres" ||
              value.destinationType === "conjunto_casas") && (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-xs">
                {(["torres", "casas"] as const).map((sub) => {
                  const t = sub === "torres" ? "conjunto_torres" : "conjunto_casas";
                  return (
                    <button
                      key={sub}
                      type="button"
                      role="radio"
                      aria-checked={value.destinationType === t}
                      disabled={disabled}
                      onClick={() => onChange({ destinationType: t })}
                      className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition-all ${
                        value.destinationType === t
                          ? "border-brand-purple bg-brand-purple/10 text-brand-purple-dark"
                          : "border-brand-purple/15 text-brand-muted hover:border-brand-purple/30"
                      }`}
                    >
                      {DESTINATION_SUBTOGGLE[sub]}
                    </button>
                  );
                })}
              </div>
            )}
            {err("destinationType") && (
              <p className="text-destructive text-sm">{err("destinationType")}</p>
            )}
          </div>

          {value.destinationType && (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ...DESTINATION_CONFIG[value.destinationType].required,
                ...DESTINATION_CONFIG[value.destinationType].optional,
              ].map((field: DestinationField) => {
                const isRequired =
                  DESTINATION_CONFIG[value.destinationType as DestinationType].required.includes(
                    field,
                  );
                return (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={field}>
                      {DESTINATION_FIELD_LABELS[field]}
                      {isRequired ? " *" : ""}
                    </Label>
                    <Input
                      id={field}
                      name={field}
                      value={value[field]}
                      disabled={disabled}
                      onChange={(e) => onChange({ [field]: e.target.value })}
                      placeholder={DESTINATION_FIELD_PLACEHOLDERS[field]}
                      maxLength={DESTINATION_FIELD_MAX[field]}
                      aria-invalid={Boolean(err(field))}
                    />
                    {err(field) && <p className="text-destructive text-sm">{err(field)}</p>}
                  </div>
                );
              })}
            </div>
          )}
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
              <Label htmlFor="finca">{FINCA_LABEL}</Label>
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
              placeholder={RURAL_REF_PLACEHOLDER}
              className="border-brand-purple/25 focus:border-brand-purple w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none"
            />
            {err("referencia") && <p className="text-destructive text-sm">{err("referencia")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="altPhone">{ALT_PHONE_LABEL}</Label>
            <Input
              id="altPhone"
              name="altPhone"
              type="tel"
              value={value.altPhone}
              disabled={disabled}
              onChange={(e) => onChange({ altPhone: e.target.value })}
              placeholder="300 887 3826"
              maxLength={12}
              inputMode="numeric"
              aria-invalid={Boolean(err("altPhone"))}
            />
            {err("altPhone") ? (
              <p className="text-destructive text-sm">{err("altPhone")}</p>
            ) : (
              <p className="text-brand-muted text-xs">{ALT_PHONE_HINT}</p>
            )}
          </div>
        </>
      )}

      {/* Código postal al final (tras el complemento): se autocompleta con el
          CP REAL de la ciudad cuando el catálogo DANE lo tiene; si no, queda
          vacío y el cliente puede escribirlo. */}
      <div className="space-y-1.5">
        <Label htmlFor="zip">Código postal (opcional)</Label>
        <Input
          id="zip"
          name="zip"
          value={value.zip}
          disabled={disabled}
          onChange={(e) => onChange({ zip: e.target.value.replace(/\D/g, "").slice(0, 6) })}
          placeholder="Opcional"
          inputMode="numeric"
          aria-invalid={Boolean(err("zip"))}
        />
        {err("zip") && <p className="text-destructive text-sm">{err("zip")}</p>}
      </div>
    </div>
  );
}
