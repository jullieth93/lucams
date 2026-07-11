"use client";

/*
 * Step 1 — Datos del cliente (Lucy 2026-05-21 — validaciones reales).
 *
 * Validación cliente-side estricta:
 *   - Nombre: solo letras + capitalización al perder foco
 *   - Email: validación formato + autocomplete dominios + detección typos
 *   - Teléfono: 10 dígitos móvil CO con auto-formato "300 887 3826"
 *   - Documento: regex por tipo (CC/CE/NIT/PP/TI)
 *   - Departamento/Ciudad: dropdowns DANE divipola (catálogo curado)
 *   - Código postal: autocompletado por ciudad si DANE lo tiene
 *   - Dirección: 4 campos estructurados (Vía + Número + #Cruce + Detalle)
 */

import { useActionState, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveDatosAction, type DatosActionState } from "./actions";
import type { CheckoutState } from "@/lib/checkout-session";
import {
  DEPARTMENTS,
  getCitiesByDeptCode,
  getCityByCode,
  type DaneCity,
} from "@/lib/dane-divipola";
import {
  DOCUMENT_TYPE_LABELS,
  capitalizeName,
  formatPhone,
  getDocumentHelp,
  stripPhone,
  validateDocument,
  validateName,
  validatePhone,
  type DocumentType,
} from "@/lib/colombia-validators";
import { detectEmailTypo, isValidEmail, suggestEmails } from "@/lib/email-domains";
import { VIA_TYPES } from "@/features/checkout/schemas";
import type { CheckoutPrefillAddress } from "@/features/addresses/service";

