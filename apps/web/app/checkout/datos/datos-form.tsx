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
 *   - Localidad (zona del catálogo lib/lucams-zones.ts): obligatoria si la
 *     ciudad está en el catálogo — dato de dirección, no filtro de oferta
 *   - Barrio: texto libre opcional (todas las ciudades)
 *   - Dirección: 4 campos estructurados (Vía + Número + #Cruce + Detalle)
 */

import { useActionState, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
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
import { getZoneCityByCode } from "@/lib/lucams-zones";
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
import type { CheckoutTexts } from "../checkout-texts";

export function DatosForm({
  initial,
  savedAddresses = [],
  canSaveAddress = false,
  texts,
}: {
  initial: CheckoutState;
  savedAddresses?: CheckoutPrefillAddress[];
  // true solo si hay cliente logueado → ofrecer "guardar esta dirección".
  canSaveAddress?: boolean;
  /** Textos CMS del formulario (roadmap B8) — los resuelve el padre server. */
  texts: CheckoutTexts["datos"];
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

  // #26 — "reward early, punish late": el error de validación cliente aparece solo tras el primer
  // blur del campo (touched) y se oculta al reeditar. Evita el rojo prematuro mientras se escribe.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (f: string) => setTouched((t) => ({ ...t, [f]: true }));
  const clearTouched = (f: string) => setTouched((t) => (t[f] ? { ...t, [f]: false } : t));

  // Address DANE
  const [deptCode, setDeptCode] = useState(initial.address?.deptCode ?? "");
  const [cityCode, setCityCode] = useState(initial.address?.cityCode ?? "");
  const [zip, setZip] = useState(initial.address?.zip ?? "");
  // Zona de entrega (localidad/comuna — lib/lucams-zones.ts) — DATO DE DIRECCIÓN:
  // se muestran TODAS las zonas del catálogo y es obligatoria siempre que la
  // ciudad esté en el catálogo, haya o no envío propio activo (las zonas
  // habilitadas en /admin/envios solo deciden si aparece la oferta "Envío
  // Lucam's" en el paso de envío).
  const [localityId, setLocalityId] = useState(initial.address?.localityId ?? "");
  const [neighborhood, setNeighborhood] = useState(initial.address?.neighborhood ?? "");
  const zoneCity = getZoneCityByCode(cityCode);
  const showZoneSelect = zoneCity !== null;
  const zoneOptions = zoneCity?.zones ?? [];
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
  const [billingDocType, setBillingDocType] = useState<"CC" | "CE" | "NIT" | "PP">(
    initial.billing?.documentType ?? "NIT",
  );
  const [billingDocNumber, setBillingDocNumber] = useState(initial.billing?.documentNumber ?? "");
  const [billingName, setBillingName] = useState(initial.billing?.name ?? "");
  // Autorización de tratamiento de datos (Ley 1581) — obligatoria antes de guardar la PII.
  const [dataConsent, setDataConsent] = useState<boolean>(false);

  // "Guardar esta dirección en mi cuenta" (opt-in, solo clientes logueados).
  const [saveToAccount, setSaveToAccount] = useState(false);
  const [saveAddressLabel, setSaveAddressLabel] = useState("");

  // FLUJO REGALO — "compro yo, lo recibe otra persona": toggle de destinatario
  // distinto (nombre + teléfono van a la guía) + checkbox "Es un regalo" con
  // mensaje opcional para la tarjeta. La facturación sigue siendo del comprador.
  const [hasRecipient, setHasRecipient] = useState<boolean>(Boolean(initial.gift));
  const [recipientName, setRecipientName] = useState(initial.gift?.recipientName ?? "");
  const [recipientPhoneDisplay, setRecipientPhoneDisplay] = useState(
    initial.gift?.recipientPhone ? formatPhone(initial.gift.recipientPhone) : "",
  );
  const [isGift, setIsGift] = useState<boolean>(initial.gift?.isGift ?? false);
  const [giftMessage, setGiftMessage] = useState(initial.gift?.giftMessage ?? "");

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
    setLocalityId("");
    setNeighborhood("");
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
      setLocalityId(String(s.localityId ?? ""));
      setNeighborhood(String(s.neighborhood ?? ""));
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
    markTouched("fullName");
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    setEmailTypoFix(null);
    clearTouched("email");
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
    markTouched("email");
    if (email.trim()) {
      const typo = detectEmailTypo(email.trim().toLowerCase());
      setEmailTypoFix(typo);
    }
  }

  function handlePhoneChange(value: string) {
    setPhoneDisplay(formatPhone(value));
    clearTouched("phone");
  }

  function handleDeptChange(newCode: string) {
    setDeptCode(newCode);
    setCityCode("");
    setZip("");
    setLocalityId("");
  }

  function handleCityChange(newCode: string) {
    setCityCode(newCode);
    const city = getCityByCode(newCode);
    if (city?.zip) setZip(city.zip);
    // La zona es específica de la ciudad — cambiar de ciudad la invalida.
    setLocalityId("");
  }

  function handleCruceChange(value: string) {
    // Auto-formato: si tipea solo dígitos, sugiere "NN-NN" cuando alcanza 2-3 dígitos.
    // No fuerza guion, solo limpia caracteres no válidos.
    const cleaned = value.replace(/[^\dA-Za-z-]/g, "").toUpperCase();
    setCruceNumber(cleaned);
  }

  // Copia EXPLÍCITA contacto → facturación (botón, no sincronización opaca):
  // el cliente la dispara y la puede re-disparar si edita el contacto después.
  // El documento solo se copia si el contacto lo diligenció y el tipo es válido
  // para facturación (el select de billing no ofrece TI).
  function copyContactToBilling() {
    setBillingName(fullName);
    if (docType && docType !== "TI") setBillingDocType(docType);
    if (docNumber) setBillingDocNumber(docNumber);
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
        <h2 className="text-brand-purple-dark font-display mb-4 text-lg font-bold">
          {texts.contactTitle}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nombre */}
          <div>
            <Label
              htmlFor="fullName"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {texts.nameLabel} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="fullName"
              name="fullName"
              required
              placeholder={texts.namePlaceholder}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                clearTouched("fullName");
              }}
              onBlur={handleNameBlur}
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
            />
            <FieldHint
              clientError={
                fullName.length > 0 && !isNameValid && touched.fullName ? texts.nameError : null
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
              {texts.emailLabel} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder={texts.emailPlaceholder}
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
              clientError={
                email.length > 0 && !isEmailValid && touched.email ? texts.emailError : null
              }
              serverError={err("email")}
              hint={texts.emailHint}
            />
            {/* Sugerencia de typo */}
            {emailTypoFix && (
              <p className="mt-1 text-xs text-amber-700">
                {texts.emailTypo}{" "}
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
              {texts.phoneLabel} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="phone-display"
              type="tel"
              required
              placeholder="300 887 3826"
              value={phoneDisplay}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onBlur={() => markTouched("phone")}
              maxLength={12} // 10 dígitos + 2 espacios
              className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
              autoComplete="tel-national"
              inputMode="numeric"
            />
            {/* Campo hidden con el valor sin formato (lo que se envía al server) */}
            <input type="hidden" name="phone" value={stripPhone(phoneDisplay)} />
            <FieldHint
              clientError={
                phoneDisplay.length > 0 && !isPhoneValid && touched.phone ? texts.phoneError : null
              }
              serverError={err("phone")}
              hint={texts.phoneHint}
            />
          </div>

          {/* Documento (opcional) */}
          <div>
            <Label className="text-brand-purple-dark mb-1 block text-xs font-semibold">
              {texts.docLabel}
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
                onChange={(e) => {
                  setDocNumber(e.target.value);
                  clearTouched("documentNumber");
                }}
                onBlur={() => markTouched("documentNumber")}
                disabled={!docType}
                placeholder={docType ? "1234567890" : texts.docTypePlaceholder}
                className="border-brand-purple/20 focus-visible:ring-brand-purple/30 col-span-2"
              />
            </div>
            <FieldHint
              clientError={
                docType && docNumber.length > 0 && !isDocValid && touched.documentNumber
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
          {texts.addressTitle}
        </h2>

        {/* USAR DIRECCIÓN GUARDADA — solo si el cliente logueado tiene direcciones */}
        {savedAddresses.length > 0 && (
          <div className="border-brand-purple/25 bg-brand-purple/5 mb-4 rounded-xl border p-3">
            <label
              htmlFor="saved-address"
              className="text-brand-purple-dark mb-1.5 block text-sm font-semibold"
            >
              {texts.savedLabel}
            </label>
            <select
              id="saved-address"
              defaultValue=""
              onChange={(e) => e.target.value && applySavedAddress(e.target.value)}
              className="border-brand-purple/25 focus:border-brand-purple h-9 w-full rounded-md border bg-white px-2 text-sm"
            >
              <option value="">{texts.savedNew}</option>
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                  {a.isDefault ? " (predeterminada)" : ""} — {a.line1}
                </option>
              ))}
            </select>
            <p className="text-brand-muted mt-1.5 text-xs">{texts.savedNote}</p>
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
              <option value="">{texts.deptPlaceholder}</option>
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
              {texts.cityLabel} <span className="text-rose-600">*</span>
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
              <option value="">{deptCode ? texts.cityPlaceholder : texts.cityWait}</option>
              {cities.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldHint
              clientError={deptCode && cities.length > 0 && !cityCode ? null : null}
              serverError={err("cityCode")}
              hint={deptCode && cities.length === 0 ? texts.cityMissing : undefined}
            />
            <input type="hidden" name="city" value={selectedCity?.name ?? ""} />
          </div>

          <div className="sm:col-span-2">
            <Label
              htmlFor="zip"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {texts.zipLabel}
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
            {/* El CP se autocompleta a nivel MUNICIPAL (DANE): es el estándar que
                usan las transportadoras para cotizar en Colombia — no existe fuente
                confiable y gratuita con precisión sub-municipal. */}
            <FieldHint
              clientError={null}
              serverError={err("zip")}
              hint={selectedCity?.zip ? texts.zipHintAuto : texts.zipHint}
            />
          </div>
        </div>

        {/* Barrio (opcional, todas las ciudades) — convive con la zona/localidad:
            no son lo mismo (la zona sale del catálogo, el barrio es texto libre). */}
        <div className="mt-4">
          <Label
            htmlFor="neighborhood"
            className="text-brand-purple-dark mb-1 block text-xs font-semibold"
          >
            {texts.neighborhoodLabel}
          </Label>
          <Input
            id="neighborhood"
            name="neighborhood"
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            placeholder={texts.neighborhoodPlaceholder}
            maxLength={100}
            className="border-brand-purple/20 focus-visible:ring-brand-purple/30 sm:max-w-xs"
          />
          <FieldHint
            clientError={null}
            serverError={err("neighborhood")}
            hint={texts.neighborhoodHint}
          />
        </div>

        {/* Zona de entrega (localidad/comuna del catálogo lib/lucams-zones.ts) —
            dato de dirección: obligatoria siempre que la ciudad esté en el
            catálogo (lo re-valida el server), haya o no envío propio activo. */}
        {showZoneSelect && zoneCity && (
          <div className="mt-4">
            <Label
              htmlFor="localityId"
              className="text-brand-purple-dark mb-1 block text-xs font-semibold"
            >
              {zoneCity.zoneLabel} <span className="text-rose-600">*</span>
            </Label>
            <select
              id="localityId"
              name="localityId"
              value={localityId}
              onChange={(e) => setLocalityId(e.target.value)}
              required
              className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:max-w-xs"
            >
              <option value="">Elige tu {zoneCity.zoneLabel.toLowerCase()}…</option>
              {zoneOptions.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <FieldHint
              clientError={null}
              serverError={err("localityId")}
              hint={texts.zoneHint.replace("{zona}", zoneCity.zoneLabel.toLowerCase())}
            />
          </div>
        )}

        {/* Toggle Urbana / Rural (Lucy 2026-05-21) */}
        <div className="mt-4">
          <Label className="text-brand-purple-dark mb-2 block text-xs font-semibold">
            {texts.kindLabel} <span className="text-rose-600">*</span>
          </Label>
          <input type="hidden" name="addressKind" value={addressKind} />
          <div role="radiogroup" aria-label={texts.kindLabel} className="grid grid-cols-2 gap-2">
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
              <div className="text-brand-purple-dark text-sm font-semibold">{texts.kindUrban}</div>
              <div className="text-brand-muted text-xs">{texts.kindUrbanDesc}</div>
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
              <div className="text-brand-purple-dark text-sm font-semibold">{texts.kindRural}</div>
              <div className="text-brand-muted text-xs">{texts.kindRuralDesc}</div>
            </button>
          </div>
        </div>

        {addressKind === "urban" ? (
          <>
            {/* Dirección urbana — nomenclatura colombiana completa
                (Lucy 2026-05-21: bis + cardinal + letras) */}
            <div className="mt-4 space-y-3">
              <Label className="text-brand-purple-dark block text-xs font-semibold">
                {texts.addressLabel} <span className="text-rose-600">*</span>
              </Label>

              {/* Primera fila: Tipo de vía + Número + Bis + Cardinal */}
              <div>
                <p className="text-brand-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">
                  {texts.viaLabel}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <select
                    name="viaType"
                    value={viaType}
                    onChange={(e) => setViaType(e.target.value as (typeof VIA_TYPES)[number])}
                    aria-label={texts.viaTypeAria}
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
                    aria-label={texts.viaNumberAria}
                  />
                  <label className="border-brand-purple/20 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border bg-white px-2 text-xs sm:col-span-2">
                    <input
                      type="checkbox"
                      name="viaBis"
                      checked={viaBis}
                      onChange={(e) => setViaBis(e.target.checked)}
                      className="accent-brand-purple h-3.5 w-3.5"
                    />
                    <span className="text-brand-purple-dark font-semibold">{texts.viaBis}</span>
                  </label>
                  <select
                    name="viaCardinal"
                    value={viaCardinal}
                    onChange={(e) => setViaCardinal(e.target.value)}
                    aria-label={texts.viaCardinalAria}
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:col-span-3"
                  >
                    <option value="">{texts.cardinalPlaceholder}</option>
                    <option value="Norte">Norte</option>
                    <option value="Sur">Sur</option>
                    <option value="Este">Este</option>
                    <option value="Oeste">Oeste</option>
                  </select>
                </div>
                <FieldHint clientError={null} serverError={err("viaNumber")} hint={texts.viaHint} />
              </div>

              {/* Segunda fila: Cruce + Cardinal del cruce */}
              <div>
                <p className="text-brand-muted mb-1 text-[10px] font-semibold tracking-wide uppercase">
                  {texts.cruceLabel}
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
                    aria-label={texts.cruceCardinalAria}
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 h-9 w-full rounded-md border bg-white px-2 text-sm focus:ring-2 focus:outline-none sm:col-span-3"
                  >
                    <option value="">{texts.cardinalPlaceholder}</option>
                    <option value="Norte">Norte</option>
                    <option value="Sur">Sur</option>
                    <option value="Este">Este</option>
                    <option value="Oeste">Oeste</option>
                  </select>
                </div>
                <FieldHint
                  clientError={null}
                  serverError={err("cruceNumber")}
                  hint={texts.cruceHint}
                />
              </div>
            </div>

            <div className="mt-4">
              <Label
                htmlFor="detail"
                className="text-brand-purple-dark mb-1 block text-xs font-semibold"
              >
                {texts.detailLabel}
              </Label>
              <Input
                id="detail"
                name="detail"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={texts.detailPlaceholder}
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
                  {texts.veredaLabel} <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="vereda"
                  name="vereda"
                  required
                  value={vereda}
                  onChange={(e) => setVereda(e.target.value)}
                  placeholder={texts.veredaPlaceholder}
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
                  {texts.fincaLabel}
                </Label>
                <Input
                  id="finca"
                  name="finca"
                  value={finca}
                  onChange={(e) => setFinca(e.target.value)}
                  placeholder={texts.fincaPlaceholder}
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
                {texts.refLabel} <span className="text-rose-600">*</span>
              </Label>
              <textarea
                id="referencia"
                name="referencia"
                required
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder={texts.refPlaceholder}
                className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
              <FieldHint
                clientError={
                  referencia.length > 0 && referencia.length < 10 ? texts.refError : null
                }
                serverError={err("referencia")}
                hint={texts.refHint}
              />
            </div>
          </>
        )}

        {/* Preview live de cómo se verá la dirección */}
        {addressPreview && (
          <div className="border-brand-purple/15 bg-brand-purple/5 mt-4 rounded-lg border p-3">
            <p className="text-brand-muted text-[10px] font-semibold tracking-wider uppercase">
              {texts.previewLabel}
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
            {texts.notesLabel}
          </Label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            placeholder={texts.notesPlaceholder}
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
              {texts.saveCheck}
            </label>
            {saveToAccount && (
              <div className="mt-2">
                <Label
                  htmlFor="saveAddressLabel"
                  className="text-brand-muted mb-1 block text-xs font-semibold"
                >
                  {texts.saveNameLabel}
                </Label>
                <Input
                  id="saveAddressLabel"
                  name="saveAddressLabel"
                  value={saveAddressLabel}
                  onChange={(e) => setSaveAddressLabel(e.target.value.slice(0, 60))}
                  placeholder={texts.saveNamePlaceholder}
                  maxLength={60}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* DESTINATARIO / REGALO (FLUJO REGALO) — sección propia entre dirección
          y facturación. Con el toggle on, nombre + teléfono de quien recibe
          son requeridos (van a la guía de la transportadora: es quien atiende
          al mensajero, y en COD quien paga el efectivo). "Es un regalo" oculta
          los precios del correo de confirmación y habilita el mensaje para la
          tarjeta. La facturación (sección siguiente) queda SIEMPRE a nombre
          del comprador. */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-2 text-lg font-bold">
          ¿Quién recibe el pedido?
        </h2>
        <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="hasRecipient"
            checked={hasRecipient}
            onChange={(e) => setHasRecipient(e.target.checked)}
            className="accent-brand-purple h-4 w-4"
          />
          Lo recibe otra persona (va a su nombre y teléfono)
        </label>

        {hasRecipient && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="recipientName"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  Nombre de quien recibe <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="recipientName"
                  name="recipientName"
                  required
                  value={recipientName}
                  onChange={(e) => {
                    setRecipientName(e.target.value);
                    clearTouched("recipientName");
                  }}
                  onBlur={() => {
                    if (recipientName.trim()) setRecipientName(capitalizeName(recipientName));
                    markTouched("recipientName");
                  }}
                  placeholder="Ej. Camila Torres"
                  maxLength={120}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
                <FieldHint
                  clientError={
                    recipientName.length > 0 &&
                    !validateName(recipientName) &&
                    touched.recipientName
                      ? "Solo letras, espacios y acentos (sin números)"
                      : null
                  }
                  serverError={err("recipientName")}
                />
              </div>
              <div>
                <Label
                  htmlFor="recipientPhone-display"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  Teléfono de quien recibe <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="recipientPhone-display"
                  type="tel"
                  required
                  value={recipientPhoneDisplay}
                  onChange={(e) => {
                    setRecipientPhoneDisplay(formatPhone(e.target.value));
                    clearTouched("recipientPhone");
                  }}
                  onBlur={() => markTouched("recipientPhone")}
                  placeholder="300 887 3826"
                  maxLength={12}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                  autoComplete="off"
                  inputMode="numeric"
                />
                {/* Valor sin formato (lo que se envía al server) */}
                <input
                  type="hidden"
                  name="recipientPhone"
                  value={stripPhone(recipientPhoneDisplay)}
                />
                <FieldHint
                  clientError={
                    recipientPhoneDisplay.length > 0 &&
                    !validatePhone(recipientPhoneDisplay) &&
                    touched.recipientPhone
                      ? "Debe ser un móvil colombiano de 10 dígitos (300...)"
                      : null
                  }
                  serverError={err("recipientPhone")}
                  hint="La transportadora lo llama a este número al entregar."
                />
              </div>
            </div>

            <div>
              <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  name="isGift"
                  checked={isGift}
                  onChange={(e) => setIsGift(e.target.checked)}
                  className="accent-brand-purple h-4 w-4"
                />
                Es un regalo 🎁 (tu correo de confirmación no mostrará precios)
              </label>
              {isGift && (
                <div className="mt-3">
                  <Label
                    htmlFor="giftMessage"
                    className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                  >
                    Mensaje para la tarjeta (opcional)
                  </Label>
                  <textarea
                    id="giftMessage"
                    name="giftMessage"
                    rows={2}
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    maxLength={300}
                    placeholder="Ej. ¡Feliz cumpleaños! Con cariño, Lau"
                    className="border-brand-purple/20 focus:border-brand-purple focus:ring-brand-purple/20 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                  />
                  <FieldHint clientError={null} serverError={err("giftMessage")} />
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* FACTURACIÓN */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-brand-purple-dark font-display mb-2 text-lg font-bold">
          {texts.billingTitle}
        </h2>
        <p className="text-brand-muted mb-4 text-sm">{texts.billingNote}</p>

        <label className="text-brand-purple-dark inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="wantsInvoice"
            checked={wantsInvoice}
            onChange={(e) => setWantsInvoice(e.target.checked)}
            className="accent-brand-purple h-4 w-4"
          />
          {texts.billingCheck}
        </label>

        {wantsInvoice && (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyContactToBilling}
              className="border-brand-purple/30 text-brand-purple-dark hover:bg-brand-purple/10 hover:text-brand-purple-dark mb-4"
            >
              Usar los datos del comprador
            </Button>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Label
                  htmlFor="billingDocumentType"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  {texts.billingTypeLabel} <span className="text-rose-600">*</span>
                </Label>
                <select
                  id="billingDocumentType"
                  name="billingDocumentType"
                  value={billingDocType}
                  onChange={(e) => setBillingDocType(e.target.value as "CC" | "CE" | "NIT" | "PP")}
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
                  {texts.billingNumberLabel} <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="billingDocumentNumber"
                  name="billingDocumentNumber"
                  required={wantsInvoice}
                  value={billingDocNumber}
                  onChange={(e) => setBillingDocNumber(e.target.value)}
                  placeholder={texts.billingNumberPlaceholder}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
                <FieldHint clientError={null} serverError={err("billingDocumentNumber")} />
              </div>
              <div className="sm:col-span-6">
                <Label
                  htmlFor="billingName"
                  className="text-brand-purple-dark mb-1 block text-xs font-semibold"
                >
                  {texts.billingNameLabel} <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="billingName"
                  name="billingName"
                  required={wantsInvoice}
                  value={billingName}
                  onChange={(e) => setBillingName(e.target.value)}
                  placeholder={texts.billingNamePlaceholder}
                  className="border-brand-purple/20 focus-visible:ring-brand-purple/30"
                />
                <FieldHint clientError={null} serverError={err("billingName")} />
              </div>
            </div>
          </div>
        )}
        {err("wantsInvoice") && <p className="mt-2 text-xs text-rose-600">{err("wantsInvoice")}</p>}
      </section>

      {/* AUTORIZACIÓN DE TRATAMIENTO DE DATOS (Ley 1581) — previa y expresa, también para invitados.
          Sin la casilla marcada, la acción no guarda la PII ni continúa. */}
      <section className="border-brand-purple/10 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="dataConsent"
            required
            checked={dataConsent}
            onChange={(e) => setDataConsent(e.target.checked)}
            className="accent-brand-purple mt-0.5 h-4 w-4 flex-shrink-0"
          />
          <span className="text-brand-purple-dark/90 [&_a]:text-brand-purple leading-relaxed [&_a]:underline">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {texts.consent}
            </ReactMarkdown>
          </span>
        </label>
        {err("dataConsent") && <p className="mt-2 text-xs text-rose-600">{err("dataConsent")}</p>}
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
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {texts.pending}
            </>
          ) : (
            texts.submit
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