export function DatosForm({
  initial,
  savedAddresses = [],
  canSaveAddress = false,
}: {
  initial: CheckoutState;
  savedAddresses?: CheckoutPrefillAddress[];
  // true solo si hay cliente logueado → ofrecer "guardar esta dirección".
  canSaveAddress?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DatosActionState | null, FormData>(
    saveDatosAction,
    null,
  );

  // Estado local de cada campo con validación reactiva
  const [fullName, setFullName] = useState(initial.contact?.fullName ?? "");
  const [email, setEmail] = useState(initial.contact?.email ?? "");
  const [emailSuggestions, setEmailSuggestions] = useState<string[]>([]);
  const [emailTypoFix, setEmailTypoFix] = useState<string | null>(null);
  const [phoneDisplay, setPhoneDisplay] = useState(
    initial.contact?.phone ? formatPhone(initial.contact.phone) : "",
  );
  const [docType, setDocType] = useState<DocumentType | "">(initial.contact?.documentType ?? "");
  const [docNumber, setDocNumber] = useState(initial.contact?.documentNumber ?? "");

  // Address DANE
  const [deptCode, setDeptCode] = useState(initial.address?.deptCode ?? "");
  const [cityCode, setCityCode] = useState(initial.address?.cityCode ?? "");
  const [zip, setZip] = useState(initial.address?.zip ?? "");
  // Discriminated union urbana/rural (Lucy 2026-05-21)
  const [addressKind, setAddressKind] = useState<"urban" | "rural">(
    initial.address?.kind ?? "urban",
  );
  // Urban fields — nomenclatura colombiana completa (Lucy 2026-05-21)
  const [viaType, setViaType] = useState<(typeof VIA_TYPES)[number]>(
    initial.address?.kind === "urban" ? initial.address.viaType : "Calle",
  );
  const [viaNumber, setViaNumber] = useState(
    initial.address?.kind === "urban" ? initial.address.viaNumber : "",
  );
  const [viaBis, setViaBis] = useState<boolean>(
    initial.address?.kind === "urban" ? !!initial.address.viaBis : false,
  );
  const [viaCardinal, setViaCardinal] = useState<string>(
    initial.address?.kind === "urban" ? (initial.address.viaCardinal ?? "") : "",
  );
  const [cruceNumber, setCruceNumber] = useState(
    initial.address?.kind === "urban" ? initial.address.cruceNumber : "",
  );
  const [cruceCardinal, setCruceCardinal] = useState<string>(
    initial.address?.kind === "urban" ? (initial.address.cruceCardinal ?? "") : "",
  );
  const [detail, setDetail] = useState(
    initial.address?.kind === "urban" ? (initial.address.detail ?? "") : "",
  );
  // Rural fields
  const [vereda, setVereda] = useState(
    initial.address?.kind === "rural" ? initial.address.vereda : "",
  );
  const [finca, setFinca] = useState(
    initial.address?.kind === "rural" ? (initial.address.finca ?? "") : "",
  );
  const [referencia, setReferencia] = useState(
    initial.address?.kind === "rural" ? initial.address.referencia : "",
  );
  const [notes, setNotes] = useState(initial.address?.notes ?? "");

  // Preview live de cómo se verá la dirección en la guía del courier
  const addressPreview = useMemo(() => {
    if (addressKind === "urban") {
      if (!viaNumber || !cruceNumber) return "";
      const viaParts = [viaType, viaNumber.toUpperCase()];
      if (viaBis) viaParts.push("Bis");
      if (viaCardinal) viaParts.push(viaCardinal);
      const cruceParts = ["#", cruceNumber.toUpperCase()];
      if (cruceCardinal) cruceParts.push(cruceCardinal);
      const base = `${viaParts.join(" ")} ${cruceParts.join(" ")}`;
      return detail.trim() ? `${base} (${detail.trim()})` : base;
    }
    if (!vereda) return "";
    const parts: string[] = [`Vereda ${vereda}`];
    if (finca.trim()) parts.push(`Finca ${finca.trim()}`);
    if (referencia.trim()) parts.push(`Ref: ${referencia.trim()}`);
    return parts.join(" · ");
  }, [
    addressKind,
    viaType,
    viaNumber,
    viaBis,
    viaCardinal,
    cruceNumber,
    cruceCardinal,
    detail,
    vereda,
    finca,
    referencia,
  ]);

  // Billing
  const [wantsInvoice, setWantsInvoice] = useState<boolean>(initial.billing?.wantsInvoice ?? false);

  // "Guardar esta dirección en mi cuenta" (opt-in, solo clientes logueados).
  const [saveToAccount, setSaveToAccount] = useState(false);
  const [saveAddressLabel, setSaveAddressLabel] = useState("");

  // Cities filtradas por depto elegido
  const cities = useMemo<DaneCity[]>(
    () => (deptCode ? getCitiesByDeptCode(deptCode) : []),
    [deptCode],
  );
  const selectedDept = useMemo(() => DEPARTMENTS.find((d) => d.code === deptCode), [deptCode]);
  const selectedCity = useMemo(() => getCityByCode(cityCode), [cityCode]);

  // ─── Handlers ───

  // Limpia TODOS los campos de dirección a un estado por defecto. Crítico antes de
  // aplicar una guardada: si no, la calle/tipo previos (de otra selección o tipeo
  // manual) quedan pegados y se enviaría una dirección MEZCLADA (ciudad nueva +
  // calle vieja) que pasa validación silenciosamente (revisión adversarial #1).
  function resetAddressFields() {
    setDeptCode("");
    setCityCode("");
    setZip("");
    setAddressKind("urban");
    setViaType("Calle");
    setViaNumber("");
    setViaBis(false);
    setViaCardinal("");
    setCruceNumber("");
    setCruceCardinal("");
    setDetail("");
    setVereda("");
    setFinca("");
    setReferencia("");
  }

  // Rellena la dirección desde una guardada. Reset primero (estado limpio), luego:
  // structured (form nuevo) → reuso 100%; legacy (sin structured) → solo depto/ciudad/CP.
  function applySavedAddress(id: string) {
    const a = savedAddresses.find((x) => x.id === id);
    if (!a) return;
    resetAddressFields();
    const s = a.structured;
    if (s) {
      setDeptCode(String(s.deptCode ?? ""));
      setCityCode(String(s.cityCode ?? ""));
      setZip(String(s.zip ?? ""));
      const kind = s.kind === "rural" ? "rural" : "urban";
      setAddressKind(kind);
      if (kind === "urban") {
        setViaType((String(s.viaType ?? "Calle") as (typeof VIA_TYPES)[number]) || "Calle");
        setViaNumber(String(s.viaNumber ?? ""));
        setViaBis(Boolean(s.viaBis));
        setViaCardinal(String(s.viaCardinal ?? ""));
        setCruceNumber(String(s.cruceNumber ?? ""));
        setCruceCardinal(String(s.cruceCardinal ?? ""));
        setDetail(String(s.detail ?? ""));
      } else {
        setVereda(String(s.vereda ?? ""));
        setFinca(String(s.finca ?? ""));
        setReferencia(String(s.referencia ?? ""));
      }
    } else {
      if (a.deptCode) setDeptCode(a.deptCode);
      if (a.cityCode) setCityCode(a.cityCode);
      if (a.zip) setZip(a.zip);
    }
  }

  function handleNameBlur() {
    if (fullName.trim()) setFullName(capitalizeName(fullName));
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setEmailTypoFix(null);
    if (value.includes("@") && !value.includes(" ")) {
      const dotIdx = value.indexOf("@") + 1;
      const domainPart = value.slice(dotIdx);
      if (!domainPart.includes(".") || domainPart.endsWith(".")) {
        setEmailSuggestions(suggestEmails(value, 4));
      } else {
        setEmailSuggestions([]);
      }
    } else {
      setEmailSuggestions([]);
    }
  }

  function handleEmailBlur() {
    setEmailSuggestions([]);
    if (email.trim()) {
      const typo = detectEmailTypo(email.trim().toLowerCase());
      setEmailTypoFix(typo);
    }
  }

  function handlePhoneChange(value: string) {
    setPhoneDisplay(formatPhone(value));
  }

  function handleDeptChange(newCode: string) {
    setDeptCode(newCode);
    setCityCode("");
    setZip("");
  }

  function handleCityChange(newCode: string) {
    setCityCode(newCode);
    const city = getCityByCode(newCode);
    if (city?.zip) setZip(city.zip);
  }

  function handleCruceChange(value: string) {
    // Auto-formato: si tipea solo dígitos, sugiere "NN-NN" cuando alcanza 2-3 dígitos.
    // No fuerza guion, solo limpia caracteres no válidos.
    const cleaned = value.replace(/[^\dA-Za-z-]/g, "").toUpperCase();
    setCruceNumber(cleaned);
  }

  // Validaciones derivadas
  const isPhoneValid = phoneDisplay.length === 0 || validatePhone(phoneDisplay);
  const isNameValid = fullName.length === 0 || validateName(fullName);
  const isEmailValid = email.length === 0 || isValidEmail(email);
  const isDocValid = !docType || docNumber.length === 0 || validateDocument(docType, docNumber);

  function err(field: string): string | null {
    return state?.fieldErrors?.[field]?.[0] ?? null;
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* CONTACTO */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-4 text-lg font-bold">1. Contacto</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nombre */}
          <div>
            <Label
              htmlFor="fullName"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Nombre completo <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="fullName"
              name="fullName"
              required
              placeholder="Ej. Lucy Hurtado"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={handleNameBlur}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <FieldHint
              clientError={
                fullName.length > 0 && !isNameValid
                  ? "Solo letras, espacios y acentos (sin números)"
                  : null
              }
              serverError={err("fullName")}
            />
          </div>

          {/* Email con autocomplete */}
          <div className="relative">
            <Label
              htmlFor="email"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Email <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              onBlur={handleEmailBlur}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              autoComplete="email"
            />
            {/* Dropdown sugerencias */}
            {emailSuggestions.length > 0 && (
              <ul className="border-brand-purple/20 absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
                {emailSuggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="text-brand-purple-dark hover:bg-brand-purple/10 block w-full px-3 py-2 text-left text-sm"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEmail(s);
                        setEmailSuggestions([]);
                      }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FieldHint
              clientError={email.length > 0 && !isEmailValid ? "Email inválido" : null}
              serverError={err("email")}
              hint="Aquí te enviamos la confirmación + tracking"
            />
            {/* Sugerencia de typo */}
            {emailTypoFix && (
              <p className="mt-1 text-xs text-amber-700">
                ¿Quisiste decir{" "}
                <button
                  type="button"
                  onClick={() => {
                    setEmail(emailTypoFix);
                    setEmailTypoFix(null);
                  }}
                  className="font-semibold underline"
                >
                  {emailTypoFix}
                </button>
                ?
              </p>
            )}
          </div>

          {/* Teléfono */}
          <div>
            <Label
              htmlFor="phone-display"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Teléfono móvil <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="phone-display"
              type="tel"
              required
              placeholder="300 887 3826"
              value={phoneDisplay}
              onChange={(e) => handlePhoneChange(e.target.value)}
              maxLength={12} // 10 dígitos + 2 espacios
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              autoComplete="tel-national"
              inputMode="numeric"
            />
            {/* Campo hidden con el valor sin formato (lo que se envía al server) */}
            <input type="hidden" name="phone" value={stripPhone(phoneDisplay)} />
            <FieldHint
              clientError={
                phoneDisplay.length > 0 && !isPhoneValid
                  ? "Móvil colombiano: 10 dígitos empezando con 3"
                  : null
              }
              serverError={err("phone")}
              hint="El courier lo usa para coordinar entrega"
            />
          </div>

          {/* Documento (opcional) */}
          <div>
            <Label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              Documento (opcional, requerido si quieres factura)
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <select
                name="contactDocumentType"
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType | "")}
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 col-span-1 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="">—</option>
                {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Input
                id="contactDocumentNumber"
                name="contactDocumentNumber"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                disabled={!docType}
                placeholder={docType ? "1234567890" : "Elige tipo primero"}
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 col-span-2"
              />
            </div>
            <FieldHint
              clientError={
                docType && docNumber.length > 0 && !isDocValid
                  ? `Formato inválido. ${getDocumentHelp(docType as DocumentType)}`
                  : null
              }
              serverError={err("documentNumber")}
              hint={docType ? getDocumentHelp(docType as DocumentType) : undefined}
            />
          </div>
        </div>
      </section>

      {/* DIRECCIÓN */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-4 text-lg font-bold">
          2. Dirección de envío
        </h2>

        {/* USAR DIRECCIÓN GUARDADA — solo si el cliente logueado tiene direcciones */}
        {savedAddresses.length > 0 && (
          <div className="border-brand-purple/25 bg-brand-purple/5 mb-4 rounded-xl border p-3">
            <label
              htmlFor="saved-address"
              className="text-brand-purple-dark mb-1.5 block text-sm font-semibold"
            >
              📍 Usar una dirección guardada
            </label>
            <select
              id="saved-address"
              defaultValue=""
              onChange={(e) => e.target.value && applySavedAddress(e.target.value)}
              className="border-brand-purple/25 focus:border-brand-purple h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              <option value="">Escribir una dirección nueva…</option>
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.isDefault ? " (predeterminada)" : ""} — {a.line1}
                </option>
              ))}
            </select>
            <p className="text-brand-muted mt-1.5 text-xs">
              Rellenamos tu dirección guardada. Revisa que esté completa antes de continuar.
            </p>
          </div>
        )}

        {/* Depto + Ciudad + CP */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <Label
              htmlFor="deptCode"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Departamento <span className="text-rose-600">*</span>
            </Label>
            <select
              id="deptCode"
              name="deptCode"
              required
              value={deptCode}
              onChange={(e) => handleDeptChange(e.target.value)}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Elige departamento...</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
            <FieldHint clientError={null} serverError={err("deptCode")} />
            {/* Hidden snapshot human-readable */}
            <input type="hidden" name="department" value={selectedDept?.name ?? ""} />
          </div>

          <div className="sm:col-span-3">
            <Label
              htmlFor="cityCode"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Ciudad <span className="text-rose-600">*</span>
            </Label>
            <select
              id="cityCode"
              name="cityCode"
              required
              value={cityCode}
              onChange={(e) => handleCityChange(e.target.value)}
              disabled={!deptCode}
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {deptCode ? "Elige ciudad..." : "Elige departamento primero"}
              </option>
              {cities.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldHint
              clientError={deptCode && cities.length > 0 && !cityCode ? null : null}
              serverError={err("cityCode")}
              hint={
                deptCode && cities.length === 0
                  ? "No tenemos esa ciudad en el catálogo. Contactanos por WhatsApp."
                  : undefined
              }
            />
            <input type="hidden" name="city" value={selectedCity?.name ?? ""} />
          </div>

          <div className="sm:col-span-2">
            <Label
              htmlFor="zip"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              Código postal (opcional)
            </Label>
            <Input
              id="zip"
              name="zip"
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="110111"
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              inputMode="numeric"
            />
            <FieldHint
              clientError={null}
              serverError={err("zip")}
              hint={selectedCity?.zip ? "Autocompletado para tu ciudad" : "6 dígitos"}
            />
          </div>
        </div>

        {/* Toggle Urbana / Rural (Lucy 2026-05-21) */}
        <div className="mt-4">
          <Label className="text-brand-purple-dark mb-2 block text-xs font-semibold">
            Tipo de dirección <span className="text-rose-600">*</span>
          </Label>
          <input type="hidden" name="addressKind" value={addressKind} />
          <div role="radiogroup" aria-label="Tipo de dirección" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={addressKind === "urban"}
              onClick={() => setAddressKind("urban")}
              className={
                "rounded-lg border-2 p-3 text-left transition-all " +
                (addressKind === "urban"
                  ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                  : "border-brand-purple/15 hover:border-brand-purple/30")
              }
            >
              <div className="text-brand-purple-dark text-sm font-semibold">🏙️ Urbana</div>
              <div className="text-brand-muted text-xs">
                Calle / Carrera + número (nomenclatura DIAN)
              </div>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={addressKind === "rural"}
              onClick={() => setAddressKind("rural")}
              className={
                "rounded-lg border-2 p-3 text-left transition-all " +
                (addressKind === "rural"
                  ? "border-brand-purple bg-brand-purple/5 ring-brand-purple/20 ring-2"
                  : "border-brand-purple/15 hover:border-brand-purple/30")
              }
            >
              <div className="text-brand-purple-dark text-sm font-semibold">🌳 Rural</div>
              <div className="text-brand-muted text-xs">
                Vereda / Finca / Corregimiento + referencias
              </div>
            </button>
          </div>
        </div>

        {addressKind === "urban" ? (
          <>
            {/* Dirección urbana — nomenclatura colombiana completa
                (Lucy 2026-05-21: bis + cardinal + letras) */}
            <div className="mt-4 space-y-3">
              <Label className="text-brand-purple-dark block text-xs font-semibold">
                Dirección <span className="text-rose-600">*</span>
              </Label>

              {/* Primera fila: Tipo de vía + Número + Bis + Cardinal */}
              <div>
                <p className="text-brand-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">
                  Vía principal
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <select
                    name="viaType"
                    value={viaType}
                    onChange={(e) => setViaType(e.target.value as (typeof VIA_TYPES)[number])}
                    aria-label="Tipo de vía"
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:col-span-4"
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
                    value={viaNumber}
                    onChange={(e) =>
                      setViaNumber(e.target.value.toUpperCase().replace(/[^\dA-Z]/g, ""))
                    }
                    placeholder="7A"
                    maxLength={10}
                    className="border-brand-purple/20 focus-visible:ring-brand-purple/30 sm:col-span-3"
                    aria-label="Número de vía"
                  />
                  <label className="border-brand-purple/20 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-white px-2 text-xs sm:col-span-2">
                    <input
                      type="checkbox"
                      name="viaBis"
                      checked={viaBis}
                      onChange={(e) => setViaBis(e.target.checked)}
                      className="accent-brand-purple h-3.5 w-3.5"
                    />
                    <span className="text-brand-purple-dark font-semibold">Bis</span>
                  </label>
                  <select
                    name="viaCardinal"
                    value={viaCardinal}
                    onChange={(e) => setViaCardinal(e.target.value)}
                    aria-label="Cuadrante de vía"
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:col-span-3"
                  >
                    <option value="">— Cuadrante —</option>
                    <option value="Norte">Norte</option>
                    <option value="Sur">Sur</option>
                    <option value="Este">Este</option>
                    <option value="Oeste">Oeste</option>
                  </select>
                </div>
                <FieldHint
                  clientError={null}
                  serverError={err("viaNumber")}
                  hint="Ej. Carrera 7A Bis Sur"
                />
              </div>

              {/* Segunda fila: Cruce + Cardinal del cruce */}
              <div>
                <p className="text-brand-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">
                  Cruce
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <div className="border-brand-purple/20 col-span-1 hidden h-9 items-center justify-center rounded-md border bg-slate-50 text-sm font-bold text-slate-600 sm:flex">
                    #
                  </div>
                  <Input
                    name="cruceNumber"
                    required
                    value={cruceNumber}
                    onChange={(e) => handleCruceChange(e.target.value)}
                    placeholder="23-45"
                    maxLength={20}
                    className="border-brand-purple/20 focus-visible:ring-brand-purple/30 sm:col-span-8"
                    aria-label="Cruce"
                  />
                  <select
                    name="cruceCardinal"
                    value={cruceCardinal}
                    onChange={(e) => setCruceCardinal(e.target.value)}
                    aria-label="Cuadrante del cruce"
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:col-span-3"
                  >
                    <option value="">— Cuadrante —</option>
                    <option value="Norte">Norte</option>
                    <option value="Sur">Sur</option>
                    <option value="Este">Este</option>
                    <option value="Oeste">Oeste</option>
                  </select>
                </div>
                <FieldHint
                  clientError={null}
                  serverError={err("cruceNumber")}
                  hint="Formato: 23-45 o 13B-42C"
                />
              </div>
            </div>

            <div className="mt-4">
              <Label
                htmlFor="detail"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Complemento (opcional)
              </Label>
              <Input
                id="detail"
                name="detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Apto 401, Conjunto Lucams, casa color rosa..."
                maxLength={200}
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              />
            </div>
          </>
        ) : (
          <>
            {/* Dirección rural */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="vereda"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  Vereda / Corregimiento / Sector <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="vereda"
                  name="vereda"
                  required
                  value={vereda}
                  onChange={(e) => setVereda(e.target.value)}
                  placeholder="Ej. Vereda El Roble"
                  maxLength={120}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
                <FieldHint clientError={null} serverError={err("vereda")} />
              </div>
              <div>
                <Label
                  htmlFor="finca"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  Finca / Lugar (opcional)
                </Label>
                <Input
                  id="finca"
                  name="finca"
                  value={finca}
                  onChange={(e) => setFinca(e.target.value)}
                  placeholder="Ej. Finca Las Flores"
                  maxLength={120}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
              </div>
            </div>
            <div className="mt-4">
              <Label
                htmlFor="referencia"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Indicaciones para llegar <span className="text-rose-600">*</span>
              </Label>
              <textarea
                id="referencia"
                name="referencia"
                required
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Ej. A 200m del puente sobre el río, casa de dos pisos color azul, portón de madera. Llamar al llegar."
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
              <FieldHint
                clientError={
                  referencia.length > 0 && referencia.length < 10
                    ? "Mínimo 10 caracteres — el courier necesita referencias claras"
                    : null
                }
                serverError={err("referencia")}
                hint="Cuanto más detallada la referencia, más fácil para el courier"
              />
            </div>
          </>
        )}

        {/* Preview live de cómo se verá la dirección */}
        {addressPreview && (
          <div className="border-brand-purple/15 bg-brand-purple/5 mt-4 rounded-lg border p-3">
            <p className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
              📦 Así verá tu dirección el courier
            </p>
            <p className="text-brand-purple-dark mt-1 text-sm">{addressPreview}</p>
            {selectedCity && selectedDept && (
              <p className="text-brand-muted text-xs">
                {selectedCity.name}, {selectedDept.name}
                {zip && ` · CP ${zip}`}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <Label
            htmlFor="notes"
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            Notas para el courier (opcional)
          </Label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder="Ej. timbre 2, dejar con portería"
            className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        {/* Guardar la dirección para la próxima (solo clientes logueados) */}
        {canSaveAddress && (
          <div className="border-brand-purple/10 mt-4 border-t pt-4">
            <label className="text-brand-purple-dark flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="saveToAccount"
                checked={saveToAccount}
                onChange={(e) => setSaveToAccount(e.target.checked)}
                className="accent-brand-purple h-4 w-4 rounded"
              />
              💾 Guardar esta dirección en mi cuenta para la próxima
            </label>
            {saveToAccount && (
              <div className="mt-2">
                <Label
                  htmlFor="saveAddressLabel"
                  className="text-brand-muted mb-1 block text-xs font-semibold"
                >
                  Nombre para recordarla (opcional)
                </Label>
                <Input
                  id="saveAddressLabel"
                  name="saveAddressLabel"
                  value={saveAddressLabel}
                  onChange={(e) => setSaveAddressLabel(e.target.value.slice(0, 60))}
                  placeholder="Ej. Casa, Oficina, Casa de mamá"
                  maxLength={60}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* FACTURACIÓN */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-2 text-lg font-bold">
          3. Facturación electrónica
        </h2>
        <p className="text-brand-muted mb-4 text-sm">
          Si necesitas factura DIAN, marcá la casilla. Si es compra personal, dejala sin marcar.
        </p>

        <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="wantsInvoice"
            checked={wantsInvoice}
            onChange={(e) => setWantsInvoice(e.target.checked)}
            className="accent-brand-purple h-4 w-4"
          />
          Quiero factura electrónica
        </label>

        {wantsInvoice && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <Label
                htmlFor="billingDocumentType"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Tipo doc <span className="text-rose-600">*</span>
              </Label>
              <select
                id="billingDocumentType"
                name="billingDocumentType"
                defaultValue={initial.billing?.documentType ?? "NIT"}
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="NIT">NIT</option>
                <option value="CC">CC</option>
                <option value="CE">CE</option>
                <option value="PP">Pasaporte</option>
              </select>
            </div>
            <div className="sm:col-span-4">
              <Label
                htmlFor="billingDocumentNumber"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Número documento <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="billingDocumentNumber"
                name="billingDocumentNumber"
                required={wantsInvoice}
                defaultValue={initial.billing?.documentNumber ?? ""}
                placeholder="900.123.456-7"
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              />
              <FieldHint clientError={null} serverError={err("billingDocumentNumber")} />
            </div>
            <div className="sm:col-span-6">
              <Label
                htmlFor="billingName"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                Razón social o nombre <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="billingName"
                name="billingName"
                required={wantsInvoice}
                defaultValue={initial.billing?.name ?? ""}
                placeholder="Lucams S.A.S."
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              />
              <FieldHint clientError={null} serverError={err("billingName")} />
            </div>
          </div>
        )}
        {err("wantsInvoice") && <p className="mt-2 text-xs text-rose-600">{err("wantsInvoice")}</p>}
      </section>

      {state?.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          ⚠️ {state.error}
        </div>
      )}

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          disabled={pending}
          size="lg"
          className="bg-gradient-brand w-full text-white hover:brightness-110 sm:w-auto"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…
            </>
          ) : (
            "Continuar al envío →"
          )}
        </Button>
      </div>
    </form>
  );
}

function FieldHint({
  clientError,
  serverError,
  hint,
}: {
  clientError: string | null;
  serverError: string | null;
  hint?: string;
}) {
  if (clientError) return <p className="mt-1 text-xs text-rose-600">{clientError}</p>;
  if (serverError) return <p className="mt-1 text-xs text-rose-600">{serverError}</p>;
  if (hint) return <p className="text-brand-muted mt-1 text-xs">{hint}</p>;
  return null;
}
